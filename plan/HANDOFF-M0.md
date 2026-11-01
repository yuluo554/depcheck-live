# HANDOFF-M0 — 计划套件 + 方法论装订 + 可运行骨架

> 本文件是 **M0 这一棒的收尾交接单**（`k = 刚完成的里程碑号`）。
> 入库路径一律相对：`plan/HANDOFF-M0.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据

M0 已全部完成。逐项证据（全部为**本机实跑**，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| 装订件①仓库锚点 | `AGENTS.md` | 布局门 `LAYOUT.FILES` PASS |
| 装订件②布局门 | `tools/check-sprint-layout.mjs`（10 条判据） | `node tools/check-sprint-layout.mjs` → 全绿 |
| 装订件③顶部一行 | `plan/00` 第 3 行 | `LAYOUT.BINDING_HEAD` PASS |
| 计划套件 | `plan/00`–`06` + `data/README.md` | `LAYOUT.FILES` 11 份齐备 / `LAYOUT.SECTIONS` 8 份小节齐备 |
| 脱敏门 | `tools/check-desensitized.mjs`（4 条规则） | 扫 36 个文本文件 0 命中 |
| 变异验证宿主 | `tools/mutate-gates.mjs`（17 组） | 见 §六 |
| 可运行 CLI | `bin/depcheck-live.mjs` + `src/`（10 个模块） | `npm test` 55/55 pass |
| 零依赖承诺 | `package.json` 的 `dependencies`/`devDependencies` 均为空 | `LAYOUT.TESTS` PASS + CI 有零依赖断言步 |
| 真实包对照冒烟 | `chalk@6` / `zod@4` / `commander@15` 实装后跑 `check` | 见 §一"招牌判据实测" |
| CI | `.github/workflows/ci.yml`（layout + test 三版本两平台矩阵） | **从未实跑（无远端）**，见 §四 |

**M0 实测数字**：`npm test` = **55 passed / 0 failed**；布局门 **10 条判据**；
脱敏门 4 条规则；变异组 **17**（15 正 + 2 阴性对照）。

### 招牌判据实测（真实包，2026-11-01，本机 Node v24.15.0）

在临时目录 `npm i chalk@6 zod@4 commander@15`（临时目录用完即删，不入仓）后，对同一份
CommonJS 探针 `probe.cjs`（5 个引用点）跑 `depcheck-live check .`：

```
depcheck-live · 引用点 5 个
  已解析 1 · 判定问题 4 · 不可静态判定 0 · 算不了 0
  ESM-CJS-MISMATCH: 3   NOT-EXPORTED-SUBPATH: 1   RESOLVED: 1
