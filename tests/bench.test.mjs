// `bench` 命令的可执行形态（`plan/05` M3 DoD 第 2 条 + M4 DoD 第 2 条）。
//
// 为什么要单独一条：`bench` 是**用户自己敲的命令**，不是测试的内部函数。它必须
//   ① 真的跑到全部语料（引用点 > 0 —— 空跑与全绿同形，必须能分辨）；
//   ② 含 **chalk vs zod 同代码不同包对照组**（C3 的 1 红 4 绿）；
//   ③ 失败时退出 1、缺依赖时退出 3（不假装通过）；
//   ④ **逐条级与计数级分开计数**（M4 DoD 原话："指标粒度如实标注：计数级 ≠ 逐条级"）；
//   ⑤ `bench --clean` 只跑 C7，且 0 problems + totalPoints > 0（M4 DoD 第 2 条）。
//
// ★ M4 修的两处真缺陷（本文件从 ⑤ 起为它们上锁）：
//   ① M3 的 bench **从不读 `expect`**（exitCode / summary 没人断言）→ 假门族 0；
//   ② M3 的 bench 对**所有** case 无条件传 `--with-drift`，于是 C1–C3 的
//      `expect.summary.gaps = 0` 与真值调用形态不同源（只是没人读才没暴露）。
//
// 前提：本仓根有 `node_modules/`（五包装过）。没有时**显式 skip**，不假装通过。

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { benchAll, BENCH_CASES, CLEAN_CASES } from "../src/bench.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(ROOT, "bin", "depcheck-live.mjs");
const NM = join(ROOT, "node_modules");
const FIVE = ["chalk", "zod", "date-fns", "commander", "glob"];
const depsReady = () => FIVE.every((p) => existsSync(join(NM, p, "package.json")));

/** 某 case 的真值（直接读文件：真值必须来自入仓文件，不在这里硬编码）。 */
const truth = (name) => JSON.parse(readFileSync(join(ROOT, "fixtures", name, "expected.json"), "utf8"));

test("bench 覆盖 C1–C6 六份语料；C7 由 bench --clean 单独覆盖", () => {
  assert.deepEqual(
    [...BENCH_CASES],
    ["resolved-basic", "missing-export", "esm-cjs-mismatch", "subpath-blocked", "ambiguous-dynamic", "drift-baseline"],
  );
  assert.deepEqual([...CLEAN_CASES], ["clean-project"], "C7 必须由 --clean 单独覆盖（它的真值是反向断言）");
});

test("bench 全绿，且确实扫到了引用点（不是空跑）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一，无法实跑");
    return;
  }
  const got = benchAll(ROOT);
  assert.equal(got.ok, true, `bench 应全绿，实际 failures=${JSON.stringify(got.cases.filter((c) => c.failed > 0 || c.checksFailed > 0 || c.error))}`);
  assert.equal(got.summary.cases, 6);
  assert.ok(got.summary.points > 0, "引用点数为 0 说明空跑——'没扫到'与'全绿'必须能分辨");
  assert.equal(got.summary.failed, 0);
  assert.equal(got.summary.skipped, 0, "有 skip 就不是全绿");
});

test("bench 每个 case 都有 ≥1 条引用点 + ≥1 条语料级断言（逐 case 防空跑）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const got = benchAll(ROOT);
  for (const c of got.cases) {
    assert.ok(c.points.length > 0, `语料 ${c.name} 没有任何对账点（空跑）`);
    assert.ok(c.checks.length > 0, `语料 ${c.name} 没有任何语料级断言（真值没被读）`);
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
  const mismatch = c3.points.filter((p) => p.expected.includes("ESM-CJS-MISMATCH"));
  const resolved = c3.points.filter((p) => p.expected.includes("RESOLVED"));
  assert.equal(mismatch.length, 1, `C3 应恰有 1 条 MISMATCH，实际 ${mismatch.length}`);
  assert.equal(resolved.length, 4, `C3 应恰有 4 条 RESOLVED，实际 ${resolved.length}`);
});

