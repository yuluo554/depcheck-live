// 语料实跑：`fixtures/C1–C5` 的 `expected.json` 是**真值**，本文件让它们真的跑一遍。
//
// 为什么这条测试是必须的：`tests/fixtures.test.mjs` 只检查语料的**形状**（齐备、可解析、
// 有 status/evidence），形状对不代表真值对——一个"永远返回 RESOLVED"的实现能让形状检查全绿。
// 本文件把 `expected.json` 的每个 point 与 `check` 的真实输出逐条对账，才是可证伪的形态。
//
// 依赖面怎么来（**不改交付面**）：
//   语料目录只入仓 `package.json` + `INPUT.md` + `expected.json` + `src/`（见 plan/04 §1：
//   `node_modules/` 不入库）。实跑时把每份语料复制到临时目录，再把**本仓根部**的
//   `node_modules/` 以目录联接挂上去——五包是同一批安装，事实面完全相同。
//   这样既不用往仓库里塞 5 × 34 MB 的副本（那会让 `tools/mutate-gates.mjs` 的整仓复制炸掉），
//   又保证"跑的是真实五包"。
//
// 前提：本仓根有 `node_modules/`（五包装过）。没有时**显式 skip**，不假装通过。

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(ROOT, "bin", "depcheck-live.mjs");
const FIXTURES = join(ROOT, "fixtures");
const ROOT_NM = join(ROOT, "node_modules");

const FIVE = ["chalk", "zod", "date-fns", "commander", "glob"];

/** C1–C5（C6 属 M3、C7 属 M4）。 */
const CASES = ["resolved-basic", "missing-export", "esm-cjs-mismatch", "subpath-blocked", "ambiguous-dynamic"];

/** C6 的实跑要带 `--with-drift` + 本仓基线，单独一组（M3 落位）。 */
const C6 = "drift-baseline";

/** 五包是否都在本仓根装好（缺一个就不跑，避免"半装"给出假结论）。 */
const depsReady = () => FIVE.every((p) => existsSync(join(ROOT_NM, p, "package.json")));

/**
 * 把一份语料落到临时工程目录：复制语料里的**入仓文件**，再把本仓 `node_modules` 挂上来。
 * @returns {string} 临时工程根的绝对路径
 */
function materialize(dir) {
  const work = mkdtempSync(join(tmpdir(), `depcheck-fixture-${dir}-`));
  cpSync(join(FIXTURES, dir), work, {
    recursive: true,
    filter: (src) => !src.includes("node_modules"), // 语料里不应该有它；有也不带
  });
  symlinkSync(ROOT_NM, join(work, "node_modules"), "junction");
  return work;
}

function runCheck(dir) {
  const r = spawnSync(process.execPath, [BIN, "check", dir, "--json"], { cwd: ROOT, encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", parsed };
}

const readExpected = (dir) => JSON.parse(readFileSync(join(FIXTURES, dir, "expected.json"), "utf8"));

/**
 * 把 findings 拉平成 `file|line|specifier` → status 的查找表。
 * `findings` 是**逐引用点的判定**（含 RESOLVED），与 `expected.json` 的 points 一一对应。
 */
function indexFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = `${f.file}|${f.line}|${f.specifier ?? ""}`;
    // 同一 key 若出现两次，说明抽取层把一个引用点算了两遍——按契约不该发生
    assert.ok(!map.has(key), `同一引用点被判两次: ${key}`);
    map.set(key, f);
  }
  return map;
}

