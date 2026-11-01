// ═══ 模块 ⑥ · 基准（bench） ═══
// 目的：把 `fixtures/C1–C7` 的**真值**跑一遍，逐点 + 逐项对账。它不是"再跑一遍测试"，而是
// 把"实现判得对不对"做成一个用户可自己敲的命令（`plan/05` M3 DoD 第 2 条 / M4 DoD 第 2 条）。
//
// ★ 骨架复用：`tests/fixtures-run.test.mjs` 的"临时目录 + 目录联接挂 node_modules"就是正解
//   （HANDOFF-M3 §三 第 3 条：复用它，别另写）。原因见 `tests/fixtures-layout.test.mjs` 头部：
//   往语料里塞依赖树会让 `tools/mutate-gates.mjs` 的整仓复制炸掉。
//
// 纪律：
//   · 纯函数 + 只读：本模块**不**设退出码（那是 `cli.mjs` 的事）、**不**写文件到仓库；
//     临时目录只在系统 tmp 下建，跑完即删；
//   · 不联网、不执行被测代码；
//   · 缺依赖时**显式 skip**，不假装通过（缺五包 → 该 case 记 `SKIPPED`，整体算不了）。
//
// ★★ 两层对账，粒度**分开计数**（`plan/05` M4 DoD："指标粒度如实标注：计数级 ≠ 逐条级"）：
//   · **逐条级** = `points`：每个引用点的 `status` / `driftStatus` 与真值逐条比对；
//   · **计数级** = `checks`：该 case 的 `exitCode` / `summary.problems` / `gaps` /
//     `byStatus` / `minTotalPoints` / `negativePoints`。
//   两者**不得混写**为一个数字：「28/28 引用点对账通过」是逐条级，「7 个语料全绿」是计数级。
//
// ★ 为什么要读 `expect`（M4 修的真缺陷）：M3 的 bench **只逐点对账、从不读 `expect`**，
//   于是 `expect.exitCode` / `expect.summary.*` 这些真值字段**没有任何东西在断言**——
//   正是 M3 招牌发现 0 的同一族假门（声明的真值可以悄悄失配而全绿）。M4 起逐项读、逐项断言。
//
// ★ 为什么要按 case 声明调用形态（M4 修的真缺陷）：M3 的 bench 对**所有** case 无条件传
//   `--with-drift`。但 C1/C2/C3 的 `expect.summary.gaps = 0` 与 `expect.exitCode = 0`
//   在带 drift 时**不成立**（chalk/commander/date-fns/glob 都没有离线基线 → NO-BASELINE
//   进 gaps → 退出码 3）。真值与调用形态不同源，只因"从不读 expect"才没暴露。
//   现在每个 case 必须显式声明 `expect.invocation`（`check-only` / `with-drift`），
//   bench 按它调用，并断言"声明了 driftStatus 的 case 必须用 with-drift"。
//
// 反例集纪律（`data/README.md` §5.4.2）：**不得**构造"CJS 取不存在符号 → MISSING-EXPORT"。
// 在无 `require` 分支的包上，CJS 取错名字必然先命中 `ESM-CJS-MISMATCH`——那是判定顺序的
// 结构性后果，不是 MISSING-EXPORT 的用例。

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAll, decideExit } from "./api.mjs";
import { scanAll } from "./commands.mjs";
import { exitCodeFor } from "./cli.mjs";
import { DRIFT, NO_BASELINE, PROBLEM_STATUSES } from "./contract.mjs";

/** 基准覆盖的语料（C1–C6）。C7 干净工程由 `bench --clean` 单独跑（M4）。 */
export const BENCH_CASES = Object.freeze([
  "resolved-basic",
  "missing-export",
  "esm-cjs-mismatch",
  "subpath-blocked",
  "ambiguous-dynamic",
  "drift-baseline",
]);

/** 干净工程零误报集（C7，M4）。 */
export const CLEAN_CASES = Object.freeze(["clean-project"]);

/** 五包（`plan/04` §1）：缺任一个就不跑，避免"半装"给出假结论。 */
const FIVE = ["chalk", "zod", "date-fns", "commander", "glob"];

