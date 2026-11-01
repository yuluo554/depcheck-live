# 00 · 项目总览 — 11-1-depcheck-live

> 本项目遵循 `ai-tool-project-sprint` 方法论；布局门 `node tools/check-sprint-layout.mjs`；装订日期 2026-11-01。

## 1. 文档索引

| 编号 | 文档 | 状态 |
|---|---|---|
| 00 | `plan/00-README总览.md` | ✅ 本文件 |
| 01 | `plan/01-题目文档.md` | ✅ 定稿 v1 |
| 02 | `plan/02-架构与技术选型.md` | ✅ M0 |
| 03 | `plan/03-模块详设.md` | ✅ M3（模块 ①②③ 已回填实测口径；④ `drift` 已落位；⑤ 报告 M5 已落位） |
| 04 | `plan/04-数据计划.md` | ✅ M3（语料 C1–C7 已全部落地并逐点对账） |
| 05 | `plan/05-里程碑与发布.md` | ✅ M0 |
| 06 | `plan/06-交付对标与决策.md` | ✅ M0 |
| — | `data/README.md` | ✅ 依据查证 + 口径唯一定义 |
| — | `AGENTS.md` | ✅ 方法论锚点（新对话入口） |

## 2. 决策记录

### 2.1 已定决策

| 日期 | 决策 | 结论与理由 |
|---|---|---|
| 2026-11-01 | 交付形态收敛为 **CLI + Agent Skill**（双形态） | 两形态**均有逐形态验收**（见 §5 四格表）。不设 GUI、不设 MCP。 |
| 2026-11-01 | 生态范围锁死 **Node/TS** | Python 的 import 解析、Go 的 module、Rust 的 crate 各有不同判据面，首期全做等于四个项目。**明确降级为扩展项**。 |
| 2026-11-01 | 判据用 **`exports` 的 `require` 分支存在性**，**不用 `type` 字段** | 实测 `zod`/`date-fns`/`glob` 均为 `type: module` 却可正常 `require`；只看 `type` 会把它们全判成 MISMATCH → **系统性假阳性**。 |
| 2026-11-01 | 不执行被测工程代码 | 执行会引入副作用与不可复现性。静态解析不到的一律 `AMBIGUOUS`。 |
| 2026-11-01 | 不碰 `FixProve/fixprove` 代码 | 其实测 TS/JS 侧为 0 findings，但其设计意图与本案重合；**只做竞品记录，不引用不移植**。 |
| **2026-11-01** | **实现语言 = Node 24 零第三方依赖 ESM**（用户拍板，推翻初稿的 Python 口径） | ① 本题的判据面本身就是 Node 的 resolve 语义，用 Node 实现可**当场交叉验证**（判据三态：`exports` 静态解析 vs `require.resolve` 实测）；② 零依赖可直接用 `node --test` / `node:fs`，无需任何 npm 包；③ 跨版本矩阵 = CI 的 node 20/22/24，与判据面同构。**同步改动**：`package.json`（`bin`/`type: module`/`engines`）取代 `pyproject.toml`，`.gitignore` 的 Python 段保留但注明不适用，`plan/00` §5 与 `AGENTS.md` §四 已改为 Node 口径。 |
| 2026-11-01 | **版本单一来源 = `package.json` 的 `version`** | 代码侧从 `package.json` 读（`import pkg from "../package.json" with { type: "json" }` 在 20/22 上不一致，改用 `readFileSync` + `JSON.parse` 一处函数），tag 与 `package.json` 由发布门对账。**两处必须一起改**。 |
| 2026-11-01 | **`README.md` 不承载里程碑状态** | 随包读者手里没有 `plan/`，让 README 判"发布到哪一步"必然滞后一步。状态一律看 `plan/05`。因此布局门的 `STATUS_COPIES` 只有 2 张表 + 台账 = 3 处副本（`AGENTS.md` §二 已写明）。 |
| 2026-11-01 | **M0 不豁免交接单** | M0 收尾照写 `plan/HANDOFF-M0.md`，让 HANDOFF 判据从第一天起就有活靶子（豁免＝该判据在前期空转）。 |

### 2.2 未采用方向（弃选项与理由）

