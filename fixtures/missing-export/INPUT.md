# C2 · `missing-export` —— 验证 `MISSING-EXPORT`

## 验证哪条判定态

`MISSING-EXPORT`（`data/README.md` §5 / `STATUS.MISSING_EXPORT`）：
**入口子路径存在，但该入口的导出集里没有这个符号**。

## 构造

| 引用点 | 包 | 写法 | 为什么必然缺席 |
|---|---|---|---|
| 1 | `chalk@6.0.1` | `import { notARealExport } from "chalk"` | 该名字不存在于 `chalk` 的任何产物 |
| 2 | `zod@4.6.7` | `import { notARealExport } from "zod"` | 同上 |
| 3 | `date-fns@4.4.0` | `import { notARealExport } from "date-fns"` | 同上（入口是 245 行 re-export 桶，展开后 251 个名字里也没有它） |
| 4（反例） | `chalk@6.0.1` | `const { red } = require("chalk")` | `red` **存在于 `.default` 下**，但不在 CJS 命名空间上 |

> ⚠️ **M2 修正了一处构造**：M1 骨架把点 1–3 写成 `const { notARealExport } = require("chalk")`。
> 那条在 `chalk` 这类**无 `require` 分支**的包上**永远到不了** `MISSING-EXPORT`——
> 判定顺序（`plan/03` §4.4）里 `ESM-CJS-MISMATCH` 在 `MISSING-EXPORT` 之前，首个成立者胜。
> 这不是实现缺陷，是该形态的固有结果。故点 1–3 改为 **ESM 视角**（`import`）构造，
> CJS 侧的专属形态留给点 4，它验证的是**判定顺序**本身。
>
> 对应源码：`src/chalk.mjs` / `src/zod.mjs` / `src/date-fns.mjs` / `src/chalk.cjs`。

## 为什么这条构造能证伪

1. **防"永远判 RESOLVED"**：本 case 有 3 条必须红（1–3）+ 1 条必须**不是** MISSING（4）。
   一个恒 `RESOLVED` 的实现会让 1–3 红；一个恒 `MISSING-EXPORT` 的实现会让 4 红。
   两侧都堵住，说明判定真的读了导出集。
2. **防"读不出就猜"**：`red` 不在 `chalk` 的 CJS 命名空间上（真实 `require("chalk")` 的
   `keys` 里没有 `red`，实测见 `data/README.md` §5.4.1）。第 4 条的正确判定是
   `ESM-CJS-MISMATCH`（不是 MISSING-EXPORT，也不是 RESOLVED）——**它的存在证明判定顺序**
   （`plan/03` §4.4：MISMATCH 先于 MISSING-EXPORT）。
3. **误报比漏报代价高**（`plan/06` R2）：导出集读不出时必须记 `UNPARSEABLE` 进 gaps，
   **不得**判 MISSING-EXPORT。本 case 通过"`notARealExport` 必须红"钉住"读得出"，
   通过与 C1 配对钉住"读得对"。

## 关键事实（可独立复算）

`chalk@6.0.1` 的 `exports["."]` 只有 `types` 与 `default` 两个条件，指向
`./source/index.d.ts` / `./source/index.js`；该入口的具名导出集里没有 `notARealExport`。
可用 `node -e "import('chalk').then(m=>console.log('notARealExport' in m))"` 独立验证为 `false`
（这正是 `data/README.md` §3 里对 `fixprove` 做独立核验的同一手法）。

## 期望（机读部分见 `expected.json`）

退出码 `1`；点 1–3 为 `MISSING-EXPORT`（`missing` 数组各含 `"notARealExport"`）；
点 4 为 `ESM-CJS-MISMATCH`（**不是** `MISSING-EXPORT`）；`summary.problems === 4`。

> **M2 状态**：`expected.json` 的逐点 `evidence` 已按实读 `exports` 原文片段 + 目标文件行号回填
> （无 `toFillIn` 残留）；`src/` 与 `package.json` 已在 M2 落地，`tests/fixtures-run.test.mjs` 逐点对账。
