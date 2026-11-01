// 路径相对化（隐私红线：产物与日志中不得出现用户绝对路径）。

import test from "node:test";
import assert from "node:assert/strict";
import { toRelative, normalizeSlashes, stableSort } from "../src/paths.mjs";

test("同根下的绝对路径相对化，且一律正斜杠", () => {
  const root = process.platform === "win32" ? "C:\\work\\proj" : "/work/proj";
  const abs = process.platform === "win32" ? "C:\\work\\proj\\src\\a.mjs" : "/work/proj/src/a.mjs";
  assert.equal(toRelative(root, abs), "src/a.mjs");
});

test("相对化结果不含盘符与根段", () => {
  const root = process.platform === "win32" ? "C:\\work\\proj" : "/work/proj";
  const abs = process.platform === "win32" ? "C:\\work\\proj\\deep\\nested\\x.ts" : "/work/proj/deep/nested/x.ts";
  const rel = toRelative(root, abs);
  assert.ok(!/[A-Za-z]:/.test(rel), `结果里不应有盘符: ${rel}`);
  assert.ok(!rel.startsWith("/"), `结果不应是绝对路径: ${rel}`);
});

test("根与目标相同时返回 '.'", () => {
  const root = process.platform === "win32" ? "C:\\work\\proj" : "/work/proj";
  assert.equal(toRelative(root, root), ".");
});

test("normalizeSlashes 把反斜杠统一成正斜杠", () => {
  assert.equal(normalizeSlashes("a\\b\\c"), "a/b/c");
  assert.equal(normalizeSlashes("a/b/c"), "a/b/c");
});

test("stableSort 结果与输入顺序无关（确定性）", () => {
  const a = ["b", "a", "c"];
  const b = ["c", "b", "a"];
  assert.deepEqual(stableSort(a), stableSort(b));
  assert.deepEqual(stableSort(a), ["a", "b", "c"]);
});