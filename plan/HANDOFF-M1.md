# HANDOFF-M1 — 数据先行：D1 语义核对 + 五包指纹 + 六份语料骨架

> 本文件是 **M1 这一棒的收尾交接单**（`k = 刚完成的里程碑号`）。
> 入库路径一律相对：`plan/HANDOFF-M1.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据

M1 已全部完成。逐项证据（全部为**本机实跑**，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| D1 六形态语义核对 | `data/README.md` §1 D1（✅）+ §5.4（10 条结论） | 双源核对：`packages.html` 声明层 + `esm.html` 解析算法层原文；**并用本机实测交叉验证** |
| `exports` 解析器按官方算法重写 | `src/resolve.mjs` | `tests/resolve.test.mjs` 21 条向量，每条标注实测用例编号 |
| 五包指纹入库 | `data/packages/*.json` | `node tools/gen-fingerprints.mjs --check` → `5/5 份逐字节一致` |
| 指纹生成器 | `tools/gen-fingerprints.mjs`（`--write` / `--check` / `--list` / `--from`） | `PENDING_TOOLS` 已同笔删除该条 |
| 指纹可独立复算 | 每份 `data/packages/*.json` 含 `canonical` + `fingerprint` | `tests/fingerprints.test.mjs`（6 条） |
| §5.3 三阈值回填 | `data/README.md` §5.3 + §5.3.1（实测依据） | 欠债清零；`src/contract.mjs` `LIMITS` 镜像 |
| 阈值落进实现 | `buildExportsIndex` / `scanSources` / `findBarePackageLiterals` | `tests/thresholds.test.mjs`（7 条，含双向断言） |
| 六份语料骨架 | `fixtures/<case>/INPUT.md` + `expected.json`（C1–C7） | `tests/fixtures.test.mjs`（9 条） |
| 测试总账 | `tests/` 10 个文件 | `npm test` → **104 passed / 0 failed / 0 skipped** |
| 脱敏门跳过名单对齐 | `tools/check-desensitized.mjs` 的 `SKIP_DIRS` | `tests/gate-selfcheck.test.mjs` 读 `.gitignore` 逐条对账；扫描数 137 → **60** |
| 三道门 | layout / desensitized / mutations | 见 §六 |

**M1 实测数字**：`npm test` = **104 passed / 0 failed / 0 skipped**（M0 是 55）；
`gen-fingerprints --check` = **5/5 逐字节一致**；脱敏门扫 **60** 个文本文件 0 命中；
布局门 **10 条判据**；变异组 **18**（15 正 + 2 阴性对照 + 1 跳过目录绿对照）。

### 招牌发现：M0 骨架的 10 处语义偏差（本轮最重要的产出）

D1 不是"过一遍文档"，而是**双源核对后查出实现错**。M0 的 `src/resolve.mjs` 有 **10 条**
与 Node 官方解析算法不符，全部已修正。**M2 若沿用旧口径，整族判定会反转。**

| # | M0 的错法 | 官方原文 / 实测 | 后果 |
|---|---|---|---|
| 1 | 用"条件优先级数组"遍历 | 条件匹配顺序 = **目标对象自身键序**（实测 A1/A2：同一集合换键序换目标） | 同一条件集合必错其一 |
| 2 | 嵌套条件无映射直接判 unparseable | 嵌套 behaves analogously to `if` → **继续父层后续条件**（实测 B1/B3） | 可解析的包被判"算不了" |
| 3 | 条件集含 `default` 且把 `types` 当条件 | 实测：`node-addons`/`module-sync` 参与，`types`/`browser`/`development` 不参与（Q1–Q4/F2） | 条件集错位 |
| 4 | 通配缺"不等于 patternBase"与长度下界 | 原文两条都写了；实测 `./a/*` 对 `./a/`、`./a*b` 对 `./ab` 均不命中（C1/C2/C3） | 空片段误命中 |
| 5 | （同构，保留） | `PATTERN_KEY_COMPARE`：`*` 下标大者优先，同则键长者优先 | — |
| 6 | 通配目标只替换第一处 `*` | 原文"every instance"；实测 `./src/*/idx-*.js` 全替换（T1） | 多 `*` 目标错 |
| 7 | 数组遇 `null` 立刻 unparseable | 原文/实测：`null`/invalid/unmatched 一律**继续**；空数组才屏蔽（D1–D6/P5/P6） | 与实测相反 |
| 8 | 未校验目标须 `"./"` 开头 | 原文第一步；实测 `{".","index.js"}` → `ERR_INVALID_PACKAGE_TARGET`（P1） | 裸路径被当合法 |
| 9 | 末尾斜杠键 / 多 `*` 键也升级成整包 unparseable | 实测：这两类键 Node **忽略**，其余入口照常（E1/E2） | 正常入口一起失效 |
| 10 | `exports: null` 当成屏蔽 | 等同未声明，回落 main（实测 G1） | 语义反了 |

> 完整表格带官方原文锚点见 **`data/README.md` §5.4**；每条测试向量标注实测编号见 `tests/resolve.test.mjs`。
> **这 10 条是判定面的唯一实现依据**，不要在 M2 里"再理解一遍 Node 文档"。

### 第二个发现：`commander` 与 `chalk` 不是同类（M0 记错了）

M0 的 `HANDOFF-M0.md` §一 把 `chalk` / `commander` 并列成"无 require 分支 → MISMATCH"。
M1 用真实包实测推翻了这个并列：

```
require("chalk")      → ns.red === undefined；ns.default.red === function   → 真缺陷
require("commander")  → ns.Command === function；ns.default === undefined   → 不是缺陷
```

两者**都**没有 `require` 分支，但判定**相反**。所以 §5.2 第 4 条（"属性挂在命名空间 vs `.default`"）
不是装饰条款——**只看第 2 条会把 `commander` 误判成 MISMATCH（系统性假阳性）**。
记录在 `data/README.md` §5.4.1，C3 语料用"1 红 4 绿"形状钉住。

### 第三个发现：脱敏门的 `SKIP_DIRS` 与 `.gitignore` 不对齐（收尾自检抓到的真缺陷）

M1 收尾核对时发现脱敏门的扫描数从 **70** 跳到 **137** 个文件。查明原因：
`.mimosa/`（工具 hook 的会话状态目录，79 个文件）已在 `.gitignore` 里声明，
但**没进**脱敏门的 `SKIP_DIRS`。

这不是笔误——门自己在源码注释第 ④ 条就写着「`.gitignore` 声明的每个本地目录这里都要有对应项」，
**但这条纪律靠人记**。它今天恰好没有命中项，所以门照绿；那只是运气，
会话状态里随时可能写入本机绝对路径。

修法与自证（都不是"改一行算完"）：

| 动作 | 落在哪 | 自证方式 |
|---|---|---|
| 补齐 `SKIP_DIRS`（14 项：`.mimosa`/`.vscode`/`.idea` + Python 模板残留段 11 项） | `tools/check-desensitized.mjs` | 扫描数从 137 → 59（= 去掉本地环境文件） |
| 把纪律变成机器判据 | `tests/gate-selfcheck.test.mjs`（4 条） | 读 `.gitignore` 逐条对账，漏一项即红；另有一条钉住 `.mimosa` 不许删回去 |
| 加一组变异证明判据非空转 | `tools/mutate-gates.mjs` D5 | 见下 |

**D5 非空转已实测证明**（在临时副本里做，不碰工作树）：

```
无 .mimosa 时基线        : 扫 36 个文件，0 命中
从 SKIP_DIRS 移除 .mimosa : 扫 37 个文件，1 处命中 → FAIL .mimosa/hook-state/leak.txt [absolute-session-path]  rc=1
```

> ⚠️ **本轮踩过的操作坑**：为做上面这个验证，我先在工作树里直接改了门文件再用
> `git checkout tools/check-desensitized.mjs` 恢复 —— 结果把**本轮尚未提交的两处修改一起冲掉了**
> （`git checkout` 恢复的是已提交版本，不是"我改之前的状态"）。
> 正确做法：**在临时副本里做破坏性验证**（如上），或用 `git stash`。已重做并复验。

### 第四个发现：交接单「下一棒启动命令」的 off-by-one（用户实测撞到）

用户按 M0 收尾给的命令 `/goal 读取 "…\plan\HANDOFF-M1.md"` 启动本棒时，
`HANDOFF-M1.md` **还不存在** —— 于是本棒被迫从零重建状态（读 README + plan/00/05/06 + M0 交接单）。

**根因不是"M1 忘了写 HANDOFF-M2"**，而是这条启动命令本身错：
`HANDOFF-M<k>` 的 `k` = **刚完成的里程碑号**（`AGENTS.md` §一/§二 + 每份交接单第 4 行的自我声明），
**下一棒的待办就写在本文件 §三 里**，所以启动命令必须指向**本文件自己**。

- M0 写成了 `HANDOFF-M1.md`（当时不存在）→ 用户读到空。
- M1 **照抄了这个 bug**，写成 `HANDOFF-M2.md`（现在同样不存在）→ 下一棒会再撞一次。

修法：两处指针都改为指向自己（M0 那处按"追加事实、不回填美化"记更正，不篡改原文）；
并把口径变成机器判据 —— `tests/handoff-pointer.test.mjs`（5 条）：

| 判据 | 防什么 |
|---|---|
| 启动命令行必须指向**本文件自己的编号** | off-by-one（本次缺陷） |
| 启动命令行引用的文件必须**当前存在** | 读空文件 |
| 标题编号 == 文件名编号 | 复制上一份后忘改标题 |
| 每份都有 "k = 刚完成的里程碑号" 口径声明 | 口径漂移（它是"指向自己"的依据） |
| 至少两份交接单（阳性对照） | 判据空跑 |

**非空转已实测证明**（临时副本里做）：把 M1 的启动命令改回 `HANDOFF-M2.md`
→ 基线 5 pass / 0 fail 变成 **3 pass / 2 fail**，报错精确指出
「HANDOFF-M1.md 的「下一棒启动命令」指向 HANDOFF-M2，应指向本文件 HANDOFF-M1」。

> ⚠️ 判据面只取**启动命令那一行**，不扫全文：`§三 下一棒待办` 里写
> 「M2 收尾时写 `plan/HANDOFF-M2.md`」是**正当的前瞻引用**，把它判红就是靶子瞄错
> （同族：本文件 §五 记的"变异靶子必须落在判据的实际扫描面上"）。

### 招牌发现汇总（M1 四条）

1. M0 的 `resolve.mjs` 有 **10 处**与 Node 官方解析算法不符（已全部修正，`data/README.md` §5.4）
2. M0 把 `chalk` 与 `commander` 记成同类 —— 实测判定**相反**（§5.4.1）
3. 脱敏门的 `SKIP_DIRS` 漏了 `.gitignore` 声明的本地目录（已修 + 变成机器判据）
4. 交接单「下一棒启动命令」off-by-one（已修 + 变成机器判据 `tests/handoff-pointer.test.mjs`）

## 二、当前事实 · 状态不变量（下一棒动手前必须知道）

1. **`data/README.md` §5.4 的 10 条 = 判定面唯一实现依据**。`src/resolve.mjs` 已按官方算法重写。
   **不要按 `packages.html` 的措辞自己再推导一遍**——那一页只有声明层语义，解析层在
   `esm.html#resolution-algorithm-spec` 的伪代码里。M0 就是在只看前者时错的。
