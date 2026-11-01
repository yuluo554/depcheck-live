#!/usr/bin/env node
// ═══ 布局门（方法论装订第②件） ═══
// 来源：ai-tool-project-sprint references/templates/check-sprint-layout.mjs（判据集不改，
//   只按本项目配置收敛：Node/ESM、中文计划文件名、README 不承载状态、M0 不豁免交接单）。
// 判据一律落**仓库内文件**，不读 git 元数据（浅克隆下 tag / 历史深度会翻转，既有条「判据自身
// 的环境敏感性」④）。
// 运行：node tools/check-sprint-layout.mjs
// 退出码：0 全绿 / 1 有 FAIL / 2 用法错误。
//
// ⚠️ 改本文件时必须同步重跑 `node tools/mutate-gates.mjs`——判据有几条，变异就覆盖几条。
//    本门当前判据：FILES / BINDING_HEAD / SECTIONS / STATUS / HANDOFFS / GAPS / LEDGER /
//    RELEASE / DOC_TOOLS / TESTS（共 10 条，MUTATIONS 表逐条钉住）。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok, detail });
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : null);

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-sprint-layout: unknown argument ${arg}\n`);
  process.exit(2);
}

/** 非空跑自证：这轮扫到了几个（门要自己报数，否则"0 命中"与"扫了 0 个"同形）。 */
const scanned = { docs: 0, handoffs: 0, copies: 0, docTools: 0, tests: 0 };

const REQUIRED_FILES = [
  "AGENTS.md",
  "README.md",
  "package.json",
  "data/README.md",
  "plan/00-README总览.md",
  "plan/01-题目文档.md",
  "plan/02-架构与技术选型.md",
  "plan/03-模块详设.md",
  "plan/04-数据计划.md",
  "plan/05-里程碑与发布.md",
  "plan/06-交付对标与决策.md",
];

/**
 * 装订行判据：三锚点**必须同现于一行**（方法论名 + 布局门命令 + 装订日期）。
 * 用前瞻（顺序无关），不写死顺序——写死顺序会把"日期在命令之前"的合法写法判成缺（假门族 ④）；
 * 也不写成 `A | B` 的**或**关系（假门族 ③：残句也能判绿）。
 */
const BINDING_LINE = /^>(?=.*ai-tool-project-sprint)(?=.*check-sprint-layout)(?=.*20\d{2}-\d{2}-\d{2}).*$/m;

/** 节判据锚**标题行**而非自由文本（关键词 in text 会让缺节变异恒绿）。 */
const REQUIRED_SECTIONS = {
  "plan/00-README总览.md": ["文档索引", "决策记录", "承诺-证据台账", "里程碑"],
  "plan/01-题目文档.md": ["任务要求", "评分标准", "边界与非目标"],
  "plan/02-架构与技术选型.md": ["分层", "构建"],
  "plan/03-模块详设.md": ["模块", "判定态"],
  "plan/04-数据计划.md": ["数据清单", "真值纪律", "数值口径"],
  "plan/05-里程碑与发布.md": ["DoD", "已知未验证项"],
  "plan/06-交付对标与决策.md": ["评分对标", "风险登记", "缺口"],
  "data/README.md": ["依据查证记录", "数值口径"],
};

/** HANDOFF 七节（SKILL.md 硬约束①）。断言"必需节都在"，不断言"节数恰好 7"（超集合法）。 */
const HANDOFF_SECTIONS = ["当前进度", "当前事实", "下一棒待办", "既定口径", "环境坑", "DoD", "命令速查"];

/** 已声明的豁免与冻结规则——门必须复用项目自己的声明，别另立更严的一套。
 *  M0 **不豁免**（AGENTS.md §二 第 2 条：让 HANDOFF 判据从第一天起就有活靶子）。 */
const EXEMPT_MILESTONES = [];
const HANDOFF_FORMAT_FROM = 0;
/** 末棒要不要交接单：false = 要（写"收官交接单"）。 */
const HANDOFF_EXEMPT_LAST = false;

/**
 * 状态副本 = **2 张表**；`plan/00` 的承诺-证据台账由 LAYOUT.LEDGER 单独判 → 合计 3 处。
 * README.md **刻意不参与**（随包读者没有 plan/，让 README 判"发布到哪一步"必然滞后一步；
 * AGENTS.md §二 已写明这一决定）——此时 README 必须不在本表里，否则"配置 3 处实判 2 处"。
 */
const STATUS_COPIES = [
  { file: "plan/00-README总览.md", kind: "里程碑表" },
  { file: "plan/05-里程碑与发布.md", kind: "状态表" },
];

/** 只认"状态行"：表格行且**首格**就是里程碑号（不扫自由文本——张冠李戴的假红，假门族 ⑤）。 */
const STATUS_LINE = /^\|\s*\*{0,2}M(\d+)\b/;
const PENDING_MARKERS = ["⬜", "🟡", "未开始", "未执行", "待执行", "待确认"];

/** 发布里程碑固定 M6：它没 ✅ 时 LAYOUT.RELEASE 报 PASS 并写明"尚不适用"。 */
const RELEASE_MILESTONE = 6;

/**
 * 文档点名但**还没到**该里程碑的脚本。里程碑翻 ✅ 后必须删除本条，否则 stale 分支变红。
 * 第三个状态：不是 EXEMPT（不打算做）、也不是缺件（真缺陷）。
 */
const PENDING_TOOLS = {
  "tools/check-release.mjs": 6,
};
/** 确实不打算实现时逐条登记 + 写理由（本项目当前为空）。 */
const EXEMPT_TOOLS = new Set([]);

function checkRequiredFiles() {
  const missing = REQUIRED_FILES.filter((rel) => !existsSync(join(ROOT, rel)));
  scanned.docs = REQUIRED_FILES.length - missing.length;
  add("LAYOUT.FILES", missing.length === 0, missing.length ? `缺: ${missing.join(",")}` : `${scanned.docs} 份齐备`);
}

function checkBindingHead() {
  const text = read("plan/00-README总览.md") ?? "";
  const ok = BINDING_LINE.test(text);
  add(
    "LAYOUT.BINDING_HEAD",
    ok,
    ok ? "plan/00 顶部有装订行（三锚点齐）" : "plan/00 顶部缺装订行（需同现：方法论名 + 布局门命令 + 装订日期）",
  );
}

function checkSections() {
  const bad = [];
  let files = 0;
  for (const [rel, needles] of Object.entries(REQUIRED_SECTIONS)) {
    const text = read(rel);
    if (text === null) continue;
    files += 1;
    const missing = needles.filter((n) => !headingPresent(text, n));
    if (missing.length) bad.push(`${rel}: 缺节 ${missing.join("/")}`);
  }
  add("LAYOUT.SECTIONS", bad.length === 0 && files > 0, bad.length ? bad.join("；") : `${files} 份小节齐备`);
}

/** 节判据 = 标题行里含该关键词（`#`/`##`/`###` 起头），不是全文包含。 */
function headingPresent(text, needle) {
  return text.split("\n").some((line) => /^#{1,4}\s/.test(line) && line.includes(needle));
}

/**
 * 逐副本采集：`Map<k, Set<"done"|"pending">>`。**真值不取自任何一个副本**——
 * 以某一份为真值源时，在它里面翻状态会让里程碑直接掉出待检集合（自我参照 → 恒真，假门族 ①）。
 * `rowsByCopy` 让"配置了几处"与"真正读到几行"可分（假门族 ⑪）。
 */
function collectStates() {
  const states = new Map();
  const rowsByCopy = new Map();
  const note = (k, state) => {
    if (!states.has(k)) states.set(k, new Set());
    states.get(k).add(state);
  };
  for (const copy of STATUS_COPIES) {
    const text = read(copy.file);
    if (text === null) continue;
    scanned.copies += 1;
    let rows = 0;
    for (const line of text.split("\n")) {
      const m = STATUS_LINE.exec(line);
      if (!m) continue;
      rows += 1;
      const pending = PENDING_MARKERS.some((mark) => line.includes(mark));
      note(Number(m[1]), pending ? "pending" : "done");
    }
    rowsByCopy.set(copy.file, rows);
  }
  return { states, rowsByCopy };
}

function checkStatusAgreement({ states, rowsByCopy }) {
  const conflicts = [];
  for (const [k, set] of [...states.entries()].sort((a, b) => a[0] - b[0])) {
    if (set.size > 1) conflicts.push(`M${k} 在副本间状态不一致（${[...set].join(" vs ")}）`);
  }
  const total = [...rowsByCopy.values()].reduce((a, b) => a + b, 0);
  const perCopy = [...rowsByCopy.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, rows]) => `${file.split("/").pop()}:${rows}`)
    .join(" ");
  if (conflicts.length === 0 && total === 0) {
    add("LAYOUT.STATUS", false, `所有副本合计 0 行状态行（判据空跑）：${perCopy}`);
    return;
  }
  add(
    "LAYOUT.STATUS",
    conflicts.length === 0,
    conflicts.length
      ? conflicts.join("；")
      : `${scanned.copies} 处副本 × ${states.size} 个里程碑 状态全一致（行数 ${perCopy}）`,
  );
}

