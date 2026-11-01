# HANDOFF-M6 — 收官：M6 发布已完成，全项目 7 个里程碑全部 ✅

> 本文件是 **M6 的入口文件**（`k` = **它开的那一棒**：进 M6 就读它），同时也是**收官交接单**。
> M6 是末棒：`HANDOFF_EXEMPT_LAST = false` 仍然要求有入口，收官形态就在本文件内补齐，
> **不需要也不允许再开 `HANDOFF-M7.md`**（野编号 = 超前入口，布局门半边②会红）。
> 入库路径一律相对：`plan/HANDOFF-M6.md`。

## 一、当前进度 + 证据（M6 已交付什么）

M6（发布）已全部完成，`plan/00` §4、`plan/05` §1 与本文件三处状态副本一致
（布局门 `LAYOUT.STATUS` 断言）。**全仓 7 个里程碑全部 ✅，无剩余里程碑。**

逐项证据（本机实跑 + 远端实跑，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| 发布门（三档） | `tools/check-release.mjs` | 离线档 / `--pre-tag` / `--online` 各自实跑全绿；只把**离线档**挂进 CI |
| 发布门的判据自证 | `tests/release.test.mjs`（13 条） | 含"按整行锚定"与"算不了 ≠ 没事"两条招牌判据 |
| 发布门的变异验证 | `tools/mutate-gates.mjs` 新增 **R1–R6** | 三道门共 **26/26 CAUGHT**（含 1 条阴性对照） |
| 发布留档 | `plan/RELEASE-M6.md` | 两栏齐 + 事实块（机器读）+ 覆盖对账 6 行三态 |
| 远端仓库 | `https://github.com/yuluo554/depcheck-live`（public） | `gh repo create` + push（SSH 远端） |
| CI 实跑 | run **`41322262071`**（首轮）+ **`41323571342`** / **`41324209400`**（全 ✅ 收尾轮） | 三轮均 **success**，各 7 个 job 全绿 |
| tag + Release | `v0.1.0` + 附件 `depcheck-live-0.1.0.zip` | 1 238 166 字节，sha256 `44f00d5a…`，`--online` 回取一致 |
| 干净环境 | 裸 clone 8 步 | `npm test` 222（192 pass / 30 skip）→ 门三道 → `selftest` 8/8 → `check .` 回 3 |

**M6 后的实测数字**（本机，装包状态）：
`npm test` = **223 passed / 0 failed / 0 skipped**（M5 收尾 209；M6 新增 14）；
`selftest` = **8/8**；`bench` = 28/28 逐条、49/49 计数；`bench --clean` = 7/7 逐条、14/14 计数；
`gen-fingerprints --check` = 5/5；`gen-baselines --check` = 1/1；
脱敏门 **0 命中**（127 个文本文件）；布局门 **10 条全绿**；变异组 **26/26 CAUGHT**；
契约变异组 **11/11 CAUGHT**；发布门三档全绿。

> ⚠️ **裸 clone / CI 上是 `223 tests / 193 pass / 30 skipped / 0 fail`，不是 223 pass。**
> 那 30 条全是要真实五包的那一档，代码里显式 `t.skip` 并写明缺什么。
> **把 skip 数读成 pass 数是假绿**——`plan/05` §4 U2 与本文件都据实写 skip 数。

### M6 的三条招牌发现（下一棒若还要动本仓，必须先看）

0. **★ "判据锚了进度状态"这次炸在测试里，不在门里。** `tests/handoff-pointer.test.mjs`
   有一条 `assert.ok(current !== null, "…全部 ✅ 时本测试应改为只查 done")`——
   **报错文案自己写出了修法，代码却没照做**。末棒 M6 翻 ✅ 后 `current === null`，
   该测试必炸；而布局门 `LAYOUT.HANDOFFS` 同一时刻正确地报"全部已 ✅，无当前里程碑"且全绿。
   **两边判据不同口径就是缺陷**。已按文案修：`required = done ∪ (current ?? ∅)`。
   这与 `mutate-gates.mjs` H2 组当年踩的是**同一族**（锚"总会有一个 ⬜" = 锚进度）。
   规矩：**任何判据都不许假设"一定存在未完成的里程碑"**。