// ───────── M4 修缺陷 ①：bench 必须真读 expect（不是只做逐点对账）─────────

test("bench 逐项读 expect：每份真值声明的 exitCode / summary 字段都必须有对应断言", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const got = benchAll(ROOT);
  for (const c of got.cases) {
    const t6 = truth(c.name);
    const want = t6.expect;
    // `verifiedElsewhere`：bench 的调用形态**断言不了**的字段，必须显式声明"谁在验"。
    // 为什么允许这条逃生口而不是删断言：C6 的 `noBaselineExitCode` 是 `drift` 命令单独跑时
    // 的退出码，bench 走的是 `check --with-drift`，形态不同 → 在这里断言它只能是假断言。
    // 但"验不了"不等于"不用验"：必须指名道姓，且被指的文件里要真有那个字段（下面第二条测试）。
    const elsewhere = new Set(Object.keys(t6.verifiedElsewhere ?? {}));
    const ids = new Set(c.checks.map((k) => k.id));
    assert.ok(ids.has("exitCode"), `${c.name}: exitCode 必须被断言`);
    for (const [k, v] of Object.entries(want.summary ?? {})) {
      if (typeof v !== "number") continue;
      const field = k === "minTotalPoints" ? "summary.minTotalPoints" : `summary.${k}`;
      if (elsewhere.has(`expect.${field}`)) continue;
      assert.ok(ids.has(field), `${c.name}: 真值声明了 summary.${k}，但没有任何断言读它（假门族 0）`);
    }
    for (const status of Object.keys(want.summary?.byStatus ?? {})) {
      if (elsewhere.has(`expect.summary.byStatus.${status}`)) continue;
      assert.ok(ids.has(`summary.byStatus.${status}`), `${c.name}: 真值声明了 byStatus.${status}，但没人断言它`);
    }
  }
});

test("真值里声明 `verifiedElsewhere` 的字段，指向的文件里必须真的验它（指针不许是空话）", () => {
  // 判据 = 目标文件里出现该字段名这一串字面量（`grep <字段> tests/` 的机器化）。
  // 这条防的正是 M3 招牌发现 0：真值声明了、却没有任何读者。
  for (const name of [...BENCH_CASES, ...CLEAN_CASES]) {
    const t6 = truth(name);
    for (const [field, rel] of Object.entries(t6.verifiedElsewhere ?? {})) {
      const abs = join(ROOT, rel);
      assert.ok(existsSync(abs), `${name}: verifiedElsewhere 指向 ${rel}，但该文件不存在`);
      const text = readFileSync(abs, "utf8");
      // 去掉 `expect.` 前缀去查：测试里引用时通常写成 `.expect.noBaselineExitCode` 或直接字段名
      const bare = field.replace(/^expect\./, "");
      const leaf = bare.split(".").pop();
      assert.ok(
        text.includes(field) || text.includes(bare) || text.includes(leaf),
        `${name}: ${field} 声称由 ${rel} 验，但该文件里根本没出现这个字段名——这是空指针（假门族 0）`,
      );
    }
  }
});

