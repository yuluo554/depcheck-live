// 语料真值纪律（`plan/04` §3）的可执行形态。
//
// 这条测试防的是"语料看起来齐了、其实用不了"：
//   ① 六份 case 目录齐备且每份都有 INPUT.md + expected.json；
//   ② 每份 expected.json 都能被解析，且声明了 case / verifies / milestone；
//   ③ 真值纪律 1：`expected.json` 里不得出现由被测实现算出的中间量（只存输入与期望）；
//   ④ 真值纪律 2：每项必须声明 status（+ evidence），不得只给结论；
//   ⑤ 真值纪律 4：语料中不得出现绝对路径；
//   ⑥ 语料里的包名必须是真实公开 npm 包（不虚构），且与 data/packages/ 对得上。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURES = join(ROOT, "fixtures");

/** `plan/04` §2 的六份语料（C6 是 M3、C7 是 M4，但目录在 M1 就落位）。 */
const CASES = [
  { id: "C1", dir: "resolved-basic", status: "RESOLVED" },
  { id: "C2", dir: "missing-export", status: "MISSING-EXPORT" },
  { id: "C3", dir: "esm-cjs-mismatch", status: "ESM-CJS-MISMATCH" },
  { id: "C4", dir: "subpath-blocked", status: "NOT-EXPORTED-SUBPATH" },
  { id: "C5", dir: "ambiguous-dynamic", status: "AMBIGUOUS" },
  { id: "C6", dir: "drift-baseline", status: "VERSION-BEHAVIOR-DRIFT" },
  { id: "C7", dir: "clean-project", status: null },
];

const KNOWN_PACKAGES = new Set(
  readdirSync(join(ROOT, "data", "packages"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5)),
);

test("六份 case 目录齐备，每份都有 INPUT.md + expected.json", () => {
  assert.equal(CASES.length, 7, "plan/04 §2 列的是 C1–C7 七行（C1–C5 为 M2，C6 为 M3，C7 为 M4）");
  for (const c of CASES) {
    const dir = join(FIXTURES, c.dir);
    assert.ok(existsSync(dir), `缺 fixtures/${c.dir}/`);
    assert.ok(existsSync(join(dir, "INPUT.md")), `缺 fixtures/${c.dir}/INPUT.md`);
    assert.ok(existsSync(join(dir, "expected.json")), `缺 fixtures/${c.dir}/expected.json`);
  }
});

test("每份 INPUT.md 都写清了『验证哪条』+『为什么能证伪』（plan/04 §3 第 6 条）", () => {
  for (const c of CASES) {
    const text = readFileSync(join(FIXTURES, c.dir, "INPUT.md"), "utf8");
    assert.ok(text.includes("验证哪条"), `fixtures/${c.dir}/INPUT.md 缺『验证哪条判定态』小节`);
    assert.ok(
      text.includes("为什么这条构造能证伪") || text.includes("为什么能证伪"),
      `fixtures/${c.dir}/INPUT.md 缺『为什么能证伪』小节`,
    );
    // 证伪说明必须是实质内容，不是一句"因为实现会判绿"
    assert.ok(text.length > 800, `fixtures/${c.dir}/INPUT.md 过短（${text.length} 字符），疑似占位`);
  }
});

test("每份 expected.json 可解析且声明了 case / verifies / milestone", () => {
  for (const c of CASES) {
    const raw = readFileSync(join(FIXTURES, c.dir, "expected.json"), "utf8");
    let parsed;
    assert.doesNotThrow(() => (parsed = JSON.parse(raw)), `fixtures/${c.dir}/expected.json 不是合法 JSON`);
    assert.equal(parsed.case, c.id, `fixtures/${c.dir}: case 字段应为 ${c.id}`);
    assert.ok(parsed.verifies, `fixtures/${c.dir}: 缺 verifies`);
    assert.ok(parsed.milestone, `fixtures/${c.dir}: 缺 milestone`);
    assert.ok(Array.isArray(parsed.points) && parsed.points.length > 0, `fixtures/${c.dir}: points 不能为空`);
  }
});

