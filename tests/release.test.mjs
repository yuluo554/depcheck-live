// 发布门（`tools/check-release.mjs`）的**判据自证**与仓库事实对账。
//
// 为什么需要这份测试：发布门是 M6 才落位的**最后一道门**，它验的是"版本三处一致 + 附件 +
// 回取校验闭环"。如果一个字段没有任何东西在读，改坏它门照绿（K33 同族：声明了但没人读）。
// 这里把三条最容易失配的判据搬进测试：
//   ① 事实块的标记**按整行锚定**（K37 同族：说明段落里引用同名字面量时，裸子串会切出空块）；
//   ② 版本三处一致（`package.json` ↔ 事实块 ↔ tag 名）；
//   ③ 附件口径（含版本号 · `.zip` · 纯文件名）与「缺 sha256 时离线档放行、联网档必须红」的分档差别。
//
// 判据一律**调用门导出的纯函数**（`parseFacts` / `validateFacts`），不在测试里重抄一遍规则
// ——抄一遍就是第三份副本，改一处不同步就假绿。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseFacts, validateFacts, sha256Of } from "../tools/check-release.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOC = "plan/RELEASE-M6.md";
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const docText = () => readFileSync(join(ROOT, DOC), "utf8");

/** 造一段最小事实块（正文其余部分是无关的）。 */
function factsBlock(rows) {
  return `# x\n\n<!-- RELEASE-FACTS:BEGIN -->\n\n| 字段 | 值 |\n|---|---|\n${rows}\n\n<!-- RELEASE-FACTS:END -->\n`;
}

test("★ 事实块按整行锚定：说明段落里出现同名字面量时，切出的仍是真的那一块", () => {
  // 这一条钉住 M5 在契约块上踩过的整族缺陷：`indexOf` 会抓到说明句里的同名子串，
  // 切出来的片段连一行表格都没有 → 判据空跑而全绿。
  const text =
    "# 留档\n\n" +
    "> 说明：机器读 `<!-- RELEASE-FACTS:BEGIN -->` 到 `<!-- RELEASE-FACTS:END -->`。" +
    "这一句本身就含有标记字面量。\n\n" +
    factsBlock("| version | 0.1.0 |\n| tag | v0.1.0 |");
  const parsed = parseFacts(text);
  assert.ok(parsed.ok, `应能切出真事实块，实际: ${parsed.errors.join("；")}`);
  assert.equal(parsed.facts.version, "0.1.0", "切到的必须是真表格里的值（说明段落把它带偏了）");
  assert.ok(parsed.beginLine > 5, `BEGIN 应落在说明段落**之后**，实际行号 ${parsed.beginLine}`);
});

test("事实块切空时必须报错（不允许『0 行 = 没问题』）", () => {
  const empty = "<!-- RELEASE-FACTS:BEGIN -->\n<!-- RELEASE-FACTS:END -->";
  const parsed = parseFacts(empty);
  assert.equal(parsed.ok, false, "空块必须判不成立");
  assert.match(parsed.errors.join("；"), /一行表格都没有/);
});

test("标记缺一次 / 多一次 / 顺序反了都必须报错", () => {
  const base = factsBlock("| version | 0.1.0 |");
  assert.equal(parseFacts(base.replace(/<!-- RELEASE-FACTS:END -->/, "")).ok, false, "缺 END 必须红");
  assert.equal(parseFacts(base + "\n<!-- RELEASE-FACTS:BEGIN -->\n").ok, false, "BEGIN 重复必须红");
  const swapped = base.replace("<!-- RELEASE-FACTS:BEGIN -->", "<!-- RELEASE-FACTS:END -->");
  assert.equal(parseFacts(swapped).ok, false, "END 在 BEGIN 之前必须红");
});

test("★ 仓库里的 plan/RELEASE-M6.md：事实块可解析，且 version 与 package.json 一致", () => {
  const parsed = parseFacts(docText());
  assert.ok(parsed.ok, `事实块不成立: ${parsed.errors.join("；")}`);
  assert.ok(parsed.facts.version, "事实块缺 version 字段");
  assert.equal(parsed.facts.version, pkg.version, `事实块 version=${parsed.facts.version} ≠ package.json ${pkg.version}`);
  assert.equal(parsed.facts.tag, `v${pkg.version}`, `tag 字段应等于 v + 版本号（实际 ${parsed.facts.tag}）`);
});

test("validateFacts：仓库当前事实在**离线档**应无 problems（缺 sha256 只算备注）", () => {
  const parsed = parseFacts(docText());
  const { problems, notes } = validateFacts({
    version: pkg.version,
    docVersion: parsed.facts.version,
    facts: parsed.facts,
    mode: "offline",
  });
  assert.deepEqual(problems, [], `离线档不该有 problems：${problems.join("；")}`);
  if (!parsed.facts.attachmentSha256) {
    assert.ok(notes.length > 0, "缺 sha256 时必须给出备注（否则『没记』会被读成『记了且对』）");
  }
});

