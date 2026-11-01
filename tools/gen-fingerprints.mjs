#!/usr/bin/env node
// ═══ 指纹生成器 + `--check` 自证（M1） ═══
//
// 产出：`data/packages/<pkg>.json` —— 五包对照组 `exports` 的结构指纹，裁剪后入库。
// 纪律（`plan/04` §4）：
//   · `data/packages/*.json` 是**生成器产物，禁手改**。改它唯一方式 = 改生成器再重跑；
//   · `--check` 判据 = **重算与入仓件逐字节一致**（双跑比对），不是"看起来差不多"；
//   · 指纹的字节**不得依赖跑生成器那台机器的工具链**：只对 `exports` 值做规范化序列化
//     再取 sha256，**不用** `JSON.stringify` 的默认键序（对象键显式排序后拼串）。
//
// 用法：
//   node tools/gen-fingerprints.mjs              # 重算并写入 data/packages/
//   node tools/gen-fingerprints.mjs --check      # 只校验：入仓件与重算结果逐字节一致
//   node tools/gen-fingerprints.mjs --from <dir> # 从指定 node_modules 读（默认 ./node_modules）
//   node tools/gen-fingerprints.mjs --list       # 打印五包名单与版本，不读写文件
//
// 退出码：0 成功 / 1 不一致或有缺件 / 4 用法错误。
//
// ⚠️ 本工具**不联网**：包必须已装在 `--from` 指向的 `node_modules` 里。
//    首期五包由 `npm i chalk@6 zod@4 date-fns@4 commander@15 glob@14` 提供（见 data/README §2.1）。

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "packages");

/** 五包对照组（`plan/04` §1）。顺序固定 → 输出顺序确定 → 逐字节可比。 */
const PACKAGES = ["chalk", "zod", "date-fns", "commander", "glob"];

function usage(message) {
  process.stderr.write(`gen-fingerprints: ${message}\n`);
  process.exit(4);
}

const argv = process.argv.slice(2);
let mode = "write";
let fromDir = join(ROOT, "node_modules");
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--check") mode = "check";
  else if (arg === "--list") mode = "list";
  else if (arg === "--from") {
    const next = argv[++i];
    if (!next) usage("--from 缺参数");
    fromDir = resolve(next);
  } else usage(`未知参数 ${arg}`);
}

/**
 * 规范化序列化：对象键**排序**后拼串、数组保序、`null` 保留。
 * 与 `src/resolve.mjs` 的 `canonicalize` **必须同构**（那里是运行时口径，这里是入库口径；
 * 两份若漂移，`tests/fingerprints.test.mjs` 会红）。
 */
function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return "null";
}

const sha12 = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);

/** 递归数出 `exports` 的条件分支里有没有 `require`（`data/README.md` §5.2 第 2 条）。 */
function hasRequireBranch(value) {
  if (value === null || typeof value === "string") return false;
  if (Array.isArray(value)) return value.some(hasRequireBranch);
  if (typeof value !== "object") return false;
  for (const [k, v] of Object.entries(value)) {
    if (k === "require") return true;
    if (hasRequireBranch(v)) return true;
  }
  return false;
}

/** 该包的 `exports` 是否列了 `./package.json`。 */
function exposesPackageJson(exportsField) {
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) return false;
  if (!Object.hasOwn(exportsField, "./package.json")) return false;
  return exportsField["./package.json"] !== null;
}

/** 读一个包装好的包 → 裁剪后的指纹记录。 */
function readPackage(name) {
  const pkgPath = join(fromDir, name, "package.json");
  if (!existsSync(pkgPath)) return { name, ok: false, reason: "NOT_INSTALLED" };
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (error) {
    return { name, ok: false, reason: `UNPARSEABLE: ${error.message}` };
  }
  const exportsField = pkg.exports;
  const canonical = canonicalize(exportsField === undefined ? "<absent>" : exportsField);
  return {
    ok: true,
    record: {
      name,
      version: typeof pkg.version === "string" ? pkg.version : null,
      type: pkg.type ?? null,
      // 裁剪三项：`exports` 原文（判定依据）、规范化串（指纹的输入，可独立复算）、指纹本身
      exports: exportsField === undefined ? null : exportsField,
      canonical,
      fingerprint: sha12(canonical),
      hasRequireBranch: hasRequireBranch(exportsField),
      exposesPackageJson: exposesPackageJson(exportsField),
    },
  };
}

