// `exports` 解析 —— 六形态 + 条件集 + 通配优先级 + 数组回退 + 要求分支存在性 + 指纹确定性。
//
// 每条向量的期望值都有**两重来源**（`data/README.md` §1 D1）：
//   ① Node 官方解析算法原文（esm.html#resolution-algorithm-spec 的
//      PACKAGE_EXPORTS_RESOLVE / PACKAGE_IMPORTS_EXPORTS_RESOLVE / PACKAGE_TARGET_RESOLVE /
//      PATTERN_KEY_COMPARE）；
//   ② 本机 Node v24.15.0 黑盒实测（M1 的 D1 探针，用例编号写在每条测试的注释里）。
//
// ⚠️ M0 骨架曾按"条件优先级数组"实现，被 ① ② 同时证伪；本文件是改正后的向量集，
//    **不要再改回"遍历 order 数组"的写法**（同一条件集合换键序会给出不同目标）。

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
  CONDITIONS,
} from "../src/resolve.mjs";

const ESM = CONDITIONS.import;
const CJS = CONDITIONS.require;

// ───────────────────────── 形态① `"."` 字符串（sugar） ─────────────────────────

test("形态①：'.' 字符串等价于 {'.': 值}", () => {
  // packages.html「Exports sugar」原文：'"exports": "./index.js" 可写成 { ".": "./index.js" }'
  const index = buildExportsIndex("./index.js");
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].key, ".");
  assert.equal(resolveConditional(index.entries[0].value, ESM).target, "./index.js");
  assert.equal(resolveConditional(index.entries[0].value, CJS).target, "./index.js");
});

test("形态①b：条件对象 sugar（全部键都不是子路径）等价于 {'.': 值}", () => {
  // 实测 sugar-conditional-object：require → ./i.cjs，import → ./i.mjs
  const index = buildExportsIndex({ import: "./i.mjs", require: "./i.cjs" });
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].key, ".");
  assert.equal(resolveConditional(index.entries[0].value, ESM).target, "./i.mjs");
  assert.equal(resolveConditional(index.entries[0].value, CJS).target, "./i.cjs");
});

// ───────────────────────── 形态② 条件对象：按**对象键序** ─────────────────────────

test("形态②：条件对象按序取首个命中（键序，不是条件优先级）", () => {
  // packages.html 原文："Within the "exports" object, key order is significant.
  //   During condition matching, earlier entries have higher priority and take precedence"
  const index = buildExportsIndex({ ".": { import: "./i.mjs", require: "./i.cjs" } });
  assert.equal(matchSubpath(index, ".").kind, "exact");
  const value = matchSubpath(index, ".").value;
  assert.equal(resolveConditional(value, ESM).target, "./i.mjs");
  assert.equal(resolveConditional(value, CJS).target, "./i.cjs");
});

test("形态②b：同一条件集合换键序会换目标（M0 的 order 数组写法必错其一）", () => {
  // 实测 A1：{import, node, default} → import 视角取 import；require 视角取 node
  const a1 = buildExportsIndex({ ".": { import: "./a.mjs", node: "./b.mjs", default: "./d.js" } });
  assert.equal(resolveConditional(a1.entries[0].value, ESM).target, "./a.mjs");
  assert.equal(resolveConditional(a1.entries[0].value, CJS).target, "./b.mjs");

  // 实测 A2：{require, node, default} → require 视角取 require；import 视角取 node
  const a2 = buildExportsIndex({ ".": { require: "./r.cjs", node: "./b.cjs", default: "./d.cjs" } });
  assert.equal(resolveConditional(a2.entries[0].value, CJS).target, "./r.cjs");
  assert.equal(resolveConditional(a2.entries[0].value, ESM).target, "./b.cjs");
});

test("形态②c：default 写在前时先命中 default（实测 P2）", () => {
  const index = buildExportsIndex({ ".": { default: "./d.js", import: "./i.mjs" } });
  assert.equal(resolveConditional(index.entries[0].value, ESM).target, "./d.js");
});

// ───────────────────────── 形态③ null 屏蔽 ─────────────────────────