1. **★ 变异靶子第三次、第四次随进度过期（H1 + L8，同一次收尾内）。** 两个靶子都锚了
   "仓库里还有一条未完成/未落位的东西"：
   - **L8** 原靶子是 `"tools/check-release.mjs": 6` → `: 0`。M6 真把发布门落位、按纪律清掉了
     这条登记，**靶子消失** → SKIP。正解：靶子**自己造完整的事**——注入一条野登记（指向一个
     永不存在的脚本）+ 在 `plan/06` 注入一处对它的引用。锚的是门的**判据形态**，与仓库当前
     登记几条无关。
   - **H1** 原靶子取"状态表里最小号的 ⬜"。末棒 M6 翻 ✅ 后没有 ⬜ → SKIP。正解：靶子**自己造出
     前置状态**——把状态表最小那行（两个副本同时）翻回 ⬜，让它成为"当前在做的"，再删其入口。
     这恰好就是半边①要防的真实场景。

   **这是本仓第 2/3/4 次撞同一族**（H2 两次、L8 一次、H1 一次）；**第 5 次是同一次收尾里
   我自己刚写出来的**——`tests/release.test.mjs` 的覆盖对账断言要求"三态各至少出现一次"，
   发布做完后"待首推"合法消失，那条要求等于**逼仓库永不完结**。
   改成"每行状态格必须落在三态之内"（不许自造措辞）+ 至少一行是"实现"。
   规矩升为 K41：**改靶子/断言时先问三句**——
   ①这个判据/靶子会不会因为本棒干完活而消失？②它报错文案里写的修法我照做了吗？
   ③它要求"某个状态必须存在"吗——那等于要求仓库永远停在那一步？

2. **★ 文档里写不存在的工具路径，会被 `LAYOUT.DOC_TOOLS` 当成真引用。** 本棒写交接单时
   举了个例子，把一个虚构的 `tools/` 路径原样写进正文，门当场红（"7 个文档点名工具"变 8 个、
   其中 1 个缺件）。**门是对的，不是误报**——判据就是"文档点名的每个 `tools/` 脚本必须有实物"。
   写文档的纪律：**举形态不举路径**（写"指向一个永不存在的脚本"，不写具体路径）。
   若要举真实路径，必须是仓库里存在的。

3. **★ 上一个 tag 之后不许再改代码面。** `AGENTS.md` §四的禁忌。本棒 tag `v0.1.0` 打在
   `6aa8899`；其后所有文档回写（`plan/00`/`05`/`06`、本文件收官、`plan/RELEASE-M6.md` 的
   §二追加）**都发生在 tag 之后**，必须显式区分：
   - **tag 树的代码面** = `6aa8899`（已由 `git archive v0.1.0` 复跑三道门验证）；
   - **tag 之后的工作树** = 多出文档回写 + **五处**修正：`tests/handoff-pointer.test.mjs` 的末棒口径、
     `tools/mutate-gates.mjs` 的 H1 靶子、`tests/release.test.mjs` 的覆盖对账断言、
     `README.md` 的「无需安装」措辞、`tools/check-release.mjs` 的临时目录泄漏。
   > ⚠️ **诚实口径**：这些修正都发生在 tag **之后**，所以 `v0.1.0` 的 zip 附件里
   > **还是旧写法**。它们在 tag 树里能过（tag 树里 M6 仍是 ⬜，状态副本是打 tag 那一刻的），
   > 但一旦状态全 ✅、或有人照着 README 敲命令、或反复跑 `--online`，就会撞上
   > ——所以是**必须修的缺陷**，不是可有可无的整理。已在此处与 `plan/RELEASE-M6.md` §2.6 据实记录。
   > 下一个 tag 会带上修正。**不要回填 `v0.1.0` 的描述去掩盖它。**

4. **★ 门自己也要守它写的纪律。** 发布门的回取目录原落在仓库内 `tmp/` 且从不删除，
   每跑一次 `--online` 就留一份 1.2 MB 副本（实测积了 14 个目录）。而本文件 §二第 13 条
   与 §五第 2 条明明写着"临时工程一律 `mkdtempSync(tmpdir())`"——**门没照做**。
   `tmp/` 已 gitignore 只是让泄漏**看不见**，不是不让它发生。已修（`mkdtempSync` + `finally rmSync`）
   并补测试断言。规矩：**判据门不许往被测仓库里写东西**；改门时顺手检查这一条。

## 二、当前事实 · 状态不变量（下一棒动手前必须知道）

1. **全仓 7 个里程碑全部 ✅。没有"当前里程碑"。** 任何判据都不许假设还有 ⬜。
2. **远端已建立**：`git@github.com:yuluo554/depcheck-live.git`（SSH）。
   **本机 HTTPS 到 `github.com:443` 不通**（`curl https://github.com/` 超时），但
   `api.github.com` 与 SSH 都正常 → 远端必须保持 SSH 形态，否则 push 会失败。
   `gh` 命令走 API 链路，不受影响。详见 `plan/RELEASE-M6.md` §2.6。
