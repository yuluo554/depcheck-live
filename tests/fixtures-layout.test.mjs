// 语料目录**只入仓交付文件**这一个判据（M2 实测踩到的坑的可执行形态）。
//
// 背景（M2 实测）：为了让 `tests/fixtures-run.test.mjs` 能实跑语料，曾把本仓根部的
// `node_modules/` 各复制一份进 `fixtures/C1–C5/`（5 × 34 MB）。后果不是"仓库变大"这么轻：
// `tools/mutate-gates.mjs` 需要**整仓复制**到临时目录做 20 组变异，复制 17 万个文件时
// 反复 `ENOENT`（部分文件在复制窗口内被换出）→ 20 组里 18 组 ERROR，门当场失去意义。
//
// 正解：语料只入仓 `package.json` + `INPUT.md` + `expected.json` + `src/`，
// 实跑时把本仓根的 `node_modules` 以目录联接挂到**临时**工程上（见 fixtures-run.test.mjs）。
//
// 本测试防的是"下次又有人图省事往语料里塞依赖树或产物"。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = join(ROOT, "fixtures");

/** 语料目录允许出现的东西（顶层；`src/` 内部只允许源码扩展名 + README）。 */
const ALLOWED_TOP = new Set([
  "INPUT.md",
  "expected.json",
  "package.json",
  "src",
  "README.md",
  "node_modules", // 存在也不合法，但要在下面给出具体报错而不是"未知文件"
]);

const CASE_DIRS = [
  "resolved-basic",
  "missing-export",
  "esm-cjs-mismatch",
  "subpath-blocked",
  "ambiguous-dynamic",
  "drift-baseline",
  "clean-project",
];

test("语料目录里没有依赖树（node_modules 会拖垮变异宿主的整仓复制）", () => {
  const offenders = CASE_DIRS.filter((d) => existsSync(join(FIXTURES, d, "node_modules")));
  assert.deepEqual(
    offenders,
    [],
    `这些语料目录里有 node_modules：${offenders.join(", ")}。` +
      "语料只入仓 package.json/INPUT.md/expected.json/src/；依赖面由 tests/fixtures-run.test.mjs 在临时目录挂载",
  );
});

test("语料顶层不出现未登记的路径（防顺手塞产物）", () => {
  for (const dir of CASE_DIRS) {
    const abs = join(FIXTURES, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      assert.ok(ALLOWED_TOP.has(entry), `fixtures/${dir}/${entry} 不在允许清单里（语料目录只入仓交付文件）`);
    }
  }
});

test("语料的 package.json 声明了 dependencies，且都是五包里的真实包名（plan/04 §3 第 5 条）", () => {
  const FIVE = new Set(["chalk", "zod", "date-fns", "commander", "glob"]);
  for (const dir of CASE_DIRS) {
    const p = join(FIXTURES, dir, "package.json");
    if (!existsSync(p)) continue;
    const pkg = JSON.parse(readFileSync(p, "utf8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    assert.ok(deps.length > 0, `fixtures/${dir}/package.json 应有 dependencies（否则 bench 无输入）`);
    const notReal = deps.filter((d) => !FIVE.has(d));
    assert.deepEqual(notReal, [], `fixtures/${dir} 声明了非五包依赖：${notReal.join(", ")}（语料不得虚构包名）`);
  }
});

test("C1–C5 的 src/ 里确实有源码文件（不是空壳目录）", () => {
  for (const dir of ["resolved-basic", "missing-export", "esm-cjs-mismatch", "subpath-blocked", "ambiguous-dynamic"]) {
    const src = join(FIXTURES, dir, "src");
    assert.ok(existsSync(src), `fixtures/${dir}/src 不存在`);
    assert.ok(statSync(src).isDirectory(), `fixtures/${dir}/src 不是目录`);
    const files = readdirSync(src).filter((f) => /\.(mjs|cjs|js|ts|tsx|vue)$/.test(f));
    assert.ok(files.length > 0, `fixtures/${dir}/src 里没有源码文件（bench 会无输入）`);
  }
});