# C6 · `drift-baseline` —— 验证 `VERSION-BEHAVIOR-DRIFT` / `NO-BASELINE`

## 验证哪条判定态

- `VERSION-BEHAVIOR-DRIFT`（`DRIFT`）：代码写的是**旧版本 API**，装的却是**新版本**，且新版本里该 API 已不在。
- `NO-BASELINE`：**没有离线指纹**时记这一条，**不猜**（`plan/03` §5 硬纪律）。
- 对照：`AMBIGUOUS` 不占退出码（§5.1）；`NO-BASELINE` 同样**不算"发现问题"**。

## 构造

本项目**不联网、不查 registry**（`data/README.md` §2.1），历史指纹必须由用户**显式提供**
离线包。本 case 构造三种情形：

| # | 情形 | 声明 range | 装的版本 | 是否有离线旧指纹 | 期望 |
|---|---|---|---|---|---|
| 1 | 声明旧 major，装新 major，旧 API 已删 | `^3.0.0` | `4.4.0` | ✅ 有 `3.x` 指纹 | `VERSION-BEHAVIOR-DRIFT` |
| 2 | 声明旧 major，装新 major，但旧 API 仍在 | `^3.0.0` | `4.4.0` | ✅ 有 `3.x` 指纹 | **`RESOLVED`**（不是 DRIFT） |
| 3 | 声明 range 与实际不符，但**没有**离线指纹 | `^3.0.0` | `4.4.0` | ❌ 无 | **`NO-BASELINE`**（不进 problems） |

## 为什么这条构造能证伪

1. **第 3 条是诚实性阀门**：没有指纹就**不许猜**。一个"看到 range 不匹配就报 DRIFT"的实现
   会让第 3 条红——这正是 `plan/06` R6（无远端期间把"未跑"写成"已跑"）同族的失信形态在本模块的镜像。
2. **第 2 条防"版本号一变大就报漂移"**：漂移的判据是**行为**（该符号在新版本里还在不在），
   不是版本号字符串。一个只看 semver 的实现会让第 2 条红。
3. **第 1 条给出正例**：有指纹、且符号确实消失 → 必须红。
4. **`NO-BASELINE` 不影响退出码**（§5.1）：本 case 若只有第 3 条，退出码应为 `0` 而非 `3`——
   因为"没有基线"不等于"算不了整个工程"（工程本身可算）。这条边界由 `tests/cli.test.mjs`
   与 M3 的 `bench` 共同钉住。

## 关键事实（可独立复算）

- `date-fns@4.4.0` 的 `exports` 结构已入仓（`data/packages/date-fns.json`，741 个子路径），
  可作为"新版本"一侧的真值；
- "旧版本"一侧**不入仓**（`plan/04` §1：`drift` 历史指纹由用户显式提供的离线包，
  放 `data/fingerprints/`，M3 落位）；本 case 的 `expected.json` 只声明**契约**，
  具体版本号在 M3 由离线包填充；
- 因此 M1 只定义**判定形状**，不伪造历史指纹——**伪造历史指纹等于伪造真值**。

## 期望（机读部分见 `expected.json`）

点 1 → `VERSION-BEHAVIOR-DRIFT`；点 2 → `RESOLVED`；点 3 → `NO-BASELINE`（进 gaps，不进 problems）；
仅点 3 存在时退出码 `0`；点 1 存在时退出码 `1`。

> **M1 状态**：`INPUT.md` 已定稿；`expected.json` 只含契约形状，
> 历史指纹与逐点 `evidence` 待 M3（本 case 的里程碑是 M3 而非 M2，见 `plan/04` §2）。