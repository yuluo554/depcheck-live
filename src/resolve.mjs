// ═══ 模块 ③a · `exports` 解析（Node 官方语义） ═══
// 判据来源：`data/README.md` §1 D1（Node 文档 packages.html#package-entry-points，M1 逐条核对）。
// 本文件只做"字段 → 结构"的翻译，**不做判定**（判定在 check.mjs）。
//
// 六形态（`plan/03` §2.1）：
//   ① `"."` 字符串        "exports": "./index.js"
//   ② 条件对象            { ".": { "import": "./i.mjs", "require": "./i.cjs" } }
//   ③ `null` 屏蔽         { "./secret": null }
//   ④ 数组回退            ["./a.js", "./b.js"]
//   ⑤ 通配 `*`            { "./features/*": "./src/features/*.js" }
//   ⑥ 嵌套条件            { ".": { "node": { "import": "./n.mjs" }, "default": "./d.js" } }
//
// 三条纪律（错一处会让整族判定反转，M2 逐条测）：
//   · 条件**按序**取首个命中；`default` 是兜底，不参与"最具体优先"；
//   · 通配的优先级 = 前缀**最长**者优先（其次整体更长者），不是"写在前面的优先"；
//   · `null` 是**屏蔽语义**（→ NOT-EXPORTED-SUBPATH），不是"不存在"。
//
// 解析不了的一律 `UNPARSEABLE` + 进 gaps，**不得静默跳过**。

import { createHash } from "node:crypto";
import { UNPARSEABLE } from "./contract.mjs";

const CONDITION_KEYS = new Set(["import", "require", "node", "node-addons", "default", "browser", "development", "production", "types", "module-sync"]);

/** exports 字段是否为空（缺省）——缺省时 Node 按 main 兜底，本项目记 `NOT_DECLARED`。 */
export function isDeclared(exportsField) {
  return exportsField !== undefined && exportsField !== null;
}

/**
 * 把 `exports` 规范化成**子路径映射**（内部表示）。
 * @returns {{ entries: Array<{key:string|null, value:any}>, unparseable: boolean }}
 *   `key` = `"."` / `"./x"` / `"./p/*"`；`key === null` 表示"整个 exports 就是一个入口值"。
 */
export function buildExportsIndex(exportsField) {
  if (Array.isArray(exportsField) || typeof exportsField === "string") {
    return { entries: [{ key: ".", value: exportsField }], unparseable: false };
  }
  if (exportsField === null) return { entries: [{ key: ".", value: null }], unparseable: false };
  if (typeof exportsField !== "object") return { entries: [], unparseable: true };

  const keys = Object.keys(exportsField);
  // 条件对象 sugar：所有键都不是子路径 → 等价于 { ".": value }
  const isSubpathMap = keys.some((k) => k === "." || k.startsWith("./"));
  if (!isSubpathMap) return { entries: [{ key: ".", value: exportsField }], unparseable: false };

  const entries = [];
  let unparseable = false;
  for (const key of keys) {
    if (key !== "." && !key.startsWith("./")) {
      // 混合形态（既有子路径又有条件键）在 Node 里是非法的
      unparseable = true;
      continue;
    }
    if (key.endsWith("/")) {
      // 末尾斜杠的目录映射已废弃，且语义模糊 → 不猜
      unparseable = true;
      continue;
    }
    if ((key.match(/\*/g) ?? []).length > 1) {
      // 多个通配符：Node 只允许单个 `*`
      unparseable = true;
      continue;
    }
    entries.push({ key, value: exportsField[key] });
  }
  return { entries, unparseable };
}

/**
 * 子路径匹配。返回 `{kind, value, patternKey}`：
 *   `kind` = "exact" | "pattern" | "none"
 * 通配优先级 = 前缀最长者优先，其次整体更长者（稳定、可测；M2 有专门向量）。
 */
export function matchSubpath(index, subpath) {
  for (const entry of index.entries) {
    if (entry.key === subpath) return { kind: "exact", value: entry.value, patternKey: entry.key };
  }
  let best = null;
  for (const entry of index.entries) {
    if (!entry.key || !entry.key.includes("*")) continue;
    const [prefix, suffix] = entry.key.split("*");
    if (!subpath.startsWith(prefix)) continue;
    if (suffix && !subpath.endsWith(suffix)) continue;
    if (!suffix && subpath.length < prefix.length) continue;
    const candidate = { entry, prefixLen: prefix.length, totalLen: entry.key.length };
    if (
      best === null ||
      candidate.prefixLen > best.prefixLen ||
      (candidate.prefixLen === best.prefixLen && candidate.totalLen > best.totalLen)
    ) {
      best = candidate;
    }
  }
  if (best) {
    return { kind: "pattern", value: best.entry.value, patternKey: best.entry.key };
  }
  return { kind: "none", value: undefined, patternKey: null };
}

/** 把通配命中的目标里的 `*` 换成实际片段。 */
export function substituteWildcard(patternKey, subpath, target) {
  if (typeof target !== "string" || !patternKey.includes("*")) return target;
  const [prefix, suffix] = patternKey.split("*");
  const middle = subpath.slice(prefix.length, suffix ? subpath.length - suffix.length : undefined);
  return target.replace("*", middle);
}

/**
 * 按条件顺序解析出一个目标文件路径。顺序**在调用侧决定**（ESM 用 ["node","import","default"]，
 * CJS 用 ["node","require","default"]）——判据要能分别问"ESM 视角解析到什么"与"CJS 视角解析到什么"。
 * @returns {{ ok:boolean, target:string|null, blocked:boolean, unparseable:boolean, matchedCondition:string|null }}
 */
export function resolveConditional(value, order) {
  return walk(value, order);
}

function walk(value, order) {
  if (value === null) return { ok: false, target: null, blocked: true, unparseable: false, matchedCondition: null };
  if (typeof value === "string") {
    return { ok: true, target: value, blocked: false, unparseable: false, matchedCondition: null };
  }
  if (Array.isArray(value)) {
    // ④ 数组回退：取首个可解析目标；全不可解析 → UNPARSEABLE（假门纪律：不得截断静默）
    for (const item of value) {
      const r = walk(item, order);
      if (r.ok) return r;
      if (r.blocked || r.unparseable) return { ok: false, target: null, blocked: false, unparseable: true, matchedCondition: null };
    }
    return { ok: false, target: null, blocked: false, unparseable: true, matchedCondition: null };
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    for (const cond of order) {
      if (!keys.includes(cond)) continue;
      const r = walk(value[cond], order);
      return { ...r, matchedCondition: cond };
    }
    // 有 `default` 也兜不到（order 里应含 default）；走到这里说明条件集不匹配
    if (keys.every((k) => CONDITION_KEYS.has(k))) {
      return { ok: false, target: null, blocked: false, unparseable: false, matchedCondition: null };
    }
    return { ok: false, target: null, blocked: false, unparseable: true, matchedCondition: null };
  }
  return { ok: false, target: null, blocked: false, unparseable: true, matchedCondition: null };
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
  if (Array.isArray(value)) return value.some((v) => containsRequire(v));
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
      index: { entries: [], unparseable: false },
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