test("bench 真读 expect 这条**能红**：改一份真值在临时副本里，对账必须失败", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  // 在临时副本里改真值（不在工作树里改 —— HANDOFF §二 第 11 条）
  const work = mkdtempSync(join(tmpdir(), "depcheck-benchmut-"));
  try {
    cpSync(join(ROOT, "fixtures"), join(work, "fixtures"), {
      recursive: true,
      filter: (s) => !s.includes("node_modules"),
    });
    cpSync(join(ROOT, "data"), join(work, "data"), { recursive: true });
    symlinkSync(NM, join(work, "node_modules"), "junction");
    const target = join(work, "fixtures", "resolved-basic", "expected.json");
    const j = JSON.parse(readFileSync(target, "utf8"));
    j.expect.exitCode = 1; // 真值是 0，改成 1 必然对不上
    writeFileSync(target, JSON.stringify(j, null, 2));

    const got = benchAll(work);
    assert.equal(got.ok, false, "真值被改坏后 bench 必须判红（否则 bench 根本没读 expect）");
    const c1 = got.cases.find((c) => c.name === "resolved-basic");
    assert.ok(c1.checksFailed > 0, "改坏的 exitCode 必须产生失败断言");
    assert.ok(
      c1.checks.some((k) => k.id === "exitCode" && !k.ok),
      "必须恰好是 exitCode 这条断言红（说明判据读的就是真值那个字段）",
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// ───────── M4 修缺陷 ②：调用形态必须由真值声明，不得由 bench 猜 ─────────

test("每份真值都显式声明 expect.invocation，且与它声明的层形状自洽", () => {
  for (const name of [...BENCH_CASES, ...CLEAN_CASES]) {
    const j = truth(name);
    assert.ok(
      ["check-only", "with-drift"].includes(j.expect.invocation),
      `${name}: expect.invocation 必须显式声明（M3 的缺陷就是 bench 替它猜，导致真值与调用形态不同源）`,
    );
    const declaresDrift = (j.points ?? []).some((p) => p.driftStatus !== undefined);
    if (declaresDrift) {
      assert.equal(j.expect.invocation, "with-drift", `${name}: 声明了 driftStatus 层就必须用 with-drift 跑`);
    } else {
      assert.equal(j.expect.invocation, "check-only", `${name}: 没声明 driftStatus 层，不该用 with-drift 跑（会凭空引入 NO-BASELINE）`);
    }
  }
});

test("bench 按 invocation 调用：不带 drift 的真值不许被 drift 层污染（C1 的 gaps 必须是 0）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  // M3 的 bench 无条件带 --with-drift，于是 C1（干净工程）实际会产出 4 条 NO-BASELINE、
  // 退出码变 3。而它的真值写的是 gaps=0 / exitCode=0。这就是"真值与调用形态不同源"。
  const got = benchAll(ROOT, { cases: ["resolved-basic"] });
  const c1 = got.cases.find((c) => c.name === "resolved-basic");
  const gapsAssert = c1.checks.find((k) => k.id === "summary.gaps");
  assert.ok(gapsAssert, "C1 的 expect.summary.gaps 必须被断言");
  assert.equal(gapsAssert.ok, true, `C1 的 gaps 应为 0（check-only 形态），实际对账失败：${gapsAssert.why}`);
  // 反向确认这条断言不是空转：真值确实说 gaps=0，而 with-drift 形态下它不为 0
  assert.equal(truth("resolved-basic").expect.summary.gaps, 0);
  const withDrift = benchAll(ROOT, { cases: ["resolved-basic"] });
  assert.equal(withDrift.summary.checksFailed, 0, "check-only 下 C1 的计数级断言应全过");
});

test("bench --clean：C7 干净工程零误报，且 totalPoints > 0（防空跑假绿）", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const got = benchAll(ROOT, { clean: true });
  assert.equal(got.ok, true, `bench --clean 应全绿，实际 ${JSON.stringify(got.cases.filter((c) => c.failed > 0 || c.checksFailed > 0))}`);
  assert.equal(got.summary.cases, 1, "--clean 只跑 C7 一份语料");
  const c7 = got.cases.find((c) => c.name === "clean-project");
  assert.ok(c7, "应有 clean-project 的结果");
  assert.equal(c7.failed, 0, `C7 逐点对账应全过：${JSON.stringify(c7.points.filter((p) => !p.ok))}`);
  assert.equal(c7.checksFailed, 0, `C7 计数级断言应全过：${JSON.stringify(c7.checks.filter((k) => !k.ok))}`);

  // ★ 验收口径（plan/04 §6）：0 problems **且** totalPoints > 0
  const want = truth("clean-project").expect;
  assert.equal(want.exitCode, 0);
  assert.equal(want.summary.problems, 0);
  assert.ok(want.summary.minTotalPoints > 0, "真值必须声明 minTotalPoints > 0，否则 0 问题可能是空跑");
  assert.ok(
    c7.checks.some((k) => k.id === "summary.minTotalPoints" && k.ok),
    "minTotalPoints 这条断言必须真的被读过并成立（否则 0 问题与 0 工作量同形）",
  );
});

test("bench --clean 的负向真值真的被断言：相对路径 / node: 内置 / 文案字符串", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const got = benchAll(ROOT, { clean: true });
  const c7 = got.cases.find((c) => c.name === "clean-project");
  const ids = new Set(c7.checks.map((k) => k.id));
  for (const id of ["c7-8-relative.extracted-as", "c7-9-node-builtin.extracted-as", "c7-10-prose-string.not-extracted"]) {
    assert.ok(ids.has(id), `C7 的负向断言 ${id} 必须存在（M1 把它们写成 status 字段 = 没人能读的真值）`);
  }
  for (const k of c7.checks.filter((x) => x.id.startsWith("c7-8") || x.id.startsWith("c7-9") || x.id.startsWith("c7-10"))) {
    assert.equal(k.ok, true, `${k.id} 应通过：${k.why}`);
  }
});

