// 契约块双向断言（`SKILL.md` ↔ `src/contract.mjs`，M5 DoD 第 1 条）。
//
// 为什么必须有这条测试：`SKILL.md` 是**第二交付形态的主入口**，它对外声明的每个枚举值
// 都是"用户据此判断工具能说什么"的依据。只写不验 = 声明了但没人读（M4 招牌发现 0 的同族假门）：
// 代码里改了判定态、SKILL 不改，两份文档各自"看起来一致"，实际契约已经裂开。
//
// 判据**两个方向各一遍**（`plan/03` §7）：
//   ① contract → SKILL：`contract.mjs` 导出的每个值，契约块里都要出现；
//   ② SKILL → contract：契约块里出现的每个"像枚举值"的记号，都要在 `contract.mjs` 找到。
// 只有 ① 是假门的一半：能挡住"代码加了值文档没写"，挡不住"文档写了代码里没有的值"。
//
// 外加三条纪律断言（都是 M5 入口文件明确要求的，不是凑数）：
//   · 负向值（`OUT-OF-SCOPE` / `NOT-A-REFERENCE` / `ERROR`）**不是**枚举成员，不得写进契约块；
//   · 退出码 `2` 必须被声明为"保留不用"（`tests/cli.test.mjs` 钉代码侧，这里钉文档侧）；
//   · 判定能力的固有边界（§5.4.2）必须在 SKILL 里写明，**不得**越界宣称。
//
// 还有一条结构性判据：`plan/00` §5 四格表第 3 列点名的业务函数必须**真实存在且被 export**
// ——M0 留下的 `src/api.mjs::run()` 悬空引用就是这么来的（点了名，代码里没有，全绿）。

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS,
  NO_BASELINE,
  DRIFT,
  UNPARSEABLE,
  EXIT,
  KIND,
  SOURCE_EXTENSIONS,
  LIMITS,
  COMMANDS,
  TOOL,
} from "../src/contract.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const SKILL = read("SKILL.md");

/** 契约块 = 两个注释标记之间的那段（机器解析面）。标记缺失即判据失效，直接红。
 *  ⚠️ 必须按**整行**匹配：说明段落里会引用标记的字面量（"从 `<!-- CONTRACT:BEGIN -->` 到 …"），
 *  用 `indexOf` 抓到的会是那句说明里的同名子串，切出来的片段连一行表格都没有（判据空跑）。 */
function contractBlock(text) {
  const begin = text.search(/^<!-- CONTRACT:BEGIN -->$/m);
  const end = text.search(/^<!-- CONTRACT:END -->$/m);
  assert.ok(begin >= 0, "SKILL.md 缺独占一行的 `<!-- CONTRACT:BEGIN -->` 标记——机器解析面不存在");
  assert.ok(end > begin, "SKILL.md 缺独占一行的 `<!-- CONTRACT:END -->` 标记，或顺序颠倒");
  return text.slice(begin, end);
}

const BLOCK = contractBlock(SKILL);

/** 反引号包起来的记号 = 契约块里"声明了一个值"的唯一写法。 */
const backticked = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** 契约块的表格行 → 单元格数组（去掉首尾空串）。**表头行也跳过**（`| 项 | 值 |`）。 */
function blockRows() {
  return BLOCK.split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length >= 2 && !cells.every((c) => /^-+$/.test(c)))
    .filter((cells) => cells[0] !== "项");
}

/** 按行首名取该行的值记号（如「退出码」行）。找不到该行 → 红，不静默跳过。 */
function rowValues(label) {
  const row = blockRows().find((cells) => cells[0] === label);
  assert.ok(row, `契约块缺「${label}」这一行`);
  return backticked(row[1]);
}

// ── 方向 ①：contract.mjs → SKILL.md ──────────────────────────────────────────

test("方向① 五判定态：contract.STATUS 的每个值都出现在契约块里", () => {
  const values = Object.values(STATUS);
  assert.equal(values.length, 5, `STATUS 应恰好 5 个（冻结），实际 ${values.length}`);
  const declared = new Set(rowValues("判定态"));
  for (const v of values) assert.ok(declared.has(v), `契约块缺判定态 ${v}`);
  // 反向也在本条内钉住：判定态行不得出现 STATUS 之外的东西
  for (const token of declared) {
    assert.ok(values.includes(token), `契约块的「判定态」行出现了非枚举值 ${token}（不是五判定态成员）`);
  }
});

test("方向① 非判定态与漂移态：NO_BASELINE / UNPARSEABLE / DRIFT 都在契约块里", () => {
  assert.ok(backticked(BLOCK).includes(NO_BASELINE), `契约块缺 ${NO_BASELINE}`);
  assert.ok(backticked(BLOCK).includes(UNPARSEABLE), `契约块缺 ${UNPARSEABLE}`);
  assert.ok(backticked(BLOCK).includes(DRIFT), `契约块缺 ${DRIFT}`);
});

