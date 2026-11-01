# HANDOFF-M2 — 解析层：`exports` 解析器 + 引用点抽取器 + `fixtures/` 落地

> 本文件是 **M2 的入口文件**（`k` = **它开的那一棒**：进 M2 就读它）。
> 入库路径一律相对：`plan/HANDOFF-M2.md`；下一棒启动命令在用户侧拼绝对路径。

## 一、当前进度 + 证据（上一棒 M1 已交付什么）

M1（数据先行）已全部完成，`plan/00` §4 与 `plan/05` §1 均已翻 ✅。逐项证据（本机实跑，2026-11-01，Node v24.15.0）：

| 产出 | 实物 | 证据 |
|---|---|---|
| D1 六形态语义核对 | `data/README.md` §1 D1（✅）+ §5.4（10 条结论） | 双源：`packages.html` 声明层 + `esm.html` 解析算法层原文，加本机实测交叉验证 |
| `exports` 解析器按官方算法 | `src/resolve.mjs` | `tests/resolve.test.mjs` 21 条向量，每条标注实测用例编号 |
| 五包指纹入库 | `data/packages/*.json` | `node tools/gen-fingerprints.mjs --check` → `5/5 份逐字节一致` |
| 指纹生成器 | `tools/gen-fingerprints.mjs` | 已从 `PENDING_TOOLS` 删除该条登记 |
| §5.3 三阈值回填 | `data/README.md` §5.3 + §5.3.1 | `src/contract.mjs` `LIMITS` 镜像 + `tests/thresholds.test.mjs` 双向断言 |
| 六份语料骨架 | `fixtures/<case>/INPUT.md` + `expected.json`（C1–C7） | `tests/fixtures.test.mjs` 9 条 |
| 交接单入口口径订正 | `AGENTS.md` §一 K21 + `LAYOUT.HANDOFFS` 两半边 | `tests/handoff-pointer.test.mjs` 7 条 + 变异组 H1/H2 |

**M1 交付后的实测数字**（本机 2026-11-01，含 M1 收尾时补的两项判据）：
`npm test` = **106 passed / 0 failed / 0 skipped**；
`gen-fingerprints --check` = **5/5 逐字节一致**；脱敏门 0 命中；
布局门 10 条判据；变异组 **20** 组（18 正 + 2 阴性对照）。

### M1 的三条招牌发现（M2 必须知道，否则会踩）

1. **M0 的 `resolve.mjs` 有 10 处与 Node 官方解析算法不符**，已全部修正（`data/README.md` §5.4 逐条）。
2. **`commander` 与 `chalk` 不是同类**：同无 `require` 分支，但判定**相反**（§5.4.1）。
3. **交接单命名口径曾被写反**：`HANDOFF-M<k>` 是 **M<k> 的入口**，不是"第 k 棒的收尾单"。

## 二、当前事实 · 状态不变量（动手前必须知道）

1. **`data/README.md` §5.4 的 10 条 = 判定面唯一实现依据**。`src/resolve.mjs` 已按官方算法重写。
   **不要按 `packages.html` 的措辞自己再推导一遍**——那一页只有声明层语义，解析层在
   `esm.html#resolution-algorithm-spec` 的伪代码里。M0 就是在只看前者时错的。
2. **`resolveConditional` 返回 `state` 四态**（`ok`/`blocked`/`unmatched`/`invalid`），不是 `{ok, target}`。
   新增调用点必须区分：`blocked` → `NOT-EXPORTED-SUBPATH`；`unmatched`/`invalid` → gap，**不判 MISSING**。
3. **`matchSubpath` 返回 `{kind, value, key, patternMatch}`**（`key` 取代 M0 的 `patternKey`）；
   `substituteWildcard` 会替换**全部** `*`。
4. **`buildExportsIndex` 新增第三字段 `ignored`**：被 Node 忽略的键（末尾斜杠 / 多 `*`）只留档，
   **不参与匹配、也不算 unparseable**。别把 `ignored` 拼进 `unparseable`。
