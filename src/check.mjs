// ═══ 模块 ③b · 判定层（招牌） ═══
// 纯函数：输入事实（依赖面 + 引用点），输出 findings。**不碰 process.exit、不写文件**。
//
// 判定顺序写死（`plan/03` §4.4，首个成立者胜）：
//   AMBIGUOUS → NOT-EXPORTED-SUBPATH → ESM-CJS-MISMATCH → UNPARSEABLE → MISSING-EXPORT → RESOLVED
// 顺序本身有测试（同一输入只许出一条判定态）。
//
// **误报比漏报代价高**：读不出导出集时记 UNPARSEABLE 进 gaps，**不判 MISSING-EXPORT**。

import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import {
  STATUS,
  UNPARSEABLE,
} from "./contract.mjs";
import { matchSubpath, resolveConditional, substituteWildcard, CONDITIONS } from "./resolve.mjs";
import { splitSpecifier } from "./snapshot.mjs";

const ESM_ORDER = CONDITIONS.import;
const CJS_ORDER = CONDITIONS.require;

/**
 * 对一个引用点求判定态。
 * @param point  {file,line,kind,specifier,imported}
 * @param deps   Map<name, snapshotRecord & {index}>（由 indexDeps 建）
 * @returns {{status, evidence:object, gap?:object}}
 */
