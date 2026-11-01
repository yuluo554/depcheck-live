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
| attachmentSha256 | |

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

| 步骤 | 命令 | 期望 |
|---|---|---|
| 1 | `git clone <url> <中立目录>` | 成功，无 `node_modules` |
| 2 | `npm test` | 209 passed / 0 failed（逐文件登记，非 glob） |
| 3 | `node bin/depcheck-live.mjs --version` | `depcheck-live 0.1.0` |
| 4 | `node tools/check-sprint-layout.mjs` | 10 条判据全绿 |
| 5 | `node tools/check-desensitized.mjs` | 0 命中 |
| 6 | `node bin/depcheck-live.mjs selftest` | 8/8（现场造最小工程，不依赖本仓路径） |

> `bench` / `bench --clean` **不进**这一档：它们面对的是真实 `node_modules`（五包），
> 裸 clone 里没有装。这是**设计**，不是遗漏——`bench` 的可信度恰恰来自"面对真实依赖"，
> 用 mock 换来的绿没有证据力（`plan/04` §3）。

### 1.4 三道具实测（tag 前）

| 道具 | 命令 | 结果 |
|---|---|---|
| 单元/契约测试 | `npm test` | **209 / 209** |
| 布局门 | `node tools/check-sprint-layout.mjs` | **11 条全绿**（M6 新增 `LAYOUT.RELEASE` 判据变活） |
| 脱敏门 | `node tools/check-desensitized.mjs` | **0 命中** |
| 变异宿主（两道门） | `node tools/mutate-gates.mjs` | **20 / 20 CAUGHT** |
| 契约变异 | `node tools/verify-contract-mutations.mjs` | **11 / 11 CAUGHT** |
| 发布门（离线档） | `node tools/check-release.mjs` | **全绿** |

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

（待 tag 后追加）

## 三、覆盖对账

逐条对照 `plan/05` §2 的 M6 DoD 五项。**三态取其一**：`实现`（本仓有实物且已实跑）/
`不适用`（本项目形态下这一条不成立，写明为什么）/ `待首推`（要等远端 CI 真跑，不许提前写"已跑"）。

| # | DoD 项 | 本仓落点 | 状态 |
|---|---|---|---|
| 1 | 脱敏门 0 命中；`git archive <tag>` 解出树里能跑门 | `tools/check-desensitized.mjs`；解出树复跑记录见 §二 | 实现 |
| 2 | 干净环境（裸 clone + 无 `node_modules`）按 README 逐条敲通 | §1.3 六步；`bench` 一档**不适用**裸 clone（需真实 `node_modules`） | 实现 |
| 3 | ① git tag ② GitHub Release（≥1 附件 + 本地副本 + sha256）③ 本文件 | 口径 A：整个 tag 树的 zip，清单见 §1.5 | 实现 |
| 4 | `tools/check-release.mjs` 三档无 FAIL；进 CI 的是跨触发成立那一档 | 离线档挂 CI（`--pre-tag` 在 tag 推送时必红，`--online` 需网络与远端） | 实现 |
| 5 | CI 实跑（远端，三档 node × 两 OS） | `plan/05` §4 U1/U2；首推后据实补记 run id 与结论 | 待首推 |
| 6 | npm 发布（`npm publish` 到公共 registry） | **不适用**：本仓的交付形态是「仓库 + Release 附件」，不是 registry 包；`files` 字段只服务将来的可选发布，本轮不执行 | 不适用 |

## 四、发布门三档的适用面（为什么 CI 只能挂一档）

| 档 | 命令 | 判据 | 什么时候跑 | 能进 CI 吗 |
|---|---|---|---|---|
| 离线档 | `node tools/check-release.mjs` | 只读仓库内文件：`package.json` ↔ 事实块 ↔ 覆盖对账 | 任何触发 | **能，且只挂这一档** |
| tag 前档 | `node tools/check-release.mjs --pre-tag` | 上面那些 + **`v<X.Y.Z>` 这个 tag 还不存在** | 打 tag 之前，人手一次 | **不能**：它的前提在 tag 推送那一轮必不成立（必红） |
| 联网档 | `node tools/check-release.mjs --online` | 上面那些 + 远端 tag / Release / 附件清单 + **回取附件 sha256 闭环** | tag 后，人手一次 | **不能**：需网络 + `gh` 登录 + 已首推 |

环境不足（`gh` 不在 / 无 origin / 读不到 Release）时回**退出码 3**，不回 0
——与 `data/README.md` §5.1 同一条纪律：**"算不了"与"没事"必须落在不同退出码**。