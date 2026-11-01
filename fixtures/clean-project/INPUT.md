# C7 · `clean-project` —— 验证**零误报**（本案最硬的验收）

## 验证哪条判定态

不是某一条判定态，而是**反面**：一个**全部引用都合法**的工程，
`bench --clean` 必须产出 **0 个问题**，同时 `summary.totalPoints > 0`（证明它不是空跑）。

## 构造：覆盖全部"容易误报"的邻居形态

| # | 形态 | 写法 | 为什么容易误报 |
|---|---|---|---|
| 1 | `type: module` 且**有** `require` 分支的包，用 `require()` | `require("zod")` | 只看 `type` 会误判 MISMATCH（**系统性假阳性**） |
| 2 | 同上，`date-fns` | `require("date-fns")` | 同上 |
| 3 | 同上，`glob` | `require("glob")` | 同上 |
| 4 | 无 `require` 分支但**具名导出在命名空间上** | `require("commander").Command` | 只看 `hasRequireBranch` 会误判 MISMATCH |
| 5 | ESM 包用 `import` | `import chalk from "chalk"` | 合法用法，不是问题 |
| 6 | 显式列出的子路径 | `require("zod/package.json")` | 不查 `exports` 会误判 NOT-EXPORTED-SUBPATH |
| 7 | 显式列出的子路径（另一包） | `require("glob/raw")` | 同上 |
| 8 | 相对路径引用 | `import "./local.mjs"` | 非依赖引用，**不在判定面内**（不得计入 problems） |
| 9 | `node:` 内置模块 | `import { readFileSync } from "node:fs"` | 同上 |
| 10 | 文案里的裸字符串 | `const label = "this is a chalk-like label"` | 字符串兜底若不过滤会误判成引用（§5.3 第 3 条） |

## 为什么这条构造能证伪

1. **1–3 钉住最危险的假阳性面**：`plan/06` R5 记"干净工程误报 → 直接扣功能分"。
   `zod` / `date-fns` / `glob` 三个 `type: module` 却有 `require` 分支的包，
   正是"看 `type` 就误判"的活靶子。C3 从**正例**方向证伪，C7 从**干净工程**方向证伪——
   两者互为镜像。
2. **4 钉住第二危险的假阳性面**：`commander` 无 `require` 分支，若按"无分支即 MISMATCH"
   就会误报。这条在 C3 里是"判定正确性"，在 C7 里是"会不会误报"。
3. **6–7 钉住"子路径一律屏蔽"的过度应用**：`exports` 屏蔽的是**未列**的子路径，
   不是所有子路径。C4 从正例方向证伪，C7 从反例方向证伪。
4. **8–9 钉住"范围外不算问题"**：相对路径与 `node:` 内置不是依赖引用。
   一个把它们计入 problems 的实现会让本 case 红。
5. **10 钉住字符串兜底的误报抑制**（`data/README.md` §5.3 第 3 条）：
   文案里的 `"chalk-like label"` 不是包引用。兜底只认"形似包名 **且** 命中已装依赖"两条同时成立。
6. **`totalPoints > 0` 是自证条件**（`plan/04` §6）：0 问题可能是"扫了 0 个"的假绿。
   本 case 必须同时满足 `problems === 0` **且** `totalPoints > 0`，
   否则"零误报"与"零工作"同形。

## 关键事实（可独立复算）

- 第 1–3 条的合法性来自 `data/packages/*.json` 的 `hasRequireBranch: true`（生成器产物）；
- 第 4 条来自 `data/README.md` §5.4.1 实测（`require("commander").Command === function`）；
- 第 6–7 条来自 `exposesPackageJson: true`；
- 第 10 条的抑制判据见 §5.3 第 3 条 + `tests/thresholds.test.mjs`。

## 期望（机读部分见 `expected.json`）

退出码 **`0`**；`summary.problems === 0`；`gaps.length === 0`；`summary.totalPoints >= 8`（不含 8/9 两条范围外）；
**`findings` 里每一条都必须是 `RESOLVED`**（`findings` 含 `RESOLVED`，问题数看 `summary.problems`——
这是 M0 踩过的坑，见 `plan/00` §6 与 `HANDOFF-M0` §五.3）。

> **M1 状态**：`INPUT.md` 已定稿；`expected.json` 的逐点 `evidence` 待 M2 补齐。
> 本 case 的 `bench --clean` 验收在 **M4**。