test("形态③：null 屏蔽（是屏蔽语义，不是'不存在'）", () => {
  // 实测 exact-null-blocked / G2-dot-null → ERR_PACKAGE_PATH_NOT_EXPORTED
  const index = buildExportsIndex({ "./secret": null });
  const sub = matchSubpath(index, "./secret");
  assert.equal(sub.kind, "exact", "null 键必须能精确命中，否则会被误判成'未声明该子路径'");
  assert.equal(sub.value, null);
  assert.equal(resolveConditional(sub.value, ESM).state, "blocked");
});

// ───────────────────────── 形态④ 数组回退 ─────────────────────────

test("形态④：数组回退取首个命中项", () => {
  // 实测 P4-array-single / D5-unmatched-cond-then-ok
  const index = buildExportsIndex({ ".": [{ browser: "./br.js" }, "./ok.js"] });
  const r = resolveConditional(matchSubpath(index, ".").value, ESM);
  assert.equal(r.state, "ok");
  assert.equal(r.target, "./ok.js", "条件不匹配的项要跳过，取后面那个可解析的");
});

test("形态④b：数组里的 null 不中断，继续找后面的可解析项（实测 D1-null-then-ok）", () => {
  const index = buildExportsIndex({ ".": [null, "./b.js"] });
  assert.equal(resolveConditional(matchSubpath(index, ".").value, ESM).target, "./b.js");
});

test("形态④c：空数组 → 屏蔽（原文：'_target.length is zero, return null'）", () => {
  // 实测 D3-empty → ERR_PACKAGE_PATH_NOT_EXPORTED
  const index = buildExportsIndex({ ".": [] });
  assert.equal(resolveConditional(matchSubpath(index, ".").value, ESM).state, "blocked");
});

test("形态④d：全项都不匹配 → unmatched（不是 unparseable，也不是静默通过）", () => {
  // 实测 D6-all-undefined → ERR_PACKAGE_PATH_NOT_EXPORTED
  const index = buildExportsIndex({ ".": [{ browser: "./br.js" }, { electron: "./e.js" }] });
  assert.equal(resolveConditional(matchSubpath(index, ".").value, ESM).state, "unmatched");
});

test("形态④e：非法目标项被跳过，后续合法项仍生效（实测 D4-invalid-then-ok）", () => {
  // 原文："continuing the loop on any Invalid Package Target error"
  const index = buildExportsIndex({ ".": ["../escape.js", "./ok.js"] });
  assert.equal(resolveConditional(matchSubpath(index, ".").value, ESM).target, "./ok.js");
});

// ───────────────────────── 形态⑤ 通配 `*` ─────────────────────────

test("形态⑤：通配 * 替换", () => {
  const index = buildExportsIndex({ "./features/*": "./src/features/*.js" });
  const sub = matchSubpath(index, "./features/alpha");
  assert.equal(sub.kind, "pattern");
  assert.equal(substituteWildcard(sub.key, "./features/alpha", sub.value), "./src/features/alpha.js");
});

test("形态⑤b：多通配命中时按 PATTERN_KEY_COMPARE（* 下标大者优先）", () => {
  const index = buildExportsIndex({
    "./*": "./generic/*.js",
    "./features/*": "./src/features/*.js",
  });
  assert.equal(matchSubpath(index, "./features/x").key, "./features/*");
  assert.equal(matchSubpath(index, "./other/x").key, "./*");
});

test("形态⑤c：子路径等于 patternBase 时**不**命中（实测 C1-equal-to-base）", () => {
  // 原文："If matchKey starts with but is not equal to patternBase"
  const index = buildExportsIndex({ "./a/*": "./x/*.js" });
  assert.equal(matchSubpath(index, "./a/").kind, "none");
  assert.equal(matchSubpath(index, "./a").kind, "none");
  assert.equal(matchSubpath(index, "./a/b").kind, "pattern");
});

