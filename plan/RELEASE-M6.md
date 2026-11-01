# RELEASE-M6 — depcheck-live 发布留档

> 本文件是 **M6 的发布留档**（`plan/05` §5 第 4 条）。它由 `tools/check-release.mjs` 对账，
> 与 `package.json` 的 `version` 构成**版本三处一致**里的两处。
>
> **事实块**（下面那段 `RELEASE-FACTS`）是**机器读取**的唯一入口：`tools/check-release.mjs`
> 按**整行**锚定标记去切它（K37 —— 裸 `indexOf` 会命中本说明段落里引用的同名字面量，
> 切出空块而判据空跑）。改字段就改块里的表格，别在正文里另写一份数值副本。

<!-- RELEASE-FACTS:BEGIN -->

| 字段 | 值 |
|---|---|
| version | 0.1.0 |
| tag | v0.1.0 |
| attachment | depcheck-live-0.1.0.zip |
| attachmentSha256 | 44f00d5a0d9f2270003ea23b0a5f7cb727ca6f05bffaa1d8f8e1728ef47d8732 |

<!-- RELEASE-FACTS:END -->

## 一、tag 前事实

本节写的都是**打 tag 之前**的实测结果。凡"未执行"一律照实写"待首推"，
不把"未跑"写成"已跑"（`plan/06` R6）。

### 1.1 名字占用核对（建仓之前）

| 项 | 值 |
|---|---|
| 命令 | `gh api -X GET search/repositories -f q='depcheck-live in:name' --jq .total_count` |
| 结果 | **0** |
| 归属判定 | `depcheck-live` 在 GitHub 上无同名仓库、无映射，可直接建仓 |
| 备注 | `-X GET` 不能省（省略后 `gh api` 会按 POST 发，返回的是完全不同的东西）；0 必须来自成功响应，不是限流假 0 |

### 1.2 脱敏门

`node tools/check-desensitized.mjs` → **0 命中**。扫描面 124 个文本文件，豁免 3 份
（门自身两份 + 变异宿主，三者都必须写出被判据禁止的字面量才能当靶子）。
豁免面写成**文件集合**且有 `tests/gate-selfcheck.test.mjs` 逐条对账 `.gitignore` 的每个本地目录，
不靠人记。

### 1.3 干净环境验证（裸 clone，无 `node_modules`）

判据 = **从零 clone 出来的树，只靠 `npm test` 与三条 CLI 命令就能自证**，不预装任何东西。
本仓零第三方依赖（`dependencies` / `devDependencies` 皆空），所以 `npm install` 一步可省。

| 步骤 | 命令 | 实测结果（2026-11-01 本机） |
|---|---|---|
| 1 | `git clone <url> <中立目录>` | 成功；树内**无** `node_modules` |
| 2 | `npm test` | **222 tests / 192 pass / 0 fail / 30 skipped** |
| 3 | `node bin/depcheck-live.mjs --version` | `depcheck-live 0.1.0` |
| 4 | `node tools/check-sprint-layout.mjs` | 11 条判据全绿 |
| 5 | `node tools/check-desensitized.mjs` | 0 命中（127 个文本文件） |
| 6 | `node tools/check-release.mjs` | 全绿（离线档） |
| 7 | `node bin/depcheck-live.mjs selftest` | 8/8（现场造最小工程，不依赖本仓路径） |
| 8 | `node bin/depcheck-live.mjs check .` | **退出码 3**（`NO_NODE_MODULES`——"算不了"，不是"没事"） |

> **30 条 skip 是设计，不是欠债。** 它们全部是"需要真实五包"的那一档
> （`tests/fixtures-run.test.mjs` / `tests/bench.test.mjs` / `tests/fingerprints.test.mjs`），
> 代码里**显式 `t.skip(...)` 并在理由里写明缺什么**，不假装通过。
> 这也是第 8 步为什么回 3：没有 `node_modules` 时"零命中"与"算不了"必须落在不同退出码
> （`data/README.md` §5.1）。**把 30 条 skip 读成 30 条 pass 是假绿**——本节据实写 skip 数。

> `bench` / `bench --clean` **不进**这一档：它们面对的是真实 `node_modules`（五包），
> 裸 clone 里没有装。这是**设计**，不是遗漏——`bench` 的可信度恰恰来自"面对真实依赖"，
> 用 mock 换来的绿没有证据力（`plan/04` §3）。
> 装包后（`npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14`）那 30 条会转为实跑，
> 本机在装包状态下实测 **222 / 222 pass / 0 skip**。