5. **`LIMITS` 是阈值的代码镜像**（`src/contract.mjs`）：`EXPORTS_KEYS = 4096`、`SOURCE_FILE_BYTES = 524288`。
   唯一定义在 `data/README.md` §5.3；改一处不改另一处 `tests/thresholds.test.mjs` 会红。
6. **字符串兜底必须按 `file+line+specifier` 去重**：`require("chalk")` 里的 `"chalk"` 也形似包名，
   但它已被 `require` 结构化抽取覆盖。M1 实测踩过（重复计入 → C3 对照组多一条 → cli 测试红）。
7. **`data/packages/*.json` 是生成器产物，禁手改**。改它唯一方式 = 改生成器再重跑 `--check`。
   每份含 `canonical`（规范化串）+ `fingerprint`，任何人可复算。
8. **`date-fns.json` 有 353 KB / 741 个子路径**——真实数据不是缺陷。`package.json` 的 `files` 不含 `data/`。
9. **`fixtures/*/expected.json` 的逐点 `evidence` 是本棒要还的债**（现标记 `toFillIn: "M2"`）。
   真值纪律（`plan/04` §3 第 2 条）要求每项有原文片段或文件+行号，**不得只给结论**。
   分工：C1–C5 在 **M2** 补齐；C6 在 M3、C7 在 M4。
10. **M2 不伪造历史指纹**。C6（`drift`）的旧版本一侧必须由用户显式提供的离线包填充。
11. **`PENDING_TOOLS` 当前只剩 1 条**：`tools/check-release.mjs`(M6)。
12. **`tests/` 现在是 10 个文件**，两处登记（`package.json` `scripts.test` + CI workflow）已同步。
    **新增测试文件必须同笔登记两处**，否则 `LAYOUT.TESTS` 红。
13. **本仓库根有 `node_modules/`**（M1 为跑 `--check` 与真实包实测装的，`npm i --no-save`，
    **未写进 `package.json`**）。被 `.gitignore` 封，不影响零依赖承诺。**别把它当交付面。**
14. **脱敏门 `SKIP_DIRS` 必须与 `.gitignore` 的本地目录对齐**（门注释第 ④ 条）。
    新增 `.gitignore` 本地目录 → 同笔加进 `SKIP_DIRS`，否则 `tests/gate-selfcheck.test.mjs` 红。
15. **做破坏性验证别在工作树里改文件再用 `git checkout` 恢复**：本仓没有"改之前的快照"，
    `git checkout <file>` 恢复的是**已提交版本**，会把本轮未提交的修改一起冲掉（M1 踩过）。
    正解：复制到临时目录验证（`tools/mutate-gates.mjs` 就这么做），或先 `git stash`。

## 三、下一棒待办 —— 本棒（M2）按序执行，不跳步

1. **先跑入口体检**（每个对话开头固定动作）：
   ```bash
   node tools/check-sprint-layout.mjs      # 必须全绿
   npm test                                # 期望 106/106
   node tools/gen-fingerprints.mjs --check # 期望 5/5
   node tools/mutate-gates.mjs             # 期望 20/20
   ```
2. **补 `fixtures/C1–C5` 的逐点 evidence**：每项给出 `exports` 字段原文片段 + 入口目标文件里的
   导出行号。这是 `data/README` §5.4 与语料之间的可执行链接，**不得只给结论**。
3. **`fixtures/<case>/` 落地真正的源码**：M1 只落了 `INPUT.md` + `expected.json`。
   C1–C5 各自的 `src/*.cjs|mjs` 与 `package.json`（`dependencies` 指向五包）要在本棒建出来，
   否则 `bench` 无输入。**语料里的包名必须是真实五包**（`plan/04` §3 第 5 条）。
4. **`snapshot.mjs` 对五个真实包 + 六份语料 `UNPARSEABLE = 0`**（M2 DoD）：
   用根目录 `node_modules/` 里已装的真实包跑一遍 `depcheck-live snapshot`，确认 `parseState` 全 `OK`。
   ⚠️ `chalk` 与 `commander` 的 `exports` 是 sugar 形态（条件键全非子路径），走 `buildExportsIndex` 的 sugar 分支。
