// ═══ 模块 ③a · `exports` 解析（Node 官方语义） ═══
// 判据来源：`data/README.md` §1 D1 + §5.4（M1 逐条对照 Node 官方解析算法原文，
//   同轮用本机 Node 24.15.0 对每条规则做黑盒实测交叉验证）。
//
// 原文锚点（nodejs.org/api）：
//   · packages.html#package-entry-points —— 六形态的**声明层**语义（sugar / 条件 / 子路径 /
//     通配 / null 屏蔽 / 嵌套条件）
//   · esm.html#resolution-algorithm-spec —— 解析的**算法层**：
//     PACKAGE_EXPORTS_RESOLVE / PACKAGE_IMPORTS_EXPORTS_RESOLVE / PACKAGE_TARGET_RESOLVE /
//     PATTERN_KEY_COMPARE
//
// D1 核对结论（M1 实测，修正了 M0 骨架的 10 处偏差；逐条向量在 tests/resolve.test.mjs）：
//   ① 条件匹配顺序 = **目标对象自身的键序**，不是"条件优先级数组序"。
//      （`{import, node}` 对 import 视角命中 import；`{node, import}` 命中 node —— 键序决定，
//      两份键序的同一集合会给出不同目标。M0 用 `order` 数组遍历，两例必错其一。）
//   ② 嵌套条件**无映射时继续父层的后续条件**（原文："nested conditions behave analogously to
//      nested JavaScript `if` statements"）。M0 直接返回 unparseable，把可解析的包判成算不了。
//   ③ 条件集实测：import 视角 = ["node","import","module-sync","node-addons"]，
//      require 视角 = ["node","require","module-sync","node-addons"]，`default` 恒命中。
//      `types` / `browser` / `development` / `production` **不在** Node 的条件集里（实测 Q1–Q4）。
//   ④ 通配必须排除"等于 patternBase"：`matchKey startsWith 但**不等于** patternBase`；
//      带 trailer 时还要 `matchKey.length >= expansionKey.length`。M0 缺这两条，
//      `"./a/*"` 对 `./a/`、`"./a*b"` 对 `./ab` 都会误命中。
//   ⑤ 通配优先级 = PATTERN_KEY_COMPARE：先比 `*` 的下标（大者优先），再比整键长度（长者在先）。
//      M0 的"前缀长 → 整键长"与原文同构，保留。
//   ⑥ 通配目标里的 `*` **全部**替换（原文："every instance of `*`"）。M0 只替换第一处。
//   ⑦ 数组回退：空数组 → 屏蔽；逐项求值，`invalid`/`unmatched` 继续，`null` 也继续，
//      只有全部走完才落屏蔽/无映射。M0 遇 `null` 立刻记 unparseable，与实测相反。
//   ⑧ 目标字符串必须以 `"./"` 开头，否则 Invalid Package Target（不是"没匹配到"）。
//   ⑨ 键形态：**混合子路径键与条件键** → Invalid Package Configuration（整包算不了）；
//      末尾斜杠键、多 `*` 键 → Node **忽略该键**（不致命，其余入口照常可用）。
//      M0 把后两者也升级成整包 unparseable，会让正常入口一起失效。
//   ⑩ `exports: null` 等同于未声明（Node 回落到 index/main），不是"屏蔽"。
//
// 三条纪律（错一处会让整族判定反转）：
//   · 顺序与"最具体优先"是两条独立规则，**不得合并实现**；
//   · `null` 是**屏蔽语义**（→ NOT-EXPORTED-SUBPATH），不是"不存在"；
//   · 解析不了的一律 `UNPARSEABLE` + 进 gaps，**不得静默跳过**。

import { createHash } from "node:crypto";
import { UNPARSEABLE, LIMITS } from "./contract.mjs";

/** Node 的条件集（实测口径，见本文件头部 ③）。`default` 由匹配逻辑单独处理，不列在这里。 */
export const CONDITIONS = Object.freeze({
  import: Object.freeze(["node", "import", "module-sync", "node-addons"]),
  require: Object.freeze(["node", "require", "module-sync", "node-addons"]),
});

/** 目标必须是 `"./"` 起的相对路径（原文 PACKAGE_TARGET_RESOLVE 第一步）。 */
function isRelativeTarget(target) {
  return typeof target === "string" && target.startsWith("./");
}

/** exports 字段是否为空（缺省）——缺省时 Node 按 main/index 兜底，本项目记 `NOT_DECLARED`。 */
export function isDeclared(exportsField) {
  return exportsField !== undefined && exportsField !== null;
}