3. **版本单一来源 = `package.json` 的 `version`（当前 `0.1.0`）。** 改版本必须**三处一起**：
   `package.json` → `plan/RELEASE-M6.md` 事实块的 `version` + `tag` → 新 tag。
   `node tools/check-release.mjs` 会对账；`tests/release.test.mjs` 也会红。
4. **`plan/RELEASE-M6.md` 的事实块是机器读取面。** 标记 `<!-- RELEASE-FACTS:BEGIN/END -->`
   **必须按整行出现且各一次**；块内字段用表格。说明段落里引用标记字面量是**允许的**
   （K37：按整行锚定，不误判；变异组 R6 的阴性对照钉住这条）。
5. **附件 sha256 只能 tag 后追加**（zip 内容含留档，写进去就自指）。
   顺序固定：tag → archive → 算 sha256 → 回填留档 §一事实块 + §二追加 → 上传。
6. **`dist-release/` 已 gitignore**：附件是产物，不入库（入库会与 tag 树成两份可能漂移的副本）。
7. **`PENDING_TOOLS` 现已空**（`tools/check-sprint-layout.mjs`）。这不削弱判据：
   「登记了就必须自清理」由变异组 L8 **注入**一条野登记 + 一处野引用来钉住。
   **别为了"有靶子"把假登记写回去。**
   ⚠️ **本条自己踩过一次**：M6 收尾写文档时顺手举了个例子，写成了 `tools/` 下的一个**不存在的路径**，
   而布局门 `LAYOUT.DOC_TOOLS` 认的是"文档里点名的 `tools/` 脚本必须有实物"——
   **例子本身被当成了真引用，门当场红**（扫到 8 个、其中 1 个缺件）。
   这不是门的缺陷，是写文档的纪律：**正文里不要写不存在工具的完整路径**，
   要举例就写形态（"一条指向未落位脚本的登记"）而不写具体路径。
8. **`tools/mutate-gates.mjs` 现有 26 组**（L1–L11 / H1–H2 / D1–D5 / N1–N2 / R1–R6）。
   改任何门**必须重跑**（约 2–4 分钟），并坚持三条硬纪律：先跑基线、三态分开计、自证字节已变。
9. **`tests/` 现 20 个文件**，两处登记（`package.json` `scripts.test` + CI workflow）已同步。
   新增测试必须同笔登记两处，否则 `LAYOUT.TESTS` 红。
10. **`data/fingerprints/*.json` 与 `data/packages/*.json` 是生成器产物，禁手改**（K31）。
11. **README 不承载里程碑状态**（`AGENTS.md` §二 既定决定 1）。它写能力与指标，状态看 `plan/05`。
12. **做破坏性验证别在工作树里改文件再 `git checkout` 恢复**：正解是复制到 `tmp/`（已 gitignore）。
13. **`/tmp` 在 Git Bash + Node 上不可用**：临时工程一律 `mkdtempSync(tmpdir())`。

## 三、下一棒待办

**本仓方法论意义上的"下一棒"已不存在**（M6 是末棒，7/7 全部 ✅）。本节改为
**后续维护入口**：若将来要开新一轮（扩展项、修缺陷、发下个版本），从这里起。

### 3.1 零风险的第一步（每次动仓库之前）

```bash
node tools/check-sprint-layout.mjs        # 必须全绿（10 条）
npm test                                  # 装包环境 223/223；裸 clone 223/193 pass/30 skip
node tools/check-desensitized.mjs         # 必须 0 命中
node tools/check-release.mjs              # 离线档必须全绿
node tools/mutate-gates.mjs               # 必须 26/26 CAUGHT
node tools/verify-contract-mutations.mjs  # 必须 11/11 CAUGHT
node bin/depcheck-live.mjs selftest       # 必须 8/8
```

### 3.2 如果只是发一个新版本（最常见的后续动作）

1. 改 `package.json` 的 `version`；
2. 改 `plan/RELEASE-M6.md` 事实块的 `version` 与 `tag`（两格）；
3. `node tools/check-release.mjs --pre-tag` 必须全绿（它判"新 tag 还不存在"）；
4. 若要保留 M6 的发布历史，**新建 `plan/RELEASE-<新里程碑>.md`**，不要把本文件改成新版本
   ——`LAYOUT.RELEASE` 固定看 `RELEASE_MILESTONE = 6`，换文件要同步改门与 `STATUS_COPIES` 口径；
   若不新开里程碑（只是补丁版），直接在本文件追加一节并更新事实块即可，门照样对账。
