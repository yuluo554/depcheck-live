// 门自洽性：脱敏门的跳过名单必须与 `.gitignore` 对齐（门注释第 ④ 条的可执行形态）。
//
// 背景（M1 实测）：`.mimosa/`（工具 hook 的会话状态目录）在 `.gitignore` 里声明了，
// 却没有进脱敏门的 `SKIP_DIRS` → 扫描面从 70 涨到 137 个文件。它今天恰好没有命中项，
// 但那只是运气：会话状态里随时可能写入本机绝对路径，那时门会报一堆"本仓库自己产生"的假命中，
// 而真正的泄漏反而被淹没。
//
// 门自己在注释里写着这条纪律，却靠人记 —— 这份测试把它变成机器判据。
// **判据只读仓库内文件**（`.gitignore` + 门源码），不依赖磁盘上此刻有什么。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GITIGNORE = readFileSync(join(ROOT, ".gitignore"), "utf8");
const GATE = readFileSync(join(ROOT, "tools", "check-desensitized.mjs"), "utf8");

/** 从门源码里抽出 `SKIP_DIRS` 集合的成员（不 import 门本体：门是脚本，导入会执行它）。 */
function gateSkipDirs() {
  const block = /const SKIP_DIRS = new Set\(\[([\s\S]*?)\]\);/.exec(GATE);
  assert.ok(block, "tools/check-desensitized.mjs 里找不到 `const SKIP_DIRS = new Set([...]);` —— 判据写法变了，本测试需同步");
  const body = block[1].replace(/\/\/.*$/gm, "");
  return new Set([...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

/**
 * `.gitignore` 里"声明的本地目录"。
 * 只取**目录形态**的条目（以 `/` 结尾），且跳过：
 *   · `!` 开头的例外（那是"必须入库"）；
 *   · 含 `*` 的后缀规则（名字随包名变，由门的 `SKIP_SUFFIXES` 管）。
 *
 * 嵌套路径（`share/python-wheels/`）取其 **basename**：门的 `SKIP_DIRS` 是按
 * 目录 basename 匹配的，`wheels` 一层已在集合里，`share/python-wheels` 自然被挡住。
 * 若哪天门的匹配方式改成"全路径"，这份测试会因 basename 对不上而红——那是**期望的**信号。
 */
function gitignoreLocalDirs() {
  const out = new Set();
  for (const raw of GITIGNORE.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    if (!line.endsWith("/")) continue;
    const name = line.replace(/\/$/, "");
    if (name.includes("*")) continue; // 后缀规则 → SKIP_SUFFIXES
    const base = name.replace(/^\//, "").split("/").pop();
    if (base) out.add(base);
  }
  return out;
}

test("脱敏门的 SKIP_DIRS 覆盖 .gitignore 声明的每个本地目录（门注释第 ④ 条）", () => {
  const declared = gitignoreLocalDirs();
  assert.ok(declared.size > 0, "`.gitignore` 里没解析出任何目录条目 —— 判据空跑（阳性对照失败）");
  const skip = gateSkipDirs();
  assert.ok(skip.size >= declared.size, `SKIP_DIRS(${skip.size}) 少于 .gitignore 目录数(${declared.size})`);

  const missing = [...declared].filter((d) => !skip.has(d)).sort();
  assert.deepEqual(
    missing,
    [],
    `这些 .gitignore 本地目录没进脱敏门的 SKIP_DIRS（会让门的扫描面混进本地环境文件）：${missing.join(", ")}`,
  );
});

test("阳性对照：`.mimosa`（M1 实测漏掉的那个）确实在 SKIP_DIRS 里", () => {
  // 钉住具体一条已知历史缺陷，防止"改了别的、又把它删回去"
  assert.ok(gateSkipDirs().has(".mimosa"), ".mimosa 必须留在 SKIP_DIRS（否则扫描面又会混进会话状态）");
});

test("门的跳过名单里没有明显笔误：每项都不含路径分隔符（只认目录名）", () => {
  for (const dir of gateSkipDirs()) {
    assert.ok(!dir.includes("/") && !dir.includes("\\"), `SKIP_DIRS 项 ${dir} 含路径分隔符，它只会匹配 basename`);
  }
});

test("`.git` 在跳过名单里（worktree 下它是文件不是目录，门两态都挡）", () => {
  assert.ok(gateSkipDirs().has(".git"));
  // 门源码里必须有对 `.git` 文件形态的显式挡板
  assert.match(GATE, /entry\.name === "\.git"/, "门缺 `.git` 的 worktree 文件形态挡板");
});