test("形态⑤d：带 trailer 时要求 matchKey 长度 >= 通配键长度（实测 C2/C3）", () => {
  // 原文："matchKey ends with patternTrailer and the length of matchKey is greater than or
  //   equal to the length of expansionKey"
  const index = buildExportsIndex({ "./a*b": "./c*b.js" });
  assert.equal(matchSubpath(index, "./ab").kind, "none", "./ab 与键等长 → 空片段，不命中");
  assert.equal(matchSubpath(index, "./ab-extra").kind, "none", "末尾不是 trailer 的写法也不命中");
  const hit = matchSubpath(index, "./aZZb");
  assert.equal(hit.kind, "pattern");
  assert.equal(hit.patternMatch, "ZZ");
});

test("形态⑤e：通配目标里的 * **全部**替换（实测 T1-multi-star-target）", () => {
  // 原文："every instance of "*" replaced with patternMatch"
  const index = buildExportsIndex({ "./f/*": "./src/*/idx-*.js" });
  const sub = matchSubpath(index, "./f/zz");
  assert.equal(substituteWildcard(sub.key, "./f/zz", sub.value), "./src/zz/idx-zz.js");
});

test("形态⑤f：片段可含斜杠（实测 P3-pattern-slash-fragment / T2）", () => {
  const index = buildExportsIndex({ "./a/*": "./x/*.js" });
  assert.equal(substituteWildcard(index.entries[0].key, "./a/b/c", "./x/*.js"), "./x/b/c.js");
});

test("形态⑤g：多 * 的子路径键被 Node **忽略**，不是整包算不了（实测 E2）", () => {
  const index = buildExportsIndex({ ".": "./i.js", "./a/*/b/*": "./x/*.js" });
  assert.deepEqual(index.ignored, ["./a/*/b/*"]);
  assert.equal(index.unparseable, false, "忽略该键不致命：其余入口在 Node 里照常可用");
  assert.equal(matchSubpath(index, ".").value, "./i.js");
});

test("形态⑤h：末尾斜杠键同样被忽略，其余入口照常（实测 E1）", () => {
  const index = buildExportsIndex({ ".": "./i.js", "./dir/": "./src/dir/" });
  assert.deepEqual(index.ignored, ["./dir/"]);
  assert.equal(matchSubpath(index, ".").value, "./i.js");
  assert.equal(matchSubpath(index, "./dir/x.js").kind, "none");
});

test("形态⑤i：精确键含 * 时按通配处理，请求里带字面 * 也能命中（实测 H1）", () => {
  const index = buildExportsIndex({ "./x/*": "./x.js" });
  const sub = matchSubpath(index, "./x/*");
  assert.equal(sub.kind, "pattern");
  assert.equal(substituteWildcard(sub.key, "./x/*", sub.value), "./x.js");
});

// ───────────────────────── 形态⑥ 嵌套条件 ─────────────────────────

test("形态⑥：嵌套条件递归下降，default 兜底", () => {
  const index = buildExportsIndex({ ".": { node: { import: "./n.mjs" }, default: "./d.js" } });
  assert.equal(resolveConditional(index.entries[0].value, ESM).target, "./n.mjs");
  assert.equal(resolveConditional(index.entries[0].value, ["browser", "default"]).target, "./d.js");
});

test("形态⑥b：嵌套条件无映射时继续父层后续条件（实测 B1/B3）", () => {
  // 原文："nested conditions behave analogously to nested JavaScript `if` statements"
  const b1 = buildExportsIndex({ ".": { node: { browser: "./br.js" }, import: "./i.mjs", default: "./d.js" } });
  assert.equal(resolveConditional(b1.entries[0].value, ESM).target, "./i.mjs");
  assert.equal(resolveConditional(b1.entries[0].value, CJS).target, "./d.js");
});

test("形态⑥c：嵌套条件里命中 null 就**停在**屏蔽（实测 B2）", () => {
  const index = buildExportsIndex({ ".": { node: null, import: "./i.mjs", default: "./d.js" } });
  assert.equal(resolveConditional(index.entries[0].value, ESM).state, "blocked");
});

// ───────────────────────── 条件集（实测口径） ─────────────────────────