| 未采用 | 理由 |
|---|---|
| 包发布合规检查 | `publint` 1310★ + `arethetypeswrong` 1613★ 已占且成熟，属**包作者视角**，与本案输入形态不同。 |
| 未使用导入检测 | `knip` 12560★ 已占，且是**反方向**（"用了的"vs"没用的"）。 |
| 给 AI 喂文档（L1 文档层） | `context7` 64033★ 已占，L1/L2 直接放弃。 |
| GitHub Actions 未知 key 校验 | `actionlint` 4370★ 已占。 |
| 跨方言 cron 判定 | 缝隙存在但**太窄撑不起一题**，降级为后续扩展。 |
| Python / Go / Rust 生态 | 判据面各不相同，首期做四个等于四个项目；**降级为扩展项**。 |
| **Python 实现** | 见 §2.1 第 6 行：判据面与运行时同构带来可交叉验证的好处。 |
| **引入 TypeScript/Babel 等 AST 解析器** | 引入即破坏"零第三方依赖"承诺，且被测项目不一定装了它们。首期用手写词法级抽取 + 显式 `AMBIGUOUS` 兜底（见 `plan/03` §2）。 |
| 错误码编目（同批另一题方向） | 已独立成同系列另一题，本案不重复覆盖，两仓文档互不提及。 |

## 3. 承诺-证据台账（全项目唯一一份）

| 承诺项 | 素材来源 | 交付物内可达性 | 核验方式 | 状态 |
|---|---|---|---|---|
| `RESOLVED` 判定 | 真实 `node_modules/*/package.json` | ✅ 只读本地文件 | `bench` 正例集（C1 resolved-basic） | ✅ M3 |
| `MISSING-EXPORT` 判定 | 同上 + 导出集解析 | ✅ | `bench` 反例集（C2 missing-export） | ✅ M3 |
| `ESM-CJS-MISMATCH` 判定 | `exports.require` 分支存在性 | ✅ | `bench` 对照组（C3 chalk vs zod/date-fns/commander/glob） | ✅ M3 |
| `NOT-EXPORTED-SUBPATH` 判定 | `exports` 子路径屏蔽 | ✅ | `bench`（C4，chalk/commander 的 `./package.json`） | ✅ M3 |
| `AMBIGUOUS` 判定 | 动态形态识别 | ✅ | `bench` 动态样例（C5） | ✅ M3 |
| `VERSION-BEHAVIOR-DRIFT` 判定 | 离线指纹包 | ✅ | `bench` + C6 逐点对账（离线基线 `data/fingerprints/`） | ✅ M3 |
| 退出码语义可分 | `data/README.md` §5 | ✅ | `selftest`（8 条断言覆盖 0/1/3/4）+ `tests/selftest.test.mjs` + `tests/cli.test.mjs` | ✅ M4 |
| 干净工程零误报 | 合成干净语料 | ✅ | `bench --clean`（C7：problems=0 且 totalPoints=7） | ✅ M4 |
| Skill 契约块双向一致 | `SKILL.md` ↔ `src/contract.mjs` | ✅ | `tests/contract.test.mjs`（双向 + 按行归属）+ `tools/verify-contract-mutations.mjs`（11/11 CAUGHT） | ✅ M5 |
| 裸 clone 可复现 | README 步骤 | ✅ | 手工 + CI（待首推） | ⬜ 待 M6 |
| 布局门可跑红（10 条判据） | `tools/check-sprint-layout.mjs` | ✅ | `tools/mutate-gates.mjs` | ✅ M0 |
| `exports` 六形态语义经原文+实测双源核对 | Node 官方 `packages.html` + `esm.html` 解析算法 + 本机实测 | ✅ | `tests/resolve.test.mjs`（每条标注实测编号） | ✅ M1 |
| 五包 `exports` 指纹可独立复算 | `data/packages/*.json` 的 `canonical` | ✅ | `tests/fingerprints.test.mjs` + `--check` 逐字节 | ✅ M1 |
| 阈值口径文档↔代码一致 | `data/README` §5.3 ↔ `src/contract.mjs` `LIMITS` | ✅ | `tests/thresholds.test.mjs`（双向） | ✅ M1 |
| 六份语料骨架含证伪说明 | `fixtures/*/INPUT.md` + `expected.json` | ✅ | `tests/fixtures.test.mjs` | ✅ M1 |

> **本台账状态列必须与里程碑同一次提交里一起翻转。** 其他文档只可引用，不得复制。

