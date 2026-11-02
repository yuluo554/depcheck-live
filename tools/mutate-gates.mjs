#!/usr/bin/env node
// ═══ 变异验证宿主 ═══
// 为什么需要它：门绿 ≠ 门在验东西。本脚本把仓库**复制**到临时目录，在副本里逐条"改坏一瓶"，
// 断言门会红，然后丢弃副本（工作树一个字节都不动）。
//
// 运行：node tools/mutate-gates.mjs [--only M3,M9]
// 退出码：0 全部符合预期 / 1 有组不符 / 2 用法错误。
//
// ── 三条硬纪律（每条都来自实测假门，别删）────────────────────────────────
// ① **每组先跑未变异的基线**：基线非绿 → 该组记 `error`（不是 PASS 也不是 FAIL，但计入失败数
//    并打印原因）。否则"命令根本没跑起来"会被当成"变异被抓住"（假门族 ㉔）。
// ② **三态分开计**：CAUGHT（预期红且真红）/ MISSED（预期红却绿）/ SKIP（靶子找不到）。
//    只有 CAUGHT 算通过，SKIP 也计入失败——靶子消失不许静默变绿（假门族 ㉑）。
// ③ **每组自证"字节真的变了"**：替换前断言 marker 存在、替换后断言内容已变
//    （替换退化成 no-op 时变异会静默变绿）。
//
// 变异靶子一律锚**既有事实**（不锚"某个里程碑还没完成"），所以永不随进度过期。

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 复制仓库到临时目录做变异，工作树不动。排除体积大/与本判据无关的目录。 */
const SKIP = new Set([".git", "node_modules", ".mimosa", "dist", "tmp", ".tmp", "_private"]);

function copyRepo(dest) {
  cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(ROOT.length + 1).split("\\").join("/");
      if (!rel) return true;
      const head = rel.split("/")[0];
      return !SKIP.has(head);
    },
  });
}

