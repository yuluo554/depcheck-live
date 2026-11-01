// ═══ 事实层 · 依赖面快照（模块 ①） ═══
// 只读 `package.json` 与 `node_modules/<pkg>/package.json`；**不 require、不执行**被测代码。
//
// 缺失态与"算不了"的区分（`plan/03` §2.3、`data/README.md` §5.1）：
//   · `node_modules` 整个不存在 → 整条命令 exit 3（算不了）
//   · 单个依赖未安装 → 该条 `installedVersion: null` + `parseState: "NO_PACKAGE_JSON"`，进 gaps
//   · `exports` 解析不了 → `parseState: "UNPARSEABLE"`，进 gaps（**不得静默跳过**）

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describeExports, isDeclared } from "./resolve.mjs";

/** 读 JSON；失败返回 `{ok:false, error}`，不抛（门/命令永不崩，报一条结论继续）。 */
export function readJson(absPath) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(absPath, "utf8")) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * 读项目事实。
 * @returns {{ ok:boolean, reason?:string, root:string, directDeps:Array<object>, gaps:Array<object> }}
 */
export function readProject(root) {
  const pkgPath = join(root, "package.json");
  const nmPath = join(root, "node_modules");

  if (!existsSync(pkgPath)) return { ok: false, reason: "NO_PACKAGE_JSON", root, directDeps: [], gaps: [] };
  const pkg = readJson(pkgPath);
  if (!pkg.ok) return { ok: false, reason: "PACKAGE_JSON_UNPARSEABLE", root, directDeps: [], gaps: [] };
  if (!existsSync(nmPath) || !statSync(nmPath).isDirectory()) {
    return { ok: false, reason: "NO_NODE_MODULES", root, directDeps: [], gaps: [] };
  }

  const declared = collectDeclaredDeps(pkg.value);
  const gaps = [];
  const directDeps = [];
  for (const name of Object.keys(declared).sort()) {
    const pkgDir = join(nmPath, name);
    const depPkgPath = join(pkgDir, "package.json");
    if (!existsSync(depPkgPath)) {
      directDeps.push({
        name,
        declaredRange: declared[name],
        installedVersion: null,
        type: null,
        exportsFingerprint: null,
        exposesPackageJson: false,
        parseState: "NO_PACKAGE_JSON",
      });
      gaps.push({ kind: "NO_PACKAGE_JSON", pkg: name, detail: "node_modules 下没有该包的 package.json" });
      continue;
    }
    const depPkg = readJson(depPkgPath);
    if (!depPkg.ok) {
      directDeps.push({
        name,
        declaredRange: declared[name],
        installedVersion: null,
        type: null,
        exportsFingerprint: null,
        exposesPackageJson: false,
        parseState: "NO_PACKAGE_JSON",
      });
      gaps.push({ kind: "NO_PACKAGE_JSON", pkg: name, detail: `package.json 不可解析: ${depPkg.error}` });
      continue;
    }
    const described = describeExports(depPkg.value);
    const record = {
      name,
      declaredRange: declared[name],
      installedVersion: typeof depPkg.value.version === "string" ? depPkg.value.version : null,
      type: depPkg.value.type ?? null,
      exportsDeclared: isDeclared(depPkg.value.exports),
      exportsFingerprint: described.fingerprint,
      exposesPackageJson: described.exposesPackageJson,
      hasRequireBranch: described.hasRequireBranch,
      parseState: described.parseState,
    };
    directDeps.push(record);
    if (described.parseState === "UNPARSEABLE") {
      // 覆盖率缺口：解析不了就显式记账，绝不静默跳过
      gaps.push({ kind: "UNPARSEABLE", pkg: name, detail: "exports 字段形态无法按 Node 语义解析" });
    }
  }
  return { ok: true, root, projectName: pkg.value.name ?? null, directDeps, gaps };
}

/** dependencies ∪ devDependencies（peer/optional 首期不计入"直接依赖面"）。 */
function collectDeclaredDeps(pkgJson) {
  const out = {};
  for (const field of ["dependencies", "devDependencies"]) {
    const block = pkgJson?.[field];
    if (!block || typeof block !== "object") continue;
    for (const [name, range] of Object.entries(block)) {
      if (typeof range === "string") out[name] = range;
    }
  }
  return out;
}

/** 依赖名解析：`@scope/name/sub` → `{name: "@scope/name", subpath: "./sub"}`；`pkg/sub` → `{name:"pkg", subpath:"./sub"}`。 */
export function splitSpecifier(specifier) {
  if (typeof specifier !== "string" || specifier === "") return null;
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2) return null;
    const name = `${parts[0]}/${parts[1]}`;
    const rest = parts.slice(2).join("/");
    return { name, subpath: rest ? `./${rest}` : "." };
  }
  const [name, ...rest] = parts;
  return { name, subpath: rest.length ? `./${rest.join("/")}` : "." };
}

/** 该 specifier 是否指向已装依赖（含子路径）；用于字符串兜底扫描的误报抑制。 */
export function isInstalledSpecifier(specifier, depNames) {
  const split = splitSpecifier(specifier);
  return split !== null && depNames.has(split.name);
}