/** 渲染成**确定字节**的入库文件：固定字段序 + 2 空格缩进 + 末尾换行。 */
function render(record) {
  const ordered = {
    name: record.name,
    version: record.version,
    type: record.type,
    fingerprint: record.fingerprint,
    hasRequireBranch: record.hasRequireBranch,
    exposesPackageJson: record.exposesPackageJson,
    // 规范化串随包入仓：任何人可对它重算 sha256 复得 fingerprint，**不必相信生成器**
    canonical: record.canonical,
    exports: record.exports,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

// ─────────────────────────────── 主流程 ───────────────────────────────

const missing = [];
const records = [];
for (const name of PACKAGES) {
  const got = readPackage(name);
  if (!got.ok) {
    missing.push(`${name}（${got.reason}）`);
    continue;
  }
  records.push(got.record);
}

if (mode === "list") {
  process.stdout.write(`gen-fingerprints: ${PACKAGES.length} 个包 / 已装 ${records.length}\n`);
  for (const r of records) process.stdout.write(`  ${r.name}@${r.version}  type=${r.type ?? "(none)"}  ${r.fingerprint}\n`);
  for (const m of missing) process.stdout.write(`  缺: ${m}\n`);
  process.exitCode = missing.length === 0 ? 0 : 1;
} else if (mode === "write") {
  if (missing.length > 0) {
    process.stderr.write(`gen-fingerprints: 缺包，未写入（${missing.join("; ")}）\n`);
    process.stderr.write(`  先装：npm i chalk@6 zod@4 date-fns@4 commander@15 glob@14\n`);
    process.exitCode = 1;
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const r of records) writeFileSync(join(OUT_DIR, `${r.name}.json`), render(r), "utf8");
    process.stdout.write(`gen-fingerprints: 写入 ${records.length} 份 → data/packages/\n`);
    for (const r of records) process.stdout.write(`  ${r.name}@${r.version}  ${r.fingerprint}\n`);
    process.exitCode = 0;
  }
} else {
  // --check：三项都要对（缺件 / 多件 / 逐字节）
  const problems = [];
  if (missing.length > 0) problems.push(`缺包: ${missing.join("; ")}`);
  let compared = 0;
  for (const r of records) {
    const path = join(OUT_DIR, `${r.name}.json`);
    const expected = render(r);
    if (!existsSync(path)) {
      problems.push(`缺入仓件: data/packages/${r.name}.json`);
      continue;
    }
    const actual = readFileSync(path, "utf8");
    compared += 1;
    if (actual !== expected) {
      // 逐字节不一致时给最小差异证据（行号），不只说"不同"
      const a = expected.split("\n");
      const b = actual.split("\n");
      const firstDiff = a.findIndex((line, i) => line !== b[i]);
      problems.push(
        `data/packages/${r.name}.json 与重算结果不一致（首个差异在第 ${firstDiff + 1} 行：期望 ${JSON.stringify(
          (a[firstDiff] ?? "<EOF>").trim(),
        )} / 实际 ${JSON.stringify((b[firstDiff] ?? "<EOF>").trim())}）`,
      );
    }
  }
  // 反向：入仓目录里有没有不在名单里的包（防止改名后旧件留着当"已覆盖"）
  if (existsSync(OUT_DIR)) {
    const onDisk = new Set(
      readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)),
    );
    for (const name of onDisk) {
      if (!PACKAGES.includes(name)) problems.push(`data/packages/${name}.json 不在五包名单里（陈旧件）`);
    }
  }
  if (problems.length > 0) {
    process.stdout.write(`gen-fingerprints --check: ${problems.length} 项不一致\n`);
    for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `gen-fingerprints --check: ${compared}/${PACKAGES.length} 份逐字节一致（源 ${fromDir}）\n`,
    );
    process.exitCode = 0;
  }
}