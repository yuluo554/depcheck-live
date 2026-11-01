# C4 · `subpath-blocked` —— 验证 `NOT-EXPORTED-SUBPATH`

## 验证哪条判定态

`NOT-EXPORTED-SUBPATH`（`data/README.md` §5 形态③）：**子路径不在 `exports` 里，或显式列为 `null`**。
两者判定相同，但证据的 `rule` 不同（"未列" vs "显式 null 屏蔽"）。

## 构造

| 引用点 | 包 | 写法 | 命中形态 |
|---|---|---|---|
| 1 | `chalk@6.0.1` | `require("chalk/package.json")` | 未列该子路径 |
| 2 | `commander@15.0.0` | `require("commander/package.json")` | 未列该子路径 |
| 3 | `chalk@6.0.1` | `require("chalk/source/index.js")` | 未列该子路径（`exports` 只暴露 `.`） |
| 4（反例） | `zod@4.6.7` | `require("zod/package.json")` | **列了** `"./package.json"` → `RESOLVED` |
| 5（反例） | `glob@14.0.3` | `require("glob/raw")` | **列了** `"./raw"` → `RESOLVED` |

## 为什么这条构造能证伪

1. **`./package.json` 是跨包的自然对照组**：`zod` / `date-fns` / `glob` 的 `exports`
   **显式列了** `"./package.json"`，而 `chalk` / `commander` **没列**。同一个写法、
   同一个子路径，三种包给出两种判定（实测：`chalk`/`commander` → `ERR_PACKAGE_PATH_NOT_EXPORTED`，
   `zod`/`glob` → 正常解析）。**这是"子路径屏蔽"最不容易被猜对的地方**——
   很多实现会想当然地认为 `package.json` 总是可读的。
2. **防"什么都没列就等于不屏蔽"**：一个把 `exports` 缺省当"全部开放"的实现会让 1–3 判绿。
3. **防"一屏蔽就当不存在"**：`exports` 一旦声明，**未列的子路径一律屏蔽**
   （Node 原文："all subpaths of the package are encapsulated"）。判定态是
   `NOT-EXPORTED-SUBPATH`，不是"这个包坏了"、也不是 `MISSING-EXPORT`。
4. **`null` 屏蔽与"未列"必须走同一条判定但留不同证据**：本 case 的 1–3 走"未列"；
   `null` 形态由 `tests/resolve.test.mjs`（形态③ / 实测 `exact-null-blocked`）覆盖，
   `bench` 侧用五包的真实结构无法构造（五包都没有 `null` 键），故**在单测面钉住**。

## 关键事实（可独立复算）

| 包 | `exports` 是否含 `"./package.json"` |
|---|---|
| `chalk@6.0.1` | ❌ 否（`exports` 只有 `types` / `default` 两个条件键，且都指向入口） |
| `commander@15.0.0` | ❌ 否（`exports` 只有 `"."`） |
| `zod@4.6.7` | ✅ 是（`"./package.json": "./package.json"`） |
| `date-fns@4.4.0` | ✅ 是 |
| `glob@14.0.3` | ✅ 是（且有 `"./raw"`） |

以上可由 `data/packages/<pkg>.json` 的 `exposesPackageJson` 字段直接读出（生成器产物）。

## 期望（机读部分见 `expected.json`）

退出码 `1`；点 1–3 为 `NOT-EXPORTED-SUBPATH`；点 4–5 为 `RESOLVED`；
`summary.problems === 3`。

> **M1 状态**：`INPUT.md` 已定稿；`expected.json` 的逐点 `evidence` 待 M2 补齐。