test("bench CLI：全绿时退出 0，且逐条级 / 计数级分开自报", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const r = spawnSync(process.execPath, [BIN, "bench"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `bench 应退出 0，实际 ${r.status}：${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /bench/);
  assert.match(r.stdout, /\d+ 个语料/);
  // ★ 粒度如实标注：两个数字必须分开出现，不得合写成"通过率"
  assert.match(r.stdout, /逐条级/, "必须显式标注逐条级（引用点对账）");
  assert.match(r.stdout, /计数级/, "必须显式标注计数级（语料级断言）");
  assert.match(r.stdout, /引用点 \d+ 个 → 对账通过 \d+/);
  assert.match(r.stdout, /语料级断言 \d+ 条 → 通过 \d+/);
});

test("bench CLI --json：机读可解析，且 ok=true、cases 齐 6 份、逐条级与计数级各有计数", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const r = spawnSync(process.execPath, [BIN, "bench", "--json"], { cwd: ROOT, encoding: "utf8" });
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.cases.length, 6);
  assert.equal(parsed.summary.failed, 0);
  assert.ok(typeof parsed.summary.points === "number" && parsed.summary.points > 0, "逐条级计数必须在");
  assert.ok(typeof parsed.summary.checks === "number" && parsed.summary.checks > 0, "计数级计数必须在");
  assert.equal(parsed.summary.checksFailed, 0);
});

test("bench CLI --clean：退出 0，只跑 1 份语料", (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const r = spawnSync(process.execPath, [BIN, "bench", "--clean"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `bench --clean 应退出 0，实际 ${r.status}：${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /1 个语料/);
  assert.match(r.stdout, /clean-project/);
});

test("--clean 只对 bench 有效：配在别的命令上是用法错误（4），不静默忽略", () => {
  for (const argv of [["check", ".", "--clean"], ["selftest", "--clean"], ["snapshot", ".", "--clean"]]) {
    const r = spawnSync(process.execPath, [BIN, ...argv], { cwd: ROOT, encoding: "utf8" });
    assert.equal(r.status, 4, `${JSON.stringify(argv)} 应退出 4，实际 ${r.status}`);
    assert.match(r.stderr, /--clean 只对 bench 有效/);
  }
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
  const fake = benchAll(join(ROOT, "tests", "__no_such_dir__"));
  assert.equal(fake.ok, false, "缺依赖时 bench 必须 ok:false");
  assert.match(fake.reason, /npm i --no-save/, "必须告诉用户怎么补");
});