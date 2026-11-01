// 阈值双向断言（`data/README.md` §5.3 ↔ `src/contract.mjs` + 实现层）。
//
// 这三个阈值是"数值口径唯一定义"的第三个落点：文档写一份、代码镜像一份。
// 没有这条测试时，改文档不改代码（或反之）会静默漂移，而基准里所有边界断言都会跟着错。
//
// 断言两条方向：
//   ① 文档里写的数 == `LIMITS` 里的数（文档 → 代码）；
//   ② 实现真的**用**了 `LIMITS`（代码 → 行为），不是常量摆着好看（阳性对照）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, LARGE_FILE_DOWNGRADED } from "../src/contract.mjs";
import { buildExportsIndex } from "../src/resolve.mjs";
import { findBarePackageLiterals, scanText } from "../src/scan.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_README = readFileSync(join(ROOT, "data", "README.md"), "utf8");

test("§5.3 不再是欠债：三行都有具体数值（没有'见 plan/'式的纯指向）", () => {
  const section = DATA_README.slice(DATA_README.indexOf("### 5.3"), DATA_README.indexOf("### 5.4"));
  assert.ok(section.length > 0, "找不到 §5.3");
  for (const label of ["`exports` 通配展开上限", "单文件 AST 大小上限", "字符串兜底扫描的误报抑制"]) {
    const line = section.split("\n").find((l) => l.includes(label));
    assert.ok(line, `§5.3 缺「${label}」这一行`);
    // 反例：只有指向、没有数值
    assert.ok(
      !/^\|\s*`?[^|]*\|\s*见\s/.test(line),
      `「${label}」仍是纯指向（"见 plan/xxx"），必须给具体数值`,
    );
    assert.match(line, /\d/, `「${label}」没有出现任何数值`);
  }
});

test("文档 → 代码：§5.3 写的两个数 == LIMITS", () => {
  const section = DATA_README.slice(DATA_README.indexOf("### 5.3"), DATA_README.indexOf("### 5.4"));
  const exportsLine = section.split("\n").find((l) => l.includes("`exports` 通配展开上限"));
  const bytesLine = section.split("\n").find((l) => l.includes("单文件 AST 大小上限"));
  assert.ok(exportsLine.includes(String(LIMITS.EXPORTS_KEYS)), `文档写的 exports 上限与 LIMITS.EXPORTS_KEYS=${LIMITS.EXPORTS_KEYS} 不一致`);
  assert.ok(bytesLine.includes(String(LIMITS.SOURCE_FILE_BYTES)), `文档写的字节上限与 LIMITS.SOURCE_FILE_BYTES=${LIMITS.SOURCE_FILE_BYTES} 不一致`);
});

test("代码 → 行为 ①：exports 键数超限 → 整包 unparseable（不截断静默）", () => {
  const over = {};
  for (let i = 0; i < LIMITS.EXPORTS_KEYS + 1; i++) over[`./s${i}`] = `./s${i}.js`;
  const index = buildExportsIndex(over);
  assert.equal(index.unparseable, true, "超限必须记 unparseable，否则等于静默截断");
  assert.equal(index.entries.length, 0);

  // 边界内照常（阳性对照：证明这条判据不是恒真）
  const atLimit = {};
  for (let i = 0; i < LIMITS.EXPORTS_KEYS; i++) atLimit[`./s${i}`] = `./s${i}.js`;
  const ok = buildExportsIndex(atLimit);
  assert.equal(ok.unparseable, false);
  assert.equal(ok.entries.length, LIMITS.EXPORTS_KEYS);
});

test("代码 → 行为 ②：真实五包全部在上限内（阈值不能卡死真实语料）", () => {
  for (const name of ["chalk", "zod", "date-fns", "commander", "glob"]) {
    const rec = JSON.parse(readFileSync(join(ROOT, "data", "packages", `${name}.json`), "utf8"));
    const index = buildExportsIndex(rec.exports);
    assert.equal(index.unparseable, false, `${name} 被阈值判成 unparseable —— 阈值比真实语料还小`);
  }
});

test("代码 → 行为 ③：字符串兜底的双条件过滤（只满足形似的不计入）", () => {
  const deps = new Set(["chalk", "zod", "@scope/pkg"]);
  const text = [
    'const a = "chalk";',              // ① 形似 ② 已装     → 计入
    'const b = "lodash";',             // ① 形似 ② 未装     → 不计入
    'const c = "hello world";',        // ① 不形似          → 不计入
    'const d = "zod/v4";',             // ① 形似(含子路径) ② 已装 → 计入
    'const e = "@scope/pkg/sub";',     // ① scoped ② 已装   → 计入
    'const f = "@other/x";',           // ① 形似 ② 未装     → 不计入
    'const g = "Chalk";',              // 大写不算包名       → 不计入
  ].join("\n");
  const hits = findBarePackageLiterals(text, deps).map((h) => h.specifier).sort();
  assert.deepEqual(hits, ["@scope/pkg/sub", "chalk", "zod/v4"]);
});

test("代码 → 行为 ④：降级扫描的 gap 种类在契约里有名有实", () => {
  assert.equal(typeof LARGE_FILE_DOWNGRADED, "string");
  assert.equal(LARGE_FILE_DOWNGRADED, "LARGE_FILE_DOWNGRADED");
});

test("scanText 不会把普通文案当引用（兜底只走 findBarePackageLiterals 的两条判据）", () => {
  const points = scanText('const msg = "chalk";\n', "a.mjs");
  assert.equal(points.filter((p) => p.kind === "string-literal").length, 0, "scanText 本身不做字符串兜底");
});