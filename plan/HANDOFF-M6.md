# HANDOFF-M6 — 发布：脱敏 + 干净环境 + 建仓 + CI 首推 + tag + Release

> 本文件是 **M6 的入口文件**（`k` = **它开的那一棒**：进 M6 就读它）。
> 入库路径一律相对：`plan/HANDOFF-M6.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据（上一棒 M5 已交付什么）

M5（交付）已全部完成，`plan/00` §4、`plan/05` §1 与本文件三处状态副本一致（布局门 `LAYOUT.STATUS` 断言）。
逐项证据（本机实跑，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| `SKILL.md` 落位（第二交付形态主入口） | `SKILL.md`（含 `<!-- CONTRACT:BEGIN/END -->` 机器解析块） | 契约测试 13 条；变异验证 **11/11 CAUGHT** |
| 契约块双向断言 | `tests/contract.test.mjs` | 方向① `contract → SKILL`、方向② `SKILL → contract`（**按行归属**） |
| 契约测试的变异验证 | `tools/verify-contract-mutations.mjs` | 11 组（1 对照 + 10 改坏）全 CAUGHT，约 6 秒 |
| 四格表两处悬空引用修实 | `plan/00` §5 第 3 列 | `run()`（从不存在）与 `src/check.mjs::checkAll()`（实际在 `api.mjs`）已改为真实函数 |
| 技术报告 | `docs/技术报告.md` | 讲判据与边界；数值只引用 `data/README.md` §5，不复制 |
| demo GIF | `docs/demo/demo.gif`（869 KB / 29 帧） | **ConPTY 真实终端录制**：`scan`/`check`/`drift`/`bench`/`bench --clean`/`selftest` |

**M5 交付后的实测数字**（本机 2026-11-01）：
`npm test` = **209 passed / 0 failed / 0 skipped**（M4 收尾时 196，M5 新增 13）；
`bench` = 逐条级 **28/28**、计数级 **49/49**；`bench --clean` = 逐条级 **7/7**、计数级 **14/14**；
`selftest` = **8/8**；`gen-fingerprints --check` = **5/5**；`gen-baselines --check` = **1/1**；
脱敏门 **0 命中**（124 个文本文件）；布局门 **10 条全绿**；变异组 **20/20 CAUGHT**；
契约变异组 **11/11 CAUGHT**。

### M5 的三条招牌发现（M6 必须知道，否则会踩）

0. **★ "声明了但没人读" 仍是头号缺陷族。** M5 又抓到两处同族问题：
   - **契约块标记必须按整行匹配。** 说明段落里会引用 `<!-- CONTRACT:BEGIN -->` 的字面量；
     用 `indexOf` 抓到的会是那句说明里的同名子串，切出来的片段**连一行表格都没有**
     ——判据空跑而全绿。同一坑在变异验证里又复现一次：裸子串 `replace` 改的是说明段，
     真标记还在，**变异本身无效**（第一版 M5 变异就这么逃了一次）。两处都改成按整行锚定。
   - **四格表第 3 列的第二处悬空引用。** `HANDOFF-M5` 只点了 `src/api.mjs::run()`，
     实测 `src/check.mjs::checkAll()` 同样悬空（`checkAll` 在 `api.mjs`）。M0 起一直写着，
     **没有任何东西变红**——因为此前没有断言在读这一列。M5 补了"点名的函数必须真实 export"。

1. **契约块的方向②不能写成"全局猜记号属于哪个枚举"。** 第一版把 `KIND`（小写）与
   `COMMANDS`（小写）混在一个全局分类里 → 等于没验。判据必须是**按行归属**：
   行名决定该比对哪个真值源，两边集合相等（多一个少一个都红）。

2. **`plan/00` 的表格编辑要小心。** M5 回写文档索引时，一次 `Edit` 把两行合成了一行
   （`|| 05 |` 粘连）。**改完必须跑布局门**——它当场红了才被发现。改表格类文档后
   先目视核对行数（`plan/00` §4 与 `plan/05` §1 的行数会打印在门的结论行里）。

3. **★ 变异靶子不许锚进度状态。** M5 收尾跑变异宿主时 `H2` 组报 SKIP
   （"未开工的里程碑不足 2 个，本组不适用"）——它的靶子要求"⬜ 里程碑 ≥ 2"，
   而 M5 完成后只剩 M6 一个 ⬜。**宿主文件头部自己写着"靶子一律锚既有事实，
   永不随进度过期"，这条靶子违反了它。**
   已修：半边②本来就有两条独立判据，改用不随进度变化的那条（**野编号**
   `HANDOFF-M<k>.md` 里 k 不在里程碑表 → 也是超前入口）作兜底；⬜ ≥ 2 时仍优先用表内判据。
   **M6 收尾时若又出现 SKIP，先怀疑靶子锚了进度，别改门的判据去迁就靶子。**

## 二、当前事实 · 状态不变量（动手前必须知道）

1. **M5 已把"交付面"做完，M6 的活是"发布面"：脱敏 + 干净环境 + 建仓 + CI 首推 + tag + Release。**
   **别推倒重写** `src/check.mjs` / `src/drift.mjs` / `src/bench.mjs` / `src/selftest.mjs` /
   `SKILL.md` / `docs/技术报告.md`。
2. **`tools/check-release.mjs` 尚未存在**，它登记在布局门的 `PENDING_TOOLS`（`M6`）。
   **M6 翻 ✅ 后必须同笔把它从 `PENDING_TOOLS` 删除**，否则 `LAYOUT.DOC_TOOLS` 会因
   "M6 已 ✅ 但登记项未清理"变红（门的 stale 分支）。
3. **`plan/RELEASE-M6.md` 必须在 M6 翻 ✅ 前落盘**，且要满足布局门 `LAYOUT.RELEASE` 三条：
   ① 有 `## 一、tag 前事实` 与 `## 二、tag 后追加` 两栏；
   ② 有 `## …覆盖对账` 小节（`^#{2,3}.*覆盖对账`）；
   ③ 含 `实现` / `不适用` / `待首推` 三态的行**至少 3 行**。