test("方向① 退出码：EXIT 的每个值都写进「退出码」行，且 2 被声明为保留不用", () => {
  const declared = rowValues("退出码");
  for (const [name, code] of Object.entries(EXIT)) {
    assert.ok(declared.includes(String(code)), `契约块「退出码」行缺 ${name}=${code}`);
  }
  assert.ok(declared.includes("2"), "契约块必须写明 2 的存在（保留不用），否则读者会以为 2 可用");
  assert.ok(!Object.values(EXIT).includes(2), "代码侧 EXIT 里不得出现 2（保留不用）");
  assert.match(BLOCK, /`2`\s*保留不用/, "契约块必须把 2 标注为「保留不用」，不能只留一个数字");
});

test("方向① 命令名：COMMANDS 的每个命令都出现在契约块里", () => {
  const declared = new Set(rowValues("命令"));
  for (const cmd of COMMANDS) assert.ok(declared.has(cmd), `契约块缺命令 ${cmd}`);
  for (const token of declared) {
    assert.ok(COMMANDS.includes(token), `契约块声明了 COMMANDS 之外的命令 ${token}`);
  }
});

test("方向① 引用点种类与扫描扩展名：KIND / SOURCE_EXTENSIONS 全部出现", () => {
  const kinds = new Set(rowValues("引用点种类"));
  for (const k of KIND) assert.ok(kinds.has(k), `契约块缺引用点种类 ${k}`);
  for (const token of kinds) assert.ok(KIND.includes(token), `契约块声明了 KIND 之外的种类 ${token}`);

  const exts = new Set(rowValues("扫描扩展名"));
  for (const e of SOURCE_EXTENSIONS) assert.ok(exts.has(e), `契约块缺扩展名 ${e}`);
  for (const token of exts) assert.ok(SOURCE_EXTENSIONS.includes(token), `契约块声明了 SOURCE_EXTENSIONS 之外的扩展名 ${token}`);
});

test("方向① 工具名：契约块的工具名 == contract.TOOL", () => {
  const [declared] = rowValues("工具名");
  assert.equal(declared, TOOL, `契约块工具名 ${declared} 与 contract.TOOL=${TOOL} 不一致`);
});

// ── 方向 ②：SKILL.md → contract.mjs ──────────────────────────────────────────

test("方向② 契约块按行归属校验：每行的记号只能来自该行对应的枚举，多一个少一个都红", () => {
  // 全局"猜这个记号属于哪个枚举"会把 COMMANDS（小写）与 KIND（小写）混在一起——
  // 那等于没验。判据改成**按行**：行名决定它该比对哪个真值源，两边集合必须相等。
  const EXPECT = {
    工具名: [TOOL],
    命令: [...COMMANDS],
    判定态: Object.values(STATUS),
    非判定态: [NO_BASELINE, UNPARSEABLE],
    漂移态: [DRIFT],
    退出码: [...Object.values(EXIT).map(String), "2"],
    引用点种类: [...KIND],
    扫描扩展名: [...SOURCE_EXTENSIONS],
  };
  const rows = blockRows();
  const labels = rows.map((c) => c[0]).sort();
  assert.deepEqual(labels, Object.keys(EXPECT).sort(), `契约块行名与判据表不匹配：实际 ${labels.join(",")}`);

  for (const [label, expected] of Object.entries(EXPECT)) {
    const declared = rowValues(label);
    const missing = expected.filter((v) => !declared.includes(v));
    const extra = declared.filter((v) => !expected.includes(v));
    assert.deepEqual(missing, [], `契约块「${label}」行缺值：${missing.join(",")}`);
    assert.deepEqual(extra, [], `契约块「${label}」行声明了代码里没有的值：${extra.join(",")}`);
  }
});

test("方向② 契约块里每个大写枚举记号确实出现在 SKILL 的语义位置（不是随手贴的）", () => {
  // 防"把 contract.mjs 整个粘一遍就算对账"：每个枚举值必须落在带语义标签的行里。
  const rows = blockRows();
  const labelOf = (token) => rows.filter((cells) => backticked(cells[1]).includes(token)).map((cells) => cells[0]);
  assert.deepEqual(labelOf(STATUS.MISSING_EXPORT), ["判定态"], "MISSING-EXPORT 应只出现在「判定态」行");
  assert.deepEqual(labelOf(DRIFT), ["漂移态"], "VERSION-BEHAVIOR-DRIFT 应只出现在「漂移态」行（它不是第六判定态）");
  for (const token of [NO_BASELINE, UNPARSEABLE]) {
    assert.deepEqual(labelOf(token), ["非判定态"], `${token} 应只出现在「非判定态」行`);
  }
});

// ── 纪律断言（负向值不得进枚举 / 边界必须写明）──────────────────────────────