### 1.4 三道具实测（tag 前）

| 道具 | 命令 | 结果（本机，2026-11-01，Node v24.15.0） |
|---|---|---|
| 单元/契约测试 | `npm test` | **222 / 222**（M5 收尾 209，M6 新增 13） |
| 布局门 | `node tools/check-sprint-layout.mjs` | **10 条全绿**（`LAYOUT.RELEASE` 在 M6 翻 ✅ 后变活，见 §二） |
| 脱敏门 | `node tools/check-desensitized.mjs` | **0 命中**（127 个文本文件） |
| 发布门（离线档） | `node tools/check-release.mjs` | **全绿** |
| 发布门（tag 前档） | `node tools/check-release.mjs --pre-tag` | **全绿**（`v0.1.0` 尚未创建） |
| 发布门（联网档） | `node tools/check-release.mjs --online` | tag 前 FAIL（缺 sha256）+ UNKNOWN（无 origin）→ **退出码 1**，属预期 |
| 变异宿主（三道门） | `node tools/mutate-gates.mjs` | **26 / 26 CAUGHT**（M5 时 20 组，M6 新增 R1–R6） |
| 契约变异 | `node tools/verify-contract-mutations.mjs` | **11 / 11 CAUGHT** |

> `--online` 在 tag 前失败**不是缺陷**：它的判据要求"附件已在远端且 sha256 能回取闭环"，
> tag 未创建时这个前提不成立。三档各自的前提与适用面见 §四。

### 1.5 附件清单（口径 A 定稿）

`plan/05` §4 的 U4 记着"附件形态 `<ver>.zip` 已定、内容清单未定稿"。本节**定稿**：

| 项 | 值 |
|---|---|
| 文件名 | `depcheck-live-0.1.0.zip` |
| 内容 | **整个 tag 树的 `git archive`**（`bin/` `src/` `tests/` `tools/` `fixtures/` `data/` `docs/` `plan/` `SKILL.md` `AGENTS.md` `README.md` `LICENSE` `package.json`） |
| 不含 | `node_modules/`、`tmp/`、`.mimosa/`、`dist-release/` 等本地目录（`git archive` 只打已入库文件，天然不含） |
| 理由 | 双交付形态（CLI + Agent Skill）都在附件里；`SKILL.md` 与 `plan/` 是提交材料的一部分，缺了就只剩半份交付 |
| 本地留档 | `dist-release/depcheck-live-0.1.0.zip`（`dist-release/` 已 gitignore）+ sha256 写入本文件 §二 |

> **sha256 为什么只能 tag 后追加**：zip 由 tag 树产出，而本文件在 tag 树里。
> 把 sha256 写进本文件再打包，sha256 会随内容变化而失效（自指）。
> 所以顺序固定：**打 tag → archive → 算 sha256 → 在 `main` 上追加 §二 → 上传附件**。

## 二、tag 后追加

> **本节在 tag 之前必须留空但存在**（布局门 `LAYOUT.RELEASE` 断言两栏齐）。
> tag 之后才允许往里追加，追加的都是**事后事实**：真实 run id、回取校验、解出树复跑结果。
> **补记是追加，不回填、不改写上方 §一 的历史措辞**——写错就另起一条更正。

### 2.1 tag 与 Release（实跑，2026-11-01）

| 项 | 值 |
|---|---|
| tag | `v0.1.0`（annotated，指向提交 `6aa8899`） |
| 远端仓库 | `https://github.com/yuluo554/depcheck-live`（public） |
| Release URL | `https://github.com/yuluo554/depcheck-live/releases/tag/v0.1.0` |
| 附件 | `depcheck-live-0.1.0.zip`（1 238 166 字节，state `uploaded`） |
| 附件 sha256 | `44f00d5a0d9f2270003ea23b0a5f7cb727ca6f05bffaa1d8f8e1728ef47d8732` |
| 本地副本 | `dist-release/depcheck-live-0.1.0.zip`（`dist-release/` 已 gitignore，不入库） |

生成方式：`git archive --format=zip --prefix=depcheck-live-0.1.0/ -o … v0.1.0`。
**先 tag、再 archive、再算 sha256、最后写回本节** —— zip 内容含本文件，若先把 sha256 写进来，
打包后 sha256 立刻失效（自指）。顺序不可调换。

