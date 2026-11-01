#!/usr/bin/env node
// ═══ 脱敏门（发布前必跑，进 CI 的 layout job） ═══
// 来源：ai-tool-project-sprint references/templates/check-desensitized.mjs（4 条规则不改）。
// 为什么是"门"而不是一次性 grep：发布**之后**任何一次改动都可能把本机路径带回来；
// 命中时逐行打印 `文件:行: [规则] 原文`，不静默通过。
//
// 运行：node tools/check-desensitized.mjs
// 退出码：0 零命中 / 1 有命中 / 2 用法错误。
//
// 变异验证（每条规则一组，`node tools/mutate-gates.mjs` 已钉住）：
//   V1 文档里写 `D:/<本机目录>/…`        → absolute-session-path 红
//   V2 写 `C:\Users\<真实用户名>\x`      → absolute-session-path + host-username 红
//   V3 写 `/c/Users/<真实用户名>/x`      → msys-user-path + host-username 红
//   V4 写 `127.0.0.1:7897`               → loopback-proxy 红
//   还原后必须复绿。
//
// 四条实测口径：
//   ① 占位符必须放行（`<user>` / `<repo>` / `<local-proxy>`）——否则"已脱敏"被判成"未脱敏"；
//   ② 公开镜像不是私有代理：`goproxy.cn` / 清华源不判，只认回环与私网；
//   ③ 门要豁免自己，但**豁免面写成文件集合**（假门族 ㉒：新增同类工具会被自己的判据判红），
//      并把豁免份数打进结论行；`.git` 在 worktree 里是文件不是目录，两态都要挡；
//   ④ **扫描面 = 仓库内容，不是本地环境**：`.gitignore` 声明的每个本地目录这里都要有对应项
//      （名字随包名变的用后缀规则）。判据要问"跑我这一步时磁盘上多了什么？"
//      ⚠️ M1 实测补记：`.mimosa/`（工具 hook 的会话状态）曾被漏掉，扫描面从 70 涨到 137 个文件
//      —— 它当时恰好没有命中项，但那只是运气；会话状态里随时可能出现本机绝对路径。
//      **新增 `.gitignore` 本地目录时必须同笔加进 SKIP_DIRS**，`tests/gate-selfcheck.test.mjs`
//      会读 `.gitignore` 逐条对账（漏一项即红），不靠人记。变异组 D5 钉住这条的实际效果。

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-desensitized: unknown argument ${arg}\n`);
  process.exit(2);
}

/** 自豁免面 = **文件集合**（.mjs 与将来的 .py 两版都在，别只豁免自己那一份）。
 *  `mutate-gates.mjs` 必须**写出**被判据禁止的字面量（它就是变异靶子的定义），
 *  与既有条同族：豁免面要写成集合 + 把"为什么它必须豁免"写清楚，否则下一个同类工具
 *  落进扫描面时会被自己的判据判红（假门族 ㉒）。 */
const SELF = new Set([
  "tools/check-desensitized.mjs",
  "tools/check_desensitized.py",
  "tools/mutate-gates.mjs",
]);

const SKIP_DIRS = new Set([
  ".git", ".tmp", "tmp", "dist", "dist-release", "node_modules", ".cache", ".venv", "venv",
  "build", "_private", ".depcheck-live", ".pytest_cache", "coverage", "_scratch", ".venv-readme",
  // 编辑器 / 系统 / 工具本地的状态目录（`.gitignore` 里声明过的，这里必须有对应项）
  ".vscode", ".idea", ".mimosa",
  // `.gitignore` 的 Python 模板残留段：本仓不产出这些路径，但**留着对应项**——
  // 万一有人在本仓跑 pytest/venv，这些目录会出现在磁盘上，届时必须已经在外。
  // `share/python-wheels/` 按 basename 取 `python-wheels`（门的匹配口径是目录名）。
  "__pycache__", ".eggs", "develop-eggs", "downloads", "eggs", "lib", "lib64", "parts",
  "sdist", "var", "wheels", "ENV", "env", "python-wheels",
  ".tox", ".nox", ".hypothesis", ".mypy_cache", ".ruff_cache", "htmlcov",
]);
const SKIP_SUFFIXES = [".egg-info", ".dist-info"];
const SKIP_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".gz", ".exe", ".dll", ".pdf", ".woff", ".woff2"]);

const RULES = [
  {
    id: "absolute-session-path",
    // 盘符绝对路径；`<repo>` / `<user>` 这类占位符放行（负向前瞻）
    re: /\b[A-Za-z]:[\\/](?:ProgramData|Users|zcode|repos?|projects?|Program)[\\/](?!<)/,
  },
  {
    id: "msys-user-path",
    re: /\/[a-z]\/Users\/(?!<)[A-Za-z0-9._-]+\//,
  },
  {
    id: "host-username",
    // 本机用户名实测值；换机器要改这一行（runner 上叫 runner，不能用环境实算）
    re: /\bASUS\b/,
  },
  {
    id: "loopback-proxy",
    // 回环代理端口；私网段同理（`\b192\.168\.\d+\.\d+(?::\d+)?\b`）
    re: /\b127\.0\.0\.1:\d{2,5}\b/,
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue; // 目录形态与 worktree 文件形态一起挡
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
      yield* walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    if (dot >= 0 && SKIP_EXTS.has(entry.name.slice(dot))) continue;
    yield join(dir, entry.name);
  }
}

const hits = [];
let scanned = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (SELF.has(rel)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // 二进制
  scanned++;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const rule of RULES) {
      if (rule.re.test(lines[i])) hits.push(`${rel}:${i + 1}: [${rule.id}] ${lines[i].trim().slice(0, 160)}`);
    }
  }
}

if (hits.length > 0) {
  process.stdout.write(`脱敏门：${hits.length} 处命中（扫了 ${scanned} 个文本文件，豁免 ${SELF.size} 份）\n`);
  for (const h of hits) process.stdout.write(`FAIL  ${h}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`脱敏门：扫了 ${scanned} 个文本文件，0 命中（豁免 ${SELF.size} 份）\n`);
  process.exitCode = 0;
}