## 4. 里程碑

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 计划套件 + 方法论装订 + 可运行骨架（CLI 参数面 + 模块接口 + 两道门） | ✅ 已完成 |
| M1 | 数据先行：`exports` 六形态语义核对入 `data/README` §5、五包对照组指纹与六份语料定稿 | ✅ 已完成 |
| M2 | 解析层：`exports` 解析器 + 引用点抽取器 + `fixtures/` 落地（含 `snapshot` / `scan` 命令） | ✅ 已完成 |
| M3 | 判定层：五个判定态 + `drift`（离线基线）+ `bench` | ✅ 已完成 |
| M4 | 基准：`bench` / `selftest` / 退出码断言 / 干净零误报集 | ✅ 已完成 |
| M5 | 交付：CLI 完整面 + `SKILL.md`（契约块双向断言）+ 技术报告 + demo GIF | ✅ 已完成 |
| M6 | 发布：脱敏 + 干净环境验证 + 建仓 + CI 首跑 + tag + Release | ⬜ 待 M6 |

## 5. 逐形态验收四格表

| 形态 | 主入口 | 主命令/控件 | 接到哪个业务函数 | 断言在哪条测试 | 产物在哪个附件 |
|---|---|---|---|---|---|
| CLI | `package.json` 的 `bin` 字段 | `depcheck-live check <path> --json` | `src/api.mjs::checkAll()` | `tests/cli.test.mjs` | Release 附件 `depcheck-live-<ver>.zip` |
| Agent Skill | `SKILL.md` 契约块 | 契约块声明的五判定态 + 退出码 | `src/api.mjs::checkAll()` + `src/api.mjs::decideExit()` | `tests/contract.test.mjs`（双向断言） | 同上 |

> **任一行有空格 → 该形态视为未交付。** 本表在 M5 逐格填绿。
> 第 3 列点名的函数由 `tests/contract.test.mjs` 的"四格表点名的函数必须真实 export"断言守门
> ——**M0 的 `src/api.mjs::run()` 与 `src/check.mjs::checkAll()` 都是悬空引用**（`run` 从不存在，
> `checkAll` 实际在 `api.mjs`），M5 已修实为真实存在的 `checkAll()` / `decideExit()`。

## 6. 招牌动词表

| 能力名词 | 哪条交付态命令产出它 | 哪条基准/测试断言它 |
|---|---|---|
| `RESOLVED` | `check` 的 `findings[].status` | `bench` 正例集 |
| `MISSING-EXPORT` | 同上 | `bench` 反例集 |
| `ESM-CJS-MISMATCH` | 同上 | `bench` 对照组（chalk/commander vs zod/date-fns/glob） |
| `NOT-EXPORTED-SUBPATH` | 同上 | `bench` 子路径集 |
| `AMBIGUOUS` | 同上 | `bench` 动态集 |
| `VERSION-BEHAVIOR-DRIFT` | `drift` 命令 | `bench` 离线指纹集 |
| 退出码语义 | `check` 的进程退出码 | `selftest` 断言（覆盖 0/1/3/4）+ `tests/cli.test.mjs` |

## 7. 提交材料实物表

| 承诺项 | 应存在的文件路径 | 由哪个里程碑产出 | 用哪条命令核对 |
|---|---|---|---|
| 题目文档 | `plan/01-题目文档.md` | M0 | `git ls-files` |
| 架构选型 | `plan/02-架构与技术选型.md` | M0 | `git ls-files` |
| 模块详设 | `plan/03-模块详设.md` | M0 | `git ls-files` |
| 数据计划 | `plan/04-数据计划.md` | M0 | `git ls-files` |
| 基准语料 | `fixtures/*/INPUT.md` + `expected.json` + `src/` | ✅ M4（C1–C7 全落地；C7 由 `bench --clean` 验） | `git ls-files fixtures/` |
| 自测与基准 | `tests/` + `selftest`/`bench` 命令 | ✅ M4（`bench` M3、`bench --clean` 与 `selftest` M4） | `npm test && node bin/depcheck-live.mjs bench` |
| Agent Skill | `SKILL.md` | M5 | `git ls-files SKILL.md` |
| 技术报告 | `docs/技术报告.md` | M5 | `git ls-files docs/` |
| 演示产物 | `docs/demo/demo.gif` | M5 | `git ls-files docs/demo/` |
| 发布留档 | `plan/RELEASE-M6.md` | M6 | `git cat-file -e <tag>:plan/RELEASE-M6.md` |

## 8. 诚实口径

M0 的 CI 类 DoD 一律写"**本地等价校验（未接远端，CI 待首推验证）**"。本仓库当前**无远端**，
`gh` 已登录但未建仓；M6 首推后据实补记真实 run id（**补记是追加事实，不回填美化历史措辞**）。