### 2.2 CI 首推实跑（`plan/05` §4 U1/U2 收口）

| 项 | 值 |
|---|---|
| run id（**首次推送**） | **`41322262071`** |
| 触发 | `push` → `main`，head sha `7accbe37cf2c8892be21a8129d71d3b549b5da19` |
| 结论 | **success**（7 个 job 全绿） |
| job 明细 | 门（布局 / 脱敏 / 发布 / 变异）× 1；测试 × 6（node 20 / 22 / 24 × ubuntu / windows） |
| 测试实测 | 六条矩阵腿**逐腿一致**：`tests 222 / pass 192 / fail 0 / skipped 30` |
| 门实测 | 布局门全绿、脱敏门 0 命中、发布门离线档全绿、变异宿主 **26/26 CAUGHT** |

| 项 | 值 |
|---|---|
| run id（**收尾提交**） | **`41323571342`**（sha `b45df57`）与 **`41324209400`**（sha `8f97ca2`，含 §2.6 全部修正） |
| 结论 | 两条均 **success**（各 7 个 job 全绿） |
| 意义 | 这两轮跑的是**全部 ✅ 的仓库**（状态副本已翻完 + 判据/文档修正已提交）——**首轮跑不到这个形态**。 |
| 测试实测 | `41323571342`：六腿 `222 / 192 pass / 30 skip`；`41324209400`（最终）：六腿 `223 / 193 pass / 30 skip / fail 0` |

> **两轮都要记**：首轮覆盖"发布门刚落位、M6 还显示 ⬜"的形态；第二轮覆盖"全 ✅ + 判据修正"的形态。
> 只记首轮会漏掉后者——而**后者恰恰是 §2.6 那两处修正要证明的东西**。
> 另有一条旁证：同日还有一条中间提交的 run（`41322593052`，sha `6aa8899`）也是 success，
> 即 `v0.1.0` **tag 指向的那个提交**在远端 CI 上同样全绿。

> **30 条 skip 在 CI 上同样是设计**：CI 不装五包（零依赖承诺 → 不跑 `npm install`），
> 那档测试显式 `t.skip` 并写明缺什么。**不许把 30 条 skip 读成 30 条 pass。**
> 跨 node 版本（20/22/24）与两 OS 的行为差异至此**已由远端实跑证明**（U2 收口）。

### 2.3 `git archive v0.1.0` 解出树复跑（DoD 第 1 条后半）

在 `git archive v0.1.0` 解出的树（130 个文件，**不含 `node_modules`**）里逐条实跑：

| 命令 | 结果 |
|---|---|
| `node tools/check-sprint-layout.mjs` | 全绿（20 个测试文件 × 两处登记一致） |
| `node tools/check-desensitized.mjs` | **0 命中**（127 个文本文件） |
| `node tools/check-release.mjs` | 全绿（离线档） |
| `npm test` | 222 / 192 pass / 0 fail / 30 skipped |
| `node bin/depcheck-live.mjs selftest` | 8 / 8 |

### 2.4 Release 回取校验（`--online` 档闭环）

`gh release download v0.1.0 -p depcheck-live-0.1.0.zip` 回取后重算 sha256，
与留档值逐字节比对——结果见下方「2.5 回取结果」。**回取是独立于上传链路的一步**：
只看"上传成功"无法排除传输损坏或传错了文件。

### 2.5 回取结果

`node tools/check-release.mjs --online` → **全绿**（退出码 0）。逐条：

| 判据 | 结果 |
|---|---|
| `RELEASE.ONLINE` | Release `v0.1.0` 有 1 个附件：`depcheck-live-0.1.0.zip` |
| `RELEASE.ONLINE_ASSET` | **回取**该附件后重算 sha256 = `44f00d5a0d9f…`，与留档值一致 |
| `RELEASE.LOCAL_COPY` | `dist-release/` 本地副本与留档 sha256 逐字节一致 |

回取的独立副本由门自己在 `tmp/` 下取、自己算、自己比——**不读上传时的中间产物**，
所以这条闭环证明的是"用户下载到的东西 = 留档记的东西"。

### 2.6 tag 之后的两处判据修正（**必须记录，不许悄悄改**）

