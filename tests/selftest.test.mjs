// `selftest` 命令的可执行形态（`plan/05` M4 DoD 第 1 条：
// "断言退出码 0/1/3/4 语义（含『零命中 vs 算不了』不同码）"）。
//
// 为什么单开一条测试：`selftest` 是**用户自己敲的命令**，它的输出就是"这台机器上这个安装
// 可信不可信"的结论。测试要证明的不是"函数返回了对象"，而是：
//   ① 四个码**各自至少有一条断言真的诱发出来了**（`2` 从不出现）；
//   ② 每条断言的**附加条件**都在读实跑结果（不是恒真的装饰）；
//   ③ 命令层退出码语义：断言全过 → 0，有断言失败 → 1（**不是** 3，也不是静默 0）；
//   ④ 它**不写仓库**（现场造的工程一律落在系统 tmp，跑完即删）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { selftestAll, renderSelftest } from "../src/selftest.mjs";
import { EXIT } from "../src/contract.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(ROOT, "bin", "depcheck-live.mjs");

test("selftest：8 条断言全过，四个退出码各至少一条覆盖", () => {
  const s = selftestAll();
  assert.equal(s.ok, true, `自检应全过，失败项：${JSON.stringify(s.cases.filter((c) => !c.ok))}`);
  assert.deepEqual(
    s.summary.covered,
    [EXIT.OK, EXIT.PROBLEMS, EXIT.CANNOT_COMPUTE, EXIT.USAGE],
    "退出码语义必须四个都覆盖到（少一个 = 那条口径没人诱发）",
  );
  assert.equal(s.summary.failed, 0);
});

test("selftest：`2` 保留不用（EXIT 里没有这个键）", () => {
  const s = selftestAll();
  const two = s.cases.find((c) => c.id === "exit-2-reserved");
  assert.ok(two, "应有 exit-2-reserved 这条断言");
  assert.equal(two.ok, true, "EXIT 里不得出现 2（data/README.md §5.1：2 保留不用）");
  assert.equal(Object.values(EXIT).includes(2), false);
});

test("selftest：每个码的断言条数 ≥1，且 id 不重复（防同一条被算两遍）", () => {
  const s = selftestAll();
  const ids = s.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `自检 id 有重复：${ids.join(",")}`);
  for (const code of [EXIT.OK, EXIT.PROBLEMS, EXIT.CANNOT_COMPUTE, EXIT.USAGE]) {
    const matching = s.cases.filter((c) => c.expected === code);
    assert.ok(matching.length >= 1, `退出码 ${code} 没有任何断言诱发它`);
  }
  // `3` 有两个独立触发源（依赖缺失 / 基准缺失），必须各有一条
  const three = s.cases.filter((c) => c.expected === EXIT.CANNOT_COMPUTE);
  assert.ok(three.length >= 2, `退出码 3 应至少两条（依赖缺失 + 基准缺失），实际 ${three.length}`);
  assert.ok(three.some((c) => c.id.includes("no-node-modules")), "缺 node_modules 的 3 必须有独立断言");
  assert.ok(three.some((c) => c.id.includes("no-baseline")), "缺基线的 3 必须有独立断言（§5.1 的第二个来源）");
});

test("selftest：附加条件真的在读实跑结果（totalPoints / problems / NO-BASELINE 都有实数）", () => {
  // 防假门族 ⑱：断言写得像在检查、其实恒真。
  // 判据 = 每条带附加条件的断言，其 `extra()` 读过的东西必须在别处可独立观测到。
  // 这里用最直接的可观测物：干净工程的引用点数 > 0（否则 exit-0 那条是空跑）。
  const s = selftestAll();
  const clean = s.cases.find((c) => c.id === "exit-0-clean");
  assert.equal(clean.ok, true);
  assert.equal(clean.actual, EXIT.OK);
  // 源码级确认：`extra` 确实被 verdict() 调用过（不是写了个没人用的回调）
  const src = readFileSync(join(ROOT, "src", "selftest.mjs"), "utf8");
  assert.match(src, /extra\s*\(\s*\)/, "verdict() 必须真的调用 extra()，否则附加条件是死代码");
  assert.match(src, /summary\.totalPoints\s*>\s*0/, "exit-0 的附加条件必须检查 totalPoints > 0");
  assert.match(src, /summary\.problems\s*>\s*0/, "exit-1 的附加条件必须检查 problems > 0");
  assert.match(src, /NO-BASELINE/, "exit-3-no-baseline 的附加条件必须检查 NO-BASELINE 真的产出");
});

test("selftest CLI：人读输出自报断言数与覆盖的码，退出 0", () => {
  const r = spawnSync(process.execPath, [BIN, "selftest"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `selftest 应退出 0，实际 ${r.status}：${r.stderr}`);
  assert.match(r.stdout, /selftest/);
  assert.match(r.stdout, /\d+ 条断言/);
  assert.match(r.stdout, /退出码语义覆盖/);
  for (const code of ["0", "1", "3", "4"]) {
    assert.ok(r.stdout.includes(code), `输出里应出现退出码 ${code}`);
  }
  assert.match(r.stdout, /2 保留不用/, "必须显式写明 2 保留不用");
});

test("selftest CLI --json：机读可解析，且 ok=true、四个码都在 covered 里", () => {
  const r = spawnSync(process.execPath, [BIN, "selftest", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.summary.covered, [0, 1, 3, 4]);
  assert.equal(parsed.summary.failed, 0);
});

test("selftest 输出不含绝对路径（隐私红线：它现场造临时工程，最容易漏路径）", () => {
  const r = spawnSync(process.execPath, [BIN, "selftest"], { cwd: ROOT, encoding: "utf8" });
  assert.ok(!/[A-Za-z]:[\\/]/.test(r.stdout), `输出里出现盘符路径：${r.stdout.slice(0, 400)}`);
  assert.ok(!r.stdout.includes(ROOT), "输出里出现了仓库绝对路径");
  assert.ok(!r.stdout.includes("depcheck-selftest-"), `输出里出现了临时目录名：${r.stdout.slice(0, 400)}`);
});

test("selftest 不接受路径参数（用法错误 → 4）", () => {
  const r = spawnSync(process.execPath, [BIN, "selftest", "somepath"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, EXIT.USAGE);
});

test("selftest 不写仓库：跑完仓库里的文件一个字节都没变（只读纪律）", () => {
  const before = snapshotTree(ROOT);
  selftestAll();
  const after = snapshotTree(ROOT);
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  assert.deepEqual(changed, [], `selftest 改了仓库文件（${changed.join(", ")}）—— 它必须在 tmp 里造工程`);
});

/**
 * 仓库里"不该被 selftest 碰"的文件面。
 * 不扫 node_modules（5 包十几万文件，便宜不了）；fixtures/data/src 足以证伪。
 */
function snapshotTree(root) {
  const out = {};
  for (const dir of ["src", "bin", "fixtures", "data"]) {
    const abs = join(root, dir);
    const entries = readdirSync(abs, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // withFileTypes + recursive 下 parentPath 给出完整父路径
      const file = join(entry.parentPath ?? entry.path, entry.name);
      const st = statSync(file);
      out[file.slice(root.length)] = `${st.size}:${st.mtimeMs}`;
    }
  }
  return out;
}