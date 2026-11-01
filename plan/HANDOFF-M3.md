# HANDOFF-M3 — 判定层：五判定态收口 + `drift` + `bench`

> 本文件是 **M3 的入口文件**（`k` = **它开的那一棒**：进 M3 就读它）。
> 入库路径一律相对：`plan/HANDOFF-M3.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据（上一棒 M2 已交付什么）

M2（解析层）已全部完成，`plan/00` §4 与 `plan/05` §1 均已翻 ✅。逐项证据（本机实跑，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| 引用点抽取器（调用点 + 参数分类） | `src/scan.mjs` | `tests/scan.test.mjs` 12 条 + `tests/scan-edge.test.mjs` 9 条 |
| 导出集读取（最近 package.json 判类型 + 相对 re-export 递归） | `src/check.mjs` | C1–C5 逐点对账全绿 |
| `snapshot` / `scan` 命令真实落位 | `src/commands.mjs` + `bin/depcheck-live.mjs` + `src/report.mjs` | `tests/cli.test.mjs` 新增 6 条（含退出码与无绝对路径） |
| C1–C5 语料源码工程 + 逐点 evidence | `fixtures/<case>/src/`、`package.json`、`expected.json` | `tests/fixtures-run.test.mjs` 11 条逐点对账（真值级，非形状级） |
| 超长行 / 混合边界 | — | `tests/scan-edge.test.mjs` 3 条 |
| `LARGE_FILE_DOWNGRADED` 真实用例 | — | `tests/scan-large-file.test.mjs` 5 条（含边界 = 阈值不降级） |
| 语料目录纪律（禁依赖树） | — | `tests/fixtures-layout.test.mjs` 4 条 |

**M2 交付后的实测数字**（本机 2026-11-01）：
`npm test` = **140 passed / 0 failed / 0 skipped**；
五包 + 五份语料 `UNPARSEABLE = 0`、`gaps = 0`（DoD1）；
`gen-fingerprints --check` = **5/5 逐字节一致**；脱敏门 0 命中；
布局门 10 条判据；变异组 **20/20 CAUGHT**。

### M2 的四条招牌发现（M3 必须知道，否则会踩）

1. **M0 的"四条互补正则"有整族漏判**：`require("chalk" + suffix)`、`require("./" + x)`、
   `import("chalk" + s)` 三种形态被静默丢弃（`plan/03` §3.1）。
2. **解构 `require` 的 `imported` 曾恒为空**（下标错位），导致判定层把 C2/C3 的红条目全读成"不取符号"判绿。
3. **只看包根 `type` / 只看首层导出 = 真实五包全读成空导出集**：`glob` 的 `dist/commonjs/` 自带
   `type: commonjs`；`date-fns` 入口是 245 行 `export *` 桶。三条修法见 `plan/03` §4.3.1。
4. **`MISSING-EXPORT` 在 CJS 视角有固有边界**（见 `data/README.md` §5.4.2）：无 `require` 分支的包上，
   CJS 取不存在的符号**必然先命中 `ESM-CJS-MISMATCH`**。这不是缺陷，是判定顺序的结构性后果。
   **M3 描述判定能力与 `SKILL.md` 契约块时必须写明这条边界，不得宣称"CJS 取错名字报 MISSING-EXPORT"。**

## 二、当前事实 · 状态不变量（动手前必须知道）

1. **判定顺序（`plan/03` §4.4）已经在 `src/check.mjs` 实现并生效**：`AMBIGUOUS → NOT-EXPORTED-SUBPATH →
   ESM-CJS-MISMATCH → UNPARSEABLE → MISSING-EXPORT → RESOLVED`，首个成立者胜。
   **M3 的活不是"写判定层"，而是"收口 + 补 `drift` + 补 `bench`"。** 别推倒重写。
2. **`MISSING-EXPORT` 的固有边界**（见 §一 第 4 条 + `data/README.md` §5.4.2）。
   写 `bench` 反例集与 `SKILL.md` 时必须遵守，**不得**构造"CJS 取不存在符号 → MISSING-EXPORT"的用例。
3. **`readExportSurface` 已按最近 `package.json` 判模块类型 + 递归相对 re-export**。
   它只沿**相对**路径走；外部 re-export 仍记 `UNPARSEABLE`（口径不变）。**别加数量上限**——
   加新阈值就必须同轮改 `data/README.md` §5.3（数值唯一定义）。收敛靠 `seen` 去重。
4. **`findBarePackageLiterals` 有两条"让出"规则**（`plan/03` §3.2）：参数区内的字面量、以及
   被当作动态 specifier 用过的标识符的声明右值，都归调用点扫描器管。**动这条会同时打挂 C5 与 thresholds**。
5. **`scanAll` / `snapshotAll` 在 `src/commands.mjs`**，与 `check` 共用 `readProject` / `scanSources`。
   别在 `snapshot` 里另写一套解析（会让两个命令对同一个包给出不同事实）。
   `decideSnapshotExit` / `decideScanExit` 在 `src/api.mjs`：**只认事实层算不算得出来，永不返回 `PROBLEMS`**。
6. **`data/packages/*.json` 是生成器产物，禁手改**。改它唯一方式 = 改生成器再重跑 `--check`。
7. **`fixtures/<case>/node_modules` 永远不许入仓**（`tests/fixtures-layout.test.mjs` 会红）。
   实跑语料用 `tests/fixtures-run.test.mjs` 的临时目录 + 目录联接；往仓库里塞依赖树会让
   `tools/mutate-gates.mjs` 的整仓复制炸掉（M2 实测：20 组里 18 组 ERROR）。
8. **`tests/` 现在是 14 个文件**，两处登记（`package.json` `scripts.test` + CI workflow）已同步。
   **新增测试文件必须同笔登记两处**，否则 `LAYOUT.TESTS` 红。
9. **本仓库根有 `node_modules/`**（五包，`npm i --no-save`，未写进 `package.json`）。
   被 `.gitignore` 封，不影响零依赖承诺。**别把它当交付面。**
10. **脱敏门 `SKIP_DIRS` 必须与 `.gitignore` 的本地目录对齐**（门注释第 ④ 条）。
    新增 `.gitignore` 本地目录 → 同笔加进 `SKIP_DIRS`，否则 `tests/gate-selfcheck.test.mjs` 红。
11. **做破坏性验证别在工作树里改文件再用 `git checkout` 恢复**：恢复的是**已提交版本**，
    会把本轮未提交的修改一起冲掉。正解：复制到临时目录（`tools/mutate-gates.mjs` 就这么做）或先 `git stash`。
12. **`plan/06` §3 缺口表的"缺口"列里不要写已 ✅ 的里程碑号**（`LAYOUT.GAPS` 会把文件/状态引用当状态引用判红）。
    M2 踩过：写了"语料未落地（M1 只到骨架）"→ 门红。

## 三、下一棒待办 —— 本棒（M3）按序执行，不跳步

1. **先跑入口体检**（每个对话开头固定动作）：
   ```bash
   node tools/check-sprint-layout.mjs      # 必须全绿
   npm test                                # 期望 140/140
   node tools/gen-fingerprints.mjs --check # 期望 5/5
   node tools/mutate-gates.mjs             # 期望 20/20
   ```
2. **`drift` 落位**（`src/drift.mjs` 现为骨架，`bin` 里还写着"尚未实现（M3 落位）"）：
   - 口径见 `plan/03` §5：**只在有离线指纹时判定**；无指纹记 `NO-BASELINE` 进 gaps，**不猜**；
   - `NO-BASELINE` **不算"发现问题"**：`summary.problems` 不计它，但它进 `gaps`。
     ⚠️ 当前 `decideExit` 是"有 gaps → CANNOT_COMPUTE（3）"。`fixtures/drift-baseline/expected.json`
     的 `exitCodeWhenOnlyNoBaseline` 写的是 **0**——**这两处冲突**，M3 必须先判定口径
     （要么改 `decideExit` 对 `NO-BASELINE` 单开一支，要么改 C6 真值），
     **并同轮改 `data/README.md` §5.1 + `src/contract.mjs` + `SKILL.md` 三处**（判定态枚举冻结规则）。
     这条是本棒最容易出"改真值凑实现"的地方，按 `plan/04` §3 第 3 条处理。
   - `data/fingerprints/` 落位，历史指纹由用户**显式提供的离线包**填充，**不得伪造**（`plan/04` §4）。
   - C6 的 `src/` 与逐点 `evidence` 补齐（M2 只做了 C1–C5）。
3. **`bench` 落位**（`bin` 里现为"尚未实现（M3/4 落位）"）：
   - DoD 要求"全绿，含 chalk vs zod/glob 同代码不同包对照组"。C1–C5 已经是可跑的语料，
     `tests/fixtures-run.test.mjs` 里那套"临时目录 + 目录联接"就是 `bench` 的现成骨架——**复用它，别另写**。
   - 反例集必须遵守 §二 第 2 条的固有边界。
4. **五判定态收口**：逐条核对 `src/check.mjs` 与 `data/README.md` §5.2 / §5.4，
   确认 C1–C5 的 evidence 里每条 `rule` 指向的节号仍准确（M2 写的，M3 若改了判据要同轮改）。
5. **收尾**（顺序固定，见 `AGENTS.md` §一）：
   DoD 验证 → `plan/00`/`05`/`06` 状态回写（M3 翻 ✅）→ **写 `plan/HANDOFF-M4.md`（M4 的入口，
   不是 HANDOFF-M3）** → commit。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11、M1 的 K12–K21、M2 的 K22–K26 全部继续有效。本棒相关的重点：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| K1 | 判定态枚举 = 5 个 + `NO-BASELINE`/`VERSION-BEHAVIOR-DRIFT`/`UNPARSEABLE` | `src/contract.mjs` | `tests/architecture.test.mjs` |
| K3 | 退出码**只在** `bin/` + `src/cli.mjs` 决定 | 同上 | `tests/architecture.test.mjs`（AST 守门） |
| K7 | `src/` 只准 import `node:` 与相对路径 | 全部模块 | `tests/architecture.test.mjs` |
| K8 | 测试文件**逐文件**列在 `package.json` 与 CI 两处 | 两处 | 布局门 `LAYOUT.TESTS` |
| K12 | `exports` 解析语义 = §5.4 的 10 条；条件按**目标对象键序** | `src/resolve.mjs` | `tests/resolve.test.mjs` |
| K13 | `resolveConditional` 返回 `state` 四态 | `resolve.mjs` + `check.mjs` | `tests/resolve.test.mjs` + `cli.test.mjs` |
| K14 | 阈值唯一来源 §5.3；代码镜像 `LIMITS`；双向断言 | `src/contract.mjs` | `tests/thresholds.test.mjs` |
| K16 | 字符串兜底 = 双条件 + `file+line+specifier` 去重 + **两条让出规则** | `src/scan.mjs` | `tests/thresholds.test.mjs` + `fixtures-run`（C5） |
| K17 | `ESM-CJS-MISMATCH` 第 4 条必须看**符号所在层**；`commander` 不得判 MISMATCH | `src/check.mjs` | `cli.test.mjs` 对照组 + C3 |
| K21 | `HANDOFF-M<k>` 是 **M<k> 的入口**（k = 它开的那一棒） | `AGENTS.md` + 布局门 | `LAYOUT.HANDOFFS` 两半边 |
| **K22** | 引用点抽取 = **调用点 + 参数分类**（不是互补正则）；静态 = 纯字面量或不含插值的模板串 | `src/scan.mjs` `CALL_SITE`/`STATIC_ARG` | `tests/scan-edge.test.mjs` |
| **K23** | 解构 `require` 的 `imported` 以**调用点自身下标**为键 | `src/scan.mjs` | `tests/scan-edge.test.mjs`（6 条） |
| **K24** | 模块类型按**最近 `package.json`** 判；相对 re-export **递归**，外部仍 `UNPARSEABLE` | `src/check.mjs` `isEsmFile`/`readExportSurface` | C1/C3 的 date-fns 与 glob 条目 |
| **K25** | `snapshot`/`scan` 退出码只看事实层，**永不 `PROBLEMS`** | `src/api.mjs` | `tests/cli.test.mjs` |
| **K26** | 语料目录**只入仓交付文件**，禁 `node_modules` | `tests/fixtures-layout.test.mjs` | 该测试 + 变异宿主跑不动 |

## 五、本机环境坑（只写实测过的）

1. **`/tmp` 在 Git Bash + Node 上不可用**：探针文件一律落在仓库内 `tmp/`（已 gitignore）。
2. **探针的 `require` 解析根 = 脚本位置的 `node_modules` 链**：探针放在安装目录外面跑会
   `MODULE_NOT_FOUND`。正解：探针放进安装目录，或用 `createRequire(join(cwd,"x.cjs"))`。
3. **Bash 里用 `node -e "…"` 时反引号会被 shell 当命令替换**：M2 实测踩到
   （写带反引号的字符串时整段报 `command not found`）。正解：把脚本写到文件再 `node file`。
4. **`node --test` 不要用目录/glob 形式**：本项目一律逐文件列出，`LAYOUT.TESTS` 对账两处。
5. **改门必须重跑变异宿主**：`node tools/mutate-gates.mjs`（约 2–4 分钟）。
6. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。
7. **Windows 目录联接**：`symlinkSync(target, path, "junction")` 不需要管理员权限
   （`tests/fixtures-run.test.mjs` 靠它挂 `node_modules`）。用 `"dir"` 类型会需要开发者模式。

## 六、DoD 逐项 checklist（本棒出口判据）

| # | DoD 项 | 状态 | 证据 / 怎么验 |
|---|---|---|---|
| 1 | 五判定态 + `VERSION-BEHAVIOR-DRIFT` 实现 | 🟡 | 五判定态已由 M2 落地；`DRIFT` 仍待本棒 |
| 2 | `bench` 全绿，含 chalk vs zod/glob 同代码不同包对照组 | ⬜ | 复用 `tests/fixtures-run.test.mjs` 的临时目录骨架 |
| 3 | `drift` 无指纹时记 `NO-BASELINE`，不猜 | ⬜ | C6 逐点对账；**先解决 `NO-BASELINE` 与退出码的口径冲突**（§三 第 2 条） |
| 4 | C6 的 `src/` + 逐点 `evidence` 补齐 | ⬜ | 同 M2 对 C1–C5 的做法 |
| 5 | `data/fingerprints/` 落位（旧版本侧由用户显式提供） | ⬜ | **不得伪造历史指纹** |
| 6 | 三处状态副本 + 布局门 / 脱敏门 / 变异宿主全绿 | ⬜ | 三道门实跑 |
| 7 | CI 实跑 | ⬜ **不适用** | 无远端，未跑 CI；只写"本地等价校验 + 待首推验证" |

> 出口判据全部达成后，按 `AGENTS.md` §一 的固定顺序收尾，并写 **`plan/HANDOFF-M4.md`**。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs      # 布局门，期望全绿
node tools/check-desensitized.mjs       # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs             # 变异验证，期望 20/20

# 测试
npm test                                # 期望 140/140（M3 起会增加）

# 指纹
node tools/gen-fingerprints.mjs --list    # 列五包 + 指纹
node tools/gen-fingerprints.mjs --check   # 逐字节校验，期望 5/5

# CLI
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs snapshot .      # 事实层（M2 已可用）
node bin/depcheck-live.mjs scan .          # 引用点（M2 已可用）
node bin/depcheck-live.mjs check . --json  # 判定（M2 已可用）
node bin/depcheck-live.mjs drift .         # 待 M3

# 五包安装（跑 --check 与真实包实测时需要；--no-save 保零依赖承诺）
npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**下一棒启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M4.md" 继续完成任务`

—— 读 `plan/HANDOFF-M4.md`（= **M4 的入口**）。本文件（`HANDOFF-M3.md`）是 M3 的入口，
M3 收尾时要写的下一份入口是 `HANDOFF-M4.md`（M4：基准）。