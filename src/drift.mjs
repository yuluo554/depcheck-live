// ═══ 模块 ④ · 版本行为漂移（drift） ═══
// 判据（`plan/03` §5 + `data/README.md` §5.5）：
//   · 只在**有离线基线**时判定；无基线记 `NO-BASELINE`，**不得猜测**；
//   · `NO-BASELINE` 不是"发现问题"（不进 problems），但进 gaps（退出码 3，"基准缺失"）；
//   · 基线来源 = `data/fingerprints/<pkg>.json`（生成器 `tools/gen-baselines.mjs` 的产物），
//     工具**不联网**、**不自己造历史版本**。
//
// ★ 两条口径，别改（改了 C6 必红，且都是实测结论）：
//
// ① **判据是行为，不是版本号。** `drift` = "代码引用的这个符号，基线版本里有、已装版本里没有"。
//    装了更高 major 但符号还在 → **不是**漂移（C6 点 2 防的正是"版本号一变大就报红"）。
//
// ② **判定单位是引用点，不是整包。** 不能用"这个包有没有变"当判据：
//    实测 date-fns 3.6.0 → 4.4.0 的根导出面 251 个名字**一个不少**（只加不减），
//    而整份 `exports` 指纹必然不同——按包比指纹是**系统性假阳性**。
//    同理 zod 4 移除了 `ZodSchema` 等 31 个符号，但同一包里 `z`/`ZodError` 仍在，
//    按包比会把"用的是还在的符号"也判红。逐点判才判得出 C6 的 1 红 1 绿。
//
// 纪律：本模块纯函数，**不碰 process.exit、不写文件、不联网**（`tests/architecture.test.mjs` 守）。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DRIFT, NO_BASELINE } from "./contract.mjs";
import { CONDITIONS, matchSubpath, resolveConditional, substituteWildcard } from "./resolve.mjs";
import { readExportSurface } from "./check.mjs";
import { splitSpecifier } from "./snapshot.mjs";

/**
 * 对引用点做漂移判定。
 *
 * @param {Map<string,object>} deps     包名 → 依赖面记录（需带 `index` 与 `pkgDir`）
 * @param {Array<object>} points        `scan` 的引用点
 * @param {{baselineDir:string}} options
 * @returns {Array<{status, pkg, file, line, ...}>} 每条对应一个引用点
 */
export function driftAll(deps, points, options = {}) {
  const baselineDir = options.baselineDir ?? join(options.root ?? ".", "data", "fingerprints");
  const out = [];
  for (const point of points) {
    const judged = judgeDriftPoint(point, deps, baselineDir);
    if (judged === null) continue; // 不在判定面内（动态/非依赖/不取符号）
    out.push(judged);
  }
  return out;
}

/**
 * 单引用点的漂移判定。返回 `null` 表示"这个点不在 drift 判定面内"。
 * @returns {{status:string|null, pkg:string, file:string, line:number, ...}|null}
 */