rc=1
```

逐点结果：`require("chalk")` → MISMATCH；`require("zod")` → **RESOLVED**；
`require("commander")` → MISMATCH；`require("chalk")` 解构 `notARealExport` → MISMATCH；
`require("chalk/package.json")` → NOT-EXPORTED-SUBPATH。

**独立核验**（同机 `node -e`，不经本工具）：

```
typeof object | red: undefined | default.red: function      # chalk 的 API 在 .default 下
zod namespace has z: object | keys [ 'z','default','core','globalRegistry' ]  # zod 在命名空间上
ERR_PACKAGE_PATH_NOT_EXPORTED                                # chalk/package.json 被屏蔽
```

**这就是"同代码不同包对照组"**：同一份 `require(...)` 写法，对 `chalk`/`commander` 判 MISMATCH、
对 `zod` 判 RESOLVED——判据精确落在 `exports` 的 `require` 分支存在性上，而不是 `type` 字段。

## 二、当前事实 · 状态不变量（下一棒动手前必须知道）

1. **实现语言已由 Python 改为 Node 24 零依赖 ESM**（用户 2026-11-01 拍板）。
   `plan/00` §2.1 第 6 行 + `AGENTS.md` §四 已同步。**别再按 `pyproject.toml` / `pytest` 布局**——
   这个仓库里没有也不会再有 Python 交付面，`.gitignore` 的 Python 段是模板残留（无害，别删也别扩）。
2. **版本唯一定义处 = `package.json` 的 `version`**（`src/version.mjs` 是唯一读取点，
   用 `readFileSync` + `JSON.parse`，**不要**改成 `import ... with { type: "json" }`——import
   attributes 语法在 node 20/22/24 不一致）。定版时改它，`tools/check-release.mjs`（M6）对账 tag。
3. **`README.md` 不承载里程碑状态**。布局门的 `STATUS_COPIES` 只有 2 张表
   （`plan/00` §4 里程碑表、`plan/05` §1 状态表）+ 台账 = 3 处副本。**别把 README 加回 `STATUS_COPIES`**，
   它若贡献 0 行会让"配置 3 处 / 实判 2 处"重新出现（假门族 ⑪）。
4. **`EXEMPT_MILESTONES = []`、`HANDOFF_FORMAT_FROM = 0`**：M0 **不豁免**交接单。
   别为了省事把它加进豁免列表——那会让 `LAYOUT.HANDOFFS` 在最需要活靶子的前期空转。
5. **判定态与退出码的唯一真相源是 `src/contract.mjs` + `data/README.md` §5**。
   M5 的 `SKILL.md` 契约块必须与前者双向断言。**新增判定态要同轮改三处**
   （`data/README.md` §5 / `src/contract.mjs` / `SKILL.md`），否则 M5 的 `tests/contract.test.mjs` 会红。
6. **`ESM-CJS-MISMATCH` 判据是 `exports` 的 `require` 分支存在性，不是 `type` 字段**。
   `src/check.mjs` 已实现 §5.2 全部四条；`tests/cli.test.mjs` 的对照组钉住了
   "同代码对 chalk 判 MISMATCH、对 zod 判 RESOLVED"。**改这一段前先读 `data/README.md` §5.2**。
7. **`findings` 含 `RESOLVED`**，`summary.problems` 才是问题计数。
   写断言时别把 `findings.length` 当问题数（M0 就是这么踩过一次，见 §五）。
8. **`src/api.mjs` 末尾有 `import` 语句在函数体之间**（`describeExports` / `readJson` / `join`）。
   语法合法但顺序不整洁；M2 重构时**一并提到文件头**，别顺手改行为。
9. **`tools/mutate-gates.mjs` 在脱敏门的 `SELF` 豁免集合里**——它必须写出被判据禁止的字面量。
   **新增同类工具时把新文件名加进 `SELF` 集合**，别只加自己那一份（假门族 ㉒）。
10. **`PENDING_TOOLS` 当前 2 条登记**：`tools/check-release.mjs`(M6)、`tools/gen-fingerprints.mjs`(M1)。
    **落位脚本与删除登记必须在同一笔提交里**，否则中间态门是红的（stale 分支）。
11. **`LAYOUT.GAPS` 的列号按表头名「缺口」定位，不是取最后一列**（本仓 M0 实测修正）：
    抄模板的 `cells.length - 2` 读到的是**状态列**，"往缺口格写已完成里程碑"这条变异
    改的根本不是判据读的那一格 → 门照绿。变异组 L11 钉住这个实现决定——**别退回按末列读**。
12. **变异靶子的选择器必须与门同口径**：L7 首版替换 `| ✅ |` 命中了台账的**可达性列**
    （那里也是 ✅）而不是状态列，门因此照绿。正解 = 取 `cells.length - 2`（状态格）再改。
    判别 = **"我这条变异，能说出它改的是第几行的哪个字段吗？"**

## 三、下一棒待办（M1 数据先行）

按序执行，不跳步：

1. **D1 核对（最高优先）**：读 Node 官方 `packages.html#package-entry-points` 原文，
   把 `exports` 六形态**逐条**对照 `src/resolve.mjs` 的实现与 `tests/resolve.test.mjs` 的向量，
   把结论写进 `data/README.md` §1 D1（状态改 ✅）+ §5 补充引用节号。
   **未完成 D1 不得进入 M2**（`data/README.md` §1 已写死这条）。
