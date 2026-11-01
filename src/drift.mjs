// ═══ 模块 ④ · 版本行为漂移（drift） ═══
// M0 为骨架实现：接口与"不猜"纪律已定，指纹比对在 M3 落位。
//
// 纪律（`data/README.md` §5、`plan/03` §5）：
//   · 只在**有离线指纹**时判定；无指纹记 `NO-BASELINE`，**不得猜测**；
//   · `NO-BASELINE` 不是"发现问题"，它进 gaps（影响退出码 3，"基准缺失"）；
//   · 指纹来源 = `data/fingerprints/<pkg>/<version>.json`（由用户显式提供，工具不联网下载）。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DRIFT, NO_BASELINE } from "./contract.mjs";

/**
 * 对依赖面做漂移判定。
 * @returns {Array<{status, pkg, detail, ...}>}
 */
export function driftAll(project, options = {}) {
  const baselineDir = options.baselineDir ?? join(options.root ?? ".", "data", "fingerprints");
  const out = [];
  for (const record of project.directDeps ?? []) {
    const baseline = readBaseline(baselineDir, record);
    if (baseline === null) {
      out.push({
        status: NO_BASELINE,
        pkg: record.name,
        detail: `无离线指纹（${record.name}@${record.installedVersion ?? "<未安装>"}）`,
      });
      continue;
    }
    if (baseline.exportsFingerprint === record.exportsFingerprint) {
      out.push({ status: null, pkg: record.name, detail: "指纹一致" });
      continue;
    }
    out.push({
      status: DRIFT,
      pkg: record.name,
      installedVersion: record.installedVersion,
      baselineVersion: baseline.version,
      declaredRange: record.declaredRange,
      detail: `声明 range ${record.declaredRange} 的历史指纹与已装 ${record.installedVersion} 不一致`,
    });
  }
  return out;
}

function readBaseline(dir, record) {
  // 基线键 = 包名；文件里按版本列出指纹（用户提供，工具不自造）
  const path = join(dir, `${record.name.replace("/", "+")}.json`);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (!data || typeof data !== "object") return null;
    const version = record.installedVersion;
    if (data.exportsFingerprint && data.version === version) return data;
    // 版本不同的历史指纹才是"漂移"的判据来源
    if (data.baselineVersion && data.exportsFingerprint) return data;
    return null;
  } catch {
    return null;
  }
}