// ═══ 模块 ⑥ · 基准（bench） ═══
// 目的：把 `fixtures/C1–C6` 的**真值**跑一遍，逐点对账。它不是"再跑一遍测试"，而是
// 把"实现判得对不对"做成一个用户可自己敲的命令（`plan/05` M3 DoD 第 2 条）。
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
// 反例集纪律（`data/README.md` §5.4.2）：**不得**构造"CJS 取不存在符号 → MISSING-EXPORT"。
// 在无 `require` 分支的包上，CJS 取错名字必然先命中 `ESM-CJS-MISMATCH`——那是判定顺序的
// 结构性后果，不是 MISSING-EXPORT 的用例。

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAll } from "./api.mjs";
import { DRIFT, NO_BASELINE, STATUS } from "./contract.mjs";

/** 基准覆盖的语料（C1–C6；C7 干净工程属 M4 的 `bench --clean`）。 */
export const BENCH_CASES = Object.freeze([
  "resolved-basic",
  "missing-export",
  "esm-cjs-mismatch",
  "subpath-blocked",
  "ambiguous-dynamic",
  "drift-baseline",
]);

/** 五包（`plan/04` §1）：缺任一个就不跑，避免"半装"给出假结论。 */
const FIVE = ["chalk", "zod", "date-fns", "commander", "glob"];

/**
 * 跑基准。
 * @param {string} repoRoot 本仓根（语料与 node_modules 都在这里）
 * @param {{withDrift?:boolean, cases?:string[]}} options
 * @returns {{ok:boolean, cases:Array, summary:object, gaps:Array}}
 */
export function benchAll(repoRoot, options = {}) {
  const fixturesDir = join(repoRoot, "fixtures");
  const rootNm = join(repoRoot, "node_modules");
  const baselineDir = join(repoRoot, "data", "fingerprints");
  const cases = options.cases ?? [...BENCH_CASES];

  const missingDeps = FIVE.filter((p) => !existsSync(join(rootNm, p, "package.json")));
  if (missingDeps.length > 0) {
    return {
      ok: false,
      reason: `本仓根 node_modules 缺五包之一（${missingDeps.join(", ")}）；先 npm i --no-save ${FIVE.join(" ")}`,
      cases: [],
      summary: { cases: 0, points: 0, passed: 0, failed: 0, skipped: 0 },
      gaps: [],
    };
  }

  const results = [];
  for (const name of cases) {
    results.push(benchOne(fixturesDir, name, rootNm, baselineDir));
  }

  const summary = {
    cases: results.length,
    points: results.reduce((n, r) => n + r.points.length, 0),
    passed: results.reduce((n, r) => n + r.passed, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    skipped: results.reduce((n, r) => n + r.skipped, 0),
  };
  return {
    ok: summary.failed === 0 && results.every((r) => !r.error),
    cases: results,
    summary,
    gaps: results.flatMap((r) => r.error ? [{ kind: "BENCH_CASE_ERROR", case: r.name, detail: r.error }] : []),
  };
}

/** 单 case：落临时工程 → 跑 `checkAll`（含 drift）→ 与 `expected.json` 逐点对账。 */
function benchOne(fixturesDir, name, rootNm, baselineDir) {
  const src = join(fixturesDir, name);
  const expectedPath = join(src, "expected.json");
  if (!existsSync(expectedPath)) {
    return { name, points: [], passed: 0, failed: 0, skipped: 0, error: "expected.json 不存在" };
  }
  let expected;
  try {
    expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  } catch (error) {
    return { name, points: [], passed: 0, failed: 0, skipped: 0, error: `expected.json 不可解析: ${error.message}` };
  }

  const work = materialize(src, rootNm);
  try {
    const actual = checkAll(work, {
      withDrift: true,
      drift: { baselineDir, root: work },
    });
    const table = indexPoints(actual.findings, actual.gaps);
    const points = [];
    for (const point of expected.points ?? []) {
      const key = `${point.file}|${point.line}|${point.specifier ?? ""}`;
      const got = table.get(key);
      // 真值可声明两层：`status`（check 层）与 `driftStatus`（drift 层）。
      // 两层各自对账——不把"两层的不同结论"当成"一个字段取不到"。
      const checks = [];
      if (point.status !== undefined) {
        checks.push({
          layer: "check",
          want: point.status,
          actual: got?.check ?? null,
        });
      }
      if (point.driftStatus !== undefined) {
        checks.push({
          layer: "drift",
          want: point.driftStatus,
          actual: got?.drift ?? null,
        });
      }
      const bad = checks.filter((c) => c.actual !== c.want);
      const ok = got !== undefined && bad.length === 0;
      points.push({
        id: point.id,
        key,
        expected: checks.map((c) => `${c.layer}=${c.want}`).join(" / "),
        actual: checks.map((c) => `${c.layer}=${c.actual}`).join(" / "),
        ok,
        // 对不上时带一句可复核的说明，不只说"不一致"
        why: ok
          ? null
          : got === undefined
            ? "实跑结果里没有这条引用点（抽取层漏了）"
            : bad.map((c) => `${c.layer} 层应为 ${c.want}，实际 ${c.actual}`).join("；"),
      });
    }
    const passed = points.filter((p) => p.ok).length;
    return { name, points, passed, failed: points.length - passed, skipped: 0 };
  } catch (error) {
    return { name, points: [], passed: 0, failed: 0, skipped: 0, error: `实跑异常: ${error.message}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
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

/** 基准报告（人读）。 */
export function renderBench(bench) {
  if (!bench.ok && bench.reason) {
    return `depcheck-live bench: 无法计算（${bench.reason}）\n`;
  }
  const s = bench.summary;
  const lines = [
    `depcheck-live bench · ${s.cases} 个语料 · 引用点 ${s.points} · 对账通过 ${s.passed} / 失败 ${s.failed}`,
  ];
  for (const c of bench.cases) {
    lines.push(`  ${c.error ? "ERROR" : c.failed === 0 ? "PASS" : "FAIL"}  ${c.name}  （${c.passed}/${c.points.length}）`);
    if (c.error) {
      lines.push(`    ${c.error}`);
      continue;
    }
    for (const p of c.points) {
      if (p.ok) continue;
      lines.push(`    ${p.id} ${p.key}：${p.why}`);
    }
  }
  return `${lines.join("\n")}\n`;
}