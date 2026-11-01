// ═══ 模块 ⑦ · 自检（selftest） ═══
// 目的（`plan/05` §2 M4 DoD 第 1 条）：把"退出码语义"变成**用户可自己敲的一条命令**——
// 断言 `0` / `1` / `3` / `4` 四种语义各由一个最小工程真的诱发出来，且 `2` 从不出现。
//
// 为什么这不是"再跑一遍测试"：测试验的是实现内部；`selftest` 验的是**这台机器上的这个
// 安装**——用户 clone 下来、装了什么、Node 是哪个版本，全都不确定。它跑在用户环境里，
// 因此不能硬编码本仓路径，必须**现场造最小工程**。
//
// 纪律：
//   · 纯函数 + 只读仓库：临时工程一律建在系统 tmp 下，跑完即删（不写仓库）；
//   · 不联网、不执行被测代码；
//   · **不猜**：某个码造不出来时记为失败并写明原因，绝不"跳过即通过"
//     （"这一层没跑"与"跑了没问题"必须可区分——`plan/05` §4 U 项纪律）。
//
// ★ 四条语义的诱发方式（每条都必须是**真工程**，不是 mock）：
//   `0` 干净：package.json + node_modules/<pkg> + 一个 RESOLVED 引用点 → 无问题
//   `1` 有问题：同上，但引用一个不存在的导出 → MISSING-EXPORT
//   `3` 算不了：分两种，都必须是 3 —— ① 无 node_modules；② 只有 NO-BASELINE（缺基线）
//   `4` 用法错误：未知命令 / 未知选项 / 缺路径参数
//
// ★ 为什么 `3` 要两小条：`data/README.md` §5.1 的 3 有两个独立触发源（"依赖缺失"与
//   "基准缺失"）。只验一个的话，另一条口径可以悄悄漂移到 0——那正是 M3 裁定
//   `NO-BASELINE` 落 3 时要防的事（`tests/drift.test.mjs` 的单条断言只覆盖了 drift 命令，
//   `selftest` 覆盖的是这台机器上 `check --with-drift` 的同一口径）。
//
// ★ `2` 保留不用：本模块显式断言它从未出现（`EXIT` 里没有这个键，见 src/contract.mjs）。

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXIT, TOOL } from "./contract.mjs";
import { exitCodeFor, parseArgv } from "./cli.mjs";
import { checkAll, decideExit, driftCommand, decideDriftExit } from "./api.mjs";

/**
 * 跑自检。
 * @returns {{ok:boolean, cases:Array<{id, semantic, expected, actual, ok, why, how}>, summary:object}}
 */
