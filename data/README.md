# data/README — 依据查证与口径唯一定义

> 本文件是 **11-1-depcheck-live** 的**唯一口径真相源**。
> `plan/01`、`plan/03`、代码、`SKILL.md` 一律**引用本节编号，不得复述数值**。

---

## 1. 依据查证记录（三态）

| # | 依据 | 渠道 | 状态 | 备注 |
|---|---|---|---|---|
| D1 | Node.js `exports` / 条件导出 / 子路径屏蔽语义 | Node 官方文档 `packages.html#package-entry-points` | ⬜ 待核对 | M1 必须逐条对照原文，**不得凭记忆** |
| D2 | `ERR_PACKAGE_PATH_NOT_EXPORTED` | Node 本机实测 | ✅ 已核对 | 2026-11-01，Node v24.15.0 |
| D3 | `ERR_REQUIRE_ESM` 在 Node 24 的行为已变 | Node 本机实测 | ✅ 已核对 | **不抛错**，返回命名空间对象 |
| D4 | `chalk` v6.0.1 `exports` 结构 | `node_modules/chalk/package.json` | ✅ 已核对 | 无 `require` 分支、无 `./package.json` |
| D5 | `zod` 4.6.7 / `date-fns` 4.4.0 / `glob` 14.0.3 `exports` | 同上 | ✅ 已核对 | 三者**均有** `require` 分支 |
| D6 | `commander` 15.0.0 `exports` | 同上 | ✅ 已核对 | 无 `require` 分支、无 `./package.json` |
| D7 | 竞品 `publint` | GitHub | ✅ 1310★（2026-11-01 快照） | 包作者视角 |
| D8 | 竞品 `arethetypeswrong` | GitHub | ✅ 1613★（同上） | 同上 |
| D9 | 竞品 `knip` | GitHub | ✅ 12560★（同上） | 反方向 |
| D10 | 竞品 `FixProve/fixprove` | GitHub + **实机运行** | ✅ 0★，`fixprove check` 对 TS/JS 报 `findings: []` | 见 §3 切割记录 |
| D11 | `actionlint` | GitHub | ✅ 4370★ | 已占，本案不碰 |

> ⚠️ **D1 是本案唯一的硬依赖且尚未核对。** M1 第一件事是读 Node 原文并把
> `exports` 的六种形态（字符串 / 条件对象 / `null` 屏蔽 / 数组回退 / 通配 `*` / 嵌套条件）
> 逐条制成测试向量。**未完成 D1 不得进入 M2。**

---

## 2. 数据源可获取性记录

### 2.1 底座（全部离线、零联网）

| 底座 | 获取方式 | 状态 | 规模 |
|---|---|---|---|
| 依赖包 `exports` 结构 | 项目自身 `node_modules/*/package.json` | ✅ 可直连 | 按项目而定 |
| 五包对照组 | `npm i chalk@6 zod@4 date-fns@4 commander@15 glob@14` | ✅ 可直连 | 5 个包 |
| 基准语料 | **本项目合成**（植入真值） | ✅ 完全可控 | 见 `plan/04` |

> **本工具运行时不联网、不查 registry、不下载包。** 所有判据来自本地磁盘。
> `drift` 模块若需历史版本指纹，须由用户**显式提供离线包**；未提供记 `NO-BASELINE`。

### 2.2 检索式与基准日（软论据，非硬锚点）

**检索窗口**：2026-11-01T03:10Z–04:40Z，`gh api search/repositories`。

| 检索式 | total | 采用状态 |
|---|---:|---|
| `check my imports against installed packages` | 0 | ⬜ 软论据 |
| `verify import exists installed dependency` | 0 | ⬜ 软论据 |
| `dependency api usage mismatch detect` | 0 | ⬜ 软论据 |
| `check api usage against node_modules` | 0 | ⬜ 软论据 |
| `verify ts imports resolve real exports` | 0 | ⬜ 软论据 |
| `npm package actual exports verify` | 0 | ⬜ 软论据 |
| `esm commonjs interop check` | 0 | ⬜ 软论据 |
| `typescript import symbol verify installed` | 1 | 唯一命中为 `FixProve/fixprove`（0★） |

> **`total=0` 一律只是软论据。** 本案的硬锚点是 D2–D6 的**本机实测**，不是检索空白。