5. commit → push → tag → archive → 算 sha256 → 回填 → `gh release create` → `--online` 回取校验。

### 3.3 如果开扩展项（`plan/05` §4 U5 / `plan/00` §2.2 弃选项）

**先补一条新里程碑**（M7）到 `plan/00` §4 与 `plan/05` §1 两处副本，
再写 `plan/HANDOFF-M7.md`（M7 的入口）。
⚠️ **顺序不能反**：先开 `HANDOFF-M7.md` 再改状态表 = 超前入口，布局门半边②必红
（变异组 H2 钉住这条）。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11、M1 的 K12–K21、M2 的 K22–K26、M3 的 K27–K32、M4 的 K33–K36、
**M5 的 K37–K39** 全部继续有效。**M6 新增四条**：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| **K40** | **报错文案里写出的修法必须真的照做**：`assert.ok(current !== null, "…应改为只查 done")` 那种"说了不改"的判据，末棒必炸 | `tests/handoff-pointer.test.mjs` | 该测试（全部 ✅ 时） |
| **K41** | **变异靶子不许随进度消失**：靶子要**自己造出它需要的前置状态**（注入登记 + 注入引用 / 把状态翻回 ⬜），不依赖仓库里"还有一条未完成的东西" | `tools/mutate-gates.mjs` 的 L8 与 H1 | `mutate-gates`（靶子找不到 → SKIP → 不符预期） |
| **K42** | **发布留档的事实块按整行锚定**，且**至少读到一行**；空块必须红，不许"0 行 = 没问题" | `tools/check-release.mjs` 的 `parseFacts` | `tests/release.test.mjs` + 变异组 R1/R5 |
| **K43** | **门工具的"算不了"回 3，不与 0 合并**；用法错误回 2（`4` 是 `bin/` 的 CLI 语义，别混用） | `tools/check-release.mjs` 的 `finish()` | `tests/release.test.mjs`（`--online` 无 origin 时） |

既有重点（后续维护必须守住）：

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
| K37 | 契约块标记按**整行**锚定 | `tests/contract.test.mjs` |
| K38 | 契约块方向②按行归属校验 | `tests/contract.test.mjs` 的 `EXPECT` 表 |
| K39 | 四格表第 3 列点名的函数必须真实 export | `tests/contract.test.mjs` |

## 五、本机环境坑（只写实测过的）

1. **★ HTTPS 到 `github.com:443` 不通，SSH 通**（2026-11-01 实测）：`git push` 走 HTTPS 两次
   失败（`Recv failure: Connection was reset` / `Failed to connect ... port 443`），
   `curl https://github.com/` 同样超时；而 `curl https://api.github.com/` 回 200、
   `ssh -T git@github.com` 认证成功。**远端已改成 SSH 并验证 push/tag 均成功。**
   诊断顺序：先测 `curl https://github.com/` 与 `ssh -T git@github.com`，
   一个不通一个通 → 直接换 SSH 远端，不必改仓库内容、不必怀疑凭据。
2. **`/tmp` 在 Git Bash + Node 上不可用**：探针文件一律落仓库内 `tmp/`（已 gitignore）。
3. **Bash 里用 `node -e "…"` 时反引号会被 shell 当命令替换**：把脚本写到文件再 `node file`。
4. **`node --test` 不要用目录/glob 形式**：本项目一律逐文件列出，`LAYOUT.TESTS` 对账两处。
   **另实测**：`node --test` 的输出前缀在不同平台/版本会变（本机 `ℹ`，部分 CI 日志渲染成 `#`），
   抓日志里的测试计数时两种前缀都要认，否则会误判"某个 job 没有测试输出"。
5. **改门必须重跑变异宿主**：`node tools/mutate-gates.mjs`（约 2–4 分钟）。
6. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。
7. **Windows 目录联接**：`symlinkSync(target, path, "junction")` 不需要管理员权限。
8. **`readdirSync(dir, { recursive: true })` 的父路径字段**在不同 Node 版本是 `parentPath` 或 `path`
   （本机 v24 两个都在）。用 `entry.parentPath ?? entry.path`。
9. **ESM 测试文件里不许用 `require`**（本项目 `type: module`）。
10. **`bench` 的 `--clean` 若配在非 bench 命令上必须 exit 4**（显式报错），不许静默忽略。
11. **`git archive` 出的树不含 `node_modules`**：所以那档测试会显式 skip（30 条），
    **不是失败**；`check .` 会回退出码 3（`NO_NODEMODULES`），也是设计。