/** 允许的调用形态。写错/漏写一律当"真值缺字段"处理（红），不静默取默认。 */
const INVOCATIONS = ["check-only", "with-drift"];

/**
 * 跑基准。
 * @param {string} repoRoot 本仓根（语料与 node_modules 都在这里）
 * @param {{withDrift?:boolean, cases?:string[], clean?:boolean}} options
 * @returns {{ok:boolean, cases:Array, summary:object, gaps:Array}}
 */
export function benchAll(repoRoot, options = {}) {
  const fixturesDir = join(repoRoot, "fixtures");
  const rootNm = join(repoRoot, "node_modules");
  const baselineDir = join(repoRoot, "data", "fingerprints");
  const cases = options.cases ?? (options.clean ? [...CLEAN_CASES] : [...BENCH_CASES]);

  const missingDeps = FIVE.filter((p) => !existsSync(join(rootNm, p, "package.json")));
  if (missingDeps.length > 0) {
    return {
      ok: false,
      reason: `本仓根 node_modules 缺五包之一（${missingDeps.join(", ")}）；先 npm i --no-save ${FIVE.join(" ")}`,
      cases: [],
      summary: emptySummary(),
      gaps: [],
    };
  }

  const results = [];
  for (const name of cases) {
    results.push(benchOne(fixturesDir, name, rootNm, baselineDir));
  }

  return {
    ok: results.every((r) => !r.error) && results.every((r) => r.failed === 0 && r.checksFailed === 0),
    cases: results,
    summary: summarize(results),
    gaps: results.flatMap((r) => (r.error ? [{ kind: "BENCH_CASE_ERROR", case: r.name, detail: r.error }] : [])),
  };
}

function emptySummary() {
  return { cases: 0, points: 0, passed: 0, failed: 0, skipped: 0, checks: 0, checksPassed: 0, checksFailed: 0 };
}

/**
 * 汇总。**逐条级（points）与计数级（checks）分开计数**——挤进一个数字就分不清
 * "每个引用点都对上了"与"整份语料都绿了"，而这两件事失败时的含义完全不同。
 */