`v0.1.0` 打完之后，状态副本全部翻 ✅ 时暴露出**两处判据锚了"进度状态"**的缺陷。
两者都是**真缺陷**，不是整理：它们只在"还有 ⬜ 里程碑"时成立，末棒必炸。

| # | 文件 | 缺陷 | 修法 |
|---|---|---|---|
| 1 | `tests/handoff-pointer.test.mjs` | 写死 `assert.ok(current !== null, "…全部 ✅ 时本测试应改为只查 done")` —— **报错文案自己写出了修法，代码没照做**。M6 翻 ✅ 后必炸 | 按文案修：`required = done ∪ (current ?? ∅)` |
| 2 | `tools/mutate-gates.mjs` 的 **H1** 组 | 靶子取"状态表里最小号的 ⬜"，全 ✅ 后没有 ⬜ → **SKIP**（宿主纪律②：SKIP 也算不符预期） | 靶子自己造前置状态：把状态表最小那行（**两个副本同时**）翻回 ⬜，让它成为"当前在做的"，再删其入口 |
| 3 | `tests/release.test.mjs` 的覆盖对账断言 | 首版要求"三态**各至少出现一次**"——发布做完后"待首推"会**合法地**全部消失，这条要求等于逼仓库永不完结 | 改成"每行状态格必须**落在三态之内**"（不许自造措辞）+ 至少一行是"实现"（防整表全是"不适用"空转） |
| 4 | `README.md` 的「从仓库直接跑（无需安装）」 | 那条 `node bin/depcheck-live.mjs check .` 在裸 clone 里回 **退出码 3**（`NO_NODE_MODULES`）——**"无需安装"与"能跑通"是两件事**，读者会把它读成"跑通了" | 改成如实说明：本仓 gitignore 了 `node_modules/`，所以 `check .` 回 3 是**设计**；裸 clone 里能跑的是 `--version` / `selftest` / `npm test`，跑 `bench` 需先装五包 |
| 5 | `tools/check-release.mjs` 的回取目录 | 原落在仓库内 `tmp/release-download-<pid>/` **且从不删除**：每跑一次 `--online` 就在工作树里留一份 1.2 MB 的 zip 副本（实测 `tmp/` 下积了 **14 个**目录）。`tmp/` 已 gitignore，所以这条泄漏在 `git status` 上**看不见** | 改成 `mkdtempSync(tmpdir())` + `finally rmSync` 清理；补一条测试断言"跑完 `--online` 后仓库 `tmp/` 不多出任何条目" |

> **第 5 条是"门自己违反本仓既定口径"**：`HANDOFF-M6` §二第 13 条与 §五第 2 条都写着
> "临时工程一律 `mkdtempSync(tmpdir())`"，而发布门自己没照做。
> **判据门不该往被测仓库里写东西**——`tmp/` 已 gitignore 只是让泄漏看不见，不是不让它发生。

> **第 4 条是本棒唯一一处"文档承诺与实测行为不一致"**：实测（`git archive v0.1.0` 解出树里
> 跑那条命令）才发现。修的是 README 的措辞，**不是工具的行为**——工具回 3 是对的。

> **诚实口径，写清代价**：第 1、2、4、5 条修正都在 tag **之后**，所以 **`v0.1.0` 的 zip 附件里是旧写法**
> （第 4 条尤其明显：附件里的 README 仍写着"无需安装"；第 5 条：附件里的发布门仍会往 `tmp/` 写）。
> 旧写法在各自语境里都能自洽（tag 树里 M6 仍显示 ⬜ —— 状态副本是打 tag 那一刻的快照），
> 但任何一个"全 ✅"的仓库、一个照 README 敲命令的新用户，或一个反复跑 `--online` 的人都会撞上。
> **下一个 tag 会带上这些修正。**
> 第 3 条（本文件的覆盖对账断言）在 tag 时**还只是"三态各至少一次"**且当时成立
> （那时确实有"待首推"行），所以 tag 树里它是对的；它变成缺陷是在状态翻完之后。
> `plan/RELEASE-M6.md` 与 `plan/HANDOFF-M6.md` §一 都据实写了，**不回填 §一 的历史措辞**。

