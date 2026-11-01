# C6 · `drift-baseline` —— 验证 `VERSION-BEHAVIOR-DRIFT` / `NO-BASELINE`

## 验证哪条判定态

- `VERSION-BEHAVIOR-DRIFT`（`DRIFT`）：代码写的是**旧版本 API**，装的却是**新版本**，且新版本里该 API 已不在。
- `NO-BASELINE`：**没有离线基线**时记这一条，**不猜**（`plan/03` §5 硬纪律）。
- 对照：`AMBIGUOUS` 不占退出码（§5.1）；`NO-BASELINE` 同样**不算"发现问题"**，
  但它落在**退出码 3**（§5.1 的 `3` 触发含"基准缺失"）。

## 构造

本项目**不联网、不查 registry**（`data/README.md` §2.1），历史基线由 `tools/gen-baselines.mjs`
从**真实历史版本包**生成并入仓（`data/fingerprints/`，带 tarball 的 `sha512`，可独立复算）。
本 case 构造三种情形：

| # | 情形 | 声明 range | 装的版本 | 是否有离线基线 | 期望 |
|---|---|---|---|---|---|
| 1 | 声明旧 major，装新 major，旧符号已删 | `^3.25.76` | `4.6.7` | ✅ `zod` 3.25.76 基线 | `VERSION-BEHAVIOR-DRIFT` |
| 2 | 声明旧 major，装新 major，但该符号仍在 | `^3.25.76` | `4.6.7` | ✅ 同上 | **`RESOLVED`**（不是 DRIFT） |
| 3 | 声明 range 与实际不符，但**没有**基线 | `^3.0.0` | `4.4.0` | ❌ 无 date-fns 基线 | **`NO-BASELINE`**（不进 problems） |

## 为什么这条构造能证伪

1. **第 3 条是诚实性阀门**：没有基线就**不许猜**。一个"看到 range 不匹配就报 DRIFT"的实现
   会让第 3 条红——这正是 `plan/06` R6 同族的失信形态在本模块的镜像。
2. **第 2 条防"版本号一变大就报漂移"**：漂移的判据是**行为**（该符号在新版本里还在不在），
   不是版本号字符串。一个只看 semver 的实现会让第 2 条红。
3. **第 1 条给出正例**：有基线、且符号确实消失 → 必须红。
4. **第 3 条同时钉住"分层"**：同一个引用点上 `check` 层是 `RESOLVED`（`addDays` 确实在
   date-fns 4.4.0 里）、`drift` 层是 `NO-BASELINE`（没基线可比）。两个结论**各自都对**——
   真值必须分 `status` / `driftStatus` 两层声明，挤成一个字段必有一方失声。
5. **`NO-BASELINE` 的退出码 = 3**（§5.1）：本 case 若只有第 3 条，退出码应为 `3` 而非 `0`——
   因为"基准缺失"就是 `3` 的触发条件之一，且回 `0` 会把"这一层没跑"写成"跑了没问题"。

## 关键事实（可独立复算）

- **M3 实测推翻了 M1 的载体选择**：`date-fns` 3.6.0 → 4.4.0 的 `.` 导出面
  **251 个名字一个不少**（只新增 134 个子路径键）。"旧 API 已删"在该包上不成立，
  按包比 `exports` 指纹必然误报 —— 这正是本 case 第 3 条用 date-fns 的原因。
- **正例载体改为 `zod` 3.25.76 → 4.6.7**：实测移除 **31 个符号**
  （`ZodSchema` / `ZodEffects` / `ZodBranded` / `ZodNativeEnum` …），而 `z` / `ZodError` / `ZodObject` 仍在。
  真实 `require` 独立复核：
  `'ZodSchema' in require('<zod3>/index.js') === true`，`'ZodSchema' in require('zod') === false`。
- 基线文件 `data/fingerprints/zod.json` 记录了 tarball 的 `sha512` 与 `fetchedAt`，
  任何人可取同一个 `npm pack zod@3.25.76` 重跑生成器复算 —— **不是伪造的历史指纹**。

## 期望（机读部分见 `expected.json`）

点 1 → `VERSION-BEHAVIOR-DRIFT`；点 2 → `RESOLVED`；点 3 → `NO-BASELINE`（进 gaps，不进 problems）；
仅点 3 存在时退出码 `3`；点 1 存在时退出码 `1`。