function checkHandoffs(done, allMilestones) {
  const last = Math.max(0, ...allMilestones);
  const missing = [];
  for (const k of done) {
    if (EXEMPT_MILESTONES.includes(k)) continue;
    if (HANDOFF_EXEMPT_LAST && k === last) continue;
    const rel = `plan/HANDOFF-M${k}.md`;
    const text = read(rel);
    if (text === null) {
      missing.push(`${rel}(缺${k === last ? "：末棒要么写收官交接单，要么置 HANDOFF_EXEMPT_LAST 并在 AGENTS.md 说明" : ""})`);
      continue;
    }
    scanned.handoffs += 1;
    if (k < HANDOFF_FORMAT_FROM) continue;
    const lack = HANDOFF_SECTIONS.filter((n) => !text.includes(n));
    if (lack.length) missing.push(`${rel}(缺节: ${lack.join("/")})`);
  }
  const tail = `M0 未豁免${HANDOFF_EXEMPT_LAST ? "；末棒已豁免" : ""}`;
  add(
    "LAYOUT.HANDOFFS",
    missing.length === 0,
    missing.length ? missing.join("；") : `${scanned.handoffs} 份交接单齐（${tail}；已扫 ${done.length} 个 ✅ 里程碑）`,
  );
}

/**
 * `plan/06` 的「缺口」列是状态的隐蔽副本。按**表头定位列号再取单元格**（不是"行里含『缺口』"，
 * 假门族 ②）。扫描面 = 表头 → 首条非 `|` 行即止（假门族 ⑦），行数进结论（假门族 ⑩）。
 * 匹配前剥掉行内代码与文件名（假门族 ⑥⑧：关闭缺口时天然要指路"证据在哪份文件"）。
 *
 * **列号必须按表头名找，不能取"最后一个有效列"**（本仓实测，2026-11-01）：首版抄了模板的
 * `col = cells.length - 2`，那是**状态列**而非缺口列——于是"往缺口格写已完成的 M0"这条变异
 * 改的根本不是判据读的那一格，门照绿（选择器太松，假门族 ㉓ 的同族）。按表头名定位后，
 * 判据读的与变异改的是同一格。
 */