12. **git clone 出来的目录可能被占用而 `rm -rf` 失败**（Windows 文件锁）：
    换个从仓外发起的 `rm -rf` 再试，或先 `cd` 出去。

### M5 实测（录屏/截帧相关，若要重录 demo GIF）

13. **★ Python 重定向到文件时用 locale 编码**：本机 cp936，中文写成 GBK 字节 → 下游按 UTF-8 读整屏 `U+FFFD`。
    正解：写 `sys.stdout.buffer.write(s.encode("utf-8"))`。**与终端/ConPTY 无关。**
14. **★ Git Bash 的提示符挡不住 `user@HOST`**：`bash --norc` / `--rcfile` 都无效
    （`/etc/bash.bashrc` 仍被读）。正解：先发一条初始化命令清 PS1 与 `PROMPT_COMMAND` 并 `clear`，
    **然后才开始收集字节**。
15. **`pywinpty` 的 `PtyProcess.read()` 是阻塞的**：必须后台线程读，否则探针挂死。
16. **`agg` 有 Windows 原生 exe**；`asciinema` 没有，录制侧用 ConPTY 自己写 asciicast v2。

## 六、DoD 逐项 checklist（全项目出口判据）

### M6（本棒）

| # | DoD 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | 脱敏门 0 命中；`git archive <tag>` 解出树里能跑门 | ✅ | 0 命中（127 文件）；tag 树 130 文件复跑三道门全绿 |
| 2 | 干净环境（裸 clone + 无 `node_modules`）按 README 逐条敲通 | ✅ | 8 步实测，`plan/RELEASE-M6.md` §1.3 |
| 3 | ① tag ② Release（≥1 附件 + 本地副本 + sha256）③ 发布留档 | ✅ | `v0.1.0` + zip（1 238 166 B）+ `--online` 回取一致 |
| 4 | 发布门三档无 FAIL；进 CI 的是跨触发成立那一档 | ✅ | 三档实跑；CI 只挂离线档（R1–R6 变异全 CAUGHT） |
| 5 | CI 实跑（远端） | ✅ | 首轮 run `41322262071` + 全 ✅ 收尾轮 `41323571342`，均 **success**（7 job 全绿，六腿逐腿 222/192/0/30） |

**M6 出口判据全部达成。全项目 7/7 里程碑 ✅。**

## 七、关键命令速查

```bash
# 门（每次动仓库之前 + 每次收尾）
node tools/check-sprint-layout.mjs         # 布局门，期望 10 条全绿
node tools/check-desensitized.mjs          # 脱敏门，期望 0 命中
node tools/check-release.mjs               # 发布门（离线档），期望全绿 —— CI 挂的就是这一档
node tools/check-release.mjs --pre-tag     # tag 之前跑；tag 存在则必红
node tools/check-release.mjs --online      # tag 后跑；回取附件验 sha256 闭环
node tools/mutate-gates.mjs                # 三道门的变异验证，期望 26/26
node tools/verify-contract-mutations.mjs   # 契约测试的变异验证，期望 11/11

# 测试
npm test                                   # 装包环境 223/223；裸 clone 223/193 pass/30 skip

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

# 发布流程（顺序不可调换：tag → archive → sha256 → 回填 → 上传 → 回取）
git tag -a v<X.Y.Z> -m "…"
git archive --format=zip --prefix=depcheck-live-<X.Y.Z>/ -o dist-release/depcheck-live-<X.Y.Z>.zip v<X.Y.Z>
sha256sum dist-release/depcheck-live-<X.Y.Z>.zip     # 写进 plan/RELEASE-M6.md 事实块 + §二
gh release create v<X.Y.Z> dist-release/depcheck-live-<X.Y.Z>.zip --title … --notes …
node tools/check-release.mjs --online                # 回取校验，期望全绿

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**M6 是末棒**：本文件即 M6 的入口，收官形态已在本文件内补齐。
**不要开 `HANDOFF-M7.md`**——那会变成野编号超前入口，布局门半边②必红。
真要开新一轮，先按 §3.3 补 M7 到两处状态副本，再写它的入口。

**启动命令（用户侧，若要重读收官状态）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M6.md" 继续完成任务`

—— 读 `plan/HANDOFF-M6.md`（= **M6 的入口 + 全项目收官交接单**）。
本文件同时是 M6 的入口与收尾记录：M5 收尾时写的下一份入口就是它，M6 完成后在原文件内补齐收官形态。