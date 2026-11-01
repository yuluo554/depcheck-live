#!/usr/bin/env node
// ═══ 发布门（M6） ═══
// 判据：`package.json` 的 `version` ↔ tag ↔ `plan/RELEASE-M6.md` 的发布事实块，三处一致。
//
// 三档（`plan/05` §5 第 4 条）：
//   node tools/check-release.mjs            # 离线档（默认）：**跨触发成立**，挂 CI
//   node tools/check-release.mjs --pre-tag  # tag 之前跑；tag 已存在 → 必红
//   node tools/check-release.mjs --online   # 联网核对远端 tag / Release / 附件回取 sha256
//
// 为什么 CI 里只能挂**离线档**：`--pre-tag` 的判据之一是"这个 tag 还不存在"，
// tag 推送触发的那一轮它必红（判据本身没错，只是那一档的前提在 tag 后不成立）。
// `--online` 需要 `gh` + 网络 + 远端仓库，PR 上不可得。
// 离线档只读**仓库内文件**，浅克隆 / 任意触发形态都成立。
//
// 退出码：0 全绿 / 1 有 FAIL / 2 用法错误 / 3 算不了（环境不足，**不是**"没事"）。
// （与另两道门同口径：门工具的用法错误 = 2；`bin/` 的 CLI 用法错误才是 4 —— K3 的分层纪律。）
//
// ── 两条来自本项目实测的纪律（别删）────────────────────────────────────────
// ① **标记必须按整行锚定**（K37）。说明段落里会引用 `<!-- RELEASE-FACTS:BEGIN -->`
//    的字面量；用 `indexOf` 抓到的会是说明里那一句，切出来的"事实块"连一行表格都没有
//    ——判据空跑而全绿（M5 在契约块上正好踩过这一族，代价是 13 条断言全瞎）。
//    **且本轮必须至少有一个附件名被真的读到**，否则同族缺陷会以"0 个附件 = 没问题"复活。
// ② **"算不了"与"没事"必须落在不同退出码**（`data/README.md` §5.1 同一口径）。
//    `--online` 拿不到 `gh` / 网络 / 远端时不许回 0——那会把"这一层没跑"写成"跑了没问题"。

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "plan/RELEASE-M6.md";
const DIST_DIR = "dist-release";

/** 事实块的标记按**整行**匹配（K37：裸子串会被说明段落里的同名字面量命中）。 */
const FACTS_BEGIN = "<!-- RELEASE-FACTS:BEGIN -->";
const FACTS_END = "<!-- RELEASE-FACTS:END -->";

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * 从发布留档里切出事实块。返回 `{ok, facts, errors, beginLine, endLine}`。
 * 判据：BEGIN/END **各恰好一次**、END 在 BEGIN 之后、块体非空。
 * 用"整行相等"而不是 `includes`——见文件头纪律①。
 */
export function parseFacts(text) {
  const lines = String(text ?? "").split("\n");
  const begins = [];
  const ends = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === FACTS_BEGIN) begins.push(i);
    if (line === FACTS_END) ends.push(i);
  }
  const errors = [];
  if (begins.length !== 1) errors.push(`\`${FACTS_BEGIN}\` 必须恰好出现 1 次（按整行），实际 ${begins.length} 次`);
  if (ends.length !== 1) errors.push(`\`${FACTS_END}\` 必须恰好出现 1 次（按整行），实际 ${ends.length} 次`);
  if (errors.length) return { ok: false, facts: {}, errors, beginLine: null, endLine: null };

  const [beginLine] = begins;
  const [endLine] = ends;
  if (endLine <= beginLine) {
    return { ok: false, facts: {}, errors: ["事实块的 END 在 BEGIN 之前（标记顺序反了）"], beginLine, endLine };
  }

  const facts = {};
  const seen = new Set();
  let rows = 0;
  for (let i = beginLine + 1; i < endLine; i++) {
    const raw = lines[i].trim();
    if (!raw.startsWith("|")) continue;
    const cells = raw.split("|").map((c) => c.trim());
    // `|a|b|` → ["", "a", "b", ""]
    const key = (cells[1] ?? "").replace(/`/g, "").trim();
    const value = (cells[2] ?? "").replace(/`/g, "").trim();
    if (!key || /^:?-{2,}:?$/.test(key)) continue; // 分隔行
    if (key === "字段") continue; // 表头
    rows += 1;
    if (seen.has(key)) errors.push(`事实块里字段 \`${key}\` 重复出现（值会被后一条覆盖）`);
    seen.add(key);
    facts[key] = value;
  }
  if (rows === 0) errors.push("事实块里一行表格都没有——切出来的片段是空的（判据面消失，同族缺陷会静默全绿）");
  return { ok: errors.length === 0, facts, errors, beginLine, endLine };
}