export function judgePoint(point, deps) {
  // ① 动态形态：不可静态判定。**不得当作"没问题"**。
  if (point.kind === "ambiguous" || point.specifier === null) {
    return {
      status: STATUS.AMBIGUOUS,
      evidence: { file: point.file, line: point.line, note: point.note ?? "动态 specifier" },
    };
  }

  const split = splitSpecifier(point.specifier);
  if (split === null) {
    return { status: STATUS.AMBIGUOUS, evidence: { file: point.file, line: point.line, note: "specifier 无法切分" } };
  }
  // 非依赖引用（相对路径、node: 内置、绝对路径）不在判定面内 —— 显式标注，不进 findings
  if (!deps.has(split.name)) {
    return {
      status: null,
      outOfScope: true,
      evidence: { file: point.file, line: point.line, note: `非已装依赖: ${split.name}` },
    };
  }

  const dep = deps.get(split.name);

  // ② 包本身不可用（node_modules 缺它 / exports 解析不了）→ 算不了，进 gaps
  if (dep.parseState === "NO_PACKAGE_JSON") {
    return {
      status: null,
      gap: { kind: "NO_PACKAGE_JSON", pkg: split.name, detail: "依赖未安装或 package.json 不可解析" },
      evidence: { file: point.file, line: point.line, pkg: split.name },
    };
  }
  if (dep.parseState === UNPARSEABLE) {
    return {
      status: null,
      gap: { kind: UNPARSEABLE, pkg: split.name, detail: "exports 形态无法解析，该引用点不可静态判定" },
      evidence: { file: point.file, line: point.line, pkg: split.name },
    };
  }
  // 包未声明 exports：Node 按 main/index 兜底，本项目不复刻整个文件系统解析 → 不猜
  if (dep.parseState === "NOT_DECLARED") {
    return {
      status: null,
      gap: { kind: "EXPORTS_NOT_DECLARED", pkg: split.name, detail: "该包未声明 exports，首期不复刻 main 兜底解析" },
      evidence: { file: point.file, line: point.line, pkg: split.name },
    };
  }

  const sub = matchSubpath(dep.index, split.subpath);

  // ③ 子路径不在 exports 里 → NOT-EXPORTED-SUBPATH
  if (sub.kind === "none") {
    return {
      status: STATUS.NOT_EXPORTED_SUBPATH,
      evidence: {
        file: point.file,
        line: point.line,
        pkg: split.name,
        subpath: split.subpath,
        rule: "exports 未列该子路径",
        exportsKeys: dep.index.entries.map((e) => e.key),
      },
    };
  }

  // ③b `null` 屏蔽（含数组里落成 blocked 的形态）→ 也是 NOT-EXPORTED-SUBPATH，
  //     不是"不存在"（`data/README.md` §5 形态③）。逐视角求值才能看见数组里的 null。
  const isRequirePoint = point.kind === "require";
  const esmResolved = resolveTarget(dep, sub, split.subpath, ESM_ORDER);
  const ownResolved = isRequirePoint ? resolveTarget(dep, sub, split.subpath, CJS_ORDER) : esmResolved;
  if (ownResolved.state === "blocked" || esmResolved.state === "blocked") {
    return {
      status: STATUS.NOT_EXPORTED_SUBPATH,
      evidence: {
        file: point.file,
        line: point.line,
        pkg: split.name,
        subpath: split.subpath,
        rule: "exports 显式 null 屏蔽",
        exportsKeys: dep.index.entries.map((e) => e.key),
      },
    };
  }

  // ④ ESM-CJS-MISMATCH：`data/README.md` §5.2 的**四条同时成立**。
  //    核心判据是"exports 无 require 分支"，**不是** type 字段——zod/date-fns/glob 都是
  //    type: module 却有 require 分支，require() 行为正常，必须判 RESOLVED。
  if (isRequirePoint) {
    const typeIsModule = dep.type === "module";
    const noRequireBranch = dep.hasRequireBranch === false;
    const looksEsmOnly = typeIsModule || isMjsTarget(esmResolved.target);
    if (looksEsmOnly && noRequireBranch && esmResolved.state === "ok") {
      const esmSurface = readExportSurface(dep, esmResolved.target);
      const requested = (point.imported ?? []).filter((s) => s !== "*" && s !== "");
      // 第 4 条：被取用的 API 不在命名空间上、而在 `.default` 下。
      //   · 有具名取用且这些名字确实是命名空间上的具名导出 → 命名空间直取可达 → 不判 MISMATCH；
      //   · 其余（无取用信息 / 取的名字不在命名空间上 / 只有 default 出口）→ API 挂在 .default 下 → MISMATCH。
      const reachableOnNamespace =
        esmSurface.ok && requested.length > 0 && requested.every((sym) => sym !== "default" && esmSurface.names.has(sym));
      if (!reachableOnNamespace) {
        return {
          status: STATUS.ESM_CJS_MISMATCH,
          evidence: {
            file: point.file,
            line: point.line,
            pkg: split.name,
            type: dep.type,
            hasRequireBranch: dep.hasRequireBranch,
            requested,
            rule: "exports 无 require 分支，require() 得到命名空间对象，API 在 .default 下",
            exportsKeys: dep.index.entries.map((e) => e.key),
          },
        };
      }
    }
  }

  // ⑤ 读导出集（静态）。读不出 → UNPARSEABLE（进 gaps，不判 MISSING）
  const target = ownResolved;
  if (target.state !== "ok") {
    return {
      status: null,
      gap: {
        kind: "UNRESOLVABLE_TARGET",
        pkg: split.name,
        detail: `条件集不匹配或目标非法（视角=${isRequirePoint ? "require" : "import"}；state=${target.state}）`,
      },
      evidence: { file: point.file, line: point.line, pkg: split.name, subpath: split.subpath },
    };
  }

  const surface = readExportSurface(dep, target.target);
  if (!surface.ok) {
    return {
      status: null,
      gap: {
        kind: "EXPORT_SURFACE_UNPARSEABLE",
        pkg: split.name,
        detail: surface.reason,
        target: target.target,
      },
      evidence: { file: point.file, line: point.line, pkg: split.name, subpath: split.subpath },
    };
  }

  // ⑥ 符号检查：`*` / 空 imported 视为"只加载包，不取符号"→ RESOLVED
  const wanted = (point.imported ?? []).filter((s) => s !== "*" && s !== "");
  if (wanted.length === 0) {
    return {
      status: STATUS.RESOLVED,
      evidence: { file: point.file, line: point.line, pkg: split.name, subpath: split.subpath, target: target.target },
    };
  }
  const missing = wanted.filter((sym) => sym !== "default" && !surface.names.has(sym));
  if (missing.length > 0) {
    return {
      status: STATUS.MISSING_EXPORT,
      evidence: {
        file: point.file,
        line: point.line,
        pkg: split.name,
        subpath: split.subpath,
        target: target.target,
        missing,
        available: [...surface.names].sort().slice(0, 20),
      },
    };
  }
  return {
    status: STATUS.RESOLVED,
    evidence: { file: point.file, line: point.line, pkg: split.name, subpath: split.subpath, target: target.target },
  };
}

