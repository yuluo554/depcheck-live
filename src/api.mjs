// ═══ 编排层 ═══
// 纯函数：(opts, deps) → result。**不碰 process.exit、不写文件**——
// 退出码只在 cli.mjs 一处决定（"判定与呈现分家"）。

import { STATUS, PROBLEM_STATUSES, NO_BASELINE, DRIFT, UNPARSEABLE } from "./contract.mjs";
import { readProject } from "./snapshot.mjs";
import { scanSources } from "./scan.mjs";
import { judgePoint } from "./check.mjs";
import { driftAll } from "./drift.mjs";

/**
 * `check` 主流程。
 * @returns {{ ok:boolean, reason?:string, summary:object, findings:Array, gaps:Array, deps:Array, files:Array }}
 */
export function checkAll(root, options = {}) {
  const project = readProject(root);
  if (!project.ok) {
    return {
      ok: false,
      reason: project.reason,
      summary: emptySummary(),
      findings: [],
      gaps: [],
      deps: [],
      files: [],
    };
  }

  const deps = new Map();
  for (const record of project.directDeps) {
    deps.set(record.name, record);
  }
  // 补 index（resolve 层结构）到每条记录上，供 check 使用
  for (const record of deps.values()) record.index = indexFor(record, root);

  const scan = scanSources(root, { ...(options.scan ?? {}), depNames: new Set(deps.keys()) });
  const findings = [];
  const gaps = [...project.gaps, ...scan.gaps];

  for (const point of scan.points) {
    const judged = judgePoint(point, deps);
    if (judged.gap) {
      gaps.push({ ...judged.gap, file: point.file, line: point.line });
      continue;
    }
    if (judged.outOfScope) continue;
    if (judged.status === null) continue;
    findings.push({ status: judged.status, ...judged.evidence, kind: point.kind, specifier: point.specifier });
  }

  if (options.withDrift) {
    // drift 按**引用点**判（不是按包）：同一个包里"老符号没了"与"老符号还在"必须给出两种结论。
    // `driftPoints` 只保留有结论的点——不在 drift 判定面内的点不制造噪音。
    for (const d of driftAll(deps, scan.points, options.drift ?? {})) {
      if (d.status === DRIFT) {
        // ★ 漂移是同一引用点上**更精确**的诊断，就地取代较粗的那条（通常是 MISSING-EXPORT）。
        //   不取代的后果：一个引用点产出两条 problem，`summary.problems` 被算两遍，
        //   "1 个问题"读成"2 个问题"——计数级失真，`plan/04` §6 的覆盖度口径就不可信了。
        //   判定顺序里 drift 不是第六态，它是"为什么缺"的解释层，所以取代而非追加。
        const key = `${d.file}|${d.line}|${d.specifier ?? ""}`;
        const at = findings.findIndex((f) => `${f.file}|${f.line}|${f.specifier ?? ""}` === key);
        if (at >= 0) findings.splice(at, 1);
        findings.push(d);
      } else if (d.status === NO_BASELINE) {
        gaps.push({ kind: NO_BASELINE, pkg: d.pkg, file: d.file, line: d.line, specifier: d.specifier, detail: d.detail });
      }
    }
  }

  return {
    ok: true,
    summary: summarize(findings, gaps, scan.points),
    findings: sortFindings(findings),
    gaps: sortGaps(gaps),
    deps: project.directDeps.map(publicDep),
    files: scan.files,
  };
}

/** 从快照记录重建 index（读一次 exports 字段；不 require 包本体）。 */
import { describeExports } from "./resolve.mjs";
import { readJson } from "./snapshot.mjs";
import { join } from "node:path";

function indexFor(record, root) {
  if (record.parseState === "NO_PACKAGE_JSON") return { entries: [], unparseable: false };
  const depDir = join(root, "node_modules", record.name);
  const pkg = readJson(join(depDir, "package.json"));
  if (!pkg.ok) return { entries: [], unparseable: false };
  const described = describeExports(pkg.value);
  record.pkgDir = depDir;
  return described.index;
}

function emptySummary() {
  return {
    totalPoints: 0,
    resolved: 0,
    ambiguous: 0,
    problems: 0,
    gaps: 0,
    byStatus: {},
  };
}

/** 计数口径先声明：`totalPoints` = 引用点总数；`problems` = 进 findings 的问题条目数。 */
function summarize(findings, gaps, points) {
  const byStatus = {};
  for (const f of findings) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  const ambiguous = byStatus[STATUS.AMBIGUOUS] ?? 0;
  const problems = findings.filter((f) => PROBLEM_STATUSES.includes(f.status) || f.status === DRIFT).length;
  return {
    totalPoints: points.length,
    resolved: byStatus[STATUS.RESOLVED] ?? 0,
    ambiguous,
    problems,
    gaps: gaps.length,
    byStatus: sortedObject(byStatus),
  };
}

function sortedObject(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

/** 稳定排序：file → line → status（确定性双跑逐字节一致的前提）。 */
function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return String(a.status).localeCompare(String(b.status));
  });
}