/**
 * 把 `exports` 规范化成**子路径映射**（内部表示）。
 * @returns {{ entries: Array<{key:string, value:any}>, unparseable: boolean, ignored: string[] }}
 *   `ignored` = 被 Node 忽略的键（末尾斜杠 / 多 `*`），保留下来只为证据可追溯，**不参与匹配**。
 */
export function buildExportsIndex(exportsField) {
  // 形态① sugar：字符串 / 数组 / null 都是"整包一个入口值"
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return { entries: [{ key: ".", value: exportsField }], unparseable: false, ignored: [] };
  }
  if (typeof exportsField !== "object") return { entries: [], unparseable: true, ignored: [] };

  const keys = Object.keys(exportsField);
  // 阈值（`data/README.md` §5.3）：子路径键数超限 → 整包算不了，**不得截断静默**
  if (keys.length > LIMITS.EXPORTS_KEYS) {
    return { entries: [], unparseable: true, ignored: [] };
  }
  const subpathKeys = keys.filter((k) => k === "." || k.startsWith("./"));
  const conditionKeys = keys.filter((k) => k !== "." && !k.startsWith("./"));

  // ⑨ 混合形态（既有子路径键又有条件键）在 Node 里是 Invalid Package Configuration
  if (subpathKeys.length > 0 && conditionKeys.length > 0) {
    return { entries: [], unparseable: true, ignored: [] };
  }
  // 形态② sugar：所有键都不是子路径 → 等价于 { ".": 值 }
  if (subpathKeys.length === 0) {
    return { entries: [{ key: ".", value: exportsField }], unparseable: false, ignored: [] };
  }

  const entries = [];
  const ignored = [];
  for (const key of keys) {
    // ⑨ 末尾斜杠 / 多通配：Node 忽略该键，**不致命**（其余入口仍可用）
    if (key.endsWith("/") || (key.match(/\*/g) ?? []).length > 1) {
      ignored.push(key);
      continue;
    }
    entries.push({ key, value: exportsField[key] });
  }
  return { entries, unparseable: false, ignored };
}

/**
 * 子路径匹配 —— 逐条实现 PACKAGE_IMPORTS_EXPORTS_RESOLVE。
 * 返回 `{kind, value, key, patternMatch}`：
 *   `kind` = "exact" | "pattern" | "none"
 * @param {object} index  buildExportsIndex 的产物
 * @param {string} subpath  "." 或 "./x/y"
 */
export function matchSubpath(index, subpath) {
  // 请求本身以 "/" 结尾 → 原文先抛 Invalid Module Specifier；本项目按"不导出"处理
  if (subpath !== "." && subpath.endsWith("/")) {
    return { kind: "none", value: undefined, key: null, patternMatch: null };
  }

  // 精确匹配只认**不含** `*` 的键（原文：`is a key of matchObj and does not contain "*"`）
  for (const entry of index.entries) {
    if (entry.key === subpath && !entry.key.includes("*")) {
      return { kind: "exact", value: entry.value, key: entry.key, patternMatch: null };
    }
  }

  // 通配候选按 PATTERN_KEY_COMPARE 降序（`*` 下标大者优先，同则整键长者优先）
  const expansions = index.entries
    .filter((e) => (e.key.match(/\*/g) ?? []).length === 1)
    .sort((a, b) => {
      const ia = a.key.indexOf("*");
      const ib = b.key.indexOf("*");
      if (ia !== ib) return ib - ia;
      return b.key.length - a.key.length;
    });

  for (const entry of expansions) {
    const star = entry.key.indexOf("*");
    const base = entry.key.slice(0, star);
    const trailer = entry.key.slice(star + 1);
    // ④ 必须 startsWith 且**不等于** patternBase
    if (!subpath.startsWith(base) || subpath === base) continue;
    // ④ 带 trailer 时还要长度下界（`matchKey.length >= expansionKey.length`）
    if (trailer !== "") {
      if (!subpath.endsWith(trailer)) continue;
      if (subpath.length < entry.key.length) continue;
    }
    const patternMatch = subpath.slice(base.length, subpath.length - trailer.length);
    return { kind: "pattern", value: entry.value, key: entry.key, patternMatch };
  }

  return { kind: "none", value: undefined, key: null, patternMatch: null };
}

/** ⑥ 通配目标里的 `*` **全部**换成实际片段（原文："every instance of `*`"）。 */
export function substituteWildcard(patternKey, subpath, target) {
  if (typeof target !== "string" || !patternKey.includes("*")) return target;
  const star = patternKey.indexOf("*");
  const base = patternKey.slice(0, star);
  const trailer = patternKey.slice(star + 1);
  const middle = subpath.slice(base.length, subpath.length - trailer.length);
  return target.split("*").join(middle);
}

