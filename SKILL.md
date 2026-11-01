---
name: depcheck-live
description: 判断源码里每个对已装依赖的引用点，在「这份 node_modules」下是否真的可解析——缺导出、ESM/CJS 加载方式错、子路径被 exports 屏蔽、版本行为漂移。纯静态、零联网、不执行被测代码。当用户问"这个 import 到底能不能跑/为什么 require 拿到 undefined/为什么升级后就崩/这段 AI 生成的调用对不对得上装的版本/子路径为什么不能引/包升级后符号还在不在"时使用。
---

# Skill: depcheck-live（调用面 vs 真实依赖对账）

**一句话**：不问"这个包发布得规不规范"，只问"**这段调用，对得上项目里真实装的这一份版本吗**"。

判定对象 = **源码里的引用点**（不是包本身）。输入 = 项目代码 + `node_modules`。
输出 = 每个引用点一条判定结论 + 一份退出码。

> 本文件下半部的 **契约块** 与 `src/contract.mjs` **双向断言**
> （`tests/contract.test.mjs`：contract→SKILL 一次、SKILL→contract 一次）。
> 契约块里**每个值**都必须有断言在读它，否则就是"声明了但没人验"的假门。

## 何时用 / 何时不用

**用**：判断一次 `import` / `require` / 动态导入在**已装的这份**依赖下是否真的成立；
排查"`import` 成功但调用时崩"这类跨加载机制的静默错位；确认升级 major 后老符号还在不在。

**不用**：不做包发布合规检查（`publint` / `arethetypeswrong` 的领域）、不做未使用导入检测
（`knip` 的领域，方向相反）、不做类型检查（不重复 `tsc`）、不做代码质量审查。

## 怎么调用

```bash
depcheck-live check <path>                 # 主命令：五判定态
depcheck-live check <path> --json          # 机读（同输入双跑逐字节一致）
depcheck-live check <path> --with-drift     # 判定 + 版本行为漂移
depcheck-live drift <path>                 # 只做版本行为漂移（需离线基线）
depcheck-live snapshot <path>              # 只摊开依赖面事实
depcheck-live scan <path>                  # 只摊开引用点
depcheck-live bench                        # 基准：语料逐条 + 逐项对账
depcheck-live bench --clean                # 干净工程零误报基准
depcheck-live selftest                     # 自检：现场造最小工程断言退出码
```

**读结果先看退出码，再看 `findings`**：退出码 `0` 且 `summary.problems === 0` 才是"零命中"；
`findings` 里**含 `RESOLVED`**（它是"判定通过"的记录，不是问题），问题数只看 `summary.problems`。

## 契约块（`<!-- CONTRACT:BEGIN -->` 到 `<!-- CONTRACT:END -->`，机器解析）

<!-- CONTRACT:BEGIN -->
| 项 | 值 |
|---|---|
| 工具名 | `depcheck-live` |
| 命令 | `check` `snapshot` `scan` `drift` `selftest` `bench` |
| 判定态 | `RESOLVED` `MISSING-EXPORT` `ESM-CJS-MISMATCH` `NOT-EXPORTED-SUBPATH` `AMBIGUOUS` |
| 非判定态 | `NO-BASELINE`（无离线基线，不猜，进 gaps）`UNPARSEABLE`（算不出导出面，进 gaps） |
| 漂移态 | `VERSION-BEHAVIOR-DRIFT` |
| 退出码 | `0` 无问题 · `1` 有判定问题 · `3` 算不了 · `4` 用法错误 · `2` 保留不用 |
| 引用点种类 | `import` `export-from` `require` `dynamic-import` `jest-mock` `string-literal` `ambiguous` |
| 扫描扩展名 | `.js` `.cjs` `.mjs` `.ts` `.tsx` `.vue` |
<!-- CONTRACT:END -->

**只有五判定态是"判定结论"。** `NO-BASELINE` / `UNPARSEABLE` 是"这一层没跑成"（进 `gaps`，
退出码 `3`），**不得**读成"没问题"，也**不得**读成"发现问题"。`VERSION-BEHAVIOR-DRIFT` 是
`drift` 层的结论，与五判定态**不共用一张表**。

**数值口径不在本文件**：阈值（`exports` 键数上限、单文件字节上限、字符串兜底的两条判据）
与退出码语义的唯一定义在 `data/README.md` §5（§5.1 退出码 / §5.3 阈值 / §5.5 drift）。
本文件只声明**枚举成员**，不复制数值——复制会让第三份副本各自漂移。

## 判定能力的边界（**不得**越界宣称）

1. **`ESM-CJS-MISMATCH` 只看 `exports` 的 `require` 分支，不看 `type` 字段。**
   `zod` / `date-fns` / `glob` 都是 `type: module` 却**有** `require` 分支，`require()` 行为正常，
   必须判 `RESOLVED`；`chalk` / `commander` 没有 `require` 分支，但**判定结论相反**——
   `commander` 的具名符号直接挂在命名空间上，取得到，**不得**判 MISMATCH。
   判据全文见 `data/README.md` §5.2 与 §5.4.1。

2. **CJS 视角取一个不存在的符号，不会报 `MISSING-EXPORT`。**
   在无 `require` 分支的包上，它**必然先命中** `ESM-CJS-MISMATCH`（判定顺序使然，
   见 `data/README.md` §5.4.2）。不执行被测代码时，"名字在 `.default` 下"与"名字压根不存在"
   无法区分——这是判据的**固有边界**，不是缺陷。**不得**宣称本工具能替你在 CJS 视角区分两者。

3. **`AMBIGUOUS` 不代表代码有错。** 动态形态（拼接的 specifier、运行时算出来的包名）
   静态不可判定，一律 `AMBIGUOUS` 并**显式计数**；只有 `AMBIGUOUS` 时退出码是 `0`。

4. **`drift` 的判据是符号行为，不是 semver 字符串；判定单位是引用点，不是整包。**
   版本号跨了 major 但引用的符号还在 → `RESOLVED`，**不报漂移**。
   没有离线基线 → `NO-BASELINE`，**不猜**。判据全文见 `data/README.md` §5.5。

5. **读不出导出面 ≠ 缺导出。** 重导出链、动态赋值等读不出时记 `UNPARSEABLE` 进 `gaps`
   （退出码 `3`），**不判** `MISSING-EXPORT`——误报比漏报代价高。

## 信任边界

纯本地、零联网、**不执行被测工程任何代码**（只读文件）。产物与日志不含用户绝对路径。
零第三方依赖：`dependencies` 与 `devDependencies` 均为空，测试用 `node:test`。