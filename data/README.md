# data/README — 依据查证与口径唯一定义

> 本文件是 **11-1-depcheck-live** 的**唯一口径真相源**。
> `plan/01`、`plan/03`、代码、`SKILL.md` 一律**引用本节编号，不得复述数值**。

---

## 1. 依据查证记录（三态）

| # | 依据 | 渠道 | 状态 | 备注 |
|---|---|---|---|---|
| D1 | Node.js `exports` / 条件导出 / 子路径屏蔽语义 | Node 官方文档 `packages.html#package-entry-points` + **解析算法原文** `esm.html#resolution-algorithm-spec`；**并用本机 Node 实测交叉验证** | ✅ 已核对（M1） | 六形态逐条对照，**查出 M0 骨架 10 处语义偏差**，逐条见 §5.4 |
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

> ⚠️ **D1 已于 M1 核对完成**（2026-11-01）：Node 官方 `packages.html` 只写了**声明层**语义，
> **解析层**的规则（条件匹配顺序、通配优先级、数组回退）在 `esm.html#resolution-algorithm-spec`
> 的伪代码里。只看前者会漏掉整族规则——M0 骨架正是这么错的（见 §5.4）。
> **§5.4 的 10 条是判定面的唯一实现依据，M2 不得再另起一套口径。**

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

### 5.3 其他阈值（M1 已回填，欠债清零 ✅）

| 项 | 值 | 说明 |
|---|---|---|
| `exports` 通配展开上限 | **4096** 个子路径键 | 超限记 `UNPARSEABLE`（进 gaps，退出码 3），**不得截断静默**。依据：五个真实包的实测上界为 `date-fns@4.4.0` 的 **741** 个键（`chalk` 2 / `commander` 1 / `glob` 3 / `zod` 12），取 4096 留 5.5 倍余量。通配展开不逐文件枚举——只按键做前缀/长度匹配，故上限约束的是**键数**而非展开后的文件数 |
| 单文件 AST 大小上限 | **512 KiB**（524288 字节，按 UTF-8 字节数） | 超限该文件降级为**字符串兜底扫描**并在报告里标注（`gaps[].kind = "LARGE_FILE_DOWNGRADED"`），不得静默跳过。依据：实测最大真实源码 `date-fns@4.4.0` 单文件 **818 KiB**、99 分位 23 KiB；512 KiB 之外的超大文件降级可保行号仍指向源行 |
| 字符串兜底扫描的误报抑制 | **双条件**：① 字符串形似包名（`^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$`，且不含 `/` 子路径的也计入）；② 其**包名部分命中** `dependencies ∪ devDependencies` 的已装依赖名集合。两条同时成立才计入 `string-literal` 引用点 | 只满足 ① 的字符串（如普通文案里的 `"lodash"` 而项目没装 lodash）**不计入**，避免把文案当引用。依据见 §5.3.1 |

#### 5.3.1 三条阈值的实测依据（2026-11-01，本机 Node v24.15.0）

| 依据 | 实测值 | 怎么量的 |
|---|---:|---|
| `exports` 键数（五包） | date-fns **741** / zod 12 / glob 3 / chalk 2 / commander 1 | 读 `data/packages/*.json` 的 `exports` 键数 |
| 单文件源码字节（五包 2935 个 `.js`） | max **818 KiB**（date-fns）/ 次大 138 KiB（zod） | `statSync` 遍历五包 `node_modules/<pkg>/**/*.js` |
| 依赖名集合的来源 | `package.json` 的 `dependencies ∪ devDependencies` | 与 `src/snapshot.mjs` 的 `collectDeclaredDeps` 同口径 |

> **回填纪律**：三个值只在**本节**出现一次；`plan/03`、`plan/04`、代码一律引用节号。
> 改这里必须同轮检查 `src/resolve.mjs`（通配上限）与 `src/scan.mjs`（单文件上限）是否同口径，
> `tests/thresholds.test.mjs` 做双向断言。

---

### 5.4 ★ `exports` 解析语义 · D1 核对结论（M1，10 条，唯一实现依据）

**核对方式（双源）**：① Node 官方文档原文 —— 声明层 `packages.html#package-entry-points`
+ 算法层 `esm.html#resolution-algorithm-spec`（`PACKAGE_EXPORTS_RESOLVE` /
`PACKAGE_IMPORTS_EXPORTS_RESOLVE` / `PACKAGE_TARGET_RESOLVE` / `PATTERN_KEY_COMPARE`）；
② 本机 Node **v24.15.0** 黑盒实测（构造临时包 → `require.resolve` / `import.meta.resolve` /
真实 `require()`，2026-11-01）。

**结果：M0 骨架有 10 处与官方语义不符，全部已修正**，`src/resolve.mjs` 重写、
`tests/resolve.test.mjs` 每条向量都标注了对应的实测用例编号。

