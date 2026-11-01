# C3 · `esm-cjs-mismatch` —— 同代码不同包对照组（**本题最硬的证伪形态**）

## 验证哪条判定态

`ESM-CJS-MISMATCH`（`data/README.md` §5.2 四条判据）与它的反面判据。

## 构造：**同一份 CommonJS 写法**，五个包给出两种判定

五个文件的内容**逐字节相同**（只有一个包名不同）：

```js
// 每个文件都长这样，只有 PKG 被替换
const ns = require("PKG");
module.exports = { a: ns.alpha, b: ns.beta };
```

| 文件 | `PKG` | 期望判定 | 理由 |
|---|---|---|---|
| `src/against-chalk.cjs` | `chalk` | **`ESM-CJS-MISMATCH`** | 无 `require` 分支；`alpha`/`beta` 不在命名空间上（在 `.default` 下） |
| `src/against-commander.cjs` | `commander` | **`ESM-CJS-MISMATCH`**（须按符号判定） | 无 `require` 分支；`alpha`/`beta` 不是 `commander` 的命名空间导出 |
| `src/against-zod.cjs` | `zod` | **`RESOLVED`** | **有** `require` 分支 → `require()` 走真 CJS 产物 |
| `src/against-date-fns.cjs` | `date-fns` | **`RESOLVED`** | 同上 |
| `src/against-glob.cjs` | `glob` | **`RESOLVED`** | 同上 |

## 为什么这条构造能证伪

### 证伪目标一：按 `type` 字段一刀切的实现

五个包**全部是 `type: "module"`**（实测，见 `data/packages/*.json` 的 `type` 字段）。
按 `type` 判的实现会把五个全判成 MISMATCH → 后三条立刻红。
这就是 `plan/00` §2.1 第 3 行决策（"判据用 `exports` 的 `require` 分支存在性，**不用** `type` 字段"）
的可执行形态。

### 证伪目标二：按"有没有 `require` 分支"一刀切的实现

`chalk` 与 `commander` **都没有** `require` 分支（实测 `hasRequireBranch === false`），
但它们的正确判定**不同**：

- `chalk`：`require("chalk")` 得到的命名空间上**没有** `red`/`blue` 等 API，它们在 `.default` 下
  → 取用即失败 → **真缺陷** → `ESM-CJS-MISMATCH`。
- `commander`：`require("commander")` 得到的命名空间上**有** `Command`/`program` 等具名导出
  → 取用成功 → **不是缺陷**。本 case 里取的 `alpha`/`beta` 两名字两个包都没有，
  所以 `commander` 走的是"取的符号不存在"，但**不能**因此判 MISMATCH——它的问题类型是符号缺失，
  不是模块格式失配。

> ⚠️ **本 case 与 C2 的边界**：`commander` 这一条真正的判定取决于"被取用的符号"。
> 为了让 C3 保持纯净（只测格式失配），C3 的 `commander` 条目取用的符号是
> **该包命名空间上真实存在的**（`Command` / `program`），判定 `RESOLVED`。
> 若取 `alpha`，它就该落到 C2 的 `MISSING-EXPORT` 域。**两组用例分开，不混测。**

修正后的对照表（C3 最终形态）：

| 文件 | `PKG` | 取用的符号 | 期望判定 |
|---|---|---|---|
| `src/against-chalk.cjs` | `chalk` | `red`（真实存在于 `.default`，不在命名空间） | **`ESM-CJS-MISMATCH`** |
| `src/against-commander.cjs` | `commander` | `Command`（真实在命名空间上） | **`RESOLVED`** |
| `src/against-zod.cjs` | `zod` | `z`（真实在命名空间上） | **`RESOLVED`** |
| `src/against-date-fns.cjs` | `date-fns` | `addDays` | **`RESOLVED`** |
| `src/against-glob.cjs` | `glob` | `globSync` | **`RESOLVED`** |

此时**唯一红的是 `chalk`**，其余四条绿。这一"1 红 4 绿"的形状就是本 case 的招牌断言。

### 证伪目标三：把 `commander` 判成 MISMATCH（系统性假阳性）

上表把 `commander` 与 `chalk` 放在同一组：**同样无 `require` 分支，判定相反**。
任何"只看 `hasRequireBranch`"的实现会同时判红这两条 → `commander` 那条红 → 本 case 红。

## 关键事实（可独立复算，2026-11-01 本机 Node v24.15.0 实测）

```
require("chalk")      → keys 不含 red；ns.red === undefined；ns.default.red === function
require("commander")  → keys 含 Command/program；ns.default === undefined
require("zod")        → ns.z 存在（exports 有 require 分支 → 真 CJS 产物）
require("date-fns")   → ns.addDays === function
require("glob")       → ns.globSync === function
```

逐条实测记录见 `data/README.md` §5.4.1。

## 期望（机读部分见 `expected.json`）

退出码 `1`（有 1 条问题）；`chalk` 条目 `ESM-CJS-MISMATCH`；其余 4 条 `RESOLVED`；
`summary.problems === 1`；`summary.byStatus.RESOLVED === 4`。

> **M1 状态**：`INPUT.md` 已定稿；`expected.json` 的逐点 `evidence` 待 M2 补齐。