4. **版本单一来源 = `package.json` 的 `version`**（当前 `0.1.0`）。tag 与它由
   `tools/check-release.mjs` 对账；**两处必须一起改**。
5. **本仓当前无远端**（`gh` 已登录但未建仓）。M6 首推后才可据实补记 CI run id；
   **补记是追加事实，不回填美化历史措辞**。
6. **名字占用核对必须在建仓之前**：`gh api -X GET search/repositories -f q='depcheck-live in:name' --jq .total_count`
   （**`-X GET` 不能省**）；0 必须来自成功响应，不是限流假 0。
7. **Release 附产物口径（A）自 M0 起不得删改或降级**：附件 ≥1 个手工上传产物，
   本地留副本 + `sha256` 留档（`plan/05` §2 M6 DoD 第 3 条）。
8. **`tests/` 现在是 19 个文件**，两处登记（`package.json` `scripts.test` + CI workflow）已同步。
   **新增测试必须同笔登记两处**，否则 `LAYOUT.TESTS` 红。
9. **`data/fingerprints/*.json` 与 `data/packages/*.json` 是生成器产物，禁手改**（K31）。
10. **`docs/` 与 `docs/demo/` 已存在且已入库例外**（`.gitignore` 有 `!docs/**/*.md` 与
    `!docs/demo/*.gif`）。`.gif` 在脱敏门的 `SKIP_EXTS` 里（二进制不扫），但**它旁边若加
    文本说明必须过脱敏门**。
11. **README 不承载里程碑状态**（AGENTS.md §二 既定决定 1），但可以写能力与指标。
    M5 未改 README；M6 若要加"裸 clone 复现"步骤，只能加**能力与用法**，状态指向 `plan/05`。
12. **做破坏性验证别在工作树里改文件再用 `git checkout` 恢复**：恢复的是已提交版本，
    会冲掉本轮未提交的修改。正解：复制到临时目录（`tmp/` 已 gitignore）。
