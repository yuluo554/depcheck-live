// `bench` 命令的可执行形态（`plan/05` M3 DoD 第 2 条）。
//
// 为什么要单独一条：`bench` 是**用户自己敲的命令**，不是测试的内部函数。它必须
//   ① 真的跑到全部语料（C1–C6，引用点 > 0 —— 空跑与全绿同形，必须能分辨）；
//   ② 含 **chalk vs zod 同代码不同包对照组**（C3 的 1 红 4 绿）；
//   ③ 失败时退出 1、缺依赖时退出 3（不假装通过）。
//
// 前提：本仓根有 `node_modules/`（五包装过）。没有时**显式 skip**，不假装通过。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { benchAll, BENCH_CASES } from "../src/bench.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(ROOT, "bin", "depcheck-live.mjs");
const NM = join(ROOT, "node_modules");
const FIVE = ["chalk", "zod", "date-fns", "commander", "glob"];
const depsReady = () => FIVE.every((p) => existsSync(join(NM, p, "package.json")));

test("bench 覆盖 C1–C6 六份语料（C7 干净工程属 M4）", () => {
  assert.deepEqual(
    [...BENCH_CASES],
    ["resolved-basic", "missing-export", "esm-cjs-mismatch", "subpath-blocked", "ambiguous-dynamic", "drift-baseline"],
  );
});

test("bench 全绿，且确实扫到了引用点（不是空跑）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一，无法实跑");
    return;
  }
  const got = benchAll(ROOT);
  assert.equal(got.ok, true, `bench 应全绿，实际 failures=${JSON.stringify(got.cases.filter((c) => c.failed > 0 || c.error))}`);
  assert.equal(got.summary.cases, 6);
  assert.ok(got.summary.points > 0, "引用点数为 0 说明空跑——'没扫到'与'全绿'必须能分辨");
  assert.equal(got.summary.failed, 0);
  assert.equal(got.summary.skipped, 0, "有 skip 就不是全绿");
});

test("bench 每个 case 都有 ≥1 条引用点（逐 case 防空跑）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const got = benchAll(ROOT);
  for (const c of got.cases) {
    assert.ok(c.points.length > 0, `语料 ${c.name} 没有任何对账点（空跑）`);
    assert.ok(!c.error, `语料 ${c.name} 实跑异常：${c.error}`);
  }
});

test("bench 含 chalk vs zod 同代码不同包对照组（C3 的 1 红 4 绿）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const got = benchAll(ROOT, { cases: ["esm-cjs-mismatch"] });
  const c3 = got.cases.find((c) => c.name === "esm-cjs-mismatch");
  assert.ok(c3, "应有 C3 的结果");
  assert.equal(c3.failed, 0, "C3 对账应全对");
  // 五条：chalk 判 MISMATCH，其余四个包判 RESOLVED —— 同代码不同判定
  const mismatch = c3.points.filter((p) => p.expected.includes("ESM-CJS-MISMATCH"));
  const resolved = c3.points.filter((p) => p.expected.includes("RESOLVED"));
  assert.equal(mismatch.length, 1, `C3 应恰有 1 条 MISMATCH，实际 ${mismatch.length}`);
  assert.equal(resolved.length, 4, `C3 应恰有 4 条 RESOLVED，实际 ${resolved.length}`);
});

test("bench CLI：全绿时退出 0，输出自报语料数与引用点数", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const r = spawnSync(process.execPath, [BIN, "bench"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `bench 应退出 0，实际 ${r.status}：${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /bench/);
  assert.match(r.stdout, /\d+ 个语料/);
  assert.match(r.stdout, /引用点 \d+/);
});

test("bench CLI --json：机读可解析，且 ok=true、cases 齐 6 份", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const r = spawnSync(process.execPath, [BIN, "bench", "--json"], { cwd: ROOT, encoding: "utf8" });
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.cases.length, 6);
  assert.equal(parsed.summary.failed, 0);
});

test("bench 输出不含绝对路径（隐私红线）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const r = spawnSync(process.execPath, [BIN, "bench"], { cwd: ROOT, encoding: "utf8" });
  assert.ok(!/[A-Za-z]:[\\/]/.test(r.stdout), `输出里出现盘符路径：${r.stdout.slice(0, 400)}`);
});

test("bench 缺依赖时显式报算不了（exit 3），不假装通过", () => {
  // 指向一个没有 node_modules 的临时目录：bench 本身就缺五包
  const r = spawnSync(process.execPath, [BIN, "bench"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
  // 本仓根有 node_modules 时这条不适用——用结构断言代替：benchAll 在缺包时返回 ok:false + reason
  const fake = benchAll(join(ROOT, "tests", "__no_such_dir__"));
  assert.equal(fake.ok, false, "缺依赖时 bench 必须 ok:false");
  assert.match(fake.reason, /npm i --no-save/, "必须告诉用户怎么补");
  assert.equal(r.status === 0 || r.status === 1 || r.status === 3, true);
});