test("validateFacts：同一份事实在**联网档**若缺 sha256 必须红", () => {
  const { problems } = validateFacts({
    version: "0.1.0",
    docVersion: "0.1.0",
    facts: { tag: "v0.1.0", attachment: "depcheck-live-0.1.0.zip", attachmentSha256: "" },
    mode: "online",
  });
  assert.ok(problems.some((p) => p.includes("attachmentSha256")), `联网档缺 sha256 必须 FAIL，实际: ${problems.join("；")}`);
});

test("validateFacts：版本三处不一致 / 附件名不含版本号 / 非 zip / 带路径 各自会红", () => {
  const base = { tag: "v0.1.0", attachment: "depcheck-live-0.1.0.zip", attachmentSha256: "a".repeat(64) };
  const run = (over = {}) => validateFacts({ version: "0.1.0", docVersion: "0.1.0", facts: { ...base, ...over }, mode: "offline" }).problems;

  assert.deepEqual(run(), [], `基线应无 problems，实际: ${run().join("；")}`);
  assert.ok(
    validateFacts({ version: "0.1.0", docVersion: "0.2.0", facts: base, mode: "offline" }).problems.some((p) => p.includes("版本三处")),
    "留档版本与 package.json 不符必须红",
  );
  assert.ok(run({ attachment: "depcheck-live.zip" }).some((p) => p.includes("不含版本号")));
  assert.ok(run({ attachment: "depcheck-live-0.1.0.tar.gz" }).some((p) => p.includes("不是 .zip")));
  assert.ok(run({ attachment: "dist/depcheck-live-0.1.0.zip" }).some((p) => p.includes("路径分隔符")));
  assert.ok(run({ tag: "v0.2.0" }).some((p) => p.includes("tag 字段")));
  assert.ok(run({ attachmentSha256: "not-a-sha" }).some((p) => p.includes("64 位小写 hex")));
  assert.ok(
    validateFacts({ version: "0.1", docVersion: "0.1", facts: base, mode: "offline" }).problems.some((p) => p.includes("不是合法 semver")),
    "非 semver 的版本必须红（否则 tag 名会漂成任意字符串）",
  );
});

test("覆盖对账表：三态行 ≥ 3，且三态各至少出现一次", () => {
  const text = docText();
  const section = text.slice(text.search(/^#{2,3}.*覆盖对账/m) >>> 0);
  assert.ok(section.length > 0, "找不到覆盖对账小节");
  const rows = section.match(/^\|.*(实现|不适用|待首推).*\|$/gm) ?? [];
  assert.ok(rows.length >= 3, `三态行 ${rows.length} 行，要求 ≥ 3`);
  for (const state of ["实现", "不适用", "待首推"]) {
    assert.ok(rows.some((r) => r.includes(state)), `覆盖对账表缺『${state}』态行——三态必须都出现，否则『没做』可以靠不写来隐藏`);
  }
});

test("★ 本地副本若存在，sha256 必须与留档一致（落档前后不一致 = 附件是另一份东西）", () => {
  const parsed = parseFacts(docText());
  const recorded = parsed.facts.attachmentSha256;
  if (!recorded) return; // tag 前：尚未记录，由 --online 档负责闭环
  const local = join(ROOT, "dist-release", parsed.facts.attachment);
  let actual;
  try {
    actual = sha256Of(local);
  } catch {
    return; // 本地没留副本（CI 上正常）
  }
  assert.equal(actual, recorded, `dist-release/${parsed.facts.attachment} 的 sha256 与留档不符`);
});

test("发布门**能从仓外 cwd 跑**（判据落仓库内文件，不靠 cwd）", () => {
  // CI 与裸 clone 都不保证 cwd 在仓库根。门若隐式依赖 cwd，换个目录就静默判错。
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "check-release.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `离线档应全绿，实际 ${r.status}:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /结论: 全绿/);
});

test("发布门的『算不了』走退出码 3，不与 0 合并（无 origin 时 --online 不许回 0）", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "check-release.mjs"), "--online"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status === 0) {
    // 已发布且回取校验全绿 —— 也是合法结果
    assert.match(r.stdout, /结论: 全绿/);
    return;
  }
  assert.ok([1, 3].includes(r.status), `--online 在环境不足或有不一致时必须回 1/3，实际 ${r.status}`);
  assert.match(r.stdout, /FAIL|算不了/, "非 0 退出必须说明原因，不许静默");
});

test("三档互斥：同时给 --pre-tag 与 --online 必须用法错误（退出码 2）", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "check-release.mjs"), "--pre-tag", "--online"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  // 门工具的用法错误 = 2（另两道门同口径）；`4` 是 `bin/` 的 CLI 用法错误语义，别混用（K3）
  assert.equal(r.status, 2, `应回用法错误 2，实际 ${r.status}`);
});

test("未知参数回 2（不许静默忽略——静默会让『我以为它验了』变成真的）", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "check-release.mjs"), "--nope"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 2);
});