13. **`/tmp` 在 Git Bash + Node 上不可用**：临时工程一律 `mkdtempSync(tmpdir())`，
    探针脚本本身放仓库内 `tmp/`。

## 三、下一棒待办 —— 本棒（M6）按序执行，不跳步

1. **先跑入口体检**（每个对话开头固定动作）：
   ```bash
   node tools/check-sprint-layout.mjs        # 必须全绿
   npm test                                  # 期望 209/209
   node tools/gen-fingerprints.mjs --check   # 期望 5/5
   node tools/gen-baselines.mjs --check      # 期望 1/1
   node tools/mutate-gates.mjs               # 期望 20/20
   node tools/verify-contract-mutations.mjs  # 期望 11/11
   node bin/depcheck-live.mjs selftest       # 期望 8/8
   node bin/depcheck-live.mjs bench --clean  # 期望 1 语料 / 7 引用点 / 0 失败
   ```
2. **`tools/check-release.mjs` 落位**（DoD 第 4 条，三档 `--pre-tag` / 离线 / `--online`）：
   - 判据：`package.json` 的 `version` ↔ tag ↔ `plan/RELEASE-M6.md` 三处一致；
   - **进 CI 的必须是跨触发成立的那一档**：`--pre-tag` 在 tag 推送时必红，
     所以 CI 里只能挂离线档或 `--online` 档，别挂 `--pre-tag`；
   - 落位后**同笔从布局门的 `PENDING_TOOLS` 删除本条**（见 §二 第 2 条）；
   - 改门/加门后**必须重跑 `node tools/mutate-gates.mjs`**（约 2–4 分钟）。
3. **`plan/RELEASE-M6.md` 落盘**（tag 前写，满足 §二 第 3 条三条判据）：
   - 「一、tag 前事实」写：名字占用核对结果、脱敏门 0 命中、干净环境验证、
     版本号、附件清单与 `sha256`；
   - 「二、tag 后追加」**留空但必须存在**（tag 后追加真实 run id 与回取校验）；
   - 「覆盖对账」表里 `实现` / `不适用` / `待首推` 三态行 ≥ 3 行。
4. **脱敏 + 干净环境验证**（DoD 第 1、2 条）：
   - `node tools/check-desensitized.mjs` 0 命中；
   - `git archive <tag>` 解出的树里能跑三道门（**解出的树不含 `node_modules`**，
     所以只跑门与 `--version`，不跑 `bench`）；
   - 裸 clone → `npm test` → `node bin/depcheck-live.mjs --version` → `check` 样例，
     按 README 逐条敲通。
5. **建仓 + CI 首推**（DoD 第 5 条）：
   - 名字核对 → `gh repo create` → push → **等 CI 真跑**（三档 node × 两 OS）；
   - CI 红则修；**不许把"未跑"写成"已跑"**（`plan/06` R6）。
6. **tag + Release**（DoD 第 3 条）：
   - `git tag` → `gh release create` 附产物 → `gh release download` 回取验 `sha256`；
   - tag 后在 `git archive <tag>` 解出树里重跑三道门。
7. **收尾**（顺序固定，见 `AGENTS.md` §一）：
   DoD 验证 → `plan/00`/`05`/`06` 状态回写（M6 翻 ✅）+ `plan/RELEASE-M6.md` 两栏补齐
   → **写收官交接单**（M6 是末棒，按 `HANDOFF_EXEMPT_LAST = false` 仍要写
   `plan/HANDOFF-M6.md` 的收官形态，或按门的要求处理）→ commit。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11、M1 的 K12–K21、M2 的 K22–K26、M3 的 K27–K32、M4 的 K33–K36、
**M5 的 K37–K39** 全部继续有效。M5 新增三条重点：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| **K37** | **契约块标记按整行锚定**（`^<!-- CONTRACT:BEGIN -->$`），不用 `indexOf` 裸子串 | `tests/contract.test.mjs` 的 `contractBlock()` | 契约测试（切出空块 → 13 条全红） |
| **K38** | **契约块方向②按行归属校验**（行名 → 对应枚举，集合相等），不做全局猜测 | `tests/contract.test.mjs` 的 `EXPECT` 表 | 契约测试（行名与判据表不匹配即红） |
| **K39** | **四格表第 3 列点名的函数必须真实 export**（`src/<file>::fn()` 形态） | `tests/contract.test.mjs` 的四格表断言 | 契约测试（悬空引用即红） |

