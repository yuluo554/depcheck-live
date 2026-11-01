// 引用点抽取的**边界与覆盖**：宽字符 / CRLF / 超长行都要保住"行号指向源行"；
// 调用点参数分类要**不漏**（漏一个 AMBIGUOUS = 对用户撒一次"没问题"）。
//
// 本文件是 M2 的 DoD2 + DoD3 落点（M0 的 tests/scan.test.mjs 只钉住基本形态，
// 超长行与"字面量+变量拼接"整族是 M2 补的）。

import test from "node:test";
import assert from "node:assert/strict";
import { scanText } from "../src/scan.mjs";

const scan = (src) => scanText(src, "a.mjs");

test("超长行（>100 KiB 单行）之后的行号仍指向源行", () => {
  // 构造：第 1 行是一个巨大的对象字面量，第 2 行才是真引用点。
  // 若实现按"字节偏移 ÷ 某常数"或先截断再切行，第 2 行会被算错。
  const hugeLine = `const blob = { ${Array.from({ length: 20000 }, (_, i) => `k${i}: ${i}`).join(", ")} };`;
  assert.ok(hugeLine.length > 100 * 1024, `构造失败：超长行只有 ${hugeLine.length} 字节`);
  const src = `${hugeLine}\nimport { z } from "zod";\n`;
  const points = scan(src);
  assert.equal(points.length, 1, "超长行本身不应产出引用点");
  assert.equal(points[0].line, 2, "行号必须指向源行 2，不能被前一行的长度带偏");
  assert.equal(points[0].specifier, "zod");
});

test("超长行**内部**的引用点也报所在行（同一行多个点不跳号）", () => {
  const filler = "x".repeat(50000);
  const src = `const s = "${filler}"; import { a } from "chalk";\nimport { b } from "zod";\n`;
  const points = scan(src);
  assert.equal(points.length, 2);
  assert.equal(points[0].line, 1);
  assert.equal(points[1].line, 2);
});

test("CRLF + 宽字符 + 超长行三者混合时行号仍正确", () => {
  const hugeLine = `// 中文注释 😀 ${"宽".repeat(60000)}`;
  const src = `${hugeLine}\r\nconst { red } = require("chalk");\r\n`;
  const points = scan(src);
  assert.equal(points.length, 1);
  assert.equal(points[0].line, 2);
  assert.deepEqual(points[0].imported, ["red"]);
});

test("字面量 + 变量拼接整族都落 ambiguous（不得漏判，也不得被当成静态）", () => {
  const forms = [
    'const m = require("chalk" + suffix);',
    'const m = require("./" + name);',
    'const m = require(`chalk/${x}`);',
    'const m = require(["chalk"].join(""));',
    'const n = import("chalk" + s);',
  ];
  for (const src of forms) {
    const points = scan(src);
    assert.equal(points.length, 1, `${src} 应抽出恰好 1 个引用点，实际 ${points.length}（漏判 = 沉默）`);
    assert.equal(points[0].kind, "ambiguous", `${src} 必须落 ambiguous`);
    assert.equal(points[0].specifier, null);
  }
});

test("不含插值的模板串是**静态**的（不得误判成 ambiguous）", () => {
  const points = scan("const m = require(`chalk`);");
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "require");
  assert.equal(points[0].specifier, "chalk");
});

test("解构 require 抽出被取用的符号（imported 不能恒为空）", () => {
  // 这条防的是 M2 实测踩到的索引错位：`REQUIRE_DESTRUCTURED` 从 `const` 起匹配，
  // 而调用点下标从 `require` 起算，早期版本拿前者当键 → imported 恒为空 →
  // 判定层把 C2/C3 的红条目全读成"不取符号"而判绿。
  const cases = [
    ['const { red } = require("chalk");', ["red"]],
    ['const { a, b: c } = require("p");', ["a", "b"]],
    ['const { ...rest } = require("p");', ["rest"]],
    ['const { a = 1 } = require("p");', ["a"]],
    ['let { x } = require("p");', ["x"]],
    ['var { y } = require("p");', ["y"]],
  ];
  for (const [src, want] of cases) {
    const points = scan(src);
    assert.equal(points.length, 1, src);
    assert.equal(points[0].kind, "require");
    assert.deepEqual(points[0].imported, want, `${src} 的 imported 应为 ${want}`);
  }
});

test("非解构的 require 不虚报符号", () => {
  for (const src of ['const ns = require("chalk");', 'require("chalk");', 'const m = require("chalk").default;']) {
    const points = scan(src);
    assert.equal(points.length, 1, src);
    assert.deepEqual(points[0].imported, [], `${src} 不该报出具名符号`);
  }
});

test("同一行的多个调用点按出现位置排序（确定性）", () => {
  const points = scan('const a = require("chalk"); const b = require("zod");');
  assert.deepEqual(points.map((p) => p.specifier), ["chalk", "zod"]);
});

test("参数跨行（本行没有闭合括号）时仍产出 ambiguous，不静默丢弃", () => {
  const points = scan("const m = require(");
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "ambiguous");
});