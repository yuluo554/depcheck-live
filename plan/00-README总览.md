# 00 · 项目总览 — 11-1-depcheck-live

## 1. 文档索引

| 编号 | 文档 | 状态 |
|---|---|---|
| 00 | `plan/00-README总览.md` | ✅ |
| 01 | `plan/01-题目文档.md` | ✅ 定稿 v1 |
| 02 | `plan/02-架构与技术选型.md` | ⬜ 待 M1 |
| 03 | `plan/03-模块详设.md` | ⬜ 待 M1 |
| 04 | `plan/04-数据计划.md` | ⬜ 待 M1 |
| 05 | `plan/05-里程碑与发布.md` | ⬜ 待 M1（M6 DoD 已在本文件 §4 预写死） |
| 06 | `plan/06-交付对标与决策.md` | ⬜ 待 M1 |
| — | `data/README.md` | ✅ 依据查证 + 口径唯一定义 |

## 2. 决策记录

| 日期 | 决策 | 结论与理由 |
|---|---|---|
| 2026-11-01 | 交付形态收敛为 **CLI + Agent Skill**（双形态） | 两形态**均有逐形态验收**（见 §5 四格表）。不设 GUI、不设 MCP。 |
| 2026-11-01 | 生态范围锁死 **Node/TS** | Python 的 import 解析、Go 的 module、Rust 的 crate 各有不同判据面，首期全做等于四个项目。**明确降级为扩展项**。 |
| 2026-11-01 | 判据用 **`exports` 的 `require` 分支存在性**，**不用 `type` 字段** | 实测 `zod`/`date-fns`/`glob` 均为 `type: module` 却可正常 `require`；只看 `type` 会把它们全判成 MISMATCH → **系统性假阳性**。 |
| 2026-11-01 | 不执行被测工程代码 | 执行会引入副作用与不可复现性（踩 preflight「只读字节」纪律）。静态解析不到的一律 `AMBIGUOUS`。 |
| 2026-11-01 | 放弃方向：包发布检查 | `publint` 1310★ + `arethetypeswrong` 1613★ 已占且成熟，属**包作者视角**，与本案输入形态不同。 |
| 2026-11-01 | 放弃方向：未使用导入 | `knip` 12560★ 已占，且是**反方向**（"用了的"vs"没用的"）。 |
| 2026-11-01 | 放弃方向：文档供给 | `context7` 64033★、`xerj` 17985★ 彻底饱和。四层里 L1/L2 直接放弃。 |
| 2026-11-01 | 放弃方向：GitHub Actions 未知 key | `actionlint` 4370★ 已占。 |
| 2026-11-01 | 放弃方向：跨方言 cron | 太窄撑不起一题（`cron dialect difference`=0 但有缝无体量），降级为后续扩展。 |
| 2026-11-01 | 不碰 `FixProve/fixprove` 代码 | 其实测 TS/JS 侧为 0 findings，但其设计意图与本案重合；**只做竞品记录，不引用不移植**。 |

## 3. 承诺-证据台账（全项目唯一一份）

| 承诺项 | 素材来源 | 交付物内可达性 | 核验方式 | 状态 |
|---|---|---|---|---|
| `RESOLVED` 判定 | 真实 `node_modules/*/package.json` | ✅ 只读本地文件 | `bench` 正例集 | ⬜ 待 M3 |
| `MISSING-EXPORT` 判定 | 同上 + 导出集解析 | ✅ | `bench` 反例集 | ⬜ 待 M3 |
| `ESM-CJS-MISMATCH` 判定 | `exports.require` 分支存在性 | ✅ | `bench` 对照组（chalk vs zod/glob） | ⬜ 待 M3 |
| `NOT-EXPORTED-SUBPATH` 判定 | `exports` 子路径屏蔽 | ✅ | `bench`（chalk/commander 的 `./package.json`） | ⬜ 待 M3 |
| `AMBIGUOUS` 判定 | 动态形态识别 | ✅ | `bench` 动态样例 | ⬜ 待 M3 |
| 退出码语义可分 | `data/README.md` §5 | ✅ | `selftest` 断言 | ⬜ 待 M4 |
| 干净工程零误报 | 合成干净语料 | ✅ | `bench --clean` | ⬜ 待 M4 |
| Skill 契约块双向一致 | `SKILL.md` ↔ `src` | ✅ | `tests/test_contract.py` | ⬜ 待 M5 |
| 裸 clone 可复现 | README 步骤 | ✅ | 手工 + CI | ⬜ 待 M6 |