> **同族统计**：本仓至今撞了 **5 次**"判据/靶子锚进度"（`mutate-gates` H2 ×2、L8 ×1、H1 ×1、
> `release.test.mjs` 覆盖对账 ×1）+ **1 次**"报错文案说了修法却没照做"（第 1 条）。
> 已升为 K40 / K41 两条口径，写进 `plan/HANDOFF-M6.md` §四。改任何门、靶子或断言之前先跑三句自问：
> ①这个判据/靶子会不会因为本棒干完活而消失？②它报错文案里写的修法我照做了吗？
> ③它要求"某个状态必须存在"吗——那等于要求仓库永远停在那一步？

### 2.7 一处实测环境事实（不影响产物，但会影响复现）

本机 `git push` 走 HTTPS 时连不上 `github.com:443`（`curl https://github.com/` 同样超时），
而 `api.github.com` 与 SSH 通道都正常。处置：**远端改用 SSH**（`git@github.com:yuluo554/depcheck-live.git`），
push 与 tag 推送均成功。`gh` 命令走 API 链路，不受影响。

> 这条**只写现象与既有处置**，不推测成因（可能与本机网络策略有关，未验证）。
> 下一棒若换机器复现 push 失败，先分别测 `curl https://github.com/` 与 `ssh -T git@github.com`：
> 一个不通一个通 → 换 SSH 远端即可，不必改仓库内容。

## 三、覆盖对账

逐条对照 `plan/05` §2 的 M6 DoD 五项。**三态取其一**：`实现`（本仓有实物且已实跑）/
`不适用`（本项目形态下这一条不成立，写明为什么）/ `待首推`（要等远端 CI 真跑，不许提前写"已跑"）。

| # | DoD 项 | 本仓落点 | 状态 |
|---|---|---|---|
| 1 | 脱敏门 0 命中；`git archive <tag>` 解出树里能跑门 | `tools/check-desensitized.mjs`；解出树复跑记录见 §2.3 | 实现 |
| 2 | 干净环境（裸 clone + 无 `node_modules`）按 README 逐条敲通 | §1.3 八步；`bench` 一档**不适用**裸 clone（需真实 `node_modules`） | 实现 |
| 3 | ① git tag ② GitHub Release（≥1 附件 + 本地副本 + sha256）③ 本文件 | 口径 A：整个 tag 树的 zip，清单见 §1.5、实跑见 §2.1 | 实现 |
| 4 | `tools/check-release.mjs` 三档无 FAIL；进 CI 的是跨触发成立那一档 | 离线档挂 CI（`--pre-tag` 在 tag 推送时必红，`--online` 需网络与远端） | 实现 |
| 5 | CI 实跑（远端，三档 node × 两 OS） | 实跑 run `41322262071`，7 job 全绿，见 §2.2 | 实现 |
| 6 | npm 发布（`npm publish` 到公共 registry） | **不适用**：本仓的交付形态是「仓库 + Release 附件」，不是 registry 包；`files` 字段只服务将来的可选发布，本轮不执行 | 不适用 |

> **状态列只写三态本身**（`实现` / `不适用` / `待首推`），证据写在前一列。
> 理由：`tests/release.test.mjs` 逐行断言状态格必须落在三态之内——写"实现（见 §2.2）"
> 这种带括号的混写会被判成"自造措辞"，而自造措辞正是"没做"藏身的地方。
> 这不是形式主义：判据要能机器读，就不能允许自由文本混进状态格。

## 四、发布门三档的适用面（为什么 CI 只能挂一档）

| 档 | 命令 | 判据 | 什么时候跑 | 能进 CI 吗 |
|---|---|---|---|---|
| 离线档 | `node tools/check-release.mjs` | 只读仓库内文件：`package.json` ↔ 事实块 ↔ 覆盖对账 | 任何触发 | **能，且只挂这一档** |
| tag 前档 | `node tools/check-release.mjs --pre-tag` | 上面那些 + **`v<X.Y.Z>` 这个 tag 还不存在** | 打 tag 之前，人手一次 | **不能**：它的前提在 tag 推送那一轮必不成立（必红） |
| 联网档 | `node tools/check-release.mjs --online` | 上面那些 + 远端 tag / Release / 附件清单 + **回取附件 sha256 闭环** | tag 后，人手一次 | **不能**：需网络 + `gh` 登录 + 已首推 |

环境不足（`gh` 不在 / 无 origin / 读不到 Release）时回**退出码 3**，不回 0
——与 `data/README.md` §5.1 同一条纪律：**"算不了"与"没事"必须落在不同退出码**。