---

## 3. 竞品实机核验记录（`FixProve/fixprove`）

**安装**：`pip install fixprove` → `0.1.17`
**运行**：
```
$ fixprove check probe_fp.js --json
{"files_checked": 1, "findings": [], "kb_build_seconds": 0.016, "check_seconds": 0.0}
```
**被测文件内容**（含一处确定不存在的导出）：
```js
const { notARealExport } = require("chalk");
```
**独立验证该导出确实不存在**：
```
$ node -e "import('chalk').then(m=>console.log('notARealExport' in (m.default||{})))"
false
```
**换显式参数再跑**：`fixprove check . --package-json package.json --json` → 仍然 `findings: []`
（`package.json` 的 `dependencies` 里 `chalk: ^6.0.1` 明确存在）

**结论**：其 TS/JS 侧判定在实测中对确定错误**报零命中**。
本案据此把它当"名义占位"处理，并做五条切割（见 `plan/01` §六）。

---

## 4. 合成数据纪律

- **基准语料全部合成**，`fixtures/<case>/` 含 `INPUT.md`（说明期望）与 `expected.json`（真值）；
- 每个 case 必须声明**它验证哪条判定态**，覆盖度口径见 `plan/04`；
- **干净工程零误报集**（`fixtures/clean-*`）是强制项——这是本案最硬的验收；
- 语料中**不得出现用户绝对路径**；路径一律相对化；
- 语料中的包使用**公开 npm 包的真实 `exports` 结构**（如上五包），不虚构包名，
  以保证"同代码不同包对照组"可被任何人复现。

---

## 5. ★ 数值口径 · 唯一定义（所有数值只在这里出现一次）

### 5.1 退出码语义

| 退出码 | 含义 | 触发条件 |
|---:|---|---|
| `0` | 无问题 | 全部引用点 `RESOLVED`，且无 `NO-BASELINE` 未满足项 |
| `1` | 发现判定问题 | 存在 `MISSING-EXPORT` / `ESM-CJS-MISMATCH` / `NOT-EXPORTED-SUBPATH` / `VERSION-BEHAVIOR-DRIFT` 至少一项 |
| `2` | ——**保留不用**—— | 与 `1` 合并（避免与 shell 常见约定冲突） |
| `3` | 算不了 | 依赖缺失、`node_modules` 不存在、`package.json` 不可解析、基准缺失 |
| `4` | 用法错误 | 参数非法 |

> **硬纪律**：`AMBIGUOUS` **不单独占用退出码**，它随 `1` 输出；
> 但"仅存在 `AMBIGUOUS`、无确证问题"时退出码为 `0`，并在报告里**显式列出** `AMBIGUOUS` 计数。
> **"零命中"与"算不了"必须落在不同退出码**（`0` vs `3`）。

### 5.2 `ESM-CJS-MISMATCH` 判据（精确口径）

判定为 `ESM-CJS-MISMATCH` 当且仅当**同时满足**：

1. 该包 `package.json` 的 `type` 为 `"module"`（或入口文件为 `.mjs`）；**且**
2. 该包 `exports` 中**不存在**任何 `require` 条件分支（含嵌套条件内部）；**且**
3. 引用点为 `require(<pkg>)` 或等价 CJS 加载；**且**
4. 被访问的属性挂在模块命名空间上而非 `.default` 上。

> **反面判据（必须判 `RESOLVED`）**：`type: module` **但有** `require` 分支 → 不得判 MISMATCH。
> 实测支撑：`zod` / `date-fns` / `glob` 属此类，`require()` 行为正常。

### 5.3 其他阈值

| 项 | 值 | 说明 |
|---|---|---|
| `exports` 通配展开上限 | 见 `plan/03` §2.4 | 超限记 `UNPARSEABLE`，不得截断静默 |
| 单文件 AST 大小上限 | 见 `plan/04` §6 | 超限降级为字符串扫描并标注 |
| 字符串兜底扫描的误报抑制 | 见 `plan/03` §2.5 | 只在"形似包名 + 已装依赖前缀"时计入 |

> 上表三项目前只有**指向**，具体值在 M1/M2 定稿后回填到本节——**回填前这三行是欠债，
> 状态记为 ⬜，`check_release.py` 的 `DATA_PROVENANCE` 会查。**