test("负向值不是枚举成员：契约块不得出现 OUT-OF-SCOPE / NOT-A-REFERENCE / ERROR", () => {
  // M1 曾把 C7 的"相对路径 / node: 内置 / 文案字符串"写成 `points[].status = "OUT-OF-SCOPE"`，
  // 而这两个值**不是五判定态**，永远进不了 findings，按 status 对账必然失配（HANDOFF-M5 §一 第 1 条）。
for (const bogus of ["OUT-OF-SCOPE", "NOT-A-REFERENCE", "ERROR"]) {
    assert.ok(!BLOCK.includes(bogus), `契约块把 ${bogus} 写成了枚举值——它不在 contract.mjs 的枚举里`);
  }
});

test("边界必须写明：SKILL 不得宣称「CJS 视角取错名字会报 MISSING-EXPORT」（§5.4.2）", () => {
  // data/README.md §5.4.2：无 require 分支的包上，CJS 取不存在的符号**必然先命中** MISMATCH。
  // 这是固有边界；宣称相反会让读者按错的方向修代码。
  const compact = SKILL.replace(/\s+/g, " ");
  assert.match(
    compact,
    /CJS 视角取一个不存在的符号，不会报 `MISSING-EXPORT`|CJS 视角.{0,20}不会报.{0,20}MISSING-EXPORT/,
    "SKILL.md 缺 §5.4.2 的固有边界声明（不得宣称 CJS 取错名字报 MISSING-EXPORT）",
  );
  assert.match(compact, /ESM-CJS-MISMATCH[\s\S]{0,80}不看 `type`/, "SKILL.md 必须写明招牌判据：不看 type，看 exports 的 require 分支");
  assert.match(compact, /`commander`/, "SKILL.md 必须点出 commander 这个反例（无 require 分支却取得到符号，不得判 MISMATCH）");
  assert.match(compact, /`AMBIGUOUS` 不代表代码有错/, "SKILL.md 必须写明 AMBIGUOUS 不是缺陷");
  assert.match(compact, /没有离线基线 → `NO-BASELINE`，\*\*不猜\*\*|NO-BASELINE.{0,20}不猜/, "SKILL.md 必须写明 drift 无基线时不猜");
});

test("数值口径不在 SKILL 复制：阈值数字只许在 data/README.md §5 出现", () => {
  // 复制会让第三份副本各自漂移（`plan/01` 口径声明：可漂移的实现数字只定义一次）。
  for (const n of Object.values(LIMITS)) {
    assert.ok(!SKILL.includes(String(n)), `SKILL.md 复制了阈值 ${n}——应改为引用 data/README.md §5.3`);
  }
});

// ── 结构性判据：四格表点名的业务函数必须真实存在 ──────────────────────────────

test("plan/00 §5 四格表第 3 列点名的每个函数都真实 export 在对应模块里", () => {
  const lines = read("plan/00-README总览.md").split("\n");
  const tables = lines.filter((l) => l.trimStart().startsWith("|"));
  const rows = tables
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length >= 5);
  const target = rows.filter((cells) => cells[0] === "CLI" || cells[0] === "Agent Skill");
  assert.equal(target.length, 2, `四格表应恰好 2 行（CLI / Agent Skill），实际 ${target.length}`);

  const srcFiles = new Set(readdirSync(join(ROOT, "src")).filter((f) => f.endsWith(".mjs")));
  const checked = [];
  for (const cells of target) {
    const cell = cells[3] ?? "";
    assert.ok(cell.length > 0, `${cells[0]} 行第 3 列是空的——该形态视为未交付`);
    const refs = [...cell.matchAll(/src\/([\w.-]+\.mjs)::([\w$]+)\(\)/g)];
    assert.ok(refs.length > 0, `${cells[0]} 行第 3 列没有点名任何 src/*.mjs::fn()：${cell}`);
    for (const [, file, fn] of refs) {
      assert.ok(srcFiles.has(file), `${cells[0]} 行点名 ${file} 不存在（悬空引用）`);
      const text = readFileSync(join(ROOT, "src", file), "utf8");
      const exported = new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\s*\\(`).test(text) ||
        new RegExp(`export\\s+const\\s+${fn}\\b`).test(text);
      assert.ok(exported, `${cells[0]} 行点名 ${file}::${fn}()，但该模块没有 export 这个函数（悬空引用）`);
      checked.push(`${file}::${fn}`);
    }
  }
  assert.ok(checked.length >= 2, `只验到 ${checked.length} 个函数引用——判据接近空跑`);
});

test("四格表两行无空列（任一行有空格 → 该形态视为未交付）", () => {
  const rows = read("plan/00-README总览.md")
    .split("\n")
    .filter((l) => l.trimStart().startsWith("|"))
    .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells.length === 6 && (cells[0] === "CLI" || cells[0] === "Agent Skill"));
  assert.equal(rows.length, 2, "四格表两行都必须在（CLI / Agent Skill）");
  for (const cells of rows) {
    cells.forEach((c, i) => assert.ok(c.length > 0, `${cells[0]} 行第 ${i + 1} 列是空的`));
  }
});