function runGate(cwd, gate) {
  const [cmd, ...args] = gate;
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** 在副本里做一次"唯一替换"，并自证 marker 存在 + 字节已变。 */
function mutateFile(cwd, rel, from, to) {
  const path = join(cwd, rel);
  if (!existsSync(path)) return { ok: false, why: `${rel} 不存在` };
  const before = readFileSync(path, "utf8");
  if (!before.includes(from)) return { ok: false, why: `${rel} 里找不到 marker: ${from.slice(0, 60)}` };
  const after = before.replace(from, to);
  if (after === before) return { ok: false, why: `${rel} 替换后字节未变（no-op）` };
  writeFileSync(path, after);
  return { ok: true };
}

const LAYOUT = ["node", "tools/check-sprint-layout.mjs"];

/** 造一份"七节齐"的交接单正文——变异靶子要能过七节判据，才能让半边②单独变红。 */
function handoffBody(k, why) {
  return (
    `# HANDOFF-M${k}\n\n## 一、当前进度 + 证据\n\n（${why}）\n\n` +
    "## 二、当前事实 · 状态不变量\n## 三、下一棒待办\n## 四、既定口径清单\n" +
    "## 五、本机环境坑\n## 六、DoD 逐项 checklist\n## 七、关键命令速查\n"
  );
}
const DESENS = ["node", "tools/check-desensitized.mjs"];
const RELEASE = ["node", "tools/check-release.mjs"];
const PLAN00 = "plan/00-README总览.md";
const PLAN05 = "plan/05-里程碑与发布.md";
const PLAN06 = "plan/06-交付对标与决策.md";
const RELEASE_DOC = "plan/RELEASE-M6.md";

/**
 * 变异组。`expect` = "red" 或 "green"（阴性对照）。
 * 靶子全部锚"仓库里有这么一件东西"，不锚"某个里程碑还没完成"。
 */
const GROUPS = [
  // ── 布局门：每条判据至少一组 ──────────────────────────────────────────
  {
    id: "L1",
    gate: LAYOUT,
    judge: "LAYOUT.FILES",
    name: "删 AGENTS.md",
    apply: (cwd) => rmSync(join(cwd, "AGENTS.md")),
  },
  {
    id: "L2",
    gate: LAYOUT,
    judge: "LAYOUT.BINDING_HEAD",
    name: "删掉 plan/00 顶部整行装订行",
    apply: (cwd) => {
      const p = join(cwd, PLAN00);
      const text = readFileSync(p, "utf8");
      const line = text.split("\n").find((l) => /^>.*ai-tool-project-sprint.*check-sprint-layout/.test(l));
      if (!line) return { ok: false, why: "找不到装订行" };
      writeFileSync(p, text.split("\n").filter((l) => l !== line).join("\n"));
      return { ok: true };
    },
  },
  {
    id: "L3",
    gate: LAYOUT,
    judge: "LAYOUT.SECTIONS",
    name: "plan/03 的『判定态』节标题改词",
    apply: (cwd) => mutateFile(cwd, "plan/03-模块详设.md", "判定态", "判断态"),
  },
  {
    id: "L4",
    gate: LAYOUT,
    judge: "LAYOUT.STATUS",
    name: "只在一个副本里把 M0 翻成 ⬜（跨副本不一致）",
    // 靶子 = plan/05 里**首格是 M0 的那一行**上的 ✅（与门同口径：首格必须是里程碑号）。
    apply: (cwd) => {
      const p = join(cwd, PLAN05);
      const lines = readFileSync(p, "utf8").split("\n");
      const idx = lines.findIndex((l) => /^\|\s*\*{0,2}M0\b/.test(l) && l.includes("✅"));
      if (idx < 0) return { ok: false, why: "plan/05 里没有首格为 M0 且含 ✅ 的状态行" };
      const next = [...lines];
      next[idx] = lines[idx].replace("✅", "⬜");
      if (next[idx] === lines[idx]) return { ok: false, why: "替换后字节未变（no-op）" };
      writeFileSync(p, next.join("\n"));
      return { ok: true };
    },
  },
  {
    id: "L5",
    gate: LAYOUT,
    judge: "LAYOUT.HANDOFFS",
    name: "删 plan/HANDOFF-M0.md",
    apply: (cwd) => rmSync(join(cwd, "plan/HANDOFF-M0.md")),
  },
  {
id: "H1",
    gate: LAYOUT,
    judge: "LAYOUT.HANDOFFS",
    name: "删『当前在做那个里程碑』的入口（半边①：欠账必须红）",
    // 这条钉住本仓真实撞过的缺陷：旧实现 `for (const k of done)` 只枚举已 ✅，
    // 于是"当前里程碑的入口没写"时门照旧全绿（实测报"2 份交接单齐"），
    // 下一棒打开仓库找不到入口。靶子必须是**当前**里程碑（最小的 ⬜），删已 ✅ 的由 L5 管。
    //
    // ⚠️ **M6 实测修正**：原靶子直接取"状态表里最小号的 ⬜"，末棒 M6 翻 ✅ 后 `pending` 为空
    //    → 本组 SKIP（宿主纪律②：SKIP 也算不符合预期）。这与 H2/L8 是**同一族**：
    //    靶子锚了"总有未完成里程碑"这个进度状态。
    //
    // 正解与 H2 一致——**靶子自己造出需要的前置状态**：把状态表里最小那行的 ✅ 翻成 ⬜，
    // 于是那个里程碑变成"当前在做的"，再删它的入口。这正是半边①要防的真实场景
    // （"这一棒还在做，但入口没写"）。全 ✅ 仓库与"还剩几个 ⬜"两种形态下都成立。
    // 顺带说明：翻 ⬜ 会让 LAYOUT.STATUS/LEDGER 也可能红，但那不是本组判据——
    // 本组只认 `judge` 那一条，另两条红不影响 CAUGHT 判定（门已经红了，正是我们要的）。
    apply: (cwd) => {
      const rel05 = "plan/05-里程碑与发布.md";
      const text = readFileSync(join(cwd, rel05), "utf8");
      const lines = text.split("\n");
      const pending = [];
      for (const line of lines) {
        const m = /^\|\s*\*{0,2}M(\d+)\b/.exec(line);
        if (m && /[⬜🟡]/.test(line)) pending.push(Number(m[1]));
      }

      let current;
      if (pending.length > 0) {
        current = Math.min(...pending);
      } else {
        // 全部 ✅：把**最小那个里程碑**翻回 ⬜，人为造出"当前里程碑"。
        // 两个副本都要改（否则跨副本不一致 —— 那会另起一条红，本组判据被淹没）。
        const lowest = lines
          .map((line) => /^\|\s*\*{0,2}M(\d+)\b/.exec(line))
          .filter(Boolean)
          .map((m) => Number(m[1]))
          .sort((a, b) => a - b)[0];
        if (lowest === undefined) return { ok: false, why: "状态表里找不到任何里程碑行（基线就不对）" };
        current = lowest;
        for (const rel of [rel05, "plan/00-README总览.md"]) {
          const abs = join(cwd, rel);
          if (!existsSync(abs)) return { ok: false, why: `${rel} 不存在` };
          const src = readFileSync(abs, "utf8").split("\n");
          const idx = src.findIndex((l) => new RegExp(`^\\|\\s*\\*{0,2}M${lowest}\\b`).test(l) && l.includes("✅"));
          if (idx < 0) return { ok: false, why: `${rel} 里找不到首格为 M${lowest} 且含 ✅ 的状态行` };
          const patched = src[idx].replace("✅ 已完成", "⬜ 待 M" + lowest).replace("✅", "⬜");
          if (patched === src[idx]) return { ok: false, why: `${rel} 的 M${lowest} 行替换后字节未变（no-op）` };
          const next = [...src];
          next[idx] = patched;
          writeFileSync(abs, next.join("\n"));
        }
      }

      const rel = `plan/HANDOFF-M${current}.md`;
      const abs = join(cwd, rel);
      if (!existsSync(abs)) return { ok: false, why: `${rel} 不存在（基线就没有入口？）` };
      rmSync(abs);
      return { ok: true };
    },
  },
  {
    id: "H2",
    gate: LAYOUT,
    judge: "LAYOUT.HANDOFFS",
    name: "给还没开工的里程碑预写入口（半边②：超前入口必须红）",
    // 半边②若从不被断言，"给没跑的棒预写当前进度+证据"整族会静默放行。
    //
    // ⚠️ **M5 实测修正**：首版靶子 = "当前里程碑之后的那个 ⬜"（`pending.length >= 2` 才成立）。
    //    那是**锚进度状态**——M5 收尾后只剩 M6 一个 ⬜，`pending.length = 1`，本组直接 SKIP，
    //    宿主报"1 组不符预期"。而本文件头部纪律明写"变异靶子一律锚**既有事实**，永不随进度过期"，
    //    这条靶子恰恰违反了它。
    //
    // 正解：门的半边②本来就有**两条独立判据**，用不随进度变化的那条做靶子——
    //   ① 表内里程碑：⬜ 且非 current 的不许有入口（进度相关，只在 ⬜ ≥ 2 时可用）；
    //   ② **野编号**：`HANDOFF-M<k>.md` 里 k 不在这 7 个里程碑里 → 也算超前入口。
    //      这条与进度无关，任何时刻都有靶子。
    // 优先级：有 ⬜ ≥ 2 时用 ①（更贴近真实误用场景）；否则退到 ②（永远成立）。
    apply: (cwd) => {
      const text = readFileSync(join(cwd, "plan/05-里程碑与发布.md"), "utf8");
      const all = [];
      const pending = [];
      for (const line of text.split("\n")) {
        const m = /^\|\s*\*{0,2}M(\d+)\b/.exec(line);
        if (!m) continue;
        all.push(Number(m[1]));
        if (/[⬜🟡]/.test(line)) pending.push(Number(m[1]));
      }

      if (pending.length >= 2) {
        // 判据①：造一个"表内但未开工、且不是当前"的里程碑入口
        const future = Math.min(...pending.filter((k) => k !== Math.min(...pending)));
        const rel = join(cwd, "plan", `HANDOFF-M${future}.md`);
        if (existsSync(rel)) return { ok: false, why: `plan/HANDOFF-M${future}.md 已存在（基线就有超前入口？）` };
        writeFileSync(rel, handoffBody(future, "这条是变异靶子：给还没开工的里程碑预写入口"));
        return { ok: true };
      }

      // 判据②：野编号（不在里程碑表里的 k）。与进度无关，任何时刻都成立。
      const wild = Math.max(0, ...all) + 1;
      const rel = join(cwd, "plan", `HANDOFF-M${wild}.md`);
      if (existsSync(rel)) return { ok: false, why: `plan/HANDOFF-M${wild}.md 已存在（基线就有野编号入口？）` };
      writeFileSync(rel, handoffBody(wild, `这条是变异靶子：M${wild} 不在这 7 个里程碑里（野编号）`));
      return { ok: true };
    },
  },
  {
    id: "L6",
    gate: LAYOUT,
    judge: "LAYOUT.GAPS",
    name: "把已 ✅ 的 M0 写进 plan/06 的『缺口』列（按表头定位那一格）",
    // 靶子必须落在判据读的**那一格**上：按表头找「缺口」列的序号再改该格，
    // 不靠"行里含某词"（选择器太松 = 假门族 ㉓）。
    apply: (cwd) => {
      const p = join(cwd, PLAN06);
      const lines = readFileSync(p, "utf8").split("\n");
      const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("缺口"));
      if (headerIdx < 0) return { ok: false, why: "plan/06 找不到缺口表头" };
      const col = lines[headerIdx].split("|").findIndex((c) => c.includes("缺口"));
      if (col < 0) return { ok: false, why: "缺口表头里找不到『缺口』列" };
      for (let i = headerIdx + 2; i < lines.length; i++) {
        if (!lines[i].startsWith("|")) break;
        const cells = lines[i].split("|");
        if (cells.length <= col) continue;
        const before = lines[i];
        cells[col] = ` M0 收尾未验证 `;
        const after = cells.join("|");
        if (after === before) continue;
        const next = [...lines];
        next[i] = after;
        writeFileSync(p, next.join("\n"));
        return { ok: true };
      }
      return { ok: false, why: "缺口表没有可改的数据行" };
    },
  },
  {
    id: "L7",
    gate: LAYOUT,
    judge: "LAYOUT.LEDGER",
    name: "台账里已 ✅ 的那行改成 `⬜ 待 M0`（改的是**状态格**）",
    // 首版替换 `| ✅ |` → `| ⬜ 待 M0 |` 命中了台账的「可达性」列（那里也是 ✅！）
    // → 状态格没变、门照绿（选择器太松）。正解 = 取**最后一格**（状态列）来改。
    apply: (cwd) => {
      const p = join(cwd, PLAN00);
      const lines = readFileSync(p, "utf8").split("\n");
      const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("承诺") && l.includes("状态"));
      if (headerIdx < 0) return { ok: false, why: "plan/00 找不到台账表头" };
      for (let i = headerIdx + 2; i < lines.length; i++) {
        if (!lines[i].startsWith("|")) break;
        const cells = lines[i].split("|");
        const statusIdx = cells.length - 2;
        if (!String(cells[statusIdx] ?? "").includes("✅")) continue;
        const before = lines[i];
        cells[statusIdx] = " ⬜ 待 M0 ";
        const after = cells.join("|");
        if (after === before) continue;
        const next = [...lines];
        next[i] = after;
        writeFileSync(p, next.join("\n"));
        return { ok: true };
      }
      return { ok: false, why: "台账里没有状态格含 ✅ 的行" };
    },
  },
  {
    id: "L8",
    gate: LAYOUT,
    judge: "LAYOUT.DOC_TOOLS",
    name: "登记一条『文档点名、里程碑已 ✅、但没落位』的脚本（登记项必须自清理）",
    // ⚠️ M6 实测改写：原靶子是 `"tools/check-release.mjs": 6` → `: 0`，而 M6 收尾已经把
    // 那条登记**清掉了**（发布门真落位，不清就是真缺陷）。靶子若继续指那条，会因
    // "marker 找不到" 报 SKIP —— 那正是本文件头部纪律②说的"靶子消失不许静默变绿"。
    //
    // 正解：靶子**自己造一件完整的事**——往 PENDING_TOOLS 注入一条野登记，同时在
    // `plan/06` 注入一处对它的引用（门只对"被文档点名且在待落位登记里"的路径报 stale）。
    // 这样靶子锚的是门的**判据形态**（登记 → 已 ✅ → 必须红），与仓库当前登记了几条无关，
    // 永不随进度过期。
    apply: (cwd) => {
      const reg = mutateFile(
        cwd,
        "tools/check-sprint-layout.mjs",
        "const PENDING_TOOLS = {};",
        'const PENDING_TOOLS = { "tools/zz-never-shipped.mjs": 0 };',
      );
      if (reg.ok === false) return reg;
      return mutateFile(
        cwd,
        "plan/06-交付对标与决策.md",
        "## 1. 评分对标",
        "变异靶子：点名 `tools/zz-never-shipped.mjs`。\n\n## 1. 评分对标",
      );
    },
  },
  {
    id: "L9",
    gate: LAYOUT,
    judge: "LAYOUT.TESTS",
    name: "新增一个测试文件但两处都不登记",
    apply: (cwd) => writeFileSync(join(cwd, "tests/zz-unregistered.test.mjs"), "// 故意未登记\n"),
  },
  {
    id: "L10",
    gate: LAYOUT,
    judge: "LAYOUT.TESTS",
    name: "从 CI 里删掉一个测试文件登记",
    apply: (cwd) => {
      const p = join(cwd, ".github/workflows/ci.yml");
      const text = readFileSync(p, "utf8");
      const m = /tests\/\w[\w.-]*\.test\.mjs/.exec(text);
      if (!m) return { ok: false, why: "CI 里找不到 tests/*.test.mjs 登记" };
      writeFileSync(p, text.replace(m[0], "tests/removed.test.mjs"));
      return { ok: true };
    },
  },
  {
    id: "L11",
    gate: LAYOUT,
    judge: "LAYOUT.GAPS",
    name: "把缺口表头里的『缺口』列名改掉（列定位必须报 FAIL，不是静默按最后一列读）",
    // 这条钉住"列号按表头名找"这个实现决定：如果门退回 `cells.length - 2`，
    // 删掉「缺口」二字后它照样能读最后一列 → 本条变绿（假门）。
    apply: (cwd) => mutateFile(cwd, PLAN06, "| # | 缺口 |", "| # | 说明 |"),
  },
  // ── 脱敏门：每条规则一组 ─────────────────────────────────────────────
  {
    id: "D1",
    gate: DESENS,
    name: "文档里写盘符绝对路径（本机 session 路径形态）",
    // 靶子必须落在判据的**实际扫描面上**：规则的目的是抓"本机 session 路径被粘进文档"，
    // 用 `D:/scratch` 这种规则本就不管的形态打靶 = 靶子瞄错（变异变绿不证明判据弱，
    // 证明的是靶子不在判据面内）。
    apply: (cwd) => mutateFile(cwd, "README.md", "# depcheck-live", "# depcheck-live\n\n临时产物在 D:/ProgramData/scratch/out 下。"),
  },
  {
    id: "D2",
    gate: DESENS,
    name: "文档里写 MSYS 用户路径",
    apply: (cwd) => mutateFile(cwd, "README.md", "# depcheck-live", "# depcheck-live\n\n配置见 /c/Users/someone/cfg.json"),
  },
  {
    id: "D3",
    gate: DESENS,
    name: "文档里写回环代理端口",
    apply: (cwd) => mutateFile(cwd, "README.md", "# depcheck-live", "# depcheck-live\n\n代理 127.0.0.1:7897"),
  },
  {
    id: "D4",
    gate: DESENS,
    name: "文档里写本机用户名",
    apply: (cwd) => mutateFile(cwd, "README.md", "# depcheck-live", "# depcheck-live\n\n作者机器 ASUS-PC"),
  },
  {
    id: "D5",
    gate: DESENS,
    name: "本地状态目录（.mimosa）里出现绝对路径 → 必须**不**被扫到（跳过硬编码）",
    // 这条钉住 `SKIP_DIRS` 与 `.gitignore` 的对齐：M1 实测时 `.mimosa/` 漏在跳过名单外，
    // 扫描面从 70 涨到 137。靶子落在"被跳过的目录"里放一个真命中项：
    // 若门把该目录放回扫描面，这条就会红（期望绿）。
    expect: "green",
    apply: (cwd) => {
      const dir = join(cwd, ".mimosa", "hook-state");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "leak.txt"), "临时产物在 D:/ProgramData/scratch/out 下\n");
      return { ok: true };
    },
  },
  // ── 阴性对照（期望**绿**）：证明判据没写死、没断言了全世界 ─────────────
  {
    id: "N1",
    gate: DESENS,
    expect: "green",
    name: "阴性对照：写脱敏占位符 `<user>` 必须放行",
    apply: (cwd) => mutateFile(cwd, "README.md", "# depcheck-live", "# depcheck-live\n\n配置见 C:\\Users\\<user>\\cfg.json"),
  },
  {
    id: "N2",
    gate: DESENS,
    expect: "green",
    name: "阴性对照：公开镜像源（清华源）不是私有代理，必须放行",
    apply: (cwd) => mutateFile(cwd, "README.md", "# depcheck-live", "# depcheck-live\n\n镜像 pypi.tuna.tsinghua.edu.cn / goproxy.cn"),
  },
  // ── 发布门（M6）：每条判据一组 ─────────────────────────────────────────
  {
    id: "R1",
    gate: RELEASE,
    judge: "RELEASE.FACTS",
    name: "事实块的 END 标记删掉（判据面消失 → 必须红，不许静默按空块读）",
    apply: (cwd) => mutateFile(cwd, RELEASE_DOC, "\n<!-- RELEASE-FACTS:END -->", ""),
  },
  {
    id: "R2",
    gate: RELEASE,
    judge: "RELEASE.VERSION",
    name: "把留档事实块的 version 改成另一个号（版本三处不一致）",
    // 靶子改的是**事实块里的那一行**（判据读的正是它），不是正文别的 0.1.0 文本，
    // 也不是 package.json（那条由 R4 管）。表格行按整行匹配，贴合门"按整行锚定"的读法。
    apply: (cwd) => mutateFile(cwd, RELEASE_DOC, "| version | 0.1.1 |", "| version | 0.2.0 |"),
  },
  {
    id: "R3",
    gate: RELEASE,
    judge: "RELEASE.ASSET",
    name: "附件名改成不含版本号的形态（发布后从名字认不出是哪个版本）",
    apply: (cwd) => mutateFile(cwd, RELEASE_DOC, "| attachment | depcheck-live-0.1.1.zip |", "| attachment | depcheck-live.zip |"),
  },
  {
    id: "R4",
    gate: RELEASE,
    judge: "RELEASE.VERSION",
    name: "只改 package.json 的 version（留档没跟 → 三处不一致必须红）",
    apply: (cwd) => mutateFile(cwd, "package.json", '"version": "0.1.1"', '"version": "0.1.2"'),
  },
  {
    id: "R5",
    gate: RELEASE,
    judge: "RELEASE.FACTS",
    name: "事实块里塞一个重复字段（值互相覆盖却只报最后一个 → 假绿）",
    apply: (cwd) => mutateFile(cwd, RELEASE_DOC, "| attachment | depcheck-live-0.1.1.zip |", "| attachment | depcheck-live-0.1.1.zip |\n| attachment | depcheck-live-0.9.9.zip |"),
  },
  {
    id: "R6",
    gate: RELEASE,
    expect: "green",
    name: "阴性对照：在说明段落里引用标记字面量，必须放行（K37：按整行锚定，不误判）",
    // 与 R1 恰好互补：R1 证明"真标记被删会红"，本组证明"说明段落里的同名子串不会误伤"。
    // 两条一起钉住"按整行锚定"这个实现决定——退回 indexOf 时 R6 会红（切到说明段落里的假标记）。
    apply: (cwd) =>
      mutateFile(
        cwd,
        RELEASE_DOC,
        "## 一、tag 前事实",
        "> 说明：正文里再提一次 `<!-- RELEASE-FACTS:BEGIN -->` 与 `<!-- RELEASE-FACTS:END -->` 不会影响机器读取。\n\n## 一、tag 前事实",
      ),
  },
];