既有重点（M6 尤其要守住）：

| # | 约定 | 动了会红在哪 |
|---|---|---|
| K1 | 判定态枚举 = 5 个 + `NO-BASELINE`/`VERSION-BEHAVIOR-DRIFT`/`UNPARSEABLE` | `tests/architecture.test.mjs` + `tests/contract.test.mjs` |
| K3 | 退出码**只在** `bin/` + `src/cli.mjs` 决定 | `tests/architecture.test.mjs`（AST 守门） |
| K7 | `src/` 只准 import `node:` 与相对路径 | `tests/architecture.test.mjs` |
| K8 | 测试文件**逐文件**列在 `package.json` 与 CI 两处 | 布局门 `LAYOUT.TESTS` |
| K21 | `HANDOFF-M<k>` 是 **M<k> 的入口**（k = 它开的那一棒） | `LAYOUT.HANDOFFS` 两半边 + `tests/handoff-pointer.test.mjs` |
| K29 | `NO-BASELINE` 不算 problems，但**落退出码 3** | `tests/drift.test.mjs` + `selftest` |
| K31 | 基线是生成器产物，禁手改 | `tests/baselines.test.mjs` |
| K33 | 真值字段必须有人读 | `tests/bench.test.mjs` |
| K35 | 负向真值用 `negativePoints`，**不许写 `status`** | `tests/fixtures.test.mjs` |

## 五、本机环境坑（只写实测过的）

1. **`/tmp` 在 Git Bash + Node 上不可用**：探针文件一律落仓库内 `tmp/`（已 gitignore）。
2. **Bash 里用 `node -e "…"` 时反引号会被 shell 当命令替换**：把脚本写到文件再 `node file`。
3. **`node --test` 不要用目录/glob 形式**：本项目一律逐文件列出，`LAYOUT.TESTS` 对账两处。
4. **改门必须重跑变异宿主**：`node tools/mutate-gates.mjs`（约 2–4 分钟）。
5. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。
6. **Windows 目录联接**：`symlinkSync(target, path, "junction")` 不需要管理员权限。
   `cmd //c "mklink /J <link> <target>"` 也可（M5 造 demo 工程时用的这条）。
7. **`readdirSync(dir, { recursive: true, withFileTypes: true })` 的父路径字段**在不同 Node
   版本是 `parentPath` 或 `path`（本机 v24 两个都在）。写跨版本测试时用 `entry.parentPath ?? entry.path`。
8. **ESM 测试文件里不许用 `require`**（本项目 `type: module`）。
9. **`bench` 的 `--clean` 若配在非 bench 命令上必须 exit 4**（显式报错），不许静默忽略。

### M5 实测新增（M6 若再要录屏/截帧会踩）

10. **★ Python 重定向到文件时用 locale 编码**：本机 cp936，`sys.stdout.write("中文")` 到
    `> file` 会被编成 GBK 字节 → 下游按 UTF-8 读，整屏 `U+FFFD`（实测 669 个替换字符）。
    正解：写 `sys.stdout.buffer.write(s.encode("utf-8"))`。**这与终端/ConPTY 无关**
    （四个 `chcp` 变体探针都正常，容易误诊成终端问题）。
11. **★ Git Bash 的提示符挡不住 `user@HOST`**：`bash --norc`、`bash --rcfile <自建rc>` 都无效
    （`/etc/bash.bashrc` 仍被读）。正解：**先发一条初始化命令**（`PS1='$ '; PROMPT_COMMAND=''; clear`）
    把提示符清掉，**然后才开始收集字节**——被丢弃的只是启动横幅，不是任何命令输出。
