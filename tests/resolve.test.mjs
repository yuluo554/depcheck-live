// `exports` 解析（六形态 + 通配优先级 + require 分支存在性 + 指纹确定性）。
// 这是模块③的全部判据来源（`data/README.md` §1 D1 / §5.2）。

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExportsIndex,
  matchSubpath,
  substituteWildcard,
  resolveConditional,
  hasRequireBranch,
  fingerprint,
  describeExports,
} from "../src/resolve.mjs";

const ESM = ["node", "import", "default"];
const CJS = ["node", "require", "default"];

test("形态①：'.' 字符串等价于 {'.': 值}", () => {
  const index = buildExportsIndex("./index.js");
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].key, ".");
  assert.equal(resolveConditional(index.entries[0].value, ESM).target, "./index.js");
});

test("形态②：条件对象按序取首个命中", () => {
  const index = buildExportsIndex({ ".": { import: "./i.mjs", require: "./i.cjs" } });
  assert.equal(matchSubpath(index, ".").kind, "exact");
  const esm = resolveConditional(matchSubpath(index, ".").value, ESM);
  const cjs = resolveConditional(matchSubpath(index, ".").value, CJS);
  assert.equal(esm.target, "./i.mjs");
  assert.equal(cjs.target, "./i.cjs");
});

test("形态③：null 屏蔽（不是'不存在'）", () => {
  const index = buildExportsIndex({ "./secret": null });
  const sub = matchSubpath(index, "./secret");
  assert.equal(sub.kind, "exact");
  assert.equal(sub.value, null);
  const r = resolveConditional(sub.value, ESM);
  assert.equal(r.blocked, true);
});

test("形态④：数组回退取首个可解析目标", () => {
  const index = buildExportsIndex({ ".": [{ require: "./c.cjs" }, "./fallback.js"] });
  const cjs = resolveConditional(matchSubpath(index, ".").value, CJS);
  assert.equal(cjs.target, "./c.cjs");
  const browser = resolveConditional(matchSubpath(index, ".").value, ["browser"]);
  assert.equal(browser.target, "./fallback.js");
});

test("形态④b：数组全不可解析 → UNPARSEABLE（不静默截断）", () => {
  const index = buildExportsIndex({ ".": [null, { import: "./x.mjs" }] });
  const r = resolveConditional(matchSubpath(index, ".").value, ["browser"]);
  assert.equal(r.ok, false);
  assert.equal(r.unparseable, true);
});

test("形态⑤：通配 * 替换", () => {
  const index = buildExportsIndex({ "./features/*": "./src/features/*.js" });
  const sub = matchSubpath(index, "./features/alpha");
  assert.equal(sub.kind, "pattern");
  assert.equal(substituteWildcard(sub.patternKey, "./features/alpha", sub.value), "./src/features/alpha.js");
});

test("形态⑤b：多个通配命中时前缀最长者优先", () => {
  const index = buildExportsIndex({
    "./*": "./generic/*.js",
    "./features/*": "./src/features/*.js",
  });
  assert.equal(matchSubpath(index, "./features/x").patternKey, "./features/*");
  assert.equal(matchSubpath(index, "./other/x").patternKey, "./*");
});

test("形态⑤c：多个 * 的子路径键 → UNPARSEABLE（不猜）", () => {
  const index = buildExportsIndex({ "./a/*/b/*": "./x/*.js" });
  assert.equal(index.unparseable, true);
});

test("形态⑥：嵌套条件（node → import / default 兜底）", () => {
  const index = buildExportsIndex({ ".": { node: { import: "./n.mjs" }, default: "./d.js" } });
  assert.equal(resolveConditional(matchSubpath(index, ".").value, ESM).target, "./n.mjs");
  assert.equal(resolveConditional(matchSubpath(index, ".").value, ["browser", "default"]).target, "./d.js");
});

test("条件对象 sugar：全部键都不是子路径时等价于 {'.': 值}", () => {
  const index = buildExportsIndex({ import: "./i.mjs", require: "./i.cjs" });
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].key, ".");
});

test("hasRequireBranch 能看见嵌套条件内部的 require（§5.2 第 2 条判据）", () => {
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": { import: "./i.mjs" } })), false);
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": { import: "./i.mjs", require: "./i.cjs" } })), true);
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": { node: { require: "./n.cjs" } } })), true);
  assert.equal(
    hasRequireBranch(buildExportsIndex({ "./x": { import: "./x.mjs" }, ".": { require: "./i.cjs" } })),
    true,
  );
});

test("指纹：键序无关（同内容不同书写 → 同指纹）", () => {
  const a = fingerprint({ ".": { import: "./i.mjs", require: "./i.cjs" } });
  const b = fingerprint({ ".": { require: "./i.cjs", import: "./i.mjs" } });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
});

test("指纹：数组保序（顺序不同 → 指纹不同）", () => {
  const a = fingerprint({ ".": ["./a.js", "./b.js"] });
  const b = fingerprint({ ".": ["./b.js", "./a.js"] });
  assert.notEqual(a, b);
});

test("指纹：null 是屏蔽语义，必须与'缺省'区分", () => {
  assert.notEqual(fingerprint({ "./x": null }), fingerprint({}));
  assert.equal(fingerprint(null), fingerprint(null));
});

test("describeExports：chalk 形态（无 require 分支、不暴露 ./package.json）", () => {
  const d = describeExports({
    type: "module",
    exports: { ".": { types: "./index.d.ts", import: "./source/index.js", default: "./source/index.js" } },
  });
  assert.equal(d.hasRequireBranch, false);
  assert.equal(d.exposesPackageJson, false);
  assert.equal(d.parseState, "OK");
});

test("describeExports：zod 形态（type: module 但**有** require 分支 → 不得判 MISMATCH）", () => {
  const d = describeExports({
    type: "module",
    exports: { ".": { import: { types: "./a.d.mts", default: "./a.mjs" }, require: { types: "./a.d.cts", default: "./a.cjs" } } },
  });
  assert.equal(d.hasRequireBranch, true, "反面判据：有 require 分支的 type:module 包必须被识别");
});

test("describeExports：显式暴露 ./package.json 时 exposesPackageJson=true", () => {
  const d = describeExports({ exports: { ".": "./i.js", "./package.json": "./package.json" } });
  assert.equal(d.exposesPackageJson, true);
});

test("describeExports：未声明 exports 时 parseState=NOT_DECLARED（不冒充解析成功）", () => {
  const d = describeExports({ main: "./index.js" });
  assert.equal(d.declared, false);
  assert.equal(d.parseState, "NOT_DECLARED");
});