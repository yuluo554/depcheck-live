// ═══ 模块 ② · 引用点抽取 ═══
// AST 优先，字符串字面量为兜底（`plan/03` §3）。本项目零第三方依赖，因此用**手写词法级抽取**：
// 能可靠覆盖静态字面量形态，抽不出一律落 `AMBIGUOUS`。
//
// 核心纪律（`data/README.md` §5、`plan/03` §3）：
//   **严禁把"解析不到"当"不存在"**——动态形态必须显式出现在结果里，不能被静默丢弃。
//   这条比"抽得全"更重要：漏一个 AMBIGUOUS 就等于对用户撒了一次"没问题"。
//
// 行号纪律：必须指向**源行号**。CRLF 先归一成 LF 再切行（否则 Windows 上每行尾部多一个 \r，
// 且某些正则的 `$` 语义会变），但**归一不改变行数**，所以行号仍然准确。

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { KIND, SOURCE_EXTENSIONS, SKIP_DIRS, LIMITS, LARGE_FILE_DOWNGRADED } from "./contract.mjs";

/**
 * 从单个文件的文本抽取引用点。
 * @returns {Array<{file,line,kind,specifier:string|null,imported:string[],note?:string}>}
 */
export function scanText(text, file = "<inline>") {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    for (const point of scanLine(line, file, lineNo)) found.push(point);
  }
  return found;
}

