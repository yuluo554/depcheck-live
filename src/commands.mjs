// ═══ 模块 ① 依赖面快照 + 模块 ② 引用点抽取的**命令出口** ═══
// `plan/03` §1 把 `snapshot` 与 `scan` 都归 M2：它们是把 ①/② 两层事实单独摊开的命令，
// 与 `check`（三层合起来判定）共用同一份底层实现——**不得**在这里复写解析逻辑，
// 否则 `check` 与 `snapshot` 会给出互相打架的"同一个包的不同事实"。
//
// 纪律：不碰 process.exit、不写文件；退出码只在 `bin/` + `src/cli.mjs` 决定。

import { readProject } from "./snapshot.mjs";
import { scanSources } from "./scan.mjs";

/**
 * 依赖面快照（`plan/03` §2 的记录形状）。
 * @returns {{ok:boolean, reason?:string, deps:Array<object>, gaps:Array<object>}}
 */
export function snapshotAll(root, options = {}) {
  const project = readProject(root);
  if (!project.ok) {
    return { ok: false, reason: project.reason, deps: [], gaps: [] };
  }
  return {
    ok: true,
    deps: project.directDeps.map(publicDep),
    gaps: project.gaps,
  };
}

/**
 * 引用点（`plan/03` §3 的记录形状）。
 * @returns {{ok:boolean, files:Array<string>, points:Array<object>, gaps:Array<object>}}
 */
export function scanAll(root, options = {}) {
  const project = readProject(root);
  // `scan` 不判定，因此**不要求**依赖可解析；但给了依赖名集合才能跑字符串兜底
  const depNames = project.ok ? new Set(project.directDeps.map((d) => d.name)) : undefined;
  const scan = scanSources(root, { ...(options.scan ?? {}), depNames });
  return {
    ok: true,
    files: scan.files,
    points: scan.points,
    gaps: project.ok ? [...project.gaps, ...scan.gaps] : scan.gaps,
  };
}

/** 对外记录：把内部字段（index / pkgDir）剥掉，只留可复核的事实。 */
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
    ignoredExportKeys: record.ignoredExportKeys ?? [],
    parseState: record.parseState,
  };
}