> **本台账状态列必须与里程碑同一次提交里一起翻转。** 其他文档只可引用，不得复制。

## 4. 里程碑初稿

| 里程碑 | 内容 | DoD |
|---|---|---|
| **M1 数据先行** | `exports` 语义核对、五包对照组落地、`data/README.md` §5 口径定稿 | `data/README.md` 口径通过 `check_topic.py`；对照表可复现 |
| **M2 解析** | `exports` 解析器 + AST/字符串抽取器 + 基准语料骨架 | 解析器对 5 个真实包含 `UNPARSEABLE`=0 |
| **M3 判定** | 五个判定态实现 | `bench` 全绿，含对照组 |
| **M4 基准** | 植入真值语料 + 干净零误报集 + 退出码断言 | `selftest`/`bench` 可跑，退出码语义断言通过 |
| **M5 交付** | CLI + `SKILL.md`（契约块双向断言）+ 技术报告 + demo GIF | 四格表全绿；`docs/技术报告.md`、`docs/demo/demo.gif` 存在 |
| **M6 发布** | 公开发布 | **①git tag ②GitHub Release（附产物：≥1 个手工上传附件，本地留副本 + sha256 留档）③`plan/RELEASE-M6.md`（tag 前落盘，tag 后事实分栏追加）**；`check_release.py` 无 FAIL |

> **DoD 口径二选一，本仓选 A：Release 附产物。** 该口径自 M1 起**不得删改或降级**。

## 5. 逐形态验收四格表

| 形态 | 主入口 | 主命令/控件 | 接到哪个业务函数 | 断言在哪条测试 | 产物在哪个附件 |
|---|---|---|---|---|---|
| CLI | `pyproject.toml` `[project.scripts]` | `depcheck-live check <path>` | `resolve.check_all()` | `tests/test_cli_exitcode.py` | Release 附件 `depcheck-live-<ver>.zip` |
| Agent Skill | `SKILL.md` | 契约块声明的五判定态 + 退出码 | `src/depcheck_live/api.py::run()` | `tests/test_contract.py`（双向断言） | 同上 |

> **任一行有空格 → 该形态视为未交付。** 本表在 M5 逐格填绿。

## 6. 招牌动词表

| 能力名词 | 哪条交付态命令产出它 | 哪条基准/测试断言它 |
|---|---|---|
| `RESOLVED` | `check` 的 `findings[].status` | `bench` 正例集 |
| `MISSING-EXPORT` | 同上 | `bench` 反例集 |
| `ESM-CJS-MISMATCH` | 同上 | `bench` 对照组（chalk/commander vs zod/date-fns/glob） |
| `NOT-EXPORTED-SUBPATH` | 同上 | `bench` 子路径集 |
| `AMBIGUOUS` | 同上 | `bench` 动态集 |
| `VERSION-BEHAVIOR-DRIFT` | `drift` 命令 | `bench` 离线指纹集 |
| 退出码语义 | `report`/进程退出 | `selftest` 断言 |

## 7. 提交材料实物表

| 承诺项 | 应存在的文件路径 | 由哪个里程碑产出 | 用哪条命令核对 |
|---|---|---|---|
| 题目文档 | `plan/01-题目文档.md` | M0 | `git ls-files` |
| 架构选型 | `plan/02-架构与技术选型.md` | M1 | `git ls-files` |
| 模块详设 | `plan/03-模块详设.md` | M1 | `git ls-files` |
| 数据计划 | `plan/04-数据计划.md` | M1 | `git ls-files` |
| 基准语料 | `fixtures/*/INPUT.md` + `expected.json` | M2 | `git ls-files fixtures/` |
| 自测与基准 | `tests/` + `selftest`/`bench` 命令 | M3/M4 | `pytest && depcheck-live bench` |
| Agent Skill | `SKILL.md` | M5 | `git ls-files SKILL.md` |
| 技术报告 | `docs/技术报告.md` | M5 | `git ls-files docs/` |
| 演示产物 | `docs/demo/demo.gif` | M5 | `git ls-files docs/demo/` |
| 发布留档 | `plan/RELEASE-M6.md` | M6 | `git cat-file -e <tag>:plan/RELEASE-M6.md` |