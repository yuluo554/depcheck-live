// 引用点抽取：静态形态要抽得到，动态形态**必须**落 ambiguous（漏一个 = 对用户撒一次"没问题"）。

import test from "node:test";
import assert from "node:assert/strict";
import { scanText, parseImportClause, isKnownKind } from "../src/scan.mjs";

const scan = (src) => scanText(src, "a.mjs");

test("import 默认 / 具名 / 命名空间 / 副作用", () => {
  const points = scan([
    'import chalk from "chalk";',
    'import { z, ZodError } from "zod";',
    'import * as fs from "node:fs";',
    'import "side-effect";',
  ].join("\n"));
  const specifiers = points.map((p) => p.specifier);
  assert.deepEqual(specifiers, ["chalk", "zod", "node:fs", "side-effect"]);
  assert.deepEqual(points[0].imported, ["default"]);
  assert.deepEqual(points[1].imported, ["z", "ZodError"]);
  assert.deepEqual(points[2].imported, ["*"]);
});

test("export ... from", () => {
  const points = scan('export { a, b as c } from "pkg";');
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "export-from");
  assert.equal(points[0].specifier, "pkg");
});

test("require 静态字面量", () => {
  const points = scan('const chalk = require("chalk");');
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "require");
  assert.equal(points[0].specifier, "chalk");
});

test("动态 require(变量) → ambiguous（显式，不可丢）", () => {
  const points = scan("const p = require(name);");
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "ambiguous");
  assert.equal(points[0].specifier, null);
  assert.match(points[0].note, /require\(/);
});

test("动态 import(变量) → ambiguous", () => {
  const points = scan("await import(name);");
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "ambiguous");
});

test("模板拼接 require(`./${x}`) → ambiguous", () => {
  const points = scan("const m = require(`./${x}`);");
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "ambiguous");
});

test("import(\"字面量\") 是动态导入但 specifier 可静态确定", () => {
  const points = scan('await import("glob");');
  assert.equal(points.length, 1);
  assert.equal(points[0].kind, "dynamic-import");
  assert.equal(points[0].specifier, "glob");
});

test("jest.mock / vi.mock 也计入引用面", () => {
  const points = scan('jest.mock("chalk");\nvi.mock("zod");');
  assert.deepEqual(points.map((p) => p.specifier), ["chalk", "zod"]);
  assert.ok(points.every((p) => p.kind === "jest-mock"));
});

test("行号指向源行（CRLF 与 LF 下同号）", () => {
  const lf = '// c\nimport a from "a";\n';
  const crlf = '// c\r\nimport a from "a";\r\n';
  assert.equal(scanText(lf, "x")[0].line, 2);
  assert.equal(scanText(crlf, "x")[0].line, 2);
});

test("含宽字符的行不改变行号", () => {
  const src = '// 中文注释 😀\nconst x = require("zod");\n';
  assert.equal(scanText(src, "x")[0].line, 2);
});

test("每个抽出的 kind 都在契约枚举里（新增 kind 忘了进 contract 会被这条抓）", () => {
  const src = [
    'import a from "a";',
    'export { b } from "b";',
    'require("c");',
    'import("d");',
    'jest.mock("e");',
    "require(v);",
  ].join("\n");
  for (const p of scan(src)) {
    assert.ok(isKnownKind(p.kind), `kind ${p.kind} 不在 contract.KIND 里`);
  }
});

test("parseImportClause 处理 as 别名与 type 修饰", () => {
  assert.deepEqual(parseImportClause("{ a as b, c }"), ["a", "c"]);
  assert.deepEqual(parseImportClause("{ type T, x }"), ["T", "x"]);
  assert.deepEqual(parseImportClause("defaultImport, { named }"), ["named", "default"]);
});