2. **落位 `tools/gen-fingerprints.mjs`**：从五个真实包的 `package.json` 生成
   `data/packages/<pkg>.json`（裁剪：`name`/`version`/`type`/`exports`），
   支持 `--check`（重算与入仓件**逐字节一致**），**落位同笔删除 `PENDING_TOOLS` 里那条**。
3. **回填 `data/README.md` §5.3 三行欠债**（通配展开上限 / 单文件 AST 上限 / 字符串兜底抑制判据）
   —— 现在只有指向没有数值，`plan/06` 的 G1 挂在这里。
4. **六份语料骨架**：按 `plan/04` §2 的 C1–C7 建 `fixtures/<case>/INPUT.md` + `expected.json`。
   M1 只要求 `INPUT.md` 的"验证哪条 + 为什么能证伪"写清；`expected.json` 可在 M2 补全。
5. 收尾：DoD 验证 → `plan/00`/`05`/`06` 状态回写 → 写 `plan/HANDOFF-M1.md` → commit。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| K1 | 判定态枚举 = 5 个 + `NO-BASELINE`/`VERSION-BEHAVIOR-DRIFT`/`UNPARSEABLE` | `src/contract.mjs` | `tests/architecture.test.mjs`（枚举 ↔ data/README 对账） |
| K2 | 退出码 0/1/3/4，**2 保留不用** | `src/contract.mjs` `EXIT` + `src/api.mjs` `decideExit` | `tests/cli.test.mjs`（语义表 + 退出 0/1/3/4 各一条） |
| K3 | 退出码**只在** `bin/` + `src/cli.mjs` 决定 | 同上 | `tests/architecture.test.mjs`（AST 守门：6 个模块不得出现 `process.exit`） |
| K4 | 判定路径零写盘 | 同上 | `tests/architecture.test.mjs` |
| K5 | 源码不含时钟/随机 | 同上 | `tests/architecture.test.mjs` |
| K6 | `contract.mjs` 不 import 任何 `src/` 模块 | `src/contract.mjs` | `tests/architecture.test.mjs` |
| K7 | `src/` 只准 import `node:` 与相对路径 | 全部模块 | `tests/architecture.test.mjs` |
| K8 | 测试文件**逐文件**列在 `package.json` `scripts.test` 与 CI 两处 | `package.json` + `.github/workflows/ci.yml` | 布局门 `LAYOUT.TESTS` |
| K9 | 脱敏门自豁免 = 文件**集合** | `tools/check-desensitized.mjs` `SELF` | 脱敏门（新增同类工具会自命中） |
| K10 | `PENDING_TOOLS` 登记项在所属里程碑翻 ✅ 后必须删除 | `tools/check-sprint-layout.mjs` | 布局门 `LAYOUT.DOC_TOOLS` stale 分支 |
| K11 | 输出中不得出现绝对路径 / 盘符 | `src/paths.mjs` `toRelative` | `tests/paths.test.mjs` + `tests/cli.test.mjs`（"输出不含绝对路径"）+ 脱敏门 |

## 五、本机环境坑（只写实测过的，2026-11-01）

1. **本机 Node = v24.15.0，npm = 11.12.1**。`py -0p` 有 3.8.8 与 3.12 两条通道，
   但本项目**不用 Python**（见 §二.1）。CI 矩阵是 node 20/22/24，**本机只有 24** →
   跨版本结论**不能**由"本机能跑"推出，只能靠首推或 `npx -y node@20 …` 就地复现。
2. **`node --test <目录>` 在部分版本行为不同**（目录形式在 Git Bash + Node 24 上曾挂
   `MODULE_NOT_FOUND`）。本项目一律**逐文件列出**，并由 `LAYOUT.TESTS` 对账两处登记。
3. **`assert` 的对象要选对**：本项目 M0 实测一次真缺陷——把 `findings.length` 当"问题数"，
   而 `findings` 含 `RESOLVED` 条目 → 干净工程被判红。**问题数看 `summary.problems`**。
   同族（既有条）：对 `StringIO` 桩做 `in` 断言是"按整对象行匹配"，中文断言静默假失败。