2. **`resolveConditional` 的返回值是 `state` 枚举（`ok`/`blocked`/`unmatched`/`invalid`），
   不再是 `{ok, target}`**。调用方 `src/check.mjs` 已对齐。新增调用点必须区分这四态：
   `blocked` → `NOT-EXPORTED-SUBPATH`；`unmatched`/`invalid` → gap（算不了），**不判 MISSING**。
3. **`matchSubpath` 返回 `{kind, value, key, patternMatch}`** —— `key` 取代了 M0 的 `patternKey`，
   且新增 `patternMatch`。`substituteWildcard(patternKey, subpath, target)` 会替换**全部** `*`。
4. **`buildExportsIndex` 返回新增第三字段 `ignored`**：被 Node 忽略的键（末尾斜杠 / 多 `*`）留档给证据，
   **不参与匹配，也不算 unparseable**。别把 `ignored` 拼进 `unparseable`。
5. **`LIMITS` 是阈值的代码镜像**（`src/contract.mjs`）：`EXPORTS_KEYS = 4096`、
   `SOURCE_FILE_BYTES = 524288`。**唯一定义在 `data/README.md` §5.3**；改一处不改另一处，
   `tests/thresholds.test.mjs` 会红（双向断言）。
6. **字符串兜底必须去重**：`require("chalk")` 里的 `"chalk"` 也形似包名，但它已被 `require`
   结构化抽取覆盖。M1 实测踩过（重复计入 → C3 对照组多出一条 → cli 测试红）。
   现实现按 `file+line+specifier` 三元组去重，见 `src/scan.mjs`。
