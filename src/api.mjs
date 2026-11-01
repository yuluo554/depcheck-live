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
    for (const d of driftAll(project, options.drift ?? {})) {
      if (d.status === DRIFT) findings.push(d);
      else if (d.status === NO_BASELINE) gaps.push({ kind: NO_BASELINE, pkg: d.pkg, detail: d.detail });
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