function checkStaleGaps(done) {
  const lines = (read("plan/06-交付对标与决策.md") ?? "").split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("缺口"));
  if (headerIdx < 0) {
    add("LAYOUT.GAPS", false, "plan/06 找不到含『缺口』表头的表（判据表搬走了？）");
    return;
  }
  const headerCells = lines[headerIdx].split("|");
  const col = headerCells.findIndex((c) => c.includes("缺口"));
  if (col < 0) {
    add("LAYOUT.GAPS", false, "plan/06 缺口表的表头里找不到『缺口』这一列");
    return;
  }
  const stale = [];
  let scannedRows = 0;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) break;
    scannedRows++;
    const cells = lines[i].split("|");
    const cell = (cells[col] ?? "")
      .replace(/`[^`]*`/g, " ")
      .replace(/[\w./-]+\.(?:md|py|mjs|js|json|toml|txt|zip|gz|whl)/g, " ");
    for (const k of done) {
      if (new RegExp(`(^|[^0-9A-Za-z])M${k}([^0-9]|$)`).test(cell)) {
        stale.push(`plan/06 缺口列仍提 M${k}: ${cell.trim()}`);
      }
    }
  }
  add("LAYOUT.GAPS", stale.length === 0, stale.length ? stale.join("；") : `plan/06 缺口列扫了 ${scannedRows} 行，无已 ✅ 里程碑`);
}

/** 承诺-证据台账 = 状态的第三处副本，它的表头不含「里程碑」→ 单独一条判据（假门族 ⑨）。 */
function checkLedger(done) {
  const lines = (read("plan/00-README总览.md") ?? "").split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("承诺") && l.includes("状态"));
  if (headerIdx < 0) {
    add("LAYOUT.LEDGER", false, "plan/00 找不到『承诺-证据台账』表头（承诺项与状态列）");
    return;
  }
  scanned.copies += 1;
  const bad = [];
  let rows = 0;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) break;
    rows++;
    const cells = lines[i].split("|").map((c) => c.trim());
    const status = cells[cells.length - 2] ?? "";
    if (!/[⬜🟡]|未开始|待 M\d|待开工/.test(status)) continue;
    for (const k of done) {
      if (new RegExp(`(^|[^0-9A-Za-z])M${k}([^0-9]|$)`, "i").test(status)) {
        bad.push(`台账行仍挂未完成: ${status.slice(0, 60)}`);
      }
    }
  }
  add(
    "LAYOUT.LEDGER",
    bad.length === 0 && rows > 0,
    rows === 0 ? "台账表 0 行——判据空跑" : bad.length ? bad.join("；") : `台账 ${rows} 行，已成 ✅ 的里程碑无未完成标记`,
  );
}

function checkReleaseDoc(done, allMilestones) {
  const target = RELEASE_MILESTONE || Math.max(0, ...allMilestones);
  if (target === 0 || !done.includes(target)) {
    add("LAYOUT.RELEASE", true, `发布里程碑 M${target} 未完成，收尾记录尚不适用（已扫 ${done.length} 个 ✅ 里程碑）`);
    return;
  }
  const release = read(`plan/RELEASE-M${target}.md`);
  const wrapup = read(`plan/WRAPUP-M${target}.md`);
  if (!release && !wrapup) {
    add("LAYOUT.RELEASE", false, `缺 plan/RELEASE-M${target}.md 或 plan/WRAPUP-M${target}.md`);
    return;
  }
  if (release) {
    const cols = /^##\s*一、tag 前事实/m.test(release) && /^##\s*二、tag 后追加/m.test(release);
    const heading = /^#{2,3}.*覆盖对账/m.test(release);
    const rows = (release.match(/^\|.*(实现|不适用|待首推).*\|$/gm) ?? []).length;
    add("LAYOUT.RELEASE", cols && heading && rows >= 3, `两栏:${cols} 覆盖对账小节:${heading} 三态行数:${rows}`);
    return;
  }
  add("LAYOUT.RELEASE", true, "WRAPUP 形态");
}

/**
 * 文档点名的工具必须有实物（既有实测：`tools/check-release.mjs` 被四份文档引用却从未实现，
 * **没有任何东西变红**）。判据只认路径形态，不读文档语义；路径必须**从仓库根起算**
 * （负向后顾，假门族 ㉕：`tests/tools/x.test.mjs` 的裸子串会被误当根上的脚本）。
 */
function checkDocumentedToolsExist(doneMilestones) {
  const docs = [
    "AGENTS.md",
    ...(existsSync(join(ROOT, "plan")) ? readdirSync(join(ROOT, "plan")).filter((f) => f.endsWith(".md")).map((f) => `plan/${f}`) : []),
  ];
  const referenced = new Set();
  for (const rel of docs) {
    const text = read(rel);
    if (text === null) continue;
    for (const m of text.matchAll(/(?<![\w./-])tools\/[\w.-]+\.(?:mjs|js|cjs|py|sh|ps1)/g)) referenced.add(m[0]);
  }
  if (referenced.size === 0) {
    add("LAYOUT.DOC_TOOLS", false, `扫了 ${docs.length} 份文档，0 处 tools/ 引用——判据是空的（阳性对照失败）`);
    return;
  }
  scanned.docTools = referenced.size;
  const missing = [];
  const deferred = [];
  const stale = [];
  for (const rel of [...referenced].sort()) {
    if (existsSync(join(ROOT, rel)) || EXEMPT_TOOLS.has(rel)) continue;
    const milestone = PENDING_TOOLS[rel];
    if (milestone === undefined) missing.push(rel);
    else if (doneMilestones.includes(milestone)) stale.push(`${rel}（M${milestone} 已 ✅，登记项必须清理）`);
    else deferred.push(`${rel}(M${milestone})`);
  }
  const problems = [...missing, ...stale];
  let detail = `${referenced.size} 个文档点名的 tools/ 脚本`;
  if (problems.length) detail += `；问题: ${problems.join(",")}`;
  else if (deferred.length) detail += `；${deferred.length} 个待里程碑落位: ${deferred.join(",")}`;
  else detail += ` 全部在位`;
  add("LAYOUT.DOC_TOOLS", problems.length === 0, detail);
}

/**
 * 测试登记对账（本项目自增判据，纯 JS 项目实测：`node --test <目录>` 在部分版本行为不同，
 * 于是测试**逐文件列出**。逐文件列出的代价 = 新增一个测试文件可能只登记了一处 → 静默漏跑）。
 *
 * 判据三条，任一不成立即 FAIL：
 *   ① `tests/` 下每个 `*.test.mjs` 都出现在 `package.json` 的 `scripts.test` 里；
 *   ② 同上，出现在 `.github/workflows/ci.yml` 里；
 *   ③ 反向：两处里列出的每个文件名都真实存在（防止改名后旧登记项留着当"已覆盖"）。
 * 只认 `tests/<name>.test.mjs` 形态，不认目录/glob 形态——glob 正是这条判据要防的东西。
 */
function checkTestRegistry() {
  const dir = join(ROOT, "tests");
  const onDisk = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".test.mjs")).sort()
    : [];
  scanned.tests = onDisk.length;
  if (onDisk.length === 0) {
    add("LAYOUT.TESTS", false, "tests/*.test.mjs 0 个——判据空跑（阳性对照失败）");
    return;
  }
  const pkg = read("package.json");
  const ci = read(".github/workflows/ci.yml");
  if (pkg === null) return add("LAYOUT.TESTS", false, "缺 package.json（无法对账测试登记）");
  if (ci === null) return add("LAYOUT.TESTS", false, "缺 .github/workflows/ci.yml（无法对账测试登记）");

  let testScript = "";
  try {
    testScript = String(JSON.parse(pkg).scripts?.test ?? "");
  } catch (error) {
    return add("LAYOUT.TESTS", false, `package.json 不可解析: ${error.message}`);
  }
  const listedIn = (text) => new Set([...text.matchAll(/tests\/([\w.-]+\.test\.mjs)/g)].map((m) => m[1]));
  const inPkg = listedIn(testScript);
  const inCi = listedIn(ci);

  const problems = [];
  for (const f of onDisk) {
    if (!inPkg.has(f)) problems.push(`tests/${f} 未登记在 package.json scripts.test`);
    if (!inCi.has(f)) problems.push(`tests/${f} 未登记在 CI workflow`);
  }
  for (const f of inPkg) if (!onDisk.includes(f)) problems.push(`package.json 登记了不存在的 tests/${f}`);
  for (const f of inCi) if (!onDisk.includes(f)) problems.push(`CI 登记了不存在的 tests/${f}`);
  if (/node\s+--test\s+(?!.*tests\/)/.test(testScript) && !/tests\//.test(testScript)) {
    problems.push("package.json 的 test 脚本疑似用了目录/glob 形态（本项目一律逐文件列出）");
  }
  add(
    "LAYOUT.TESTS",
    problems.length === 0,
    problems.length
      ? problems.join("；")
      : `tests 目录 ${onDisk.length} 个文件 × 两处登记（package.json ${inPkg.size} / CI ${inCi.size}）一致`,
  );
}

function main() {
  for (const run of [checkRequiredFiles, checkBindingHead, checkSections]) {
    try {
      run();
    } catch (error) {
      add(run.name, false, error.message);
    }
  }

  let states = new Map();
  let rowsByCopy = new Map();
  try {
    ({ states, rowsByCopy } = collectStates());
  } catch (error) {
    add("LAYOUT.STATUS", false, `采集状态副本异常: ${error.message}`);
  }
  const done = [...states.entries()].filter(([, set]) => set.has("done")).map(([k]) => k);
  const allMilestones = [...states.keys()];

  for (const run of [
    () => checkDocumentedToolsExist(done),
    () => checkTestRegistry(),
    () => checkStatusAgreement({ states, rowsByCopy }),
    () => checkHandoffs(done, allMilestones),
    () => checkStaleGaps(done),
    () => checkLedger(done),
    () => checkReleaseDoc(done, allMilestones),
  ]) {
    try {
      run();
    } catch (error) {
      add(run.name, false, error.message);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  process.stdout.write("布局门（方法论装订） · 判据只落仓库内文件\n");
  process.stdout.write("=".repeat(64) + "\n");
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.id}  ${c.detail}\n`);
  process.stdout.write("=".repeat(64) + "\n");
  process.stdout.write(
    `这轮扫到：文档 ${scanned.docs} / 交接单 ${scanned.handoffs} / 状态副本 ${scanned.copies} / ` +
      `文档点名工具 ${scanned.docTools} / 测试文件 ${scanned.tests}\n`,
  );
  process.stdout.write(`结论: ${failed.length === 0 ? "全绿" : `${failed.length} 项 FAIL`}\n`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();