7. **`data/packages/*.json` 是生成器产物，禁手改**。改它唯一方式 = 改生成器再重跑 `--check`。
   每份件含 `canonical`（规范化串）+ `fingerprint`，任何人可复算。
8. **`date-fns.json` 有 353 KB / 741 个子路径**——这是**真实数据**不是缺陷。
   `package.json` 的 `files` 字段不含 `data/`，不影响 npm 包体。
9. **`fixtures/*/expected.json` 的逐点 `evidence` 是 M1 留下的欠债**（标记 `toFillIn: "M2"`）。
   真值纪律（`plan/04` §3 第 2 条）要求每项有原文片段或文件+行号，**不得只给结论**。
   M2 必须按 case 所属里程碑补齐：C1–C5 在 M2、C6 在 M3、C7 在 M4。
10. **M1 不伪造历史指纹**。C6（`drift`）的旧版本一侧必须由用户显式提供的离线包填充，
    M1 只定义判定形状。**伪造历史指纹 = 伪造真值**。
    同族纪律：**不要为了"让指针看起来对"去补写下一棒的交接单**——
    现在写 `HANDOFF-M2.md` 等于提前伪造 M2 的收尾记录（M2 的 DoD 一条都还没做）。
    正确做法是修指针，让启动命令指回本文件。