12. **`pywinpty` 的 `PtyProcess.read()` 是阻塞的**：必须后台线程读，否则探针会挂死
    （M5 挂了两次，每次都要 `timeout` 才收场）。
13. **`pywinpty` 内部按 UTF-8 严格解码**（`ptyprocess.py` 的 `read()` 里 `data.decode('utf-8')`），
    所以**控制台层**若输出非 UTF-8 字节，它会在解码阶段就坏掉。
14. **`agg`（asciinema GIF 渲染器）有 Windows 原生 exe**：
    `https://github.com/asciinema/agg/releases/download/v1.9.0/agg-x86_64-pc-windows-msvc.exe`。
    本机实测可用；`--last-frame-duration` 控制末帧停留、`--idle-time-limit` 压缩静默段。
    **`asciinema` 本身没有 Windows 二进制**，所以录制侧用 ConPTY 自己写 asciicast v2。

## 六、DoD 逐项 checklist（本棒出口判据）

| # | DoD 项 | 状态 | 证据 / 怎么验 |
|---|---|---|---|
| 1 | 脱敏门 0 命中；`git archive <tag>` 解出树里能跑门 | ⬜ | 三道门实跑 + 解出树复跑 |
| 2 | 干净环境（裸 clone + 无 `node_modules`）按 README 逐条敲通 | ⬜ | 手工逐条 + 记录 |
| 3 | ① git tag ② GitHub Release（≥1 附件，本地副本 + `sha256`）③ `plan/RELEASE-M6.md` | ⬜ | tag 前落盘、tag 后两栏补齐 |
| 4 | `tools/check-release.mjs` 三档无 FAIL；进 CI 的是跨触发成立那一档 | ⬜ | 三档实跑 + CI 首推 |
| 5 | CI 实跑（远端） | ⬜ **当前不适用** | 无远端；M6 建仓后据实补记 run id，**不许写"已跑"** |

> 出口判据全部达成后，按 `AGENTS.md` §一 的固定顺序收尾。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs         # 布局门，期望全绿
node tools/check-desensitized.mjs          # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs                # 两道门的变异验证，期望 20/20
node tools/verify-contract-mutations.mjs   # 契约测试的变异验证，期望 11/11

# 测试
npm test                                   # 期望 209/209

# 指纹与基线
node tools/gen-fingerprints.mjs --check    # 逐字节校验，期望 5/5
node tools/gen-baselines.mjs --check       # 基线自洽，期望 1/1

# CLI
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs snapshot .
node bin/depcheck-live.mjs scan .
node bin/depcheck-live.mjs check . --json
node bin/depcheck-live.mjs check . --with-drift --baseline-dir data/fingerprints
node bin/depcheck-live.mjs drift . --baseline-dir data/fingerprints
node bin/depcheck-live.mjs bench           # 期望 6 语料 / 逐条级 28 / 计数级 49 / 0 失败
node bin/depcheck-live.mjs bench --clean   # 期望 1 语料 / 逐条级 7 / 计数级 14 / 0 失败
node bin/depcheck-live.mjs selftest        # 期望 8/8，覆盖退出码 0/1/3/4

# 五包安装（跑 bench / --check 与真实包实测时需要；--no-save 保零依赖承诺）
npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14

# 发布（M6 落位后可用）
node tools/check-release.mjs --pre-tag     # tag 之前跑；**不要**挂进 CI（tag 推送时必红）
node tools/check-release.mjs --online      # 需要联网核对 tag / Release

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**M6 是末棒**：收尾时若 `HANDOFF_EXEMPT_LAST` 仍为 `false`（默认），布局门要求 M6 也有入口
——本文件即 M6 的入口，收官形态在本文件内补齐（不需要再开 `HANDOFF-M7.md`）。

**启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M6.md" 继续完成任务`

—— 读 `plan/HANDOFF-M6.md`（= **M6 的入口**）。本文件（`HANDOFF-M5.md`）是 M5 的入口，
M5 收尾时写的下一份入口是 `HANDOFF-M6.md`（M6：发布 —— 脱敏 + 干净环境 + 建仓 + CI 首推 + tag + Release）。