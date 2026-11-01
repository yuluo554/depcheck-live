#!/usr/bin/env node
// ═══ 漂移基线生成器 + `--check` 自证（M3） ═══
//
// 产出：`data/fingerprints/<pkg>.json` —— 某个**历史版本**的导出面（符号级），供 `drift` 判定用。
//
// 为什么不是"只存指纹"：`drift` 的判据是**行为**（代码写的老 API 在装的版本里还在不在），
// 不是 semver 字符串，也不是整份 `exports` 是否逐字节相同。所以基线必须存**符号名集合**，
// 否则 C6 点 2（版本号变了但符号仍在 → 必须 RESOLVED）无法成立。
//
// 纪律（`plan/04` §4，与 `gen-fingerprints.mjs` 同一族）：
//   · `data/fingerprints/*.json` 是**生成器产物，禁手改**；改它唯一方式 = 改生成器再重跑；
//   · 基线只能来自**真实的历史版本包**（用户显式提供的离线包 / 从 npm 取下的 tarball），
//     **不得伪造**——伪造历史指纹等于伪造真值；
//   · 每个文件必须带 `provenance`（版本 + tarball 名 + sha512 + 取用时点），任何人可独立复算；
//   · `--check` 的判据是**离线可复算**：`fingerprint === sha12(canonical)`，
//     不需要重新拿到那个 tarball（拿到也能再跑一次 `--add` 比对）。
//
// 用法：
//   node tools/gen-baselines.mjs --add --pkg <name> --dir <解出来的包目录> \
//        --tarball <tarball 路径> [--fetched-at <YYYY-MM-DD>]
//   node tools/gen-baselines.mjs --check          # 离线自证：五份里的每一份都要自洽
//   node tools/gen-baselines.mjs --list           # 打印已入仓基线
//
// 退出码：0 成功 / 1 不自洽或有缺件 / 4 用法错误。

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONDITIONS, describeExports, matchSubpath, resolveConditional, substituteWildcard } from "../src/resolve.mjs";
import { readExportSurface } from "../src/check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "fingerprints");

function usage(message) {
  process.stderr.write(`gen-baselines: ${message}\n`);
  process.exit(4);
}

/**
 * 规范化序列化：对象键**排序**后拼串、数组保序、`null` 保留。
 * 与 `gen-fingerprints.mjs` 的 `canonicalize` **必须逐字节同构**——两份若漂移，
 * 两个生成器的指纹就不同源，`--check` 也就失去可比性。
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

/**
 * 采集某个历史版本的**符号级**导出面。
 *
 * 只记录**具体子路径键**（通配键 `./a/*` 不展开——展开等于把整棵目录树写进仓库，
 * 且 `drift` 的判定单位是"代码实际写的那个子路径"，不是模式）。通配键的缺席会被
 * `drift` 显式记成 `NO-BASELINE`（不猜），不是静默跳过。
 *
 * @returns {{surfaces:object, skipped:string[]}}
 */
function collectSurfaces(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const described = describeExports(pkg);
  const dep = {
    pkgDir: dir,
    type: pkg.type ?? "commonjs",
    hasRequireBranch: described.hasRequireBranch,
    index: described.index,
  };
  const surfaces = {};
  const skipped = [];
  for (const entry of described.index.entries) {
    const key = entry.key;
    if (key.includes("*")) {
      skipped.push(key); // 通配键：不展开
      continue;
    }
    const views = {};
    for (const view of ["import", "require"]) {
      const value = entry.value;
      const t = resolveConditional(value, CONDITIONS[view]);
      if (t.state !== "ok") {
        views[view] = null;
        continue;
      }
      const surface = readExportSurface(dep, t.target);
      // 读不出 = 该视角的导出面不可静态确定 → 记 null（drift 见 null 记 NO-BASELINE，不猜）
      views[view] = surface.ok ? [...surface.names].sort() : null;
    }
    surfaces[key] = views;
  }
  return {
    meta: {
      name: typeof pkg.name === "string" ? pkg.name : null,
      version: typeof pkg.version === "string" ? pkg.version : null,
      type: pkg.type ?? null,
      canonical: canonicalize(pkg.exports === undefined ? "<absent>" : pkg.exports),
      fingerprint: sha12(canonicalize(pkg.exports === undefined ? "<absent>" : pkg.exports)),
    },
    surfaces,
    skipped,
  };
}