test("真值纪律 2：每个 point 都声明 status（不得只给结论靠猜）", () => {
  for (const c of CASES) {
    const parsed = JSON.parse(readFileSync(join(FIXTURES, c.dir, "expected.json"), "utf8"));
    for (const p of parsed.points) {
      assert.ok(p.id, `fixtures/${c.dir}: 有 point 缺 id`);
      assert.ok(p.status, `fixtures/${c.dir} 的 ${p.id}: 缺 status`);
      assert.ok(p.evidence, `fixtures/${c.dir} 的 ${p.id}: 缺 evidence（真值纪律：不得只给结论）`);
    }
  }
});

test("每份 case 的判定态与它声明的 verifies 对得上（C1–C6）", () => {
  for (const c of CASES.filter((x) => x.status)) {
    const raw = readFileSync(join(FIXTURES, c.dir, "expected.json"), "utf8");
    assert.ok(raw.includes(c.status), `fixtures/${c.dir} 应验证 ${c.status}，但 expected.json 里没出现该判定态`);
  }
});

test("真值纪律 4：语料里不得出现绝对路径 / 盘符", () => {
  for (const c of CASES) {
    for (const f of ["INPUT.md", "expected.json"]) {
      const text = readFileSync(join(FIXTURES, c.dir, f), "utf8");
      assert.ok(!/[A-Za-z]:[\\/]/.test(text), `fixtures/${c.dir}/${f} 出现盘符路径`);
      assert.ok(!text.includes("\\Users\\") && !text.includes("/Users/"), `fixtures/${c.dir}/${f} 出现家目录路径`);
    }
  }
});

test("真值纪律 5：语料引用的包是真实公开包，且与 data/packages/ 对得上", () => {
  for (const c of CASES) {
    const text = readFileSync(join(FIXTURES, c.dir, "INPUT.md"), "utf8");
    // 抓所有 `<name>@<version>` 形式
    for (const m of text.matchAll(/`([@a-z0-9._/-]+)@(\d+\.\d+\.\d+)`/g)) {
      const [, name, version] = m;
      if (name.startsWith("plan/") || name.startsWith("data/") || name.startsWith("src/")) continue;
      if (!KNOWN_PACKAGES.has(name)) continue; // 只校验五包对照组
      const rec = JSON.parse(readFileSync(join(ROOT, "data", "packages", `${name}.json`), "utf8"));
      assert.equal(rec.version, version, `fixtures/${c.dir} 引用了 ${name}@${version}，但入仓指纹是 ${rec.version}`);
    }
  }
});

test("C3 的证伪三向声明齐备（同代码不同包对照组的可执行形态）", () => {
  const parsed = JSON.parse(readFileSync(join(FIXTURES, "esm-cjs-mismatch", "expected.json"), "utf8"));
  assert.ok(parsed.falsification, "C3 必须声明 falsification");
  for (const key of ["againstTypeFieldOnly", "againstHasRequireBranchOnly", "againstAlwaysResolved"]) {
    assert.ok(parsed.falsification[key], `C3 falsification 缺 ${key}`);
  }
  // chalk 判红、commander 判绿，两者 hasRequireBranch 相同 → 这是本 case 的核心形状
  const chalk = parsed.points.find((p) => p.specifier === "chalk");
  const cmd = parsed.points.find((p) => p.specifier === "commander");
  assert.equal(chalk.status, "ESM-CJS-MISMATCH");
  assert.equal(cmd.status, "RESOLVED");
  assert.equal(chalk.evidence.hasRequireBranch, cmd.evidence.hasRequireBranch);
  assert.equal(chalk.evidence.hasRequireBranch, false, "两者都应无 require 分支，判定才靠符号所在层区分");
});

test("C7 的零误报断言含自证条件 totalPoints > 0（防空跑假绿）", () => {
  const parsed = JSON.parse(readFileSync(join(FIXTURES, "clean-project", "expected.json"), "utf8"));
  assert.equal(parsed.expect.summary.problems, 0);
  assert.ok(parsed.expect.summary.minTotalPoints > 0, "C7 必须声明 minTotalPoints > 0，否则 0 问题可能是空跑");
});