# C5 · `ambiguous-dynamic` —— 验证 `AMBIGUOUS`

## 验证哪条判定态

`AMBIGUOUS`（`STATUS.AMBIGUOUS`）：**动态形态，不可静态判定**。
本项目**不执行被测代码**（`plan/00` §2.1 第 4 行），所以静态解析不到的一律落这里。

## 构造：每种动态形态各一例（`plan/04` §6 要求"不得漏判"）

| 引用点 | 文件 | 写法 | 形态 |
|---|---|---|---|
| 1 | `src/dyn-var.cjs` | `const name = "chalk"; require(name)` | 变量间接 |
| 2 | `src/dyn-concat.cjs` | `` require(`./${x}`) `` | 模板拼接 |
| 3 | `src/dyn-import.cjs` | `const m = await import(someVar)` | 动态 import 变量 |
| 4 | `src/dyn-config.mjs` | 配置对象里 `plugins: [pkgName]` 且 `pkgName` 是变量 | 运行时生成 |
| 5 | `src/dyn-prop.cjs` | `require("chalk" + suffix)` | 字面量+变量拼接 |
| 6（对照） | `src/static.mjs` | `import { z } from "zod"` | **静态字面量** → 必须 `RESOLVED`，不是 AMBIGUOUS |

## 为什么这条构造能证伪

1. **防"抽不出就丢弃"**（`src/scan.mjs` 头部纪律）：动态形态若被静默跳过，
   用户会看到"引用点 5 个、问题 0 个"——**这等于对用户撒了一次"没问题"**。
   本 case 断言 `summary.totalPoints >= 6` 且 `summary.ambiguous >= 5`：
   动态点必须**出现在结果里**并计数。
2. **防"抽不出就判死"**：`AMBIGUOUS` **不是**确证问题。按 `data/README.md` §5.1 硬纪律，
   "仅存在 `AMBIGUOUS`、无确证问题"时退出码为 **`0`**，但报告里必须**显式列出计数**。
   一个把 AMBIGUOUS 当 problems 的实现会让本 case 退出码变成 1 → 红。
3. **第 6 条对照防"全判 AMBIGUOUS"**：一个把什么都判 AMBIGUOUS 的实现能让 1–5 全绿，
   但第 6 条会红。这条对照是本 case 的阳性/阴性双向阀门。
4. **防"字面量拼接也算静态"**：第 5 条 `"chalk" + suffix` 有字面量前缀，
   容易被"看到引号就当静态"的实现误判成静态引用。它**必须**是 `AMBIGUOUS`。

## 关键事实（可独立复算）

- 本项目不执行被测代码（`plan/00` §2.1 第 4 行决策），因此**不存在**"运行时解析出来"这条退路；
- `AMBIGUOUS` 的退出码语义由 `tests/cli.test.mjs`「仅 AMBIGUOUS、无确证问题 → 退出 0」
  那一条独立钉住（M0 已落位）；
- `kind` 枚举里 `ambiguous` 是一个 `kind`（`src/contract.mjs` `KIND`），
  与同名判定态不是一回事——`tests/scan.test.mjs` 断言每个抽出的 `kind` 都在枚举里。

## 期望（机读部分见 `expected.json`）

退出码 **`0`**（仅 AMBIGUOUS，无确证问题）；点 1–5 为 `AMBIGUOUS`；点 6 为 `RESOLVED`；
`summary.ambiguous === 5`；`summary.problems === 0`；`summary.totalPoints >= 6`。

> **M1 状态**：`INPUT.md` 已定稿；`expected.json` 的逐点 `evidence` 待 M2 补齐。