11. **`PENDING_TOOLS` 当前只剩 1 条**：`tools/check-release.mjs`(M6)。
    `gen-fingerprints.mjs` 那条已随落位同笔删除（K10 纪律）。
12. **`tests/` 现在是 10 个文件**，两处登记（`package.json` `scripts.test` + `.github/workflows/ci.yml`）
    已同步。**新增测试文件必须同笔登记两处**，否则 `LAYOUT.TESTS` 红。
13. **本仓库根现在有 `node_modules/`**（M1 为跑 `--check` 与真实包实测装的，
    `npm i --no-save`，**未写进 `package.json`**）。它被 `.gitignore` 封，不影响零依赖承诺；
    但 `node_modules` 存在会让 `depcheck-live check .` 自身扫到真实包。**别把它当交付面。**
14. **脱敏门的 `SKIP_DIRS` 必须与 `.gitignore` 的本地目录对齐**（门注释第 ④ 条）。
    新增一个 `.gitignore` 本地目录 → 同一笔加进 `SKIP_DIRS`，否则
    `tests/gate-selfcheck.test.mjs` 会红（它读 `.gitignore` 逐条对账，不靠人记）。
    `.mimosa` 那条尤其别删回去——变异组 D5 用"在 `.mimosa/` 里放假命中项、期望门保持绿"
    钉住它；D5 是**期望绿**的组，判定它非空转的方式见本文件 §一 第三个发现。
15. **做破坏性验证别在工作树里改文件再用 `git checkout` 恢复**：本仓当前没有"改之前的快照"，
    `git checkout <file>` 恢复的是**已提交版本**，会把本轮未提交的修改一起冲掉（M1 踩过）。
    正解：复制到临时目录验证（`tools/mutate-gates.mjs` 就是这么做的），或先 `git stash`。

## 三、下一棒待办（M2 解析层）

按序执行，不跳步：

1. **先跑 D1 回归**：`npm test`（期望 104/104）+ `node tools/gen-fingerprints.mjs --check`（期望 5/5）。
   D1 的 10 条若被改回旧口径，`tests/resolve.test.mjs` 会立刻红——**别改测试去迁就实现**。
2. **补 `fixtures/*/expected.json` 的逐点 evidence**（C1–C5 归 M2）：每项给出
   `exports` 字段原文片段 + 入口目标文件里的导出行号。这是 `data/README` §5.4 与语料之间的可执行链接。
3. **`scan.mjs` 落地三种边界测试**（`plan/05` M2 DoD）：宽字符 / CRLF / 超长行，
   **行号必须仍指向源行**。现有 `tests/scan.test.mjs` 已有 CRLF 与宽字符各一条，M2 补超长行。
4. **`snapshot.mjs` 对五个真实包 + 六份语料 `UNPARSEABLE = 0`**（M2 DoD）：
   用 `node_modules/` 里的真实包跑一遍 `depcheck-live snapshot`，确认 `parseState` 全 `OK`。
   ⚠️ 注意 `commander` 与 `chalk` 的 `exports` 是 sugar 形态（条件键全非子路径），
   走 `buildExportsIndex` 的 sugar 分支。
