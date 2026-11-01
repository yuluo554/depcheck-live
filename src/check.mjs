// ═══ 模块 ③b · 判定层（招牌） ═══
// 纯函数：输入事实（依赖面 + 引用点），输出 findings。**不碰 process.exit、不写文件**。
//
// 判定顺序写死（`plan/03` §4.4，首个成立者胜）：
//   AMBIGUOUS → NOT-EXPORTED-SUBPATH → ESM-CJS-MISMATCH → UNPARSEABLE → MISSING-EXPORT → RESOLVED
// 顺序本身有测试（同一输入只许出一条判定态）。
//
// **误报比漏报代价高**：读不出导出集时记 UNPARSEABLE 进 gaps，**不判 MISSING-EXPORT**。

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
 * 三种可识别形态：CJS 赋值形 / ESM 声明形 / ESM re-export（外部 → 不解析）。
 */
export function readExportSurface(dep, targetRel) {
  const abs = join(dep.pkgDir, targetRel);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (error) {
    return { ok: false, reason: `目标文件不可读: ${targetRel}（${error.code ?? error.message}）` };
  }
  const isEsm = /\.mjs$/.test(targetRel) || (dep.type === "module" && !/\.cjs$/.test(targetRel));
  return isEsm ? readEsmSurface(text) : readCjsSurface(text);
}

function readCjsSurface(text) {
  const names = new Set();
  // module.exports = { a, b } / exports.a = / exports["a"] = / Object.defineProperty(exports, "a", …)
  for (const m of text.matchAll(/\bexports\s*\.\s*([\w$]+)\s*=/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bexports\s*\[\s*["']([\w$]+)["']\s*\]\s*=/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bObject\.defineProperty\s*\(\s*exports\s*,\s*["']([\w$]+)["']/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bObject\.defineProperty\s*\(\s*module\.exports\s*,\s*["']([\w$]+)["']/g)) names.add(m[1]);
  const direct = /module\.exports\s*=\s*\{([\s\S]*?)\}\s*;?\s*$/m.exec(text);
  if (direct) {
    for (const m of direct[1].matchAll(/(?:^|,)\s*(?:(?:async|const|let|var|function)\s+)?([\w$]+)\s*(?:[:(,]|$)/g)) {
      names.add(m[1]);
    }
  }
  if (/\bmodule\.exports\s*=/.test(text) && names.size === 0) {
    // `module.exports = someIdentifier` / 函数 / 调用表达式：**读不出具名导出 → 不猜**
    return { ok: false, reason: "module.exports 为表达式/标识符，具名导出集不可静态确定" };
  }
  return { ok: true, names };
}

function readEsmSurface(text) {
  const names = new Set();
  let sawReexportExternal = false;
  for (const m of text.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const item of m[1].split(",")) {
      const name = item.split(/\s+as\s+/).pop().trim();
      if (name && !name.startsWith("type ")) names.add(name);
    }
  }
  if (/\bexport\s+default\b/.test(text)) names.add("default");
  for (const m of text.matchAll(/\bexport\s+\*\s+from\s+["']([^"']+)["']/g)) {
    if (!m[1].startsWith(".")) sawReexportExternal = true;
  }
  if (sawReexportExternal && names.size === 0) {
    return { ok: false, reason: "仅外部 re-export，具名导出集需递归解析（首期不复刻）" };
  }
  return { ok: true, names };
}