for (const dir of CASES) {
  test(`${dir}：逐点 status 与 expected.json 一致（真值对账，不是形状检查）`, (t) => {
    if (!depsReady()) {
      t.skip(`本仓根 node_modules 缺五包之一（npm i --no-save ${FIVE.join(" ")}），无法实跑`);
      return;
    }
    const work = materialize(dir);
    try {
      const expected = readExpected(dir);
      const run = runCheck(work);
      assert.ok(run.parsed, `输出不是合法 JSON: ${run.out.slice(0, 300)}`);
      assert.equal(run.code, expected.expect.exitCode, `退出码应为 ${expected.expect.exitCode}，实际 ${run.code}`);

      const actual = indexFindings(run.parsed.findings);
      for (const point of expected.points) {
        const key = `${point.file}|${point.line}|${point.specifier ?? ""}`;
        const got = actual.get(key);
        assert.ok(got, `expected.json 的 ${point.id}（${key}）在实跑结果里找不到——抽取层漏了这条引用点`);
        assert.equal(got.status, point.status, `${point.id}（${key}）判定态应为 ${point.status}，实际 ${got.status}`);
      }

      // 反向：实跑出现的每个非 RESOLVED 判定，都必须能在 expected.json 里找到声明
      // （防"多判了一条没人认领的红"）
      const declared = new Set(expected.points.map((p) => `${p.file}|${p.line}|${p.specifier ?? ""}`));
      for (const [key, f] of actual) {
        if (f.status === "RESOLVED") continue;
        assert.ok(declared.has(key), `实跑多出一条未在 expected.json 声明的 ${f.status}: ${key}`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test(`${dir}：summary 与 expected.json 的 expect.summary 一致`, (t) => {
    if (!depsReady()) {
      t.skip(`本仓根 node_modules 缺五包之一`);
      return;
    }
    const work = materialize(dir);
    try {
      const want = readExpected(dir).expect.summary;
      const got = runCheck(work).parsed.summary;
      assert.equal(got.problems, want.problems, `${dir}: problems 应为 ${want.problems}，实际 ${got.problems}`);
      assert.equal(got.gaps, want.gaps, `${dir}: gaps 应为 ${want.gaps}，实际 ${got.gaps}`);
      if (want.ambiguous !== undefined) {
        assert.equal(got.ambiguous, want.ambiguous, `${dir}: ambiguous 应为 ${want.ambiguous}，实际 ${got.ambiguous}`);
      }
      if (want.minTotalPoints !== undefined) {
        assert.ok(got.totalPoints >= want.minTotalPoints, `${dir}: totalPoints 应 ≥ ${want.minTotalPoints}，实际 ${got.totalPoints}`);
      }
      if (want.byStatus) {
        for (const [status, count] of Object.entries(want.byStatus)) {
          assert.equal(got.byStatus[status] ?? 0, count, `${dir}: byStatus.${status} 应为 ${count}`);
        }
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
}

// ───────────────────── C6（drift，M3）：分层对账 ─────────────────────
//
// C6 与 C1–C5 的差别是**两层**：`check` 层的判定态 + `drift` 层的漂移结论。
// 一个引用点上两层的结论可以各自正确且不同（点 3：check=RESOLVED，drift=NO-BASELINE），
// 所以真值用 `status` / `driftStatus` 分别声明，这里也分两层对账。

test(`${C6}：逐点 status / driftStatus 与 expected.json 一致（含 chalk 式分层反例）`, (t) => {
  if (!depsReady()) {
    t.skip(`本仓根 node_modules 缺五包之一（npm i --no-save ${FIVE.join(" ")}），无法实跑`);
    return;
  }
  const work = materialize(C6);
  try {
    const expected = readExpected(C6);
    // 用 CLI 跑，确保测的是用户实际敲的那条路径（含 --with-drift 与基线目录解析）
    const r = spawnSync(
      process.execPath,
      // ★ 显式给基线目录：不依赖 cwd 的隐式解析（否则换个 cwd 就静默退化成"没读基线"）
      [BIN, "check", work, "--json", "--with-drift", "--baseline-dir", join(ROOT, "data", "fingerprints")],
      { cwd: ROOT, encoding: "utf8" },
    );
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed, `输出不是合法 JSON: ${(r.stdout ?? "").slice(0, 300)}`);

    // 两层拉平
    const checkLayer = new Map();
    for (const f of parsed.findings) checkLayer.set(`${f.file}|${f.line}|${f.specifier ?? ""}`, f.status);
    const driftLayer = new Map();
    for (const g of parsed.gaps) {
      if (g.kind === "NO-BASELINE" || g.kind === "VERSION-BEHAVIOR-DRIFT") {
        driftLayer.set(`${g.file}|${g.line}|${g.specifier ?? ""}`, g.kind);
      }
    }

    for (const point of expected.points) {
      const key = `${point.file}|${point.line}|${point.specifier ?? ""}`;
      if (point.status !== undefined) {
        assert.equal(checkLayer.get(key), point.status, `${point.id}（${key}）check 层应为 ${point.status}`);
      }
      if (point.driftStatus !== undefined) {
        assert.equal(driftLayer.get(key), point.driftStatus, `${point.id}（${key}）drift 层应为 ${point.driftStatus}`);
      }
    }

    // ★ NO-BASELINE 不是判定态：它只许出现在 gaps，绝不许混进 findings。
    //   为什么单独断言：`NO-BASELINE` 若被塞进 findings，会被 `decideExit` 当问题、
    //   被 `renderHuman` 当"问题"打印，语义整体反转——而逐点对账不一定抓得到它
    //   （因为它不在 expected.points 的 key 表里就能绕过）。M3 审计时实测这条缺过。
    assert.ok(
      !parsed.findings.some((f) => f.status === "NO-BASELINE"),
      "NO-BASELINE 不得出现在 findings 里（它不是五判定态之一，见 src/contract.mjs 的 STATUS）",
    );
    // 反向：C6 确实产出了 NO-BASELINE（否则上面那条是空转）
    assert.ok(
      parsed.gaps.some((g) => g.kind === "NO-BASELINE"),
      "C6 应产出 NO-BASELINE（否则'not in findings'这条断言是空转）",
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test(`${C6}：summary 的 problems / gaps / byStatus 与真值一致`, (t) => {
  if (!depsReady()) {
    t.skip(`本仓根 node_modules 缺五包之一`);
    return;
  }
  const work = materialize(C6);
  try {
    const want = readExpected(C6).expect.summary;
    const r = spawnSync(
      process.execPath,
      // ★ 显式给基线目录：不依赖 cwd 的隐式解析（否则换个 cwd 就静默退化成"没读基线"）
      [BIN, "check", work, "--json", "--with-drift", "--baseline-dir", join(ROOT, "data", "fingerprints")],
      { cwd: ROOT, encoding: "utf8" },
    );
    const got = JSON.parse(r.stdout).summary;
    assert.equal(got.problems, want.problems, `problems 应为 ${want.problems}，实际 ${got.problems}`);
    assert.equal(got.gaps, want.gaps, `gaps 应为 ${want.gaps}，实际 ${got.gaps}`);
    for (const [status, count] of Object.entries(want.byStatus ?? {})) {
      assert.equal(got.byStatus[status] ?? 0, count, `byStatus.${status} 应为 ${count}`);
    }
    // ★ 反"同一引用点被算两遍"：1 红不能读成 2 红
    assert.equal(got.problems, 1, "DRIFT 是同一引用点上更精确的诊断，不得与 MISSING-EXPORT 重复计数");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test(`${C6}：drift 命令单独跑时退出 1（有 DRIFT），且 NO-BASELINE 不进 problems`, (t) => {
  if (!depsReady()) {
    t.skip(`本仓根 node_modules 缺五包之一`);
    return;
  }
  const work = materialize(C6);
  try {
    const r = spawnSync(
      process.execPath,
      [BIN, "drift", work, "--json", "--baseline-dir", join(ROOT, "data", "fingerprints")],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(r.status, 1, `有 DRIFT 应退出 1，实际 ${r.status}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.summary.problems, 1);
    assert.ok(parsed.gaps.some((g) => g.kind === "NO-BASELINE"), "date-fns 无基线必须记 NO-BASELINE");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// ───────── C6 的**退出码真值**：这是 §5.1 与 §5.5 的出口判据，必须真跑断言 ─────────
//
// 为什么单独一条：`expected.json` 的 `expect.exitCodeWhenOnlyNoBaseline` /
// `exitCodeWhenDrift` 是**真值字段**，一张"声明了却没人断言"的真值等于假门——
// 改实现后这两个数字可以悄悄失配而全绿。本组把它们逐条跑出来对上。
//
// 真值一律**从 expected.json 读**，不在这里硬编码：否则改真值要改两处，
// 就又出现"两处不一致"的老毛病（`plan/04` §3 第 1 条：期望值必须能由输入独立复算）。
test(`${C6}：expect.exitCodeWhenDrift 与实跑一致（有漂移 → 1）`, (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const want = readExpected(C6).expect.exitCodeWhenDrift;
  const work = materialize(C6);
  try {
    const r = spawnSync(
      process.execPath,
      [BIN, "drift", work, "--json", "--baseline-dir", join(ROOT, "data", "fingerprints")],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(r.status, want, `真值 exitCodeWhenDrift=${want}，实际 ${r.status}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test(`${C6}：expect.exitCodeWhenOnlyNoBaseline 与实跑一致（只有缺基线 → 3，不是 0）`, (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const want = readExpected(C6).expect.exitCodeWhenOnlyNoBaseline;
  // 造一个"只有 NO-BASELINE、没有 DRIFT"的最小工程：只引用 date-fns（无基线），
  // 且引用的符号在已装版本里确实存在（避免顺带产生 MISSING-EXPORT）。
  const work = mkdtempSync(join(tmpdir(), "depcheck-c6-nb-"));
  writeFileSync(
    join(work, "package.json"),
    JSON.stringify({ name: "c6-only-no-baseline", version: "0.0.0", private: true, dependencies: { "date-fns": "^3.0.0" } }),
  );
  mkdirSync(join(work, "src"), { recursive: true });
  writeFileSync(join(work, "src", "a.mjs"), 'import { addDays } from "date-fns";\nexport const next = addDays;\n');
  symlinkSync(ROOT_NM, join(work, "node_modules"), "junction");
  try {
    const r = spawnSync(
      process.execPath,
      // ★ 用一个**空基线目录**，确保本工程只可能产出 NO-BASELINE
      [BIN, "drift", work, "--json", "--baseline-dir", join(work, "no-baselines-here")],
      { cwd: ROOT, encoding: "utf8" },
    );
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.summary.problems, 0, "只有 NO-BASELINE 时 problems 必须为 0");
    assert.ok(parsed.gaps.length > 0, "缺基线必须进 gaps");
    assert.equal(r.status, want, `真值 exitCodeWhenOnlyNoBaseline=${want}，实际 ${r.status}（回 0 就是把'没跑'写成'跑了没问题'）`);

    // ★ 同一件事在真值里写了**两遍**：`expect.exitCodeWhenOnlyNoBaseline`（顶层）
    //   与 `expect.summary.noBaselineExitCode`（摘要里）。两处若漂移，
    //   "哪一个是准的"就没人说得清——所以必须断言它们彼此相等，且都等于实跑。
    const summaryWant = readExpected(C6).expect.summary.noBaselineExitCode;
    assert.equal(
      summaryWant,
      want,
      `真值自相矛盾：expect.exitCodeWhenOnlyNoBaseline=${want} 但 expect.summary.noBaselineExitCode=${summaryWant}`,
    );
    assert.equal(r.status, summaryWant, `真值 summary.noBaselineExitCode=${summaryWant}，实际 ${r.status}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test(`${C6}：expect.summary 的三个语义字段与实跑一致（problemsCountsDrift / noBaselineCountsProblems / noBaselineGoesTo）`, (t) => {
  if (!depsReady()) {
    t.skip("本仓根 node_modules 缺五包之一");
    return;
  }
  const want = readExpected(C6).expect.summary;
  const work = materialize(C6);
  try {
    const r = spawnSync(
      process.execPath,
      [BIN, "drift", work, "--json", "--baseline-dir", join(ROOT, "data", "fingerprints")],
      { cwd: ROOT, encoding: "utf8" },
    );
    const parsed = JSON.parse(r.stdout);

    // ① problemsCountsDrift: DRIFT 算 problems
    const driftIsProblem = parsed.summary.problems >= parsed.findings.filter((f) => f.status === "VERSION-BEHAVIOR-DRIFT").length;
    assert.equal(driftIsProblem, want.problemsCountsDrift, `problemsCountsDrift 真值 ${want.problemsCountsDrift}`);

    // ② noBaselineCountsProblems: NO-BASELINE 不算 problems
    //    判据 = 把 NO-BASELINE 从 gaps 里剔掉后，problems 不变
    const noBaselineCount = parsed.gaps.filter((g) => g.kind === "NO-BASELINE").length;
    assert.ok(noBaselineCount > 0, "C6 应有 NO-BASELINE（否则这条断言是空转）");
    assert.equal(
      parsed.summary.problems,
      parsed.findings.filter((f) => f.status === "VERSION-BEHAVIOR-DRIFT").length,
      "problems 应恰好等于 DRIFT 的条数——NO-BASELINE 不得被算进 problems",
    );
    assert.equal(want.noBaselineCountsProblems, false);

    // ③ noBaselineGoesTo: NO-BASELINE 落在 gaps 里
    assert.equal(want.noBaselineGoesTo, "gaps");
    assert.ok(
      parsed.gaps.some((g) => g.kind === "NO-BASELINE"),
      "NO-BASELINE 必须出现在 gaps 里（真值说它 goesTo=gaps）",
    );
    assert.ok(
      !parsed.findings.some((f) => f.status === "NO-BASELINE"),
      "NO-BASELINE 不得出现在 findings 里（它不是判定态，见 contract.mjs）",
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("五包 + 五份语料的 parseState 全 OK（UNPARSEABLE = 0，M2 DoD1）", (t) => {
  if (!depsReady()) {
    t.skip(`本仓根 node_modules 缺五包之一，无法实跑`);
    return;
  }
  for (const dir of CASES) {
    const work = materialize(dir);
    try {
      const r = spawnSync(process.execPath, [BIN, "snapshot", work, "--json"], { cwd: ROOT, encoding: "utf8" });
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.ok, true, `${dir} snapshot 不可计算`);
      assert.equal(parsed.gaps.length, 0, `${dir} 出现 gaps: ${JSON.stringify(parsed.gaps)}`);
      for (const dep of parsed.deps) {
        assert.equal(dep.parseState, "OK", `${dir} 的 ${dep.name} parseState=${dep.parseState}（应为 OK）`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
});