export function judgeDriftPoint(point, deps, baselineDir) {
  // 动态形态：specifier 都抽不出，更谈不上"它引用的老 API 还在不在"
  if (point.kind === "ambiguous" || point.specifier === null) return null;
  const split = splitSpecifier(point.specifier);
  if (split === null || !deps.has(split.name)) return null;

  const record = deps.get(split.name);
  const wanted = (point.imported ?? []).filter((s) => s !== "*" && s !== "");
  // 只加载包、不取符号 → drift 这一层无判据（"包还在不在"是 exports 解析层的事）
  if (wanted.length === 0) return null;

  const base = { pkg: split.name, file: point.file, line: point.line, specifier: point.specifier };
  const baseline = readBaseline(baselineDir, split.name);

  // ① 没有离线基线 → 不猜（进 gaps，退出码 3）
  if (baseline === null) {
    return {
      ...base,
      status: NO_BASELINE,
      installedVersion: record.installedVersion ?? null,
      declaredRange: record.declaredRange ?? null,
      detail: `无离线基线（${split.name}@${record.installedVersion ?? "<未安装>"}），不猜`,
      why: "data/fingerprints/ 下没有该包的历史版本导出面",
    };
  }

  // ② 装的就是基线版本 → 同一份导出面，漂移不可成立（这不是"猜"，是恒等式）
  if (record.installedVersion && baseline.baselineVersion === record.installedVersion) {
    return {
      ...base,
      status: null,
      installedVersion: record.installedVersion,
      baselineVersion: baseline.baselineVersion,
      detail: `已装版本即基线版本 ${baseline.baselineVersion}，无漂移可比`,
    };
  }

  const view = point.kind === "require" ? "require" : "import";
  const baselineNames = surfaceNames(baseline, split.subpath, view);
  if (baselineNames === null) {
    // 基线的这个子路径/视角没有记录 → 比不了，记算不了（**不**当成"没变"）
    return {
      ...base,
      status: NO_BASELINE,
      installedVersion: record.installedVersion ?? null,
      baselineVersion: baseline.baselineVersion,
      detail: `基线 ${baseline.baselineVersion} 未收录 ${split.subpath} 的 ${view} 视角导出面，不猜`,
    };
  }

  const installedNames = installedSurfaceNames(record, split.subpath, view);
  if (installedNames === null) {
    return {
      ...base,
      status: NO_BASELINE,
      installedVersion: record.installedVersion ?? null,
      baselineVersion: baseline.baselineVersion,
      detail: `已装 ${record.installedVersion} 的 ${split.subpath}（${view}）导出面读不出，不猜`,
    };
  }

  // ③ 只判"基线里有、已装里没有"的那些**本点实际引用的**符号。
  //    基线里本来也没有的符号不归 drift 管（那是 MISSING-EXPORT 的判据，不重复判）。
  const missing = wanted.filter((sym) => baselineNames.has(sym) && !installedNames.has(sym));
  if (missing.length > 0) {
    return {
      ...base,
      status: DRIFT,
      installedVersion: record.installedVersion ?? null,
      baselineVersion: baseline.baselineVersion,
      declaredRange: record.declaredRange ?? null,
      subpath: split.subpath,
      missing: [...missing].sort(),
      detail:
        `声明 range ${record.declaredRange ?? "<未声明>"}，基线 ${baseline.baselineVersion} 有这些导出、` +
        `已装 ${record.installedVersion} 没有了`,
      rule: "plan/03 §5：判据是符号行为，不是 semver 字符串",
    };
  }

  return {
    ...base,
    status: null,
    installedVersion: record.installedVersion ?? null,
    baselineVersion: baseline.baselineVersion,
    subpath: split.subpath,
    detail: `基线 ${baseline.baselineVersion} 与已装 ${record.installedVersion} 都有本点引用的符号`,
  };
}

/** 基线里某子路径某视角的符号集合；未收录或读不出返回 null。 */
function surfaceNames(baseline, subpath, view) {
  const views = baseline.surfaces?.[subpath];
  if (!views) return null;
  const names = views[view];
  if (names === null || names === undefined) return null;
  return new Set(names);
}

/** 已装包某子路径某视角的符号集合；读不出返回 null（复用 `check.mjs` 的口径，不另写解析）。 */
function installedSurfaceNames(record, subpath, view) {
  if (!record.pkgDir || !record.index) return null;
  const sub = matchSubpath(record.index, subpath);
  if (sub.kind === "none") return null;
  const value = sub.kind === "pattern" ? substituteWildcard(sub.key, subpath, sub.value) : sub.value;
  const target = resolveConditional(value, CONDITIONS[view]);
  if (target.state !== "ok") return null;
  const surface = readExportSurface(record, target.target);
  return surface.ok ? surface.names : null;
}

/**
 * 读基线文件。**读不出/形状不对一律返回 null（= NO-BASELINE），不猜。**
 * 文件名 = 包名（scope 的 `/` 换成 `+`）。
 */
export function readBaseline(dir, name) {
  const path = join(dir, `${String(name).replace("/", "+")}.json`);
  if (!existsSync(path)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // 坏文件不是"没问题"，是"读不出"→ 上层记 NO-BASELINE
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (typeof data.baselineVersion !== "string") return null;
  if (!data.surfaces || typeof data.surfaces !== "object") return null;
  return data;
}