function summarize(results) {
  return {
    cases: results.length,
    // ── 逐条级：引用点对账 ──
    points: results.reduce((n, r) => n + r.points.length, 0),
    passed: results.reduce((n, r) => n + r.passed, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    // ── 计数级：语料级断言（exitCode / summary / negativePoints）──
    checks: results.reduce((n, r) => n + r.checks.length, 0),
    checksPassed: results.reduce((n, r) => n + r.checksPassed, 0),
    checksFailed: results.reduce((n, r) => n + r.checksFailed, 0),
    skipped: results.reduce((n, r) => n + r.skipped, 0),
  };
}

/**
 * 单 case：落临时工程 → 按真值声明的调用形态跑 → 与 `expected.json` 逐条/逐项对账。
 */
function benchOne(fixturesDir, name, rootNm, baselineDir) {
  const src = join(fixturesDir, name);
  const expectedPath = join(src, "expected.json");
  const blank = { name, points: [], checks: [], passed: 0, failed: 0, checksPassed: 0, checksFailed: 0, skipped: 0 };
  if (!existsSync(expectedPath)) return { ...blank, error: "expected.json 不存在" };
  let expected;
  try {
    expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  } catch (error) {
    return { ...blank, error: `expected.json 不可解析: ${error.message}` };
  }

  const work = materialize(src, rootNm);
  try {
    // ── 0. 调用形态：真值必须自己声明，bench 不猜 ──
    const invocation = expected.expect?.invocation;
    const declaredDrift = (expected.points ?? []).some((p) => p.driftStatus !== undefined);
    const shapeChecks = [
      check(
        "invocation-declared",
        INVOCATIONS.includes(invocation),
        `expect.invocation 必须显式声明为 ${INVOCATIONS.join(" / ")} 之一，实际 ${JSON.stringify(invocation)}`,
      ),
      check(
        "invocation-matches-truth-shape",
        !declaredDrift || invocation === "with-drift",
        `真值声明了 driftStatus 层，调用形态必须是 with-drift，实际 ${JSON.stringify(invocation)}`,
      ),
      check(
        "exitCode-declared",
        typeof expected.expect?.exitCode === "number",
        `expect.exitCode 必须声明数字（该调用形态下的退出码），实际 ${JSON.stringify(expected.expect?.exitCode)}`,
      ),
    ];
    if (shapeChecks.some((c) => !c.ok)) {
      // 真值本身缺字段/自相矛盾 → 这个 case 无法对账，直接判错（不猜调用形态）
      return outcome({ ...blank, name, checks: shapeChecks });
    }

    const withDrift = invocation === "with-drift";
    const actual = checkAll(work, {
      withDrift,
      drift: withDrift ? { baselineDir, root: work } : {},
    });
    // 负向真值要看"抽到没有"，因此需要 scan 层的事实（check 层对范围外的点不产出 findings）
    const scan = (expected.negativePoints ?? []).length > 0 ? scanAll(work) : null;

    const points = reconcilePoints((expected.points ?? []), actual);
    const checks = [
      ...shapeChecks,
      check(
        "exitCode",
        exitCodeFor(decideExit(actual)) === expected.expect.exitCode,
        `退出码应为 ${expected.expect.exitCode}，实际 ${exitCodeFor(decideExit(actual))}`,
      ),
      ...reconcileSummary(expected.expect.summary ?? {}, actual),
      ...reconcileNegatives(expected.negativePoints ?? [], actual, scan),
    ];
    return outcome({ ...blank, name, points, checks });
  } catch (error) {
    return { ...blank, error: `实跑异常: ${error.message}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** 一条计数级断言。`why` 只在失败时有值。 */
function check(id, ok, why) {
  return { id, ok, why: ok ? null : why };
}

/** 收口：把 points / checks 各自数成 passed / failed。 */
function outcome(result) {
  result.passed = result.points.filter((p) => p.ok).length;
  result.failed = result.points.length - result.passed;
  result.checksPassed = result.checks.filter((c) => c.ok).length;
  result.checksFailed = result.checks.length - result.checksPassed;
  return result;
}

/**
 * 逐条级：`expected.points` × 实跑 findings / gaps。
 *
 * 真值可声明**两层**：`status`（check 层）与 `driftStatus`（drift 层）。
 * 两层各自对账——不把"两层的不同结论"当成"一个字段取不到"（HANDOFF-M3 招牌发现 3）。
 */
function reconcilePoints(expectedPoints, actual) {
  const table = indexPoints(actual.findings, actual.gaps);
  const points = [];
  for (const point of expectedPoints) {
    const key = `${point.file}|${point.line}|${point.specifier ?? ""}`;
    const got = table.get(key);
    const checks = [];
    if (point.status !== undefined) checks.push({ layer: "check", want: point.status, actual: got?.check ?? null });
    if (point.driftStatus !== undefined) {
      checks.push({ layer: "drift", want: point.driftStatus, actual: got?.drift ?? null });
    }
    const bad = checks.filter((c) => c.actual !== c.want);
    const ok = got !== undefined && bad.length === 0;
    points.push({
      id: point.id,
      key,
      expected: checks.map((c) => `${c.layer}=${c.want}`).join(" / "),
      actual: checks.map((c) => `${c.layer}=${c.actual}`).join(" / "),
      ok,
      why: ok
        ? null
        : got === undefined
          ? "实跑结果里没有这条引用点（抽取层漏了）"
          : bad.map((c) => `${c.layer} 层应为 ${c.want}，实际 ${c.actual}`).join("；"),
    });
  }
  return points;
}

/**
 * 计数级：`expect.summary` × 实跑 summary。
 * 只断言真值**声明了**的字段——但每个声明了的字段都必须真被读（M3 招牌发现 0）。
 */
function reconcileSummary(want, actual) {
  const out = [];
  const s = actual.summary;
  if (typeof want.problems === "number") {
    out.push(check("summary.problems", s.problems === want.problems, `problems 应为 ${want.problems}，实际 ${s.problems}`));
  }
  if (typeof want.gaps === "number") {
    out.push(check("summary.gaps", s.gaps === want.gaps, `gaps 应为 ${want.gaps}，实际 ${s.gaps}`));
  }
  if (typeof want.ambiguous === "number") {
    out.push(check("summary.ambiguous", s.ambiguous === want.ambiguous, `ambiguous 应为 ${want.ambiguous}，实际 ${s.ambiguous}`));
  }
  if (typeof want.minTotalPoints === "number") {
    out.push(
      check(
        "summary.minTotalPoints",
        s.totalPoints >= want.minTotalPoints,
        `totalPoints 应 ≥ ${want.minTotalPoints}，实际 ${s.totalPoints}（0 问题可能是"扫了 0 个"的假绿）`,
      ),
    );
  }
  for (const [status, count] of Object.entries(want.byStatus ?? {})) {
    const got = s.byStatus?.[status] ?? 0;
    out.push(check(`summary.byStatus.${status}`, got === count, `byStatus.${status} 应为 ${count}，实际 ${got}`));
  }
  // 反向：实跑出现的每个判定态，真值都必须声明——否则"多判了一条没人认领的红/绿"静默放行
  for (const [status, count] of Object.entries(s.byStatus ?? {})) {
    if (want.byStatus && want.byStatus[status] !== undefined) continue;
    if (status === "RESOLVED" && want.byStatus === undefined) continue;
    out.push(
      check(
        `summary.byStatus.${status}.declared`,
        false,
        `实跑出现 byStatus.${status}=${count}，但真值没声明它（多判了一条没人认领的结论）`,
      ),
    );
  }
  return out;
}

/**
 * 负向真值："这些点**不得**产出问题"。
 *
 * 为什么不能塞进 `points` 的 `status`：`OUT-OF-SCOPE` / `NOT-A-REFERENCE` **不是判定态**
 * （`src/contract.mjs` 的 `STATUS` 只有五个），它们永远不会出现在 `findings` 里，
 * 按 `status` 对账必然失配。M1 写 C7 时把它们写成 `status` 字段，等于声明了一个
 * 没有任何东西能读到的真值——M4 改成两条可断言的判据：
 *   · `extractedAs`：该点在 scan 层**必须**被抽成这个 kind（`null` = 必须抽不到）；
 *   · `mustNotProduceProblem`：该点**不得**出现在 problems 里。
 */
function reconcileNegatives(expectedNegatives, actual, scan) {
  const out = [];
  const problemKeys = new Set(
    actual.findings
      .filter((f) => PROBLEM_STATUSES.includes(f.status) || f.status === DRIFT)
      .map((f) => `${f.file}|${f.line}|${f.specifier ?? ""}`),
  );
  for (const neg of expectedNegatives) {
    const key = `${neg.file}|${neg.line}|${neg.specifier ?? ""}`;
    // ★ 匹配键因断言方向而异（M4 实测的真缺陷）：
    //   · `extractedAs: null`（"这行不该抽出任何引用点"）→ 按 **file|line** 匹配。
    //     按 file|line|specifier 匹配会恒真：兜底误报抽出的 specifier **必然不等于**
    //     真值里写的那个（写 `chalk` 而不是 `this is a chalk-like label`），
    //     于是查不到、断言"没抽到"、放行——一条永远绿的空断言。
    //   · `extractedAs: <kind>`（"这行该抽成这个 kind"）→ 按 file|line|specifier 匹配，
    //     因为此时 specifier 是可确定的真值（相对路径 / node: 内置）。
    const matchKey = neg.extractedAs === null ? (p) => p.file === neg.file && p.line === neg.line
      : (p) => `${p.file}|${p.line}|${p.specifier ?? ""}` === key;
    if (neg.extractedAs !== undefined) {
      const found = scan?.points.find(matchKey);
      if (neg.extractedAs === null) {
        out.push(
          check(
            `${neg.id}.not-extracted`,
            found === undefined,
            `该行不该被抽成引用点（字符串兜底误报），实际抽出 kind=${found?.kind} specifier=${found?.specifier}`,
          ),
        );
      } else {
        out.push(
          check(
            `${neg.id}.extracted-as`,
            found?.kind === neg.extractedAs,
            found === undefined ? "该点没被 scan 抽出（抽取层漏了）" : `kind 应为 ${neg.extractedAs}，实际 ${found.kind}`,
          ),
        );
      }
    }
    if (neg.mustNotProduceProblem === true) {
      out.push(check(`${neg.id}.no-problem`, !problemKeys.has(key), `该点不得产出问题，实际进了 problems`));
    }
  }
  return out;
}

/**
 * 把一份语料落到临时工程目录：复制**入仓文件**，再把本仓 `node_modules` 以目录联接挂上。
 * 目录联接（junction）在 Windows 上不需要管理员权限（HANDOFF-M3 §五 第 7 条）。
 */
function materialize(srcDir, rootNm) {
  const work = mkdtempSync(join(tmpdir(), "depcheck-bench-"));
  cpSync(srcDir, work, {
    recursive: true,
    filter: (src) => !src.includes("node_modules"), // 语料里不应该有它；有也不带
  });
  symlinkSync(rootNm, join(work, "node_modules"), "junction");
  return work;
}

/**
 * 拉平成 `file|line|specifier` → `{check, drift}` 两层结论。
 *
 * 为什么要分两层：一个引用点可以同时有两个**各自正确**的结论。
 * 例：C6 点 3 的 `import { addDays } from "date-fns"` ——
 *   · `check` 层：`addDays` 确实在 4.4.0 的导出面上 → `RESOLVED`（对）；
 *   · `drift` 层：没有 date-fns 的离线基线 → `NO-BASELINE`（也对，且必须显式出现）。
 * 把两者挤进一个 `status` 字段，必有一方失声。所以真值用 `status` / `driftStatus` 分开声明，
 * 本函数也分两层取值——这不是"两个答案冲突"，是两层的答案不同。
 */
function indexPoints(findings, gaps) {
  const map = new Map();
  const slot = (key) => {
    if (!map.has(key)) map.set(key, { check: undefined, drift: undefined });
    return map.get(key);
  };
  for (const f of findings) {
    slot(`${f.file}|${f.line}|${f.specifier ?? ""}`).check = f.status;
  }
  for (const g of gaps) {
    if (g.kind === NO_BASELINE || g.kind === DRIFT) {
      slot(`${g.file}|${g.line}|${g.specifier ?? ""}`).drift = g.kind;
    }
  }
  return map;
}

/**
 * 基准报告（人读）。
 *
 * ★ 粒度如实标注：**逐条级**（引用点对账）与**计数级**（语料级断言）分成两个数字，
 * 不合写成一个"通过率"（`plan/05` M4 DoD 的原话）。
 */
export function renderBench(bench) {
  if (!bench.ok && bench.reason) {
    return `depcheck-live bench: 无法计算（${bench.reason}）\n`;
  }
  const s = bench.summary;
  const lines = [
    `depcheck-live bench · ${s.cases} 个语料`,
    `  逐条级：引用点 ${s.points} 个 → 对账通过 ${s.passed} / 失败 ${s.failed}`,
    `  计数级：语料级断言 ${s.checks} 条 → 通过 ${s.checksPassed} / 失败 ${s.checksFailed}`,
  ];
  for (const c of bench.cases) {
    const verdict = c.error ? "ERROR" : c.failed === 0 && c.checksFailed === 0 ? "PASS" : "FAIL";
    lines.push(`  ${verdict}  ${c.name}  （引用点 ${c.passed}/${c.points.length} · 断言 ${c.checksPassed}/${c.checks.length}）`);
    if (c.error) {
      lines.push(`    ${c.error}`);
      continue;
    }
    for (const p of c.points) {
      if (p.ok) continue;
      lines.push(`    ${p.id} ${p.key}：${p.why}`);
    }
    for (const k of c.checks) {
      if (k.ok) continue;
      lines.push(`    ${k.id}：${k.why}`);
    }
  }
  return `${lines.join("\n")}\n`;
}