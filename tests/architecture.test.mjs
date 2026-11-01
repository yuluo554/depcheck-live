// 架构守门：分层与契约纪律（`plan/03` §1/§7）。
// 判据落"读源码文件 + AST/正则"，不是跑起来看行为——层间违规往往在行为上看不出来。

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** 去掉注释再判：注释里写"不碰 process.exit / 不含 Date.now"是**说明意图**，
 *  把它数进判据就是假门族 ⑱（文本出现次数 ≠ 语义）。 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("contract.mjs 不得 import 任何其它 src/ 模块", () => {
  const text = read("src/contract.mjs");
  const imports = [...text.matchAll(/^\s*import\s+.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.deepEqual(imports, [], `contract.mjs 必须能被单独加载去对账 SKILL.md，实际 import: ${imports.join(",")}`);
});

test("src/ 下每个模块只能 import node: 内置、其它 src/ 模块或 data（不得引第三方）", () => {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length >= 8, `src/ 模块数应 ≥ 8，实际 ${files.length}`);
  const bad = [];
  for (const f of files) {
    const text = readFileSync(join(SRC, f), "utf8");
    for (const m of text.matchAll(/^\s*import\s+.*?from\s+["']([^"']+)["']/gm)) {
      const spec = m[1];
      const ok = spec.startsWith("node:") || spec.startsWith("./");
      if (!ok) bad.push(`${f} → ${spec}`);
    }
  }
  assert.deepEqual(bad, [], `出现非内置/非本地 import: ${bad.join("; ")}`);
});

test("判定层与编排层不得触碰 process.exit / process.exitCode", () => {
  const guarded = ["src/check.mjs", "src/api.mjs", "src/resolve.mjs", "src/scan.mjs", "src/snapshot.mjs", "src/drift.mjs"];
  const bad = guarded.filter((f) => /process\.(exit|exitCode)/.test(stripComments(read(f))));
  assert.deepEqual(bad, [], `退出码只准在 bin/ + src/cli.mjs 决定，违规: ${bad.join(",")}`);
});

test("判定层不得写文件（只读事实）", () => {
  const guarded = ["src/check.mjs", "src/api.mjs", "src/resolve.mjs", "src/scan.mjs", "src/snapshot.mjs", "src/drift.mjs"];
  const bad = guarded.filter((f) => /writeFileSync|appendFileSync|createWriteStream/.test(stripComments(read(f))));
  assert.deepEqual(bad, [], `判定路径必须零副作用，违规: ${bad.join(",")}`);
});

test("源码里不含时钟与随机（确定性的前提）", () => {
  const files = [
    ...readdirSync(SRC).filter((f) => f.endsWith(".mjs")).map((f) => join(SRC, f)),
    join(ROOT, "bin", "depcheck-live.mjs"),
  ];
  assert.ok(files.length >= 9, `扫描面应 ≥ 9 个文件，实际 ${files.length}`);
  const bad = [];
  for (const abs of files) {
    if (/Date\.now\s*\(|new Date\s*\(|Math\.random\s*\(/.test(stripComments(readFileSync(abs, "utf8")))) {
      bad.push(abs.slice(ROOT.length));
    }
  }
  assert.deepEqual(bad, [], `出现时钟/随机: ${bad.join(",")}`);
});

test("判定态枚举与 data/README.md §5 声明的五个判定态一一对应", () => {
  const contract = read("src/contract.mjs");
  for (const status of ["RESOLVED", "MISSING-EXPORT", "ESM-CJS-MISMATCH", "NOT-EXPORTED-SUBPATH", "AMBIGUOUS"]) {
    assert.ok(contract.includes(status), `contract.mjs 缺判定态 ${status}`);
  }
  const dataReadme = read("data/README.md");
  for (const status of ["RESOLVED", "MISSING-EXPORT", "ESM-CJS-MISMATCH", "NOT-EXPORTED-SUBPATH", "AMBIGUOUS"]) {
    assert.ok(dataReadme.includes(status), `data/README.md §5 缺判定态 ${status}`);
  }
});