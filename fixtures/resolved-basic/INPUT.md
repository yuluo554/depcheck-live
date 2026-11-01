# C1 · `resolved-basic` —— 验证 `RESOLVED`

## 验证哪条判定态

`RESOLVED`（五判定态之一，`data/README.md` §5 / `src/contract.mjs` `STATUS.RESOLVED`）。

## 构造

| 引用点 | 包 | 写法 |
|---|---|---|
| 1 | `chalk@6.0.1` | `import chalkDefault from "chalk"`（取 `.default`） |
| 2 | `zod@4.6.7` | `const { z } = require("zod")`（`z` 在命名空间上） |
| 3 | `date-fns@4.4.0` | `const { addDays } = require("date-fns")` |
| 4 | `glob@14.0.3` | `const { globSync } = require("glob")` |
| 5 | `commander@15.0.0` | `const { Command } = require("commander")`（`Command` 在命名空间上） |

## 为什么这条构造能证伪

`RESOLVED` 是最容易被"无脑判绿"的判定态——一个永远返回 `RESOLVED` 的实现能让本 case 全绿，
所以**单独看本 case 没有证明力**。本 case 的证明力来自它与其他 case 的**配对**：

- 与 **C2**（`MISSING-EXPORT`）配对：同样的 `require("chalk")`，改取一个不存在的符号就必须红。
  若实现把所有引用点判 `RESOLVED`，C2 立刻红。
- 与 **C3**（`ESM-CJS-MISMATCH`）配对：**同一份 CommonJS 写法**对 `chalk` 判 MISMATCH、
  对 `zod`/`date-fns`/`glob` 判 RESOLVED。若实现按 `type` 字段一刀切，C1 的 2–4 三条会红
  （它们都 `type: module`）。

因此本 case 必须**与 C2、C3 同批运行**才算证伪；单独跑只能证明"没崩"。

## 关键事实（可独立复算）

| 包 | `exports["."]` 原文（`data/packages/<pkg>.json`） | 结论依据 |
|---|---|---|
| `chalk@6.0.1` | `{"types":"./source/index.d.ts","default":"./source/index.js"}` | 无 `require` 分支；`default` 是兜底 |
| `zod@4.6.7` | `{"@zod/source":"./src/index.ts","types":"./index.d.cts","import":"./index.js","require":"./index.cjs"}` | **有** `require` 分支 → 可正常 `require()` |
| `date-fns@4.4.0` | `{"require":{…"./index.cjs"},"import":{…"./index.js"}}` | **有** `require` 分支 |
| `glob@14.0.3` | `{"import":{…},"require":{…"./dist/commonjs/index.min.js"}}` | **有** `require` 分支 |
| `commander@15.0.0` | `{"types":"./typings/index.d.ts","default":"./index.js"}` | 无 `require` 分支，但具名导出挂在命名空间上（见 `data/README.md` §5.4.1） |

## 期望（机读部分见 `expected.json`）

退出码 `0`；5 个引用点全部 `RESOLVED`；`summary.problems === 0`；`gaps.length === 0`。

> **M1 状态**：`INPUT.md` 已定稿；`expected.json` 的逐点 `evidence` 待 M2 补齐
> （真值纪律 `plan/04` §3：每项必须声明 `status` + `evidence`，不得只给结论）。