/**
 * 按 Node 语义解析出一个目标文件路径。
 * `conditions` 传 `CONDITIONS.import` 或 `CONDITIONS.require`（**视角**要能分别问）。
 * @returns {{ state:"ok"|"blocked"|"unmatched"|"invalid", target:string|null, matchedCondition:string|null }}
 *   · `ok`        解析到目标
 *   · `blocked`   `null` 屏蔽（→ NOT-EXPORTED-SUBPATH）
 *   · `unmatched` 条件/子路径没有映射（原文 Package Path Not Exported）
 *   · `invalid`   目标非法（原文 Invalid Package Target → 算不了）
 */
export function resolveConditional(value, conditions) {
  return walk(value, conditions);
}

function walk(value, conditions) {
  if (value === null) return { state: "blocked", target: null, matchedCondition: null };

  if (typeof value === "string") {
    // ⑧ 目标必须以 "./" 开头
    if (!isRelativeTarget(value)) return { state: "invalid", target: null, matchedCondition: null };
    return { state: "ok", target: value, matchedCondition: null };
  }

  if (Array.isArray(value)) {
    // ⑦ 数组回退：空数组 → 屏蔽；逐项求值，invalid/unmatched/null 一律继续
    if (value.length === 0) return { state: "blocked", target: null, matchedCondition: null };
    let sawBlocked = false;
    for (const item of value) {
      const r = walk(item, conditions);
      if (r.state === "ok") return r;
      if (r.state === "blocked") {
        sawBlocked = true;
        continue;
      }
      // invalid / unmatched → 继续下一项（原文：continuing the loop on any Invalid Package Target error）
    }
    return sawBlocked
      ? { state: "blocked", target: null, matchedCondition: null }
      : { state: "unmatched", target: null, matchedCondition: null };
  }

  if (typeof value === "object") {
    // ①② 按**目标对象自身键序**匹配；`default` 恒命中
    for (const key of Object.keys(value)) {
      if (key !== "default" && !conditions.includes(key)) continue;
      const r = walk(value[key], conditions);
      // ② 嵌套无映射 → 继续父层的后续条件（不是直接判死）
      if (r.state === "unmatched") continue;
      return { ...r, matchedCondition: key };
    }
    return { state: "unmatched", target: null, matchedCondition: null };
  }

  return { state: "invalid", target: null, matchedCondition: null };
}

/**
 * `exports` 里**是否存在 `require` 条件分支**（含嵌套条件内部）。
 * 这是 `ESM-CJS-MISMATCH` 的**核心判据**（`data/README.md` §5.2 第 2 条）——
 * 不是看 `type` 字段。`type: module` 但有 require 分支的包（zod/date-fns/glob）必须判 RESOLVED。
 */
export function hasRequireBranch(index) {
  return index.entries.some((entry) => containsRequire(entry.value));
}

function containsRequire(value) {
  if (value === null || typeof value === "string") return false;
  if (Array.isArray(value)) return value.some(containsRequire);
  if (typeof value !== "object") return false;
  for (const [k, v] of Object.entries(value)) {
    if (k === "require") return true;
    if (containsRequire(v)) return true;
  }
  return false;
}

/**
 * 结构指纹 = `exports` 的**规范化序列化**后 sha256 前 12 位。
 * 规范化三条：对象键排序（同内容不同书写 → 同指纹）、数组保序、`null` 保留为 `null`。
 * 不用平台相关序列化器；显式拼串，**跨机器逐字节一致**（`tools/gen-fingerprints.mjs --check` 断言）。
 */
export function fingerprint(exportsField) {
  const canonical = canonicalize(exportsField === undefined ? "<absent>" : exportsField);
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 12);
}

function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return "null";
}

/** 统一出口：一次拿到"这个包的 exports 结构"的全部事实（供 snapshot 与 check 共用）。 */
export function describeExports(pkgJson) {
  const field = pkgJson?.exports;
  const declared = isDeclared(field);
  if (!declared) {
    return {
      declared: false,
      fingerprint: fingerprint(undefined),
      hasRequireBranch: false,
      exposesPackageJson: false,
      parseState: "NOT_DECLARED",
      index: { entries: [], unparseable: false, ignored: [] },
    };
  }
  const index = buildExportsIndex(field);
  const pkgJsonSubpath = matchSubpath(index, "./package.json");
  const exposesPackageJson = pkgJsonSubpath.kind !== "none" && pkgJsonSubpath.value !== null;
  return {
    declared: true,
    fingerprint: fingerprint(field),
    hasRequireBranch: hasRequireBranch(index),
    exposesPackageJson,
    parseState: index.unparseable ? UNPARSEABLE : "OK",
    index,
  };
}