function sortGaps(gaps) {
  return [...gaps].sort((a, b) => {
    const ka = `${a.kind}|${a.pkg ?? ""}|${a.file ?? ""}|${a.line ?? 0}`;
    const kb = `${b.kind}|${b.pkg ?? ""}|${b.file ?? ""}|${b.line ?? 0}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** 对外暴露的依赖面记录（不含内部 index / pkgDir）。 */
function publicDep(record) {
  return {
    name: record.name,
    declaredRange: record.declaredRange,
    installedVersion: record.installedVersion,
    type: record.type,
    exportsDeclared: record.exportsDeclared,
    exportsFingerprint: record.exportsFingerprint,
    exposesPackageJson: record.exposesPackageJson,
    hasRequireBranch: record.hasRequireBranch,
    parseState: record.parseState,
  };
}

/** `check` 的退出码判定（语义唯一定义见 data/README.md §5.1）——本函数是唯一实现。 */
export function decideExit(result) {
  if (!result.ok) return "CANNOT_COMPUTE";
  const hardProblems = result.findings.filter(
    (f) => PROBLEM_STATUSES.includes(f.status) || f.status === DRIFT,
  ).length;
  if (hardProblems > 0) return "PROBLEMS";
  // 有 gaps（含 UNPARSEABLE / NO_BASELINE / 未安装依赖）但无确证问题 → 算不了
  if (result.gaps.length > 0) return "CANNOT_COMPUTE";
  return "OK";
}

/**
 * `drift` 主流程：只做漂移判定，不做五判定态（那是 `check` 的事）。
 *
 * 与 `check --with-drift` **共用**同一个 `judgeDriftPoint`——两个入口对同一个包不许给出不同结论。
 *
 * @returns {{ ok:boolean, reason?:string, summary:object, findings:Array, gaps:Array }}
 */
export function driftCommand(root, options = {}) {
  const project = readProject(root);
  if (!project.ok) {
    return { ok: false, reason: project.reason, summary: driftSummary([], []), findings: [], gaps: [] };
  }
  const deps = new Map();
  for (const record of project.directDeps) {
    deps.set(record.name, record);
    record.index = indexFor(record, root);
  }
  const scan = scanSources(root, { ...(options.scan ?? {}), depNames: new Set(deps.keys()) });
  const baselineDir = options.baselineDir ?? join(root, "data", "fingerprints");

  const findings = [];
  const gaps = [...project.gaps];
  for (const d of driftAll(deps, scan.points, { ...(options.drift ?? {}), baselineDir })) {
    if (d.status === DRIFT) findings.push(d);
    else if (d.status === NO_BASELINE) gaps.push({ kind: NO_BASELINE, pkg: d.pkg, file: d.file, line: d.line, specifier: d.specifier, detail: d.detail });
  }

  return {
    ok: true,
    summary: driftSummary(findings, gaps, scan.points),
    findings: sortFindings(findings),
    gaps: sortGaps(gaps),
  };
}

function driftSummary(findings, gaps, points = []) {
  const byStatus = {};
  for (const f of findings) byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  return {
    totalPoints: points.length,
    resolved: 0,
    ambiguous: 0,
    problems: findings.filter((f) => f.status === DRIFT).length,
    gaps: gaps.length,
    byStatus: sortedObject(byStatus),
  };
}

/**
 * `drift` 的退出码：与 `check` **同一条口径**（`data/README.md` §5.1）。
 * 有 DRIFT → 1；只有 NO-BASELINE（基准缺失）→ 3；都没有 → 0。
 *
 * 为什么 NO-BASELINE 记 3 而不是 0：这是"这一层没跑"与"跑了没问题"的分界
 * （`bin/depcheck-live.mjs` 顶部纪律 + `plan/05` §4 U 项）。用户显式跑了 `drift`，
 * 却因为没有基线而什么都没比，回 0 等于把"没跑"写成"跑了没问题"。
 */
export function decideDriftExit(result) {
  if (!result.ok) return "CANNOT_COMPUTE";
  const hard = result.findings.filter((f) => f.status === DRIFT).length;
  if (hard > 0) return "PROBLEMS";
  if (result.gaps.length > 0) return "CANNOT_COMPUTE";
  return "OK";
}

/**
 * `snapshot` 的退出码：只看**事实层算不算得出来**。
 * 它不做判定，因此**永不退出 1**——把"某个包 exports 解析不了"读成"发现问题"是错的，
 * 那是覆盖率缺口（§5.1 的 3）。
 */
export function decideSnapshotExit(snapshot) {
  if (!snapshot.ok) return "CANNOT_COMPUTE";
  if (snapshot.gaps.length > 0) return "CANNOT_COMPUTE";
  return "OK";
}

/**
 * `scan` 的退出码：同理只看事实层。
 * 唯一例外是"工程连 `package.json` 都没有"（`scan` 仍能扫源码，但已无处挂靠依赖面）
 * ——这一条由调用方按 `ok` 判，不在这里凭空升级成问题。
 */
export function decideScanExit(scan) {
  if (!scan.ok) return "CANNOT_COMPUTE";
  return "OK";
}