5. **`scan.mjs` 补齐三种边界测试**（M2 DoD）：宽字符 / CRLF / **超长行**，行号必须仍指向源行。
   现有 `tests/scan.test.mjs` 已有 CRLF 与宽字符各一条，本棒补超长行。
6. **超长行降级路径要有真实用例**：`LARGE_FILE_DOWNGRADED` 的 gap 现在只在 `scanSources` 里
   按字节数判；本棒要有一个真实 >512 KiB 的文件用例，证明它**真的进了 gaps**（不是写了没跑）。
7. **`resolve.mjs` 的六形态向量与六份语料对账**：`plan/05` M2 DoD 要求"对五个真实包 + 六份语料
   `UNPARSEABLE = 0`"。若某份语料构造出 `UNPARSEABLE`，先判断是**语料设计问题**还是**解析器缺陷**，
   按 `data/README` §5.4 的 10 条判定——**不得改真值凑实现**（`plan/04` §3 第 3 条）。
8. **收尾**（顺序固定，见 `AGENTS.md` §一）：
   DoD 验证 → `plan/00`/`05`/`06` 状态回写（M2 翻 ✅）→ **写 `plan/HANDOFF-M3.md`（M3 的入口，
   不是 HANDOFF-M2）** → commit。

## 四、既定口径清单（动了会打挂测试的约定，K 编号）

M0 的 K1–K11、M1 的 K12–K21 全部继续有效。本棒相关的重点：

| # | 约定 | 在哪实现 | 动了会红在哪 |
|---|---|---|---|
| K1 | 判定态枚举 = 5 个 + `NO-BASELINE`/`VERSION-BEHAVIOR-DRIFT`/`UNPARSEABLE` | `src/contract.mjs` | `tests/architecture.test.mjs` |
| K3 | 退出码**只在** `bin/` + `src/cli.mjs` 决定 | 同上 | `tests/architecture.test.mjs`（AST 守门） |
| K7 | `src/` 只准 import `node:` 与相对路径 | 全部模块 | `tests/architecture.test.mjs` |
| K8 | 测试文件**逐文件**列在 `package.json` 与 CI 两处 | 两处 | 布局门 `LAYOUT.TESTS` |
| K12 | `exports` 解析语义 = §5.4 的 10 条；条件按**目标对象键序** | `src/resolve.mjs` | `tests/resolve.test.mjs`（形态②b） |
| K13 | `resolveConditional` 返回 `state` 四态 | `resolve.mjs` + `check.mjs` | `tests/resolve.test.mjs` + `cli.test.mjs` |
| K14 | 阈值唯一来源 §5.3；代码镜像 `LIMITS`；双向断言 | `src/contract.mjs` | `tests/thresholds.test.mjs` |
| K16 | 字符串兜底 = 双条件 + 按 `file+line+specifier` 去重 | `src/scan.mjs` | `tests/thresholds.test.mjs` + `cli.test.mjs` |
| K17 | `ESM-CJS-MISMATCH` 第 4 条必须看**符号所在层**；`commander` 不得判 MISMATCH | `src/check.mjs` | `cli.test.mjs` 对照组 + `fixtures/esm-cjs-mismatch` |
| K21 | `HANDOFF-M<k>` 是 **M<k> 的入口**（k = 它开的那一棒）；已开的必须有入口，未开工的不许有 | `AGENTS.md` + 布局门 | `LAYOUT.HANDOFFS` 两半边 + 变异组 H1/H2 + `tests/handoff-pointer.test.mjs` |

## 五、本机环境坑（只写实测过的）

1. **`/tmp` 在 Git Bash + Node 上不可用**：`curl -o /tmp/x` 写 `C:\tmp`，`node -e` 读 `/tmp/x`
   解析成 `C:\tmp\x` → `ENOENT`。探针文件一律落在仓库内 `tmp/`（已 gitignore）。
2. **探针的 `require` 解析根 = 脚本位置的 `node_modules` 链**：探针放在安装目录外面跑会
   `MODULE_NOT_FOUND`。正解：探针文件**放进安装目录**，或用 `createRequire(join(cwd,"x.cjs"))`。