/** 发布事实的**纯校验**（不碰磁盘），供测试直接调用。`extra` 见 `sha256State`。 */
export function validateFacts({ version, docVersion, facts, mode }) {
  const problems = [];
  const notes = [];

  if (!SEMVER.test(String(version ?? ""))) problems.push(`package.json 的 version 不是合法 semver: ${JSON.stringify(version)}`);
  if (semver(version) !== semver(docVersion)) {
    problems.push(`版本三处不一致：package.json=${version} / 留档事实块=${docVersion || "(缺)"}`);
  }

  const wantTag = `v${version}`;
  if (facts.tag !== wantTag) problems.push(`tag 字段应为 ${wantTag}（= v + package.json version），实际 ${facts.tag || "(缺)"}`);
  if (facts.tag && !/^v\d+\.\d+\.\d+/.test(facts.tag)) problems.push(`tag 形态不合法（应为 v<X.Y.Z>）: ${facts.tag}`);

  const asset = String(facts.attachment ?? "");
  if (!asset) problems.push("事实块缺 `attachment`（Release 口径 A 要求 ≥1 个手工上传产物）");
  else {
    if (!asset.includes(version)) problems.push(`附件名 ${asset} 不含版本号 ${version}（发布后无法从名字认版本）`);
    if (!/\.zip$/i.test(asset)) problems.push(`附件名 ${asset} 不是 .zip（口径 A 定稿形态为整个 tag 树的 zip）`);
    if (asset.includes("/") || asset.includes("\\")) problems.push(`附件名 ${asset} 含路径分隔符（必须只是文件名）`);
  }

  const sha = String(facts.attachmentSha256 ?? "");
  if (sha && !SHA256_HEX.test(sha)) problems.push(`attachmentSha256 不是 64 位小写 hex: ${JSON.stringify(sha)}`);
  if (!sha) {
    if (mode === "online") problems.push("事实块缺 `attachmentSha256`（--online 档要求回取校验闭环）");
    else notes.push("attachmentSha256 尚未记录（按设计只能 tag 后追加——zip 内容含本文件，sha256 写进去会自指）");
  }

  return { problems, notes };
}

const semver = (v) => String(v ?? "").trim();