test("条件集：node-addons / module-sync 参与匹配，browser 与 types 不参与（实测 Q1–Q4, F2）", () => {
  const addons = buildExportsIndex({ ".": { "node-addons": "./addons.js", default: "./d.js" } });
  assert.equal(resolveConditional(addons.entries[0].value, ESM).target, "./addons.js");

  const sync = buildExportsIndex({ ".": { "module-sync": "./ms.js", default: "./d.js" } });
  assert.equal(resolveConditional(sync.entries[0].value, CJS).target, "./ms.js");

  const browser = buildExportsIndex({ ".": { browser: "./br.js", default: "./d.js" } });
  assert.equal(resolveConditional(browser.entries[0].value, ESM).target, "./d.js");

  const types = buildExportsIndex({ ".": { types: "./t.d.ts", default: "./d.js" } });
  assert.equal(resolveConditional(types.entries[0].value, CJS).target, "./d.js");
});

test("条件集：import 与 require 互斥（package.json 原文：always mutually exclusive）", () => {
  const v = { import: "./i.mjs", require: "./i.cjs" };
  assert.equal(resolveConditional(v, ESM).target, "./i.mjs");
  assert.equal(resolveConditional(v, CJS).target, "./i.cjs");
});

// ───────────────────────── 目标合法性 / 键形态致命性 ─────────────────────────

test("目标必须以 './' 开头，裸路径是 Invalid Package Target（实测 P1）", () => {
  const index = buildExportsIndex({ ".": "index.js" });
  assert.equal(resolveConditional(index.entries[0].value, ESM).state, "invalid");
});

test("混合子路径键与条件键 → 整包 Invalid Package Configuration（实测 E3/E4）", () => {
  // 原文："If exports is an Object with both a key starting with "." and a key not starting
  //   with ".", throw an Invalid Package Configuration error."
  assert.equal(buildExportsIndex({ ".": "./i.js", import: "./i.mjs" }).unparseable, true);
  assert.equal(buildExportsIndex({ ".": "./i.js", xyz: "./z.js" }).unparseable, true);
});

test("exports: null 等同未声明（Node 回落 main/index），不是屏蔽（实测 G1）", () => {
  const d = describeExports({ exports: null, main: "./main.js" });
  assert.equal(d.declared, false);
  assert.equal(d.parseState, "NOT_DECLARED");
});

// ───────────────────────── require 分支存在性（§5.2 第 2 条判据） ─────────────────────────

test("hasRequireBranch 能看见嵌套条件内部的 require", () => {
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": { import: "./i.mjs" } })), false);
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": { import: "./i.mjs", require: "./i.cjs" } })), true);
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": { node: { require: "./n.cjs" } } })), true);
  assert.equal(
    hasRequireBranch(buildExportsIndex({ "./x": { import: "./x.mjs" }, ".": { require: "./i.cjs" } })),
    true,
  );
  // 数组里的 require 分支也算（原文：数组逐项求值）
  assert.equal(hasRequireBranch(buildExportsIndex({ ".": [{ browser: "./b.js" }, { require: "./c.cjs" }] })), true);
});

// ───────────────────────── 指纹确定性 ─────────────────────────

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

// ───────────────────────── describeExports 汇总 ─────────────────────────

test("describeExports：chalk 形态（无 require 分支、不暴露 ./package.json）", () => {
  // 真实 chalk@6.0.1：exports = {"types":"...","default":"..."}（实测）
  const d = describeExports({ type: "module", exports: { types: "./source/index.d.ts", default: "./source/index.js" } });
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

test("describeExports：显式暴露 ./package.json 时 exposesPackageJson=true（zod/date-fns/glob 实测）", () => {
  const d = describeExports({ exports: { ".": "./i.js", "./package.json": "./package.json" } });
  assert.equal(d.exposesPackageJson, true);
});

test("describeExports：未声明 exports 时 parseState=NOT_DECLARED（不冒充解析成功）", () => {
  const d = describeExports({ main: "./index.js" });
  assert.equal(d.declared, false);
  assert.equal(d.parseState, "NOT_DECLARED");
});