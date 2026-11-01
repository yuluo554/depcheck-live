# HANDOFF-M5 — 交付：`SKILL.md` 契约块 + 技术报告 + demo GIF

> 本文件是 **M5 的入口文件**（`k` = **它开的那一棒**：进 M5 就读它）。
> 入库路径一律相对：`plan/HANDOFF-M5.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据（上一棒 M4 已交付什么）

M4（基准）已全部完成，`plan/00` §4、`plan/05` §1 与本文件三处状态副本一致（布局门 `LAYOUT.STATUS` 断言）。
逐项证据（本机实跑，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| `selftest` 命令真实落位 | `src/selftest.mjs` + `bin`（`selftest` 不再"尚未实现"） | `tests/selftest.test.mjs` 9 条；实跑 **8/8 断言，覆盖 0/1/3/4** |
| C7 干净工程可跑语料 | `fixtures/clean-project/` 的 `package.json` + `src/`（10 个形态） | `bench --clean` 实跑 **problems=0 / gaps=0 / totalPoints=7 / RESOLVED=7**，退出码 0 |
| `bench --clean` 落位 | `src/bench.mjs` 的 `CLEAN_CASES` + `benchAll({clean:true})` + `--clean` CLI 选项 | `tests/bench.test.mjs` 17 条；实跑 **7/7 引用点 + 14/14 断言** |
| 基准指标进 README（粒度如实） | `README.md`「基准指标」两节 | 逐条级 `28/28`+`7/7`；计数级 `49/49`+`14/14`；自检 `8/8` |
| 三处状态副本 + 三道具 | `plan/00`/`plan/05`/`plan/06` 回写 | 布局门 10 条全绿；脱敏门 0 命中；变异组 20/20 |

**M4 交付后的实测数字**（本机 2026-11-01）：
`npm test` = **196 passed / 0 failed / 0 skipped**（M3 收尾时 177，M4 新增 19）；
`bench` = 逐条级 **28/28**、计数级 **49/49**；`bench --clean` = 逐条级 **7/7**、计数级 **14/14**；
`selftest` = **8/8**（覆盖 `0`/`1`/`3`/`4`，`2` 保留不用）；
`gen-fingerprints --check` = **5/5**；`gen-baselines --check` = **1/1**；
脱敏门 **0 命中**（118 个文本文件）；布局门 **10 条全绿**；变异组 **20/20 CAUGHT**。

### M4 的两条招牌发现（M5 必须知道，否则会踩）

0. **★ "声明了但没人读" 是贯穿三棒的头号缺陷族。** M3 发现真值字段无人断言（5 个），
   M4 又发现两个同族问题：
   - `bench` **从不读 `expect`** —— `exitCode` / `summary` / `byStatus` 全是"没人读的真值"。
     测试全绿，但它们可以悄悄失配。M4 补了逐项断言，并用**临时副本变异**证明每条都会红。
   - `bench` 对**所有** case 无条件传 `--with-drift`，于是 C1–C3 的 `expect.summary.gaps=0`
     与真值调用形态**不同源**（drift 层凭空产出 NO-BASELINE，gaps 实际是 3/4，退出码会变 3）。
     M4 起每份真值必须显式声明 `expect.invocation`，bench 按它调用。
   **M5 写 `SKILL.md` 契约块时先自问：契约块里我声明的每个值，`tests/contract.test.mjs` 有哪条读它？**
   检查手法：`grep "<值>" src/contract.mjs tests/contract.test.mjs`，两边任一零命中就是假门。

1. **负向真值不能写成判定态。** C7 的"相对路径 / `node:` 内置 / 文案字符串"三条，
   M1 曾写成 `points[].status = "OUT-OF-SCOPE"` / `"NOT-A-REFERENCE"` ——
   这两个值**不是五判定态**（`src/contract.mjs` 的 `STATUS` 只有五个），
   永远进不了 `findings`，按 status 对账**必然失配**。
   M4 改成 `negativePoints` + `extractedAs` / `mustNotProduceProblem` 两条可断言的判据，
   并在 `tests/fixtures.test.mjs` 加了"negativePoints 里不得写 status"的纪律测试。
   **M5 写契约块时守住这条**：契约块只声明五判定态 + `drift` 两态，不要把"范围外"塞进枚举。

2. **`not-extracted` 的匹配键必须是 `file|line`，不是 `file|line|specifier`。**
   M4 修这条时实测：兜底误报抽出的 specifier **必然不等于**真值里写的那个
   （抽出 `chalk` 而非 `this is a chalk-like label`），按后者匹配会**永远查不到、恒绿**。
   已验证改回后者会漏报。**M5 若写"不得出现"类断言，先想清楚匹配键。**

## 二、当前事实 · 状态不变量（动手前必须知道）

1. **M4 已把"基准面"做完，M5 的活是"交付面"：`SKILL.md` 契约块 + 技术报告 + demo GIF。**
   **别推倒重写** `src/check.mjs` / `src/drift.mjs` / `src/bench.mjs` / `src/selftest.mjs`。
2. **`src/contract.mjs` 是 `SKILL.md` 契约块的对账方，且它不得 import 任何其它 `src/` 模块**
   （`tests/architecture.test.mjs` 断言这条）。契约块要能**单独加载 contract.mjs** 去对账。
3. **`plan/00` §5 四格表第 3 列现在写着 `src/api.mjs::run()`，但 `src/api.mjs` 里没有 `run`**
   （实测：只有 `checkAll` / `decideExit` / `driftCommand` / `decideDriftExit` /
   `decideSnapshotExit` / `decideScanExit`）。这是 M0 留下的悬空引用，**M5 必须处理**：
   要么补一个真正的编排入口，要么把四格表改指实际函数。**不许留着悬空**（测试若断言四格表
   指向的函数存在，会直接红）。
4. **五判定态 + `NO-BASELINE` + `VERSION-BEHAVIOR-DRIFT` + `UNPARSEABLE` 的枚举都在
   `src/contract.mjs`**，`SKILL.md` 契约块必须与它**双向**一致（两边各自都在对方那里出现）。
   `ERROR` / `OUT-OF-SCOPE` / `NOT-A-REFERENCE` **不是**枚举成员，别往契约块里塞。
5. **退出码 `0/1/3/4`，`2` 保留不用**（`data/README.md` §5.1 唯一定义）。
   `NO-BASELINE` 不算 problems，但**落退出码 3**（K29）。`selftest` 已把这四条锁住，
   契约块里的码表必须与 `EXIT` 常量逐值一致。
6. **`tests/` 现在是 18 个文件**，两处登记（`package.json` `scripts.test` + CI workflow）已同步。
   **新增 `tests/contract.test.mjs` 必须同笔登记两处**，否则 `LAYOUT.TESTS` 红。
7. **`data/fingerprints/*.json` 与 `data/packages/*.json` 是生成器产物，禁手改**（K31）。
8. **`fixtures/clean-project/` 现在是完整可跑语料**（C7），别的 case 的 `src/` 别去"对齐"它。
9. **README **不承载里程碑状态**（AGENTS.md §二 既定决定 1），但**可以写指标**——M4 已写「基准指标」两节。
   M5 若要往 README 加内容，只能加**能力与用法**，状态一律指向 `plan/05`。
10. **`docs/` 目录目前不存在**，`.gitignore` 已有 `!docs/**/*.md` 与 `!docs/demo/*.gif` 例外
   （说明这两类文件本就打算入库）。
11. **做破坏性验证别在工作树里改文件再用 `git checkout` 恢复**：恢复的是已提交版本，
    会冲掉本轮未提交的修改。正解：复制到临时目录（本仓 `tmp/` 下已有多个这种探针，可参照）。
12. **`/tmp` 在 Git Bash + Node 上不可用**：临时工程一律 `mkdtempSync(tmpdir())`，
    探针脚本本身放仓库内 `tmp/`（已 gitignore）。

## 三、下一棒待办 —— 本棒（M5）按序执行，不跳步

1. **先跑入口体检**（每个对话开头固定动作）：
   ```bash
   node tools/check-sprint-layout.mjs      # 必须全绿
   npm test                                # 期望 196/196
   node tools/gen-fingerprints.mjs --check # 期望 5/5
   node tools/gen-baselines.mjs --check    # 期望 1/1
   node tools/mutate-gates.mjs             # 期望 20/20
   node bin/depcheck-live.mjs selftest     # 期望 8/8
   node bin/depcheck-live.mjs bench --clean # 期望 1 语料 / 7 引用点 / 0 失败
   ```
2. **`SKILL.md` 落位 + 契约块双向断言**（DoD 第 1 条）：
   - 契约块必须含：五判定态、`NO-BASELINE`、`VERSION-BEHAVIOR-DRIFT`、退出码 `0/1/3/4`、六个命令名；
   - 新建 `tests/contract.test.mjs` 做**双向**断言（contract → SKILL、SKILL → contract 各一次），
     像 `tests/thresholds.test.mjs` 那样两边都读；
   - **注意 `LAYOUT.DOC_TOOLS` / `LAYOUT.SECTIONS` 不会因为新增 `SKILL.md` 而变**，
     但 `AGENTS.md` §二 的 `REQUIRED_FILES` 若不含 `SKILL.md`，那是既定口径，**别擅自加**。
3. **`plan/00` §5 四格表第 3 列修实**（见 §二 第 3 条）：
   - Agent Skill 行的「接到哪个业务函数」若写 `run()`，必须真有这个函数，或改成真实存在的函数名；
   - 该行「断言在哪条测试」必须指向 M5 新建的 `tests/contract.test.mjs`。
4. **技术报告 + demo GIF**（DoD 第 2 条）：
   - `docs/技术报告.md`：讲清判据（`ESM-CJS-MISMATCH` 的四条判据、`drift` 的符号级判据、
     五判定态的边界），数值一律引用 `data/README.md` §5，**不复制**；
   - `docs/demo/demo.gif`：真实终端录制（`check` / `drift` / `bench` / `selftest` 至少各一段），
     **不得**用伪造的静态图；
   - 两者都要过**脱敏门**（`node tools/check-desensitized.mjs` 0 命中）。
5. **`plan/00` §5 四格表逐格填绿**（DoD 第 3 条）：两行都不能有空列。
6. **收尾**（顺序固定，见 `AGENTS.md` §一）：
   DoD 验证 → `plan/00`/`05`/`06` 状态回写（M5 翻 ✅）→ **写 `plan/HANDOFF-M6.md`（M6 的入口，
   不是 HANDOFF-M5）** → commit。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11、M1 的 K12–K21、M2 的 K22–K26、M3 的 K27–K32、M4 的 **K33–K36** 全部继续有效。重点：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| K1 | 判定态枚举 = 5 个 + `NO-BASELINE`/`VERSION-BEHAVIOR-DRIFT`/`UNPARSEABLE` | `src/contract.mjs` | `tests/architecture.test.mjs` + `tests/drift.test.mjs` |
| K3 | 退出码**只在** `bin/` + `src/cli.mjs` 决定 | 同上 | `tests/architecture.test.mjs`（AST 守门） |
| K7 | `src/` 只准 import `node:` 与相对路径 | 全部模块 | `tests/architecture.test.mjs` |
| K8 | 测试文件**逐文件**列在 `package.json` 与 CI 两处 | 两处 | 布局门 `LAYOUT.TESTS` |
| K14 | 阈值唯一来源 §5.3；代码镜像 `LIMITS`；双向断言 | `src/contract.mjs` | `tests/thresholds.test.mjs` |
| K21 | `HANDOFF-M<k>` 是 **M<k> 的入口**（k = 它开的那一棒） | `AGENTS.md` + 布局门 | `LAYOUT.HANDOFFS` 两半边 + `tests/handoff-pointer.test.mjs` |
| K27 | `drift` 判据 = **符号行为** | `src/drift.mjs` | `tests/drift.test.mjs` + C6 |
| K28 | `drift` 判定单位 = **引用点** | 同上 | 同上 |
| K29 | `NO-BASELINE` 不算 problems，但**落退出码 3** | `src/api.mjs` | `tests/drift.test.mjs` + `selftest` |
| K30 | 同一引用点只许一条问题结论 | `src/api.mjs` | C6 的 `summary.problems === 1` |
| K31 | 基线是生成器产物，禁手改 | `tools/gen-baselines.mjs` | `tests/baselines.test.mjs` |
| K32 | 真值可**分层声明**（`status` / `driftStatus`），两层各自对账 | `src/bench.mjs` | C6 点 3 |
| **K33** | **真值字段必须有人读**：`expect` 里的每个字段要么被 bench 断言，要么在 `verifiedElsewhere` 里指名谁验 | `src/bench.mjs` + `tests/bench.test.mjs` | `tests/bench.test.mjs` 的"逐项读 expect" + "指针不许是空话" |
| **K34** | **调用形态由真值声明**（`expect.invocation`），bench 不猜；声明 `driftStatus` 的 case 必须 `with-drift` | `src/bench.mjs` | `tests/bench.test.mjs` 的 invocation 三条 |
| **K35** | **负向真值用 `negativePoints`**（`extractedAs` / `mustNotProduceProblem`），**不许写 `status`**（`OUT-OF-SCOPE`/`NOT-A-REFERENCE` 不是判定态） | `src/bench.mjs` + `fixtures/clean-project/expected.json` | `tests/fixtures.test.mjs` 的"真值纪律 2b" |
| **K36** | **"不得出现"类断言的匹配键 = `file\|line`**（含 specifier 会恒绿，因为误报抽出的 specifier 必然不等于真值） | `src/bench.mjs` | 反例已在 M4 实测（改回旧键则漏报） |

## 五、本机环境坑（只写实测过的）

1. **`/tmp` 在 Git Bash + Node 上不可用**：探针文件一律落仓库内 `tmp/`（已 gitignore）。
2. **Bash 里用 `node -e "…"` 时反引号会被 shell 当命令替换**：把脚本写到文件再 `node file`。
   引号套引号（尤其中文引号 + `'`）也会炸——**M4 实测踩到两次**，正解同上。
3. **`node --test` 不要用目录/glob 形式**：本项目一律逐文件列出，`LAYOUT.TESTS` 对账两处。
4. **改门必须重跑变异宿主**：`node tools/mutate-gates.mjs`（约 2–4 分钟）。
5. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。
6. **Windows 目录联接**：`symlinkSync(target, path, "junction")` 不需要管理员权限。
7. **M4 实测新增**：`readdirSync(dir, { recursive: true, withFileTypes: true })` 的条目上，
   父路径字段在不同 Node 版本是 `parentPath` 或 `path`（本机 v24 两个都在）。
   写跨版本测试时用 `entry.parentPath ?? entry.path`。
8. **M4 实测新增**：ESM 测试文件里**不许用 `require`**（本项目 `type: module`）。
   写探针/测试时若从 CJS 习惯抄过来会直接 `ReferenceError`——M4 踩过两次。
9. **M4 实测新增**：`bench` 的 `--clean` 若配在非 bench 命令上必须 exit 4（显式报错），
   **不许静默忽略**（静默忽略会让用户以为"只跑了干净集"）。

## 六、DoD 逐项 checklist（本棒出口判据）

| # | DoD 项 | 状态 | 证据 / 怎么验 |
|---|---|---|---|
| 1 | `SKILL.md` 契约块与 `src/contract.mjs` 双向断言通过 | ⬜ | 新建 `tests/contract.test.mjs`，两边各自读一遍对方 |
| 2 | `docs/技术报告.md`、`docs/demo/demo.gif` 落盘 | ⬜ | 文件存在 + 脱敏门 0 命中 + GIF 是真录屏 |
| 3 | `plan/00` §5 四格表逐格填绿 | ⬜ | 两行无空列；第 3 列指向真实存在的函数 |
| 4 | 三处状态副本 + 布局门 / 脱敏门 / 变异宿主全绿 | ⬜ | 三道门实跑 |
| 5 | CI 实跑 | ⬜ **不适用** | 无远端，未跑 CI；只写"本地等价校验 + 待首推验证" |

> 出口判据全部达成后，按 `AGENTS.md` §一 的固定顺序收尾，并写 **`plan/HANDOFF-M6.md`**（M6 的入口）。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs      # 布局门，期望全绿
node tools/check-desensitized.mjs       # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs             # 变异验证，期望 20/20

# 测试
npm test                                # 期望 196/196（M5 会再增）

# 指纹与基线
node tools/gen-fingerprints.mjs --check # 逐字节校验，期望 5/5
node tools/gen-baselines.mjs --check    # 基线自洽，期望 1/1

# CLI（M3/M4 起全部可用）
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs snapshot .
node bin/depcheck-live.mjs scan .
node bin/depcheck-live.mjs check . --json
node bin/depcheck-live.mjs check . --with-drift --baseline-dir data/fingerprints
node bin/depcheck-live.mjs drift . --baseline-dir data/fingerprints
node bin/depcheck-live.mjs bench        # 期望 6 语料 / 逐条级 28 / 计数级 49 / 0 失败
node bin/depcheck-live.mjs bench --clean # 期望 1 语料 / 逐条级 7 / 计数级 14 / 0 失败
node bin/depcheck-live.mjs selftest     # 期望 8/8，覆盖退出码 0/1/3/4

# 五包安装（跑 bench / --check 与真实包实测时需要；--no-save 保零依赖承诺）
npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**下一棒启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M6.md" 继续完成任务`

—— 读 `plan/HANDOFF-M6.md`（= **M6 的入口**）。本文件（`HANDOFF-M5.md`）是 M5 的入口，
M5 收尾时要写的下一份入口是 `HANDOFF-M6.md`（M6：发布 —— 脱敏 + 干净环境 + 建仓 + CI 首推 + tag + Release）。