| # | 规则 | 官方原文 / 实测 | M0 骨架的错法（已修） |
|---|---|---|---|
| 1 | 条件匹配顺序 = **目标对象自身的键序** | packages.html：「Within the `exports` object, key order is significant… earlier entries have higher priority」。实测 `{import,node,default}` 的 import 视角取 `import`，require 视角取 `node` | 用"条件优先级数组"遍历 → 同一条件集合换键序必错其一 |
| 2 | 嵌套条件**无映射时继续父层后续条件** | esm.html：「nested conditions behave analogously to nested JavaScript `if` statements」。实测 `{node:{browser},import,default}` 的 import 视角取 `import` | 直接返回 unparseable，把可解析的包判成"算不了" |
| 3 | 条件集（实测）：import 视角 = `node,import,module-sync,node-addons`；require 视角 = `node,require,module-sync,node-addons`；`default` 恒命中 | 实测 `node-addons`/`module-sync` 被命中；`types`/`browser`/`development`/`production` **不参与** | 条件集写成含 `default` 的固定数组，且把 `types` 等当条件 |
| 4 | 通配须**排除等于 patternBase**，带 trailer 时还要 `matchKey.length >= expansionKey.length` | esm.html：「matchKey starts with but is **not equal to** patternBase」「length of matchKey is greater than or equal to the length of expansionKey」。实测 `./a/*` 对 `./a/`、`./a*b` 对 `./ab` 均不命中 | 缺这两条 → 空片段也命中，误报一整族 |
| 5 | 通配优先级 = `PATTERN_KEY_COMPARE`：先比 `*` 下标（大者优先），再比整键长度（长者在先） | esm.html `PATTERN_KEY_COMPARE` 伪代码 | 实现同构（前缀长 → 整键长），保留 |
| 6 | 通配目标里的 `*` **全部**替换 | esm.html：「every instance of `*` replaced with patternMatch」。实测 `./f/*` → `./src/*/idx-*.js` 对 `zz` 得 `./src/zz/idx-zz.js` | 只替换第一处 |
| 7 | 数组回退：空数组 → **屏蔽**；逐项求值，`invalid` / `unmatched` / `null` 一律**继续** | esm.html：「If _target.length is zero, return null」「continuing the loop on any Invalid Package Target error」。实测 `[null,"./b.js"]` → `b.js` | 遇 `null` 立刻记 unparseable（与实测相反）；空数组未单独处理 |
| 8 | 目标字符串必须以 `"./"` 开头，否则 Invalid Package Target | esm.html：`PACKAGE_TARGET_RESOLVE` 第一步。实测 `{".","index.js"}` → `ERR_INVALID_PACKAGE_TARGET` | 未校验，裸路径被当成合法目标 |
| 9 | 键形态致命性**分档**：混合子路径键+条件键 → Invalid Package Configuration（整包算不了）；末尾斜杠键、多 `*` 键 → Node **忽略该键**，其余入口照常可用 | esm.html：「exports is an Object with both a key starting with "." and a key not starting with "."」→ throw；实测 `./dir/`、`./a/*/b/*` 被忽略但 `.` 仍可解析 | 三者一律升级成整包 unparseable → 正常入口一起失效 |
| 10 | `exports: null` **等同未声明**（Node 回落 main/index） | 实测 `{exports:null, main:"./main.js"}` 的 require 走 main，不报 NOT_EXPORTED | 当成"一个 `"."` 值为 null 的入口"（= 屏蔽），语义反了 |

**三条纪律（错一处会让整族判定反转）**：

1. **顺序**（#1/#2）与**最具体优先**（#5）是两条**独立**规则，**不得合并实现**；
2. `null` 是**屏蔽语义**（→ `NOT-EXPORTED-SUBPATH`），不是"不存在"（#7/#10）；
3. 解析不了的记 `UNPARSEABLE` 并进 gaps，**不得静默跳过**——但"该忽略的键被忽略"（#9 后半）
   不是"解析不了"，**不得升级成 gaps**。

> **M2 硬约束**：`src/resolve.mjs` 对上述 10 条已实现；`tests/resolve.test.mjs` 每条向量都钉住
> 官方原文或实测编号。**改判定前先读本节 + §5.2**，不要按 `packages.html` 的措辞"再理解一遍"。

#### 5.4.1 招牌判据（§5.2 第 4 条）的实测校准

`§5.2` 第 4 条要求"被访问的属性挂在模块命名空间上而非 `.default` 上"。M1 用五个真实包实测
`require()` 的返回形态，结论如下（这是判定实现的可证伪依据）：

| 包 | `exports` 有 `require` 分支 | `require()` 返回 | `const { X } = require(...)` 取得到吗 |
|---|---|---|---|
| `chalk@6.0.1` | ❌ | 命名空间对象，具名符号 `red`/`blue` 等在 **`.default`** 下；`ns.red === undefined` | **取不到**（`red === undefined`）→ 真缺陷 |
| `commander@15.0.0` | ❌ | 命名空间对象，`Command`/`program` 等**直接挂在命名空间上**；`ns.default === undefined` | **取得到** → **不得**判 MISMATCH |
| `zod@4.6.7` | ✅ | 真 CJS 产物（`require` 分支指向 `.cjs`） | 取得到 |
| `date-fns@4.4.0` | ✅ | 同上 | 取得到 |
| `glob@14.0.3` | ✅ | 同上 | 取得到 |

> **关键**：`commander` 与 `chalk` 同为"无 `require` 分支"，但**判定不同**——
> 判据落在"被取用的符号能否从命名空间直达"，不是"有没有 require 分支"这一条。
> 只看第 2 条会把 `commander` 误判成 MISMATCH（**系统性假阳性**）。
> 这正是 §5.2 要四条同时成立的原因，M3 的 `bench` 必须覆盖 `commander` 这个反例。