export function selftestAll() {
  const cases = [];
  const scratch = [];

  /** 造一个最小工程，返回其根；登记以便收尾删除。 */
  const make = (files) => {
    const dir = mkdtempSync(join(tmpdir(), "depcheck-selftest-"));
    scratch.push(dir);
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, content);
    }
    return dir;
  };

  // 最小"可解析的包"：CJS 形态，exports 只列 "."，require 分支存在。
  // 不用真实五包 —— selftest 必须能在**任何**机器上跑，包括没 npm i 过的裸 clone。
  const PKG_OK = JSON.stringify({
    name: "probe-pkg",
    version: "1.0.0",
    exports: { ".": { require: "./index.cjs", import: "./index.mjs" } },
  });
  const PKG_ENTRY_CJS = 'exports.good = 1;\nmodule.exports = { good: 1 };\n';
  const PKG_ENTRY_ESM = "export const good = 1;\n";

  const cleanFiles = {
    "package.json": JSON.stringify({
      name: "selftest-clean",
      version: "0.0.0",
      private: true,
      dependencies: { "probe-pkg": "^1.0.0" },
    }),
    "node_modules/probe-pkg/package.json": PKG_OK,
    "node_modules/probe-pkg/index.cjs": PKG_ENTRY_CJS,
    "node_modules/probe-pkg/index.mjs": PKG_ENTRY_ESM,
    "src/a.cjs": 'const { good } = require("probe-pkg");\nmodule.exports = { good };\n',
  };

  // ── ① 退出码 0：干净 ──
  {
    const dir = make(cleanFiles);
    const result = checkAll(dir);
    cases.push(
      verdict({
        id: "exit-0-clean",
        semantic: "OK",
        expected: EXIT.OK,
        actual: exitCodeFor(decideExit(result)),
        how: "最小工程：1 个 RESOLVED 引用点，无 gaps",
        extra: () => (result.summary.totalPoints > 0 ? null : "引用点数为 0 —— '零命中'与'扫了 0 个'同形，本自检是空跑"),
      }),
    );
  }

  // ── ② 退出码 1：有问题（缺导出）──
  {
    const dir = make({
      ...cleanFiles,
      "src/a.cjs": 'const { nope } = require("probe-pkg");\nmodule.exports = { nope };\n',
    });
    const result = checkAll(dir);
    cases.push(
      verdict({
        id: "exit-1-missing-export",
        semantic: "PROBLEMS",
        expected: EXIT.PROBLEMS,
        actual: exitCodeFor(decideExit(result)),
        how: "最小工程：require 取用不存在的导出 → MISSING-EXPORT",
        extra: () =>
          result.summary.problems > 0 ? null : "problems 为 0 —— 退出码若为 1 必有问题条目，本自检自相矛盾",
      }),
    );
  }

  // ── ③ 退出码 3：算不了（无 node_modules）──
  {
    const dir = make({
      "package.json": JSON.stringify({
        name: "selftest-no-nm",
        version: "0.0.0",
        private: true,
        dependencies: { "probe-pkg": "^1.0.0" },
      }),
      "src/a.cjs": 'require("probe-pkg");\n',
    });
    const result = checkAll(dir);
    cases.push(
      verdict({
        id: "exit-3-no-node-modules",
        semantic: "CANNOT_COMPUTE",
        expected: EXIT.CANNOT_COMPUTE,
        actual: exitCodeFor(decideExit(result)),
        how: "最小工程：声明了依赖但没有 node_modules → 算不了（不是'没问题'）",
      }),
    );
  }

  // ── ④ 退出码 3：算不了（缺基线 / NO-BASELINE）──
  //    这一条是 §5.1 的第二个 3 的来源。用 driftCommand + 空基线目录诱发：
  //    引用点合法、包存在，但没有任何离线基线 → 只有 NO-BASELINE → 3。
  {
    const dir = make({
      ...cleanFiles,
      "src/a.cjs": 'const { good } = require("probe-pkg");\nconst other = require("probe-pkg");\nmodule.exports = { good, other };\n',
    });
    // 用 CJS 视角取了一个**具名符号**，drift 层才会进判定面（wanted.length > 0）
    const result = driftCommand(dir, { baselineDir: join(dir, "__no_baselines__") });
    cases.push(
      verdict({
        id: "exit-3-no-baseline",
        semantic: "CANNOT_COMPUTE",
        expected: EXIT.CANNOT_COMPUTE,
        actual: exitCodeFor(decideDriftExit(result)),
        how: "最小工程：引用点合法但没有离线基线 → NO-BASELINE 进 gaps → 算不了（回 0 就是把'没跑'写成'跑了没问题'）",
        extra: () =>
          result.gaps.some((g) => g.kind === "NO-BASELINE")
            ? null
            : "没有产出 NO-BASELINE —— 这条自检没真正走到'基准缺失'分支（判据空跑）",
      }),
    );
  }

  // ── ⑤ 退出码 4：用法错误（三类，一次报一条）──
  const usageTrials = [
    { argv: ["no-such-command"], how: "未知命令" },
    { argv: ["check", ".", "--no-such-option"], how: "未知选项" },
    { argv: ["check"], how: "缺路径参数" },
  ];
  for (const trial of usageTrials) {
    // 用法错误走的是 parseArgv → CLI 的 USAGE 分支，**不经过** checkAll。
    // 这里直接断言解析层与码映射，避免 selftest 依赖子进程（子进程会让它慢一个数量级）。
    const parsed = parseArgv(trial.argv);
    const actual = parsed.ok ? EXIT.OK : exitCodeFor("USAGE");
    cases.push(
      verdict({
        id: `exit-4-usage-${trial.argv.join("-").replace(/[^\w-]/g, "")}`,
        semantic: "USAGE",
        expected: EXIT.USAGE,
        actual,
        how: `用法错误：${trial.how}`,
        extra: () => (parsed.ok ? `parseArgv 认为 ${JSON.stringify(trial.argv)} 合法（应为用法错误）` : null),
      }),
    );
  }

  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });

  // ── ⑥ `2` 保留不用 ──
  const hasReservedTwo = Object.values(EXIT).includes(2);
  cases.push({
    id: "exit-2-reserved",
    semantic: "RESERVED",
    expected: null,
    actual: hasReservedTwo ? 2 : null,
    ok: !hasReservedTwo,
    how: "2 保留不用（与 1 合并，避免与 shell 常见约定冲突）",
    why: hasReservedTwo ? "EXIT 里出现了 2 —— 2 在本项目保留不用（data/README.md §5.1）" : null,
  });

  const summary = {
    cases: cases.length,
    passed: cases.filter((c) => c.ok).length,
    failed: cases.filter((c) => !c.ok).length,
    // 语义覆盖：四个码各自至少一条通过（缺失即红——否则"某条码没人诱发"会静默放行）
    covered: [...new Set(cases.filter((c) => c.ok).map((c) => c.expected))].filter((v) => v !== null).sort(),
  };
  return { ok: summary.failed === 0, cases, summary };
}

/** 组装一条自检结论。`extra()` 只在退出码对得上时才值得看（否则真正的红因是码）。 */
function verdict({ id, semantic, expected, actual, how, extra }) {
  const codeOk = actual === expected;
  const extraWhy = typeof extra === "function" ? extra() : null;
  const ok = codeOk && extraWhy === null;
  return {
    id,
    semantic,
    expected,
    actual,
    ok,
    how,
    why: ok ? null : codeOk ? extraWhy : `退出码应为 ${expected}，实际 ${actual}`,
  };
}

/** 自检报告（人读）。 */
export function renderSelftest(selftest) {
  const s = selftest.summary;
  const lines = [
    `${TOOL} selftest · ${s.cases} 条断言 · 通过 ${s.passed} / 失败 ${s.failed}`,
    `  退出码语义覆盖: ${s.covered.length > 0 ? s.covered.join(" / ") : "<无>"}（2 保留不用）`,
  ];
  for (const c of selftest.cases) {
    lines.push(`  ${c.ok ? "PASS" : "FAIL"}  ${c.id}  期望 ${c.expected === null ? "—" : c.expected} / 实际 ${c.actual === null ? "—" : c.actual}`);
    if (!c.ok) lines.push(`    ${c.why}`);
  }
  return `${lines.join("\n")}\n`;
}