/** 确定字节：固定字段序 + 2 空格缩进 + 末尾换行。 */
function render(record) {
  const ordered = {
    name: record.name,
    baselineVersion: record.baselineVersion,
    type: record.type,
    // 指纹的输入随包入仓：任何人可对它重算 sha256 复得 fingerprint，不必相信生成器
    canonical: record.canonical,
    fingerprint: record.fingerprint,
    provenance: record.provenance,
    onlyInBaselineKeys: record.onlyInBaselineKeys,
    skippedPatternKeys: record.skippedPatternKeys,
    surfaces: record.surfaces,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

// ─────────────────────────────── 参数 ───────────────────────────────

const argv = process.argv.slice(2);
let mode = null;
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--check") mode = "check";
  else if (arg === "--list") mode = "list";
  else if (arg === "--add") mode = "add";
  else if (arg === "--pkg" || arg === "--dir" || arg === "--tarball" || arg === "--fetched-at") {
    const next = argv[++i];
    if (!next) usage(`${arg} 缺参数`);
    opts[arg.slice(2)] = next;
  } else usage(`未知参数 ${arg}`);
}
if (mode === null) usage("需要 --add / --check / --list 之一");

// ─────────────────────────────── --add ───────────────────────────────

if (mode === "add") {
  for (const required of ["pkg", "dir", "tarball"]) {
    if (!opts[required]) usage(`${required} 必填（--add 必须能溯源到真实的历史版本包）`);
  }
  const dir = resolve(opts.dir);
  const tarball = resolve(opts.tarball);
  if (!existsSync(join(dir, "package.json"))) usage(`目录里没有 package.json: ${dir}`);
  if (!existsSync(tarball)) usage(`tarball 不存在: ${tarball}`);

  const got = collectSurfaces(dir);
  if (got.meta.version === null) usage("历史版本包缺 version 字段");
  if (got.meta.name !== opts.pkg) {
    usage(`包名不符：tarball 里是 ${got.meta.name}，命令行给的是 ${opts.pkg}`);
  }

  const tarballBytes = readFileSync(tarball);
  const digest = createHash("sha512").update(tarballBytes).digest("hex");
  const record = {
    name: got.meta.name,
    baselineVersion: got.meta.version,
    type: got.meta.type,
    canonical: got.meta.canonical,
    fingerprint: got.meta.fingerprint,
    provenance: {
      // 溯源三件：这份基线是哪个包、从哪来、字节校验值多少
      tarball: `npm:${opts.pkg}@${got.meta.version}`,
      tarballFile: opts.tarball.replace(/\\/g, "/").split("/").pop(),
      sha512: digest,
      fetchedAt: opts["fetched-at"] ?? null,
    },
    onlyInBaselineKeys: Object.keys(got.surfaces).sort(),
    skippedPatternKeys: got.skipped.sort(),
    surfaces: got.surfaces,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${got.meta.name}.json`);
  writeFileSync(outPath, render(record), "utf8");
  const symbolCount = Object.values(got.surfaces).reduce(
    (n, v) => n + (v.import?.length ?? 0) + (v.require?.length ?? 0),
    0,
  );
  process.stdout.write(
    `gen-baselines: 写入 data/fingerprints/${got.meta.name}.json\n` +
      `  ${got.meta.name}@${got.meta.version}  fingerprint=${record.fingerprint}\n` +
      `  子路径 ${Object.keys(got.surfaces).length} 个（通配键跳过 ${got.skipped.length} 个）/ 符号 ${symbolCount} 条\n` +
      `  sha512(tarball)=${digest.slice(0, 16)}…\n`,
  );
  process.exitCode = 0;
}

// ─────────────────────────────── --list ───────────────────────────────

if (mode === "list") {
  if (!existsSync(OUT_DIR)) {
    process.stdout.write("gen-baselines --list: 0 份（data/fingerprints/ 不存在）\n");
    process.exitCode = 0;
  } else {
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).sort();
    process.stdout.write(`gen-baselines --list: ${files.length} 份\n`);
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(OUT_DIR, f), "utf8"));
      process.stdout.write(
        `  ${data.name}@${data.baselineVersion}  fingerprint=${data.fingerprint}  ` +
          `子路径 ${Object.keys(data.surfaces ?? {}).length} 个\n`,
      );
    }
    process.exitCode = 0;
  }
}

// ─────────────────────────────── --check ───────────────────────────────

if (mode === "check") {
  const problems = [];
  let compared = 0;
  if (!existsSync(OUT_DIR)) {
    process.stdout.write("gen-baselines --check: 0/0（data/fingerprints/ 不存在）\n");
    process.exitCode = 1;
  } else {
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).sort();
    if (files.length === 0) problems.push("data/fingerprints/ 为空——C6 将无处取基线");
    for (const f of files) {
      const path = join(OUT_DIR, f);
      let data;
      try {
        data = JSON.parse(readFileSync(path, "utf8"));
      } catch (error) {
        problems.push(`data/fingerprints/${f} 不可解析：${error.message}`);
        continue;
      }
      compared += 1;
      const rel = `data/fingerprints/${f}`;
      // ① 自洽：指纹必须能由入仓的 canonical 独立复算出来
      const want = sha12(data.canonical);
      if (data.fingerprint !== want) {
        problems.push(`${rel} 指纹不自洽：存 ${data.fingerprint}，由 canonical 复算是 ${want}`);
      }
      // ② 溯源：必须有版本与 sha512，否则这份基线不可复核
      if (!data.baselineVersion) problems.push(`${rel} 缺 baselineVersion`);
      if (!data.provenance?.sha512) problems.push(`${rel} 缺 provenance.sha512（不可复核）`);
      // ③ 符号面必须是排序去重的数组或 null（null = 读不出，drift 会记 NO-BASELINE）
      for (const [subpath, views] of Object.entries(data.surfaces ?? {})) {
        for (const view of ["import", "require"]) {
          const names = views?.[view];
          if (names === null) continue;
          if (!Array.isArray(names)) {
            problems.push(`${rel} 的 surfaces["${subpath}"].${view} 不是数组也不是 null`);
            continue;
          }
          const sorted = [...new Set(names)].sort();
          if (sorted.length !== names.length || sorted.some((n, i) => n !== names[i])) {
            problems.push(`${rel} 的 surfaces["${subpath}"].${view} 未排序去重`);
          }
        }
      }
    }
    if (problems.length > 0) {
      process.stdout.write(`gen-baselines --check: ${problems.length} 项不一致\n`);
      for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`gen-baselines --check: ${compared}/${compared} 份自洽（指纹可由 canonical 离线复算）\n`);
      process.exitCode = 0;
    }
  }
}