/** 文件的 sha256（全 hex）。 */
export function sha256Of(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const checks = [];
const add = (id, ok, detail, kind = "assert") => checks.push({ id, ok, detail, kind });

function usage(message) {
  process.stderr.write(`check-release: ${message}\n`);
  process.exit(2);
}

function main(argv) {
  const modes = [];
  for (const arg of argv) {
    if (arg === "--pre-tag") modes.push("pre-tag");
    else if (arg === "--online") modes.push("online");
    else if (arg === "--offline") modes.push("offline");
    else usage(`unknown argument ${arg}`);
  }
  if (modes.length > 1) usage("三档互斥，一次只能给一个（--pre-tag / --online / 默认离线档）");
  const mode = modes[0] ?? "offline";

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  } catch (error) {
    add("RELEASE.VERSION", false, `package.json 不可读/不可解析: ${error.message}`);
    return finish(mode);
  }

  const docPath = join(ROOT, DOC);
  if (!existsSync(docPath)) {
    add("RELEASE.FACTS", false, `缺 ${DOC}（发布留档必须在 tag 前落盘）`);
    return finish(mode);
  }
  const parsed = parseFacts(readFileSync(docPath, "utf8"));
  add("RELEASE.FACTS", parsed.ok, parsed.ok ? "事实块按整行锚定，标记各一次、块体非空" : parsed.errors.join("；"));
  if (!parsed.ok) return finish(mode);

  const { problems, notes } = validateFacts({
    version: pkg.version,
    docVersion: parsed.facts.version,
    facts: parsed.facts,
    mode,
  });
  const grouped = (id, predicate, okDetail) => {
    const hits = problems.filter(predicate);
    add(id, hits.length === 0, hits.length ? hits.join("；") : okDetail);
  };
  grouped("RELEASE.VERSION", (p) => p.startsWith("package.json 的 version") || p.startsWith("版本三处"), `${pkg.version}（package.json ↔ 留档一致）`);
  grouped("RELEASE.TAG", (p) => p.startsWith("tag 字段") || p.startsWith("tag 形态"), `v${pkg.version}（= v + 版本号）`);
  grouped("RELEASE.ASSET", (p) => p.startsWith("事实块缺 `attachment`") || p.startsWith("附件名"), `${parsed.facts.attachment}（含版本号 · zip · 纯文件名）`);
  grouped("RELEASE.SHA256", (p) => p.startsWith("attachmentSha256") || p.startsWith("事实块缺 `attachmentSha256`"), parsed.facts.attachmentSha256 || "（见备注）");
  const unaccounted = problems.filter((p) => !/^(package\.json 的 version|版本三处|tag 字段|tag 形态|事实块缺 `attachment`|附件名|attachmentSha256|事实块缺 `attachmentSha256`)/.test(p));
  if (unaccounted.length) add("RELEASE.UNCLASSIFIED", false, unaccounted.join("；"));

  // 本地副本：有就核对，没有就**说出来**（CI 上正常没有——zip 是产物，不入库）
  const distRel = `${DIST_DIR}/${parsed.facts.attachment}`;
  const distAbs = join(ROOT, DIST_DIR, parsed.facts.attachment ?? "");
  if (parsed.facts.attachment && existsSync(distAbs) && statSync(distAbs).isFile()) {
    const actual = sha256Of(distAbs);
    const recorded = String(parsed.facts.attachmentSha256 ?? "");
    if (!recorded) {
      add("RELEASE.LOCAL_COPY", true, `本地副本在（${distRel}），但 sha256 尚未记录；实测 ${actual.slice(0, 12)}…`, "note");
    } else {
      add(
        "RELEASE.LOCAL_COPY",
        actual === recorded,
        actual === recorded ? `${distRel} 与留档 sha256 逐字节一致` : `${distRel} sha256 与留档不符：实测 ${actual} / 留档 ${recorded}`,
      );
    }
  } else {
    add("RELEASE.LOCAL_COPY", true, `本地无 ${DIST_DIR}/ 副本（CI 上正常：zip 是产物不入库；留档 sha256 仍被 --online 档回取核对）`, "note");
  }

  // 覆盖对账表：至少 3 行三态（实现 / 不适用 / 待首推）。与布局门 LAYOUT.RELEASE 独立判——
  // 那边判"文件存在且形态齐"，这边判"每一格都落到了三态之一"，判据不重叠。
  const docText = readFileSync(docPath, "utf8");
  const coverage = docText.slice(docText.search(/^#{2,3}.*覆盖对账/m) >>> 0);
  const stateRows = (coverage.match(/^\|.*(实现|不适用|待首推).*\|$/gm) ?? []).length;
  add("RELEASE.COVERAGE", stateRows >= 3, `覆盖对账表三态行 ${stateRows} 行（要求 ≥ 3）`);

  if (mode === "pre-tag") checkPreTag(pkg.version);
  if (mode === "online") checkOnline(pkg.version, parsed.facts);

  for (const note of notes) add("RELEASE.NOTE", true, note, "note");
  return finish(mode);
}

/** tag 之前的档：判"这个 tag 还不存在"。**这一条就是它不能进 CI 的原因**（tag 推送时必红）。 */
function checkPreTag(version) {
  const tag = `v${version}`;
  const r = spawnSync("git", ["tag", "-l", tag], { cwd: ROOT, encoding: "utf8" });
  if (r.error || r.status !== 0) {
    add("RELEASE.PRE_TAG", false, `读不到 git tag（${r.error?.message ?? r.stderr?.trim() ?? "未知"}）——算不了，不是没事`, "unknown");
    return;
  }
  const exists = (r.stdout ?? "").trim() !== "";
  add(
    "RELEASE.PRE_TAG",
    !exists,
    exists
      ? `tag ${tag} 已存在：--pre-tag 只适用于打 tag 之前（tag 后请用离线档或 --online）`
      : `tag ${tag} 尚未创建（--pre-tag 的前提成立）`,
  );
}

/** 联网档：远端 tag + Release + ≥1 附件 + 附件回取 sha256 与留档一致。 */
function checkOnline(version, facts) {
  const tag = `v${version}`;
  const remote = spawnSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, encoding: "utf8" });
  const url = (remote.stdout ?? "").trim();
  if (remote.status !== 0 || !url) {
    add("RELEASE.ONLINE", false, "仓库没有 origin 远端——算不了（先建仓首推，再跑 --online）", "unknown");
    return;
  }
  const slug = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(url.replace(/\/$/, ""));
  if (!slug) {
    add("RELEASE.ONLINE", false, `origin 不是 GitHub 形态: ${url}`, "unknown");
    return;
  }
  const [, owner, repo] = slug;

  const rel = spawnSync("gh", ["api", `repos/${owner}/${repo}/releases/tags/${tag}`, "--jq", ".assets[]?.name"], { cwd: ROOT, encoding: "utf8" });
  if (rel.error) {
    add("RELEASE.ONLINE", false, `拿不到 gh（${rel.error.message}）——算不了`, "unknown");
    return;
  }
  if (rel.status !== 0) {
    add("RELEASE.ONLINE", false, `读 Release ${tag} 失败（${(rel.stderr ?? "").trim().split("\n")[0] || "无 stderr"}）`, "unknown");
    return;
  }
  const assets = (rel.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  add("RELEASE.ONLINE", assets.length >= 1, assets.length >= 1 ? `Release 有 ${assets.length} 个附件: ${assets.join(", ")}` : `Release ${tag} 没有任何附件（口径 A 要求 ≥1）`);
  if (assets.length === 0) return;

  const want = String(facts.attachment ?? "");
  if (!assets.includes(want)) {
    add("RELEASE.ONLINE_ASSET", false, `远端附件里没有留档声明的 ${want}（实际: ${assets.join(", ")}）`);
    return;
  }
  const recorded = String(facts.attachmentSha256 ?? "");
  if (!SHA256_HEX.test(recorded)) {
    add("RELEASE.ONLINE_ASSET", false, "没有可比的 attachmentSha256，回取校验无法闭环（--online 档硬要求）");
    return;
  }

  // 回取目录用**系统临时目录**并保证清理（本仓口径：临时工程一律 mkdtempSync(tmpdir())；
  // `/tmp` 在 Git Bash + Node 上不可用，所以不能写死 "/tmp"）。
  // ⚠️ 首版落在仓库内 `tmp/release-download-<pid>/`，**从不删除**——每跑一次 `--online`
  //    就在工作树里留一份 1.2 MB 的 zip 副本（实测跑几次后 `tmp/` 下积了 14 个目录）。
  //    判据门不该往被测仓库里写东西；`tmp/` 虽已 gitignore，但那只是让泄漏看不见。
  const dlDir = mkdtempSync(join(tmpdir(), "depcheck-release-"));
  try {
    const dl = spawnSync("gh", ["release", "download", tag, "-p", want, "-D", dlDir, "--clobber"], { cwd: ROOT, encoding: "utf8" });
    if (dl.error || dl.status !== 0) {
      add("RELEASE.ONLINE_ASSET", false, `回取附件失败（${dl.error?.message ?? (dl.stderr ?? "").trim().split("\n")[0]}）`, "unknown");
      return;
    }
    const back = join(dlDir, want);
    if (!existsSync(back)) {
      add("RELEASE.ONLINE_ASSET", false, `回取后找不到 ${want}（gh 退出 0 但文件不在）`);
      return;
    }
    const actual = sha256Of(back);
    add(
      "RELEASE.ONLINE_ASSET",
      actual === recorded,
      actual === recorded
        ? `回取 ${want} 的 sha256 与留档一致（${actual.slice(0, 12)}…）`
        : `回取 sha256 不符：远端 ${actual} / 留档 ${recorded}`,
    );
  } finally {
    rmSync(dlDir, { recursive: true, force: true });
  }
}

function finish(mode) {
  const label = { offline: "离线档（跨触发成立 · 挂 CI）", "pre-tag": "tag 前档", online: "联网档" }[mode];
  const failed = checks.filter((c) => !c.ok && c.kind !== "unknown");
  const unknown = checks.filter((c) => c.kind === "unknown" && !c.ok);
  process.stdout.write(`发布门 · ${label}\n${"=".repeat(64)}\n`);
  for (const c of checks) {
    const tag = c.ok ? (c.kind === "note" ? "NOTE" : "PASS") : c.kind === "unknown" ? "UNKNOWN" : "FAIL";
    process.stdout.write(`${tag.padEnd(7)} ${c.id.padEnd(20)} ${c.detail}\n`);
  }
  process.stdout.write(`${"=".repeat(64)}\n`);
  if (failed.length > 0) {
    process.stdout.write(`结论: ${failed.length} 条 FAIL\n`);
    process.exitCode = 1;
  } else if (unknown.length > 0) {
    process.stdout.write(`结论: 环境不足，${unknown.length} 条算不了（退出码 3——不是"没事"）\n`);
    process.exitCode = 3;
  } else {
    process.stdout.write("结论: 全绿\n");
    process.exitCode = 0;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main(process.argv.slice(2));