const onlyArg = process.argv.slice(2).find((a) => a.startsWith("--only"));
let only = null;
if (onlyArg) {
  const raw = onlyArg.includes("=") ? onlyArg.split("=")[1] : process.argv[process.argv.indexOf(onlyArg) + 1];
  if (!raw) {
    process.stderr.write("mutate-gates: --only 需要一个逗号分隔的组号列表\n");
    process.exit(2);
  }
  only = new Set(raw.split(",").map((s) => s.trim().toUpperCase()));
}

const rows = [];
for (const group of GROUPS) {
  if (only && !only.has(group.id)) continue;
  const expect = group.expect ?? "red";
  const dir = mkdtempSync(join(tmpdir(), "depcheck-mut-"));
  try {
    copyRepo(dir);

    // 纪律①：先跑未变异的基线。基线不绿 → 本组记 error（"预期红"的前提不成立）。
    const base = runGate(dir, group.gate);
    if (base.code !== 0) {
      rows.push({ id: group.id, verdict: "error", note: `基线就非绿（code=${base.code}）: ${base.out.split("\n").slice(-2).join(" ")}` });
      continue;
    }

    // 纪律③：变异必须真的改了字节。
    const mutated = group.apply(dir);
    if (mutated && mutated.ok === false) {
      rows.push({ id: group.id, verdict: "skip", note: `靶子找不到：${mutated.why}` });
      continue;
    }

    const r = runGate(dir, group.gate);
    if (expect === "red") {
      const caught = r.code !== 0 && (!group.judge || r.out.includes(group.judge));
      rows.push({
        id: group.id,
        verdict: caught ? "caught" : "missed",
        note: caught
          ? `${group.judge ?? "门"} 如期变红`
          : `期望红。实际 code=${r.code}${group.judge ? `；输出里没有 ${group.judge}` : ""}`,
      });
    } else {
      rows.push({
        id: group.id,
        verdict: r.code === 0 ? "caught" : "missed",
        note: r.code === 0 ? "阴性对照如期保持绿" : `期望绿却红: ${r.out.split("\n").filter((l) => l.startsWith("FAIL")).slice(0, 2).join(" ")}`,
      });
    }
  } catch (error) {
    rows.push({ id: group.id, verdict: "error", note: `宿主异常: ${error.message}` });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (rows.length === 0) {
  process.stderr.write("mutate-gates: 没有匹配的变异组\n");
  process.exit(2);
}

const bad = rows.filter((r) => r.verdict !== "caught");
process.stdout.write("变异验证（每组建临时副本，工作树不动）\n");
process.stdout.write("=".repeat(64) + "\n");
for (const r of rows) {
  const tag = r.verdict === "caught" ? "CAUGHT" : r.verdict.toUpperCase();
  process.stdout.write(`${tag.padEnd(6)}  ${r.id.padEnd(4)}  ${r.note}\n`);
}
process.stdout.write("=".repeat(64) + "\n");
const counts = rows.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {});
process.stdout.write(
  `共 ${rows.length} 组：CAUGHT ${counts.caught ?? 0} / MISSED ${counts.missed ?? 0} / SKIP ${counts.skip ?? 0} / ERROR ${counts.error ?? 0}\n`,
);
process.stdout.write(`结论: ${bad.length === 0 ? "全部符合预期" : `${bad.length} 组不符预期（${bad.map((r) => r.id).join(",")}）`}\n`);
process.exitCode = bad.length === 0 ? 0 : 1;