function isMjsTarget(target) {
  return typeof target === "string" && target.endsWith(".mjs");
}

/** 按视角解析出目标文件。通配先替换再走条件解析。 */
function resolveTarget(dep, sub, subpath, conditions) {
  const value = sub.kind === "pattern" ? substituteWildcard(sub.key, subpath, sub.value) : sub.value;
  return resolveConditional(value, conditions);
}

/**
 * 静态读导出集（`plan/03` §4.3）。读不出**不猜**——返回 ok:false 让调用方记 gap。
 *
 * 三种可识别形态：CJS 赋值形 / ESM 声明形 / **相对 re-export 递归**。
 * 为什么必须递归：`date-fns@4.4.0` 的入口 `index.js` 是 245 行 `export * from "./x.js"`，
 * `zod@4.6.7` 的 `index.cjs` 是 `__exportStar(require("./v4/…"), exports)`，
 * 只看首层会读出**空导出集**，于是每个真实引用点都变 MISSING-EXPORT（系统性假阳性）。
 * 递归只沿**相对**路径走；外部 re-export（`export * from "pkg"`）仍记 UNPARSEABLE，
 * 口径与 `plan/03` §4.3 一致。
 */
export function readExportSurface(dep, targetRel) {
  const seen = new Set();
  const names = new Set();
  const pending = [targetRel];
  let sawReexportExternal = false;
  let externalFrom = null;
  let depth = 0;

  while (pending.length > 0) {
    const rel = pending.pop();
    if (seen.has(rel)) continue; // 环与重复桶：每个文件只读一次，递归天然收敛
    seen.add(rel);
    const abs = join(dep.pkgDir, rel);
    let text;
    try {
      text = readFileSync(abs, "utf8");
    } catch (error) {
      if (depth === 0) return { ok: false, reason: `目标文件不可读: ${rel}（${error.code ?? error.message}）` };
      continue; // 桶文件里一个分支读不到：跳过它，不因此判整包算不了
    }
    depth++;
    const isEsm = isEsmFile(dep, rel);
    const r = isEsm ? readEsmSurface(text) : readCjsSurface(text);
    if (!r.ok) {
      // 首层读不出 → 真算不了；桶文件某一支读不出 → 记下来，最后若无其它证据仍算不了
      if (seen.size === 1) return r;
      sawReexportExternal = true;
      externalFrom = externalFrom ?? r.reason;
      continue;
    }
    for (const n of r.names) names.add(n);
    for (const next of r.relativeFrom) {
      if (!next.startsWith("./") && !next.startsWith("../")) {
        sawReexportExternal = true;
        externalFrom = externalFrom ?? `外部 re-export: ${next}`;
        continue;
      }
      pending.push(resolveRelative(rel, next));
    }
  }

  if (names.size === 0 && sawReexportExternal) return { ok: false, reason: externalFrom };
  return { ok: true, names };
}

/** 把 `./x.js` 从 `rel` 所在目录解析成包内相对路径（一律正斜杠，走 posix 语义）。 */
function resolveRelative(fromRel, specifier) {
  return posix.normalize(posix.join(posix.dirname(fromRel), specifier));
}

/**
 * 目标文件的模块类型 = **最近的** `package.json` 的 `type`（Node 的 Module Type 判定口径）。
 * 不能只看包根：`glob` 的 `dist/commonjs/package.json` 写着 `type: commonjs`，而包根是
 * `type: module`——按包根判会把 CJS 产物当 ESM 解析，导出集读成空（实测 0 个）。
 */