4. **注释会被判据吃掉**：`tests/architecture.test.mjs` 首版直接对源码跑
   `/process\.(exit|exitCode)/`，被 `src/check.mjs` 头部注释里的"不碰 process.exit"命中 → 假红。
   **判据前先剥注释**（已在 `stripComments()` 做）。同族：假门族 ⑱。
5. **变异的靶子必须落在判据的实际扫描面上**：D1 首版往 README 写 `D:/scratch/out`，
   而脱敏门的 `absolute-session-path` 规则只认 `ProgramData|Users|zcode|repos|projects|Program`
   → 变异变绿，**看起来像判据弱、其实是靶子瞄错**。改成"落在规则词表那一档的路径形态"后如期红。
6. **Git Bash 下 `cd` 会跨工具调用残留**：每轮开头用绝对路径或先 `cd <仓库根>`。
7. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义。
   本项目所有门**读文件而非走 git 管道**，绕开整族 quotepath 坑。

## 六、DoD 逐项 checklist

| # | DoD 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | 装订三件齐（AGENTS.md / 布局门 / plan/00 顶部行） | ✅ | 布局门 3 条判据 PASS |
| 2 | `plan/00`–`06` + `data/README.md` 齐备且各含必需小节 | ✅ | `LAYOUT.FILES` 11 份 / `LAYOUT.SECTIONS` 8 份 |
| 3 | 待定决策表经用户拍板 | ✅ | 实现语言 = Node 24 零依赖 ESM（§二.1） |
| 4 | 可运行骨架（CLI 参数面 + 五模块接口 + 契约层） | ✅ | `npm test` 55/55 |
| 5 | 脱敏门落位且 0 命中 | ✅ | 扫 36 个文件 0 命中 |
| 6 | 两道门在 CI 里各有一条步骤 | ✅ | `.github/workflows/ci.yml` layout job 3 步 |
| 7 | 变异验证全组符合预期 | ✅ | 17 组：CAUGHT 17（含 2 阴性对照保持绿）/ MISSED 0 / SKIP 0 / ERROR 0 |
| 8 | 布局门在收尾态全绿 | ✅ | 10 条判据全 PASS，rc=0 |
| 9 | 招牌判据对真实包成立 | ✅ | `chalk`/`commander`→MISMATCH、`zod`→RESOLVED、`chalk/package.json`→NOT-EXPORTED-SUBPATH（§一 实测 + 独立核验） |
| 10 | CI 实跑 | ⬜ **不适用** | 无远端，**未跑 CI**；本地等价校验见 §四 K1–K11 + 三道门 |

> 第 10 项按诚实口径写：**无远端 = 未跑 CI**，不得写"CI 绿"。
> M6 首推后据实补记真实 run id（补记是追加事实，不回填美化本节措辞）。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs      # 布局门，期望 rc=0 全绿
node tools/check-desensitized.mjs       # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs             # 变异验证，期望全部 CAUGHT

# 测试
npm test                                # node --test 逐文件，期望 55/55（M1 起会增加）

# CLI
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs check .
node bin/depcheck-live.mjs check . --json
node bin/depcheck-live.mjs --help

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**下一棒启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M0.md" 继续完成任务`

—— **就读本文件**（`plan/HANDOFF-M0.md`）。`HANDOFF-M<k>` 的 `k` 是**刚完成的里程碑号**，
下一棒的待办写在**本文件 §三**里；下一棒收尾时才写 `HANDOFF-M<k+1>.md`。

> ⚠️ **更正（M1 收尾追加）**：本节原文写的是 `HANDOFF-M1.md`，那是 off-by-one 错误——
> 当时该文件不存在，导致下一棒读到空文件、被迫从零重建状态。原措辞保留在 git 历史里
> （`02bea05` 之前），此处按"追加事实、不回填美化"的纪律更正。
> 该缺陷已由 `tests/handoff-pointer.test.mjs` 钉住，不再靠人记。