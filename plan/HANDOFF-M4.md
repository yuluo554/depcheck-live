# HANDOFF-M4 — 基准：`selftest` + `bench --clean` + 基准指标进 README

> 本文件是 **M4 的入口文件**（`k` = **它开的那一棒**：进 M4 就读它）。
> 入库路径一律相对：`plan/HANDOFF-M4.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据（上一棒 M3 已交付什么）

M3（判定层）已全部完成，`plan/00` §4、`plan/05` §1 与本文件三处状态副本一致（布局门 `LAYOUT.STATUS` 断言）。
逐项证据（本机实跑，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| `drift` 命令真实落位 | `src/drift.mjs` + `src/api.mjs`（`driftCommand` / `decideDriftExit`）+ `bin` + `renderDrift` | `tests/drift.test.mjs` 12 条；C6 逐点对账 3 条 |
| `drift` 判据 = 符号行为、单位 = 引用点 | `data/README.md` **§5.5**（新增，唯一定义） | `tests/drift.test.mjs` 的"1 红 1 绿"条 |
| 离线基线落位（真实 tarball，未伪造） | `tools/gen-baselines.mjs` + `data/fingerprints/zod.json` | `tests/baselines.test.mjs` 8 条；`--check` = 1/1 自洽 |
| `bench` 命令真实落位 | `src/bench.mjs` + `bin`（`bench` 不再"尚未实现"） | `tests/bench.test.mjs` 8 条；实跑 **6 语料 / 28 引用点 / 28 通过** |
| C6 语料补齐（`src/` + `package.json` + 逐点 `evidence`） | `fixtures/drift-baseline/` | `tests/fixtures-run.test.mjs` 新增 3 条 |
| `NO-BASELINE` 退出码口径裁定 | `data/README.md` §5.1 + `plan/03` §5 纠正 + C6 真值 | `tests/drift.test.mjs` 的"只有 NO-BASELINE → 3"条 |

**M3 交付后的实测数字**（本机 2026-11-01）：
`npm test` = **174 passed / 0 failed / 0 skipped**（M2 收尾时 140）；
`gen-fingerprints --check` = **5/5 逐字节一致**；`gen-baselines --check` = **1/1 自洽**；
脱敏门 **0 命中**（扫 103 个文本文件）；布局门 **10 条判据全绿**；变异组 **20/20 CAUGHT**；
`node bin/depcheck-live.mjs bench` = **6 语料 / 28 引用点 / 28 通过 / 0 失败**。

### M3 的四条招牌发现（M4 必须知道，否则会踩）

1. **`drift` 的原骨架（按包比整份 `exports` 指纹）是系统性假阳性。**
   实测 `date-fns` 3.6.0 → 4.4.0 的 `.` 导出面 **251 个名字一个不少**（只新增 134 个子路径键）。
   整份指纹必然不同 → 按包比会把"纯加法升级"全判成漂移。**判据必须逐引用点求值**
   （`data/README.md` §5.5 第 3 条）。
2. **C6 的原真值（date-fns 3.x→4.x"旧 API 已删"）在真实数据上不成立。**
   M3 改用 `zod@3.25.76 → 4.6.7`（实测移除 31 个符号，真实 `require` 独立复核）。
   **这不是"改真值凑实现"，是真值本身错了**——按 `plan/04` §3 第 3 条同轮改了三处。
3. **一个引用点可以有两层各自正确的结论。** C6 点 3：`check` 层 `RESOLVED`（`addDays` 确实在）
   + `drift` 层 `NO-BASELINE`（没基线可比）。真值必须分 `status` / `driftStatus` 两层声明，
   `bench` 也必须分两层对账——挤进一个字段必有一方失声。
4. **同一引用点不许被算两遍问题。** `--with-drift` 时 `MISSING-EXPORT` 与 `DRIFT` 会同时命中同一个点，
   `summary.problems` 就被算两遍。M3 已改为"DRIFT 就地取代较粗的那条"（`src/api.mjs`）。
   **M4 写 `selftest` 的计数断言时要守住这条**。

## 二、当前事实 · 状态不变量（动手前必须知道）

1. **五判定态 + `drift` + `bench` 都已落位，M4 的活是"补自测 + 补干净工程基准 + 把指标写进 README"。**
   **别推倒重写** `src/check.mjs` / `src/drift.mjs` / `src/bench.mjs`。
2. **`bench` 的骨架不许另写一套。** `src/bench.mjs` 的"临时目录 + 目录联接挂 `node_modules`"
   与 `tests/fixtures-run.test.mjs` 是同一条纪律（HANDOFF-M3 §三 第 3 条：复用，别另写）。
   `bench --clean`（M4）应复用 `benchAll` 的 `cases` 选项，**不要**复制一份落盘逻辑。
3. **`NO-BASELINE` 落退出码 `3`**（`data/README.md` §5.1 的单条口径 + `plan/03` §5 的纠正说明）。
   写 `selftest` 断言退出码时，**不许**把它读成 `0`。
4. **`data/fingerprints/*.json` 是生成器产物，禁手改**。改它唯一方式 = 改 `tools/gen-baselines.mjs`
   再重跑 `--add`。`--check` 的判据是 `fingerprint === sha12(canonical)`（离线可复算）。
5. **`--baseline-dir` 是 M3 新增的 CLI 选项**（`src/cli.mjs`）：基线不必在工程内的
   `data/fingerprints/`。语料目录只入仓 `package.json`/`INPUT.md`/`expected.json`/`src`，
   装不下指纹库，C6 的测试就靠它。**`selftest` 若要跑 drift，同样要传它。**
6. **`data/packages/*.json` 与 `data/fingerprints/*.json` 是两类不同的东西**：
   前者 = 五包**当前装的那个版本**的 `exports` 指纹；后者 = 某包的**历史版本**导出面。
   别混用（`bench` / `drift` 分别读它们）。
7. **`fixtures/<case>/node_modules` 永远不许入仓**（`tests/fixtures-layout.test.mjs` 会红）。
8. **`tests/` 现在是 17 个文件**，两处登记（`package.json` `scripts.test` + CI workflow）已同步。
   **新增测试文件必须同笔登记两处**，否则 `LAYOUT.TESTS` 红。
9. **本仓库根有 `node_modules/`**（五包，`npm i --no-save`，未写进 `package.json`）。
   被 `.gitignore` 封，不影响零依赖承诺。**别把它当交付面。**
10. **脱敏门 `SKIP_DIRS` 必须与 `.gitignore` 的本地目录对齐**（门注释第 ④ 条）。
11. **做破坏性验证别在工作树里改文件再用 `git checkout` 恢复**：恢复的是**已提交版本**，
    会把本轮未提交的修改一起冲掉。正解：复制到临时目录（`tools/mutate-gates.mjs` 就这么做）。
12. **`plan/06` §3 缺口表的"缺口"列里不要写已 ✅ 的里程碑号**（`LAYOUT.GAPS` 会判红）。
13. **C7 `clean-project` 目前只有 `INPUT.md` + `expected.json`，没有 `package.json` 与 `src/`**
    （实测：`fixtures/clean-project/package.json` 不存在）。M4 的 `bench --clean` 要先把它补成
    可跑的语料——但**别塞依赖树**，照 C1–C6 的写法。

## 三、下一棒待办 —— 本棒（M4）按序执行，不跳步

1. **先跑入口体检**（每个对话开头固定动作）：
   ```bash
   node tools/check-sprint-layout.mjs      # 必须全绿
   npm test                                # 期望 174/174
   node tools/gen-fingerprints.mjs --check # 期望 5/5
   node tools/gen-baselines.mjs --check    # 期望 1/1
   node tools/mutate-gates.mjs             # 期望 20/20
   ```
2. **`selftest` 落位**（`bin` 里现为"尚未实现（M4 落位）"）：
   - DoD 要求"断言退出码 0/1/3/4 语义（含'零命中 vs 算不了'不同码）"；
   - 最省力的正解：用**临时目录造最小工程**跑四条断言，**不要**硬编码本仓的路径；
   - 必须覆盖：`0`（干净）、`1`（缺导出）、`3`（缺 `node_modules` / 缺基线）、`4`（未知命令/缺参数）；
   - **`2` 保留不用**——若实现里出现 `2`，是缺陷。
3. **`bench --clean` 落位**：
   - 先补 `fixtures/clean-project/` 的 `package.json` + `src/`（全 `RESOLVED` 的合成工程）；
   - 验收口径见 `plan/04` §6：**0 findings 且 `totalPoints > 0`**（证明确实扫到了东西，不是空跑）；
   - 复用 `benchAll(repoRoot, { cases: ["clean-project"] })`，别另写落盘逻辑。
4. **基准指标写进 `README.md`**：
   - **指标粒度必须如实标注：计数级 ≠ 逐条级**（`plan/05` M4 DoD 的原话）；
   - 「28/28 引用点对账通过」是**逐条级**；「6 个语料全绿」是**计数级**——两者不可混写；
   - README 不承载里程碑状态（AGENTS.md §二 既定决定 1），指标可以写，状态不许写。
5. **收尾**（顺序固定，见 `AGENTS.md` §一）：
   DoD 验证 → `plan/00`/`05`/`06` 状态回写（M4 翻 ✅）→ **写 `plan/HANDOFF-M5.md`（M5 的入口，
   不是 HANDOFF-M4）** → commit。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11、M1 的 K12–K21、M2 的 K22–K26、M3 的 **K27–K30** 全部继续有效。重点：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| K1 | 判定态枚举 = 5 个 + `NO-BASELINE`/`VERSION-BEHAVIOR-DRIFT`/`UNPARSEABLE` | `src/contract.mjs` | `tests/architecture.test.mjs` + `tests/drift.test.mjs` |
| K3 | 退出码**只在** `bin/` + `src/cli.mjs` 决定 | 同上 | `tests/architecture.test.mjs`（AST 守门） |
| K7 | `src/` 只准 import `node:` 与相对路径 | 全部模块 | `tests/architecture.test.mjs` |
| K8 | 测试文件**逐文件**列在 `package.json` 与 CI 两处 | 两处 | 布局门 `LAYOUT.TESTS` |
| K14 | 阈值唯一来源 §5.3；代码镜像 `LIMITS`；双向断言 | `src/contract.mjs` | `tests/thresholds.test.mjs` |
| K21 | `HANDOFF-M<k>` 是 **M<k> 的入口**（k = 它开的那一棒） | `AGENTS.md` + 布局门 | `LAYOUT.HANDOFFS` 两半边 |
| K22–K26 | 见 `HANDOFF-M3.md` §四（引用点抽取 / `imported` 下标 / 最近 package.json / snapshot 退出码 / 语料目录纪律） | 同前 | 同前 |
| **K27** | `drift` 判据 = **符号行为**（不是 semver、不是整份 exports 指纹） | `src/drift.mjs` | `tests/drift.test.mjs` + C6 |
| **K28** | `drift` 判定单位 = **引用点**（不是包）；同一包可 1 红 1 绿 | 同上 | `tests/drift.test.mjs` + C6 |
| **K29** | `NO-BASELINE` 不算 problems，但**落退出码 3** | `src/api.mjs` | `tests/drift.test.mjs` + `cli.test.mjs` |
| **K30** | 同一引用点只许一条问题结论：`DRIFT` 就地取代较粗的 `MISSING-EXPORT` | `src/api.mjs` | C6 的 `summary.problems === 1` |
| **K31** | 基线是生成器产物（真实 tarball + `sha512`），禁手改；`--check` = 离线复算指纹 | `tools/gen-baselines.mjs` | `tests/baselines.test.mjs` |
| **K32** | 真值可**分层声明**（`status` / `driftStatus`），两层各自对账 | `src/bench.mjs` + `fixtures-run` | C6 点 3 |

## 五、本机环境坑（只写实测过的）

1. **`/tmp` 在 Git Bash + Node 上不可用**：探针文件一律落在仓库内 `tmp/`（已 gitignore）。
2. **探针的 `require` 解析根 = 脚本位置的 `node_modules` 链**。正解：探针放进安装目录，
   或用 `createRequire(join(cwd,"x.cjs"))`。
3. **Bash 里用 `node -e "…"` 时反引号会被 shell 当命令替换**：把脚本写到文件再 `node file`。
4. **`node --test` 不要用目录/glob 形式**：本项目一律逐文件列出，`LAYOUT.TESTS` 对账两处。
5. **改门必须重跑变异宿主**：`node tools/mutate-gates.mjs`（约 2–4 分钟）。
6. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。
7. **Windows 目录联接**：`symlinkSync(target, path, "junction")` 不需要管理员权限。
   用 `"dir"` 类型会需要开发者模式。
8. **M3 实测新增**：`npm pack <pkg>@<ver>` 在这个环境可用（registry 可达），
   但**工具运行时仍不许联网**——tarball 只在**生成基线**时取一次，产物入仓后即可离线复算。
9. **M3 实测新增**：真实包的 `.` 导出面要用 `readExportSurface` 读，**别用 `Object.keys(require(...))`**
   当判据——后者是 CJS 命名空间的键，与静态导出面不是一回事（zod：require 261 键 vs 静态 730 名）。

## 六、DoD 逐项 checklist（本棒出口判据）

| # | DoD 项 | 状态 | 证据 / 怎么验 |
|---|---|---|---|
| 1 | `selftest` 断言退出码 0/1/3/4 语义 | ⬜ | 临时目录造最小工程，四条断言各一条测试 |
| 2 | `bench --clean` 干净工程零误报 | ⬜ | `fixtures/clean-project` 补 `package.json`+`src/`；0 findings 且 `totalPoints > 0` |
| 3 | 基准指标写进 README（粒度如实标注） | ⬜ | 逐条级 / 计数级分开写，不混 |
| 4 | 三处状态副本 + 布局门 / 脱敏门 / 变异宿主全绿 | ⬜ | 三道门实跑 |
| 5 | CI 实跑 | ⬜ **不适用** | 无远端，未跑 CI；只写"本地等价校验 + 待首推验证" |

> 出口判据全部达成后，按 `AGENTS.md` §一 的固定顺序收尾，并写 **`plan/HANDOFF-M5.md`**。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs      # 布局门，期望全绿
node tools/check-desensitized.mjs       # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs             # 变异验证，期望 20/20

# 测试
npm test                                # 期望 174/174（M4 起会增加）

# 指纹与基线
node tools/gen-fingerprints.mjs --check # 逐字节校验，期望 5/5
node tools/gen-baselines.mjs --check    # 基线自洽，期望 1/1
node tools/gen-baselines.mjs --list     # 列已入仓基线

# CLI（M3 起全部可用）
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs snapshot .
node bin/depcheck-live.mjs scan .
node bin/depcheck-live.mjs check . --json
node bin/depcheck-live.mjs check . --with-drift --baseline-dir data/fingerprints
node bin/depcheck-live.mjs drift . --baseline-dir data/fingerprints
node bin/depcheck-live.mjs bench        # 期望 6 语料 / 28 通过 / 0 失败
node bin/depcheck-live.mjs selftest     # 待 M4

# 五包安装（跑 bench / --check 与真实包实测时需要；--no-save 保零依赖承诺）
npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**下一棒启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M5.md" 继续完成任务`

—— 读 `plan/HANDOFF-M5.md`（= **M5 的入口**）。本文件（`HANDOFF-M4.md`）是 M4 的入口，
M4 收尾时要写的下一份入口是 `HANDOFF-M5.md`（M5：交付 —— `SKILL.md` 契约块 + 技术报告 + demo GIF）。