const STATIC_IMPORT = /(?:^|[\s;{(])import\s+(?:([\w$*{}\s,]+?)\s+from\s+)?(["'])([^"'\n]+)\2/g;
const EXPORT_FROM = /(?:^|[\s;}])export\s+(?:\*|\{[^}]*\})\s+from\s+(["'])([^"'\n]+)\1/g;
const REQUIRE_CALL = /\brequire\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g;
const REQUIRE_DESTRUCTURED = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*(["'])([^"'\n]+)\2\s*\)/g;
const REQUIRE_DYNAMIC = /\brequire\s*\(\s*([^"')\s][^)]*)\)/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/g;
const DYNAMIC_IMPORT_VAR = /\bimport\s*\(\s*([^"')\s][^)]*)\)/g;
const JEST_MOCK = /\b(?:jest|vi)\s*\.\s*(?:mock|requireActual|importActual|doMock)\s*\(\s*(["'])([^"'\n]+)\1/g;

function scanLine(line, file, lineNo) {
  const out = [];

  // ① import ... from "x" / import "x"
  for (const m of line.matchAll(STATIC_IMPORT)) {
    out.push({ file, line: lineNo, kind: "import", specifier: m[3], imported: parseImportClause(m[1]) });
  }
  // ② export ... from "x"
  for (const m of line.matchAll(EXPORT_FROM)) {
    out.push({ file, line: lineNo, kind: "export-from", specifier: m[2], imported: ["*"] });
  }
  // ③ require("x")——解构形态额外记下被取用的符号（判定 §5.2 第 4 条要用）
  const destructured = new Map();
  for (const m of line.matchAll(REQUIRE_DESTRUCTURED)) {
    destructured.set(m.index, parseDestructuredNames(m[1]));
  }
  for (const m of line.matchAll(REQUIRE_CALL)) {
    const names = destructured.get(m.index) ?? [];
    out.push({ file, line: lineNo, kind: "require", specifier: m[2], imported: names });
  }
  // ④ require(variable) → AMBIGUOUS（显式，不可丢）
  for (const m of line.matchAll(REQUIRE_DYNAMIC)) {
    out.push({ file, line: lineNo, kind: "ambiguous", specifier: null, imported: [], note: `require(${truncate(m[1])})` });
  }
  // ⑤ import("x")
  for (const m of line.matchAll(DYNAMIC_IMPORT)) {
    out.push({ file, line: lineNo, kind: "dynamic-import", specifier: m[2], imported: ["*"] });
  }
  // ⑥ import(variable) → AMBIGUOUS
  for (const m of line.matchAll(DYNAMIC_IMPORT_VAR)) {
    out.push({ file, line: lineNo, kind: "ambiguous", specifier: null, imported: [], note: `import(${truncate(m[1])})` });
  }
  // ⑦ jest.mock("x")
  for (const m of line.matchAll(JEST_MOCK)) {
    out.push({ file, line: lineNo, kind: "jest-mock", specifier: m[2], imported: [] });
  }
  return out;
}

function truncate(s, n = 40) {
  const t = String(s).trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** `const { a, b: c } = require("p")` → ["a","b"]（取左侧的原名，不是本地别名）。 */
export function parseDestructuredNames(clause) {
  const names = [];
  for (const item of String(clause ?? "").split(",")) {
    const raw = item.trim();
    if (!raw) continue;
    // 剥掉默认值与 rest
    const cleaned = raw.replace(/^\.\.\./, "").split("=")[0].trim();
    const original = cleaned.split(":")[0].trim();
    if (original && /^[\w$]+$/.test(original)) names.push(original);
  }
  return names;
}

/**
 * 解析 import 子句 → 导入符号表。
 * `import x from` → ["default"]；`import {a, b as c}` → ["a","b"]；`import * as ns` → ["*"]。
 */
export function parseImportClause(clause) {
  if (!clause) return [];
  const parts = [];
  const named = /\{([^}]*)\}/.exec(clause);
  if (named) {
    for (const item of named[1].split(",")) {
      const name = item.split(/\s+as\s+/)[0].trim().replace(/^type\s+/, "");
      if (name) parts.push(name);
    }
  }
  if (/\*\s*as\s+[\w$]+/.test(clause)) parts.push("*");
  const beforeBrace = clause.split("{")[0].trim();
  if (beforeBrace && !beforeBrace.startsWith("*")) {
    const def = beforeBrace.replace(/,$/, "").trim();
    if (def && !def.startsWith("*")) parts.push("default");
  }
  return parts;
}

/** `⚠️ 字符串兜底`：形似包名的裸字符串（`data/README.md` §5.3 第 3 条）。 */
const BARE_PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(\/[^\s"'`]*)?$/;
/** 任意引号字符串字面量（单/双/反引号，不含换行，不含插值）。 */
const ANY_STRING_LITERAL = /(["'`])([^"'`\n$\\]{2,120})\1/g;

/**
 * 字符串兜底扫描的**误报抑制**（`data/README.md` §5.3 第 3 条：两条同时成立才计入）：
 *   ① 字符串形似包名（含 `pkg/sub` 形态）；
 *   ② 其包名部分命中已装依赖名集合。
 * 只满足 ① 的字符串（文案里的 `"lodash"` 而项目没装 lodash）**不计入**。
 *
 * @param {string} text 源文件文本
 * @param {Set<string>} depNames 已装依赖名（来自 package.json 的 dependencies ∪ devDependencies）
 * @returns {Array<{specifier:string, line:number}>}
 */
export function findBarePackageLiterals(text, depNames) {
  const out = [];
  if (!depNames || depNames.size === 0) return out;
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(ANY_STRING_LITERAL)) {
      const raw = m[2].trim();
      if (!BARE_PACKAGE_NAME.test(raw)) continue;
      const namePart = raw.startsWith("@") ? raw.split("/").slice(0, 2).join("/") : raw.split("/")[0];
      if (!depNames.has(namePart)) continue;
      out.push({ specifier: raw, line: i + 1 });
    }
  }
  return out;
}

/**
 * 递归收集源码文件（按扩展名过滤，跳过 `node_modules` 等）。
 * 返回**已排序**的绝对路径列表（确定性：集合遍历前必须排序）。
 */
export function collectSourceFiles(root, options = {}) {
  const exts = new Set(options.extensions ?? SOURCE_EXTENSIONS);
  const skip = new Set(options.skipDirs ?? SKIP_DIRS);
  const out = [];
  walk(root, out, exts, skip);
  return out.sort();
}

function walk(dir, out, exts, skip) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 无权限/不存在：跳过这个目录，不中断整批
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skip.has(entry.name)) continue;
      walk(join(dir, entry.name), out, exts, skip);
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    const ext = dot >= 0 ? entry.name.slice(dot) : "";
    if (exts.has(ext)) out.push(join(dir, entry.name));
  }
}

/** 全树扫描；文件读失败记一条 gap（不静默）；超大文件降级并记一条 gap（也不静默）。 */
export function scanSources(root, options = {}) {
  const files = collectSourceFiles(root, options);
  const limit = options.maxFileBytes ?? LIMITS.SOURCE_FILE_BYTES;
  const points = [];
  const gaps = [];
  for (const abs of files) {
    const rel = relative(root, abs).split(sep).join("/");
    let text;
    try {
      // 单文件上限（`data/README.md` §5.3）：超限**降级为字符串兜底扫描**并显式记账，
      // 不得静默跳过——用户必须看得见"这份文件没被完整分析"。
      const size = statSync(abs).size;
      if (size > limit) {
        gaps.push({ kind: LARGE_FILE_DOWNGRADED, file: rel, detail: `${size} 字节 > 上限 ${limit}，降级为字符串兜底扫描` });
      }
      text = readFileSync(abs, "utf8");
    } catch (error) {
      gaps.push({ kind: "UNREADABLE_FILE", file: rel, detail: error.message });
      continue;
    }
    for (const p of scanText(text, rel)) points.push(p);
    // 字符串兜底（§5.3 第 3 条）：只在给了已装依赖名集合时才跑，双条件过滤后计入。
    // **必须去重**：`require("chalk")` 里的 "chalk" 也是形似包名的字面量，
    // 但它已被 `require` 结构化抽取覆盖；再计一次就是同一引用点算两遍（假阳性）。
    if (options.depNames) {
      for (const hit of findBarePackageLiterals(text, options.depNames)) {
        const already = points.some(
          (p) => p.file === rel && p.line === hit.line && p.specifier === hit.specifier,
        );
        if (already) continue;
        points.push({ file: rel, line: hit.line, kind: "string-literal", specifier: hit.specifier, imported: [] });
      }
    }
  }
  points.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  return { files: files.map((abs) => relative(root, abs).split(sep).join("/")), points, gaps };
}

/** kind 是否属于契约枚举（自检用：新增 kind 忘了进 contract 会被测试抓）。 */
export function isKnownKind(kind) {
  return KIND.includes(kind);
}