5. **`fixtures/<case>/src/` 与 `package.json` 落地**：M1 只落了 `INPUT.md` + `expected.json`，
   真正的源码文件（`src/against-chalk.cjs` 等）与每 case 的 `package.json` 要在 M2 建。
6. **超长行降级路径验证**：`LARGE_FILE_DOWNGRADED` 的 gap 目前只在 `scanSources` 里按字节数判，
   M2 要有一个真实 >512 KiB 的文件用例证明它真的进了 gaps。
7. **收尾**：DoD 验证 → `plan/00`/`05`/`06` 状态回写 → **写 `plan/HANDOFF-M2.md`（M2 收尾时才写，
   不是现在）** → commit。写完把 `plan/HANDOFF-M2.md` 的「下一棒启动命令」指向**它自己**。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11 全部继续有效（见 `plan/HANDOFF-M0.md` §四），M1 新增：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| K12 | `exports` 解析语义 = §5.4 的 10 条；条件匹配按**目标对象键序**，不是优先级数组 | `src/resolve.mjs` | `tests/resolve.test.mjs`（形态②b 换键序） |
| K13 | `resolveConditional` 返回 `state` 四态（`ok`/`blocked`/`unmatched`/`invalid`） | `src/resolve.mjs` + `src/check.mjs` | `tests/resolve.test.mjs` + `tests/cli.test.mjs` |
| K14 | 阈值唯一来源 §5.3；代码镜像 `LIMITS`；**双向断言** | `src/contract.mjs` `LIMITS` | `tests/thresholds.test.mjs`（文档↔代码） |
| K15 | 指纹件含 `canonical`，可独立复算；生成器与 `resolve.mjs` 规范化口径**同构** | `tools/gen-fingerprints.mjs` | `tests/fingerprints.test.mjs` |
| K16 | 字符串兜底 = 双条件（形似包名 **且** 命中已装依赖）+ 按 `file+line+specifier` 去重 | `src/scan.mjs` `findBarePackageLiterals` | `tests/thresholds.test.mjs` + `tests/cli.test.mjs` 对照组 |
| K17 | `ESM-CJS-MISMATCH` 第 4 条必须看**符号所在层**；`commander` 不得判 MISMATCH | `src/check.mjs` | `tests/cli.test.mjs` 对照组 + `fixtures/esm-cjs-mismatch` |
| K18 | 五包指纹件**禁手改**；改它只能改生成器 + 重跑 `--check` | `tools/gen-fingerprints.mjs` | `tools/gen-fingerprints.mjs --check` + `tests/fingerprints.test.mjs` |
| K19 | 脱敏门 `SKIP_DIRS` 必须覆盖 `.gitignore` 的每个本地目录 | `tools/check-desensitized.mjs` | `tests/gate-selfcheck.test.mjs`（逐条对账）+ 变异组 D5 |
| K20 | 破坏性验证在临时副本里做，不用 `git checkout` 恢复工作树 | 约定（见 §二.15） | —（操作纪律，机器判不了） |
| K21 | `HANDOFF-M<k>` 的 `k` = 刚完成的里程碑号；「下一棒启动命令」必须指向**本文件自己** | 约定 + `AGENTS.md` §一 | `tests/handoff-pointer.test.mjs`（5 条） |

## 五、本机环境坑（只写实测过的，2026-11-01）

1. **`/tmp` 在 Git Bash + Node 上不可用**：`curl -o /tmp/x` 写到 `C:\tmp`，而 `node -e` 读
   `/tmp/x` 会解析成 `C:\tmp\x` → `ENOENT`。本轮 D1 探针文件一律落在仓库内 `tmp/d1/`（已 gitignore）。
2. **探针里的 `require` 解析根 = 脚本所在位置的 `node_modules` 链**：
   把探针放在安装目录**外面**跑，`require("chalk")` 会 `MODULE_NOT_FOUND`（本轮踩过）。
   正解：探针文件**放进安装目录**，或用 `createRequire(join(cwd,"x.cjs"))`。
3. **ESM 脚本里没有 `require`**：`node probe.mjs` 里直接写 `require(...)` 会 `ReferenceError`。
   要测 CJS 视角就用 `createRequire`，并注意 `import()` 的解析根是**脚本位置**不是 cwd。
4. **通配目标的探针必须落实体文件**：`"./f/*": "./src/*.js"` 若只写键不建文件，
   `require.resolve` 会报 `MODULE_NOT_FOUND`，与"导出语义不命中"混在一起（本轮首跑踩过）。
   正解：把 `*` 换成实际片段一起建出来。