3. **ESM 脚本里没有 `require`**：`node probe.mjs` 里直接写 `require(...)` 会 `ReferenceError`。
   `import()` 的解析根是**脚本位置**不是 cwd。
4. **通配目标的探针必须落实体文件**：`"./f/*": "./src/*.js"` 若只写键不建文件，
   `require.resolve` 报 `MODULE_NOT_FOUND`，与"导出语义不命中"混在一起（M1 首跑踩过）。
5. **`node --test` 不要用目录/glob 形式**（不同版本行为不同）：本项目一律逐文件列出，
   `LAYOUT.TESTS` 对账两处登记。
6. **改门必须重跑变异宿主**：`node tools/mutate-gates.mjs`。
7. **中文文件名**（`plan/00-README总览.md`）会让 `git diff --name-only` 输出八进制转义；
   所有门**读文件不走 git 管道**，绕开整族 quotepath 坑。

## 六、DoD 逐项 checklist（本棒出口判据）

| # | DoD 项 | 状态 | 证据 / 怎么验 |
|---|---|---|---|
| 1 | `resolve.mjs` 对五个真实包 + 六份语料 `UNPARSEABLE = 0` | ⬜ | `depcheck-live snapshot` 跑根目录真实包，`parseState` 全 `OK` |
| 2 | `scan.mjs` 抽 `{file, line, kind, specifier, imported}`，动态形态一律 `AMBIGUOUS` | ⬜ | `tests/scan.test.mjs` + C5 语料 |
| 3 | 宽字符 / CRLF / 超长行三类边界有测试（行号仍指向源行） | 🟡 | 前两类已有；**超长行待补** |
| 4 | `fixtures/C1–C5` 的逐点 `evidence` 补齐（原文片段 or 文件+行号） | ⬜ | 逐份 `expected.json` 无 `toFillIn` 残留 |
| 5 | `fixtures/<case>/src/` 与 `package.json` 落地（bench 有输入） | ⬜ | `fixtures/*/package.json` 存在且 `dependencies` 指向五包 |
| 6 | 超长文件降级真有用例（`LARGE_FILE_DOWNGRADED` 进 gaps） | ⬜ | 构造 >512 KiB 文件，断言 `gaps` 含该 kind |
| 7 | 布局门 / 脱敏门 / 变异宿主全绿 | ⬜ | 三道门实跑 |
| 8 | CI 实跑 | ⬜ **不适用** | 无远端，未跑 CI；只写"本地等价校验 + 待首推验证" |

> 出口判据全部达成后，按 `AGENTS.md` §一 的固定顺序收尾，并写 **`plan/HANDOFF-M3.md`**。

## 七、关键命令速查

```bash
# 门（每个对话开头 + 每次收尾）
node tools/check-sprint-layout.mjs      # 布局门，期望全绿
node tools/check-desensitized.mjs       # 脱敏门，期望 0 命中
node tools/mutate-gates.mjs             # 变异验证，期望 20/20

# 测试
npm test                                # 期望 106/106（M2 起会增加）

# 指纹
node tools/gen-fingerprints.mjs --list    # 列五包 + 指纹
node tools/gen-fingerprints.mjs --check   # 逐字节校验，期望 5/5

# CLI
node bin/depcheck-live.mjs --version
node bin/depcheck-live.mjs snapshot .
node bin/depcheck-live.mjs scan .
node bin/depcheck-live.mjs check . --json

# 五包安装（跑 --check 与真实包实测时需要；--no-save 保零依赖承诺）
npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14

# 本机跨版本复现（CI 红时用）
npx -y node@20 --test tests/cli.test.mjs
```

**下一棒启动命令（用户侧）**：
`/goal 读取 "<项目绝对路径>\plan\HANDOFF-M3.md" 继续完成任务`

—— 读 `plan/HANDOFF-M3.md`（= **M3 的入口**）。本文件（`HANDOFF-M2.md`）是 M2 的入口，
M2 收尾时要写的下一份入口是 `HANDOFF-M3.md`（M3：判定层）。