export function isEsmFile(dep, rel) {
  if (rel.endsWith(".mjs")) return true;
  if (rel.endsWith(".cjs")) return false;
  let dir = posix.dirname(rel);
  while (true) {
    const candidate = posix.join(dir, "package.json");
    const abs = join(dep.pkgDir, candidate);
    if (existsSync(abs)) {
      if (candidate === "package.json") return dep.type === "module";
      try {
        const pkg = JSON.parse(readFileSync(abs, "utf8"));
        return pkg.type === "module";
      } catch {
        return false;
      }
    }
    if (dir === "." || dir === "" || dir === "/") return dep.type === "module";
    dir = posix.dirname(dir);
  }
}

function readCjsSurface(text) {
  const names = new Set();
  const relativeFrom = [];
  // module.exports = { a, b } / exports.a = / exports["a"] = / Object.defineProperty(exports, "a", …)
  for (const m of text.matchAll(/\bexports\s*\.\s*([\w$]+)\s*=/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bexports\s*\[\s*["']([\w$]+)["']\s*\]\s*=/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bObject\.defineProperty\s*\(\s*exports\s*,\s*["']([\w$]+)["']/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bObject\.defineProperty\s*\(\s*module\.exports\s*,\s*["']([\w$]+)["']/g)) names.add(m[1]);
  // 桶文件：`__exportStar(require("./x"), exports)`（zod 的 index.cjs 就是这一形态）
  for (const m of text.matchAll(/__exportStar\s*\(\s*require\s*\(\s*["']([^"']+)["']\s*\)/g)) relativeFrom.push(m[1]);
  // 桶文件（另一种）：`var _index = require("./add.cjs"); Object.keys(_index).forEach(...)`
  // date-fns@4.4.0 的 index.cjs 是 245 组这种形态（共 8885 行）。
  // 判据不是"有 require"（普通引用也有），而是**同一文件里对该标识符做了 `Object.keys(…)` 枚举转发**。
  const bound = new Map();
  for (const m of text.matchAll(/(?:const|let|var)\s+([\w$]+)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (m[2].startsWith(".")) bound.set(m[1], m[2]);
  }
  for (const [ident, target] of bound) {
    const escaped = ident.replace(/\$/g, "\\$");
    if (new RegExp(`\\bObject\\.keys\\s*\\(\\s*${escaped}\\s*\\)`).test(text)) relativeFrom.push(target);
  }

  const direct = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?\s*$/m.exec(text);
  if (direct) {
    for (const m of direct[1].matchAll(/(?:^|,)\s*(?:(?:async|const|let|var|function)\s+)?([\w$]+)\s*(?:[:(,]|$)/g)) {
      names.add(m[1]);
    }
  }
  if (/\bmodule\.exports\s*=/.test(text) && names.size === 0 && relativeFrom.length === 0) {
    // `module.exports = someIdentifier` / 函数 / 调用表达式：**读不出具名导出 → 不猜**
    return { ok: false, reason: "module.exports 为表达式/标识符，具名导出集不可静态确定", relativeFrom: [] };
  }
  return { ok: true, names, relativeFrom };
}

function readEsmSurface(text) {
  const names = new Set();
  const relativeFrom = [];
  let sawReexportExternal = false;
  for (const m of text.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const item of m[1].split(",")) {
      const name = item.split(/\s+as\s+/).pop().trim();
      if (name && !name.startsWith("type ")) names.add(name);
    }
  }
  if (/\bexport\s+default\b/.test(text)) names.add("default");
  for (const m of text.matchAll(/\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g)) {
    relativeFrom.push(m[1]);
  }
  for (const m of text.matchAll(/\bexport\s+\*\s+as\s+[\w$]+\s+from\s+["']([^"']+)["']/g)) {
    relativeFrom.push(m[1]);
  }
  for (const from of relativeFrom) {
    if (!from.startsWith(".")) sawReexportExternal = true;
  }
  if (sawReexportExternal && names.size === 0 && relativeFrom.every((f) => !f.startsWith("."))) {
    return { ok: false, reason: "仅外部 re-export，具名导出集需递归解析（首期不复刻）", relativeFrom: [] };
  }
  return { ok: true, names, relativeFrom };
}