5. **`npm view` / `npm i` 可用**（本轮实跑过 `npm i chalk@6 zod@4 date-fns@4 commander@15 glob@14`）。
   装包用 `--no-save`，**别让 `dependencies` 变非空**——CI 有零依赖断言步。
6. **`node --test` 的目录/glob 形式不要用**（M0 已记）：一律逐文件列出，`LAYOUT.TESTS` 对账。
7. **改一门必须重跑变异宿主**：`node tools/mutate-gates.mjs`。M1 改的是 `check-sprint-layout.mjs`
   的 `PENDING_TOOLS`（删一条登记），变异组 L1–L11 的基线判据是全绿 → 删登记后仍应全绿。
8. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   本项目所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。

## 六、DoD 逐项 checklist

| # | DoD 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | D1 核对完成：六形态逐条对照，写入 `data/README` §1 与 §5 | ✅ | §1 D1 改 ✅；§5.4 10 条结论；双源（原文 + 本机实测） |
| 2 | `data/packages/` 五包指纹入库 | ✅ | `chalk@6.0.1` / `zod@4.6.7` / `date-fns@4.4.0` / `commander@15.0.0` / `glob@14.0.3` |
| 3 | 六份 `fixtures/*/INPUT.md` + `expected.json` 定稿 | ✅ | C1–C7 齐；每份声明验证哪条 + 为什么能证伪；`tests/fixtures.test.mjs` 9 条 |
| 4 | 生成器产出确定：`--check` 逐字节一致（双跑比对） | ✅ | `gen-fingerprints --check: 5/5 份逐字节一致` |
| 5 | 口径回填：§5.3 三行改具体数值（欠债清零） | ✅ | 4096 键 / 512 KiB / 双条件；`LIMITS` 镜像；`tests/thresholds.test.mjs` 双向 |
| 6 | `npm test` 本地全绿 | ✅ | **104 passed / 0 failed / 0 skipped** |
| 7 | 三道门全绿 | ✅ | layout 10 条 PASS / desensitized 0 命中 / mutations 18 组符合预期 |
| 8 | 状态副本三处一致 | ✅ | `plan/00` §4 + `plan/05` §1 + `plan/00` §3 台账；`LAYOUT.STATUS` + `LAYOUT.LEDGER` PASS |
| 9 | CI 实跑 | ⬜ **不适用** | 无远端，**未跑 CI**；本地等价校验见 §一 |
| 10 | 交接单指针指向**本文件自己**（用户实测撞到的缺陷） | ✅ | 两处指针已修；`tests/handoff-pointer.test.mjs` 5 条；非空转已证（改回 M2 → 2 红） |

> 第 9 项按诚实口径写：**无远端 = 未跑 CI**，不得写"CI 绿"。
> M6 首推后据实补记真实 run id（补记是追加事实，不回填美化本节措辞）。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs      # 布局门，期望 rc=0 全绿
node tools/check-desensitized.mjs       # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs             # 变异验证，期望 18/18 符合预期

# 测试
npm test                                # 期望 104/104（M2 起会增加）

# 指纹（M1 新增）
node tools/gen-fingerprints.mjs --list              # 列五包 + 指纹，不读写文件
node tools/gen-fingerprints.mjs --check             # 校验：逐字节一致（期望 5/5）
node tools/gen-fingerprints.mjs                     # 重算并写入（改了生成器才用）
node tools/gen-fingerprints.mjs --from <dir>        # 从指定 node_modules 读

# CLI
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs check .
node bin/depcheck-live.mjs check . --json
node bin/depcheck-live.mjs --help

# 五包安装（跑 --check / 真实包实测时需要；--no-save 保零依赖承诺）
npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**下一棒启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M1.md" 继续完成任务`

—— **就读本文件**（`plan/HANDOFF-M1.md`）。`HANDOFF-M<k>` 的 `k` 是**刚完成的里程碑号**，
所以下一棒的待办写在**本文件 §三**里；下一棒收尾时才写 `plan/HANDOFF-M2.md`。
⚠️ 此处曾是 off-by-one 缺陷：M0 写成 `HANDOFF-M1.md`（当时不存在），M1 照抄成 `HANDOFF-M2.md`
—— 导致下一棒读空文件、被迫从零重建状态。已由 `tests/handoff-pointer.test.mjs` 钉住。