# depcheck-live

判断**源码里每一个对已装依赖的引用点**，在「这份 `node_modules`」下是否真的可解析；
不可解析时，是缺导出、加载方式错、子路径未导出，还是版本行为已变。

纯本地、零联网、**不执行被测工程任何代码**——只读文件。

> **它不做什么**：不做包发布检查（`publint` / `arethetypeswrong` 的领域）、不做未使用导入检测
> （`knip` 的领域，方向相反）、不做类型检查（不重复 `tsc`）。

## 为什么需要它

一个 AI 生成的调用点可以有四种"看起来都对"的状态，而**整条链上没有任何一步返回非零退出码**：

1. TypeScript 编译通过——但很多项目根本不上 `tsc`；
2. `import` / `require` 成功——Node 24 的 `require()` 对纯 ESM 包**不抛错**，而是返回命名空间对象；
3. 拿到一个 object——`typeof pkg === 'object'` 为真，于是"看起来正常"；
4. 真正调用时崩——崩的位置**离真因隔了一整个加载机制**。

```
$ node -e "const c=require('chalk'); console.log(typeof c, typeof c.red, typeof c.default)"
object undefined function
```

`chalk` v6 是纯 ESM，`require()` 拿到的是**命名空间对象**，真正的 API 挂在 `.default` 下。
报错在 `.bold` 那一行，**真因是"API 在 `.default` 下"**。这类静默错位 AI 自己 debug 不出来，
CI 也不会报。

`depcheck-live` 回答的就是这一句：**这段调用，对得上项目里真实装的这一份版本吗。**

## 安装与运行

要求 **Node ≥ 20**（开发与实测用 v24.15.0）。**零第三方依赖**——本工具自身不 `npm install`。

> 披露：Node 20 已于 2026-04-30 EOL（endoflife.date 实测）。floor 仍保留 **≥ 20** 不收窄——本工具要跑进**旧工程**的 `node_modules` 里对账，收窄 claim 伤用途；且自身零依赖、纯本地运行，不提供网络面。

它判定的是**你那个工程**的引用点，所以要在**装过依赖的工程**里跑：

```bash
# 在你自己的工程里（必须先有 node_modules）
node /path/to/depcheck-live/bin/depcheck-live.mjs check .

# 或链接成本地命令
npm link
depcheck-live check .
```

> **在本仓库自己的裸 clone 里跑 `check .` 会回退出码 `3`**（`NO_NODE_MODULES`）：
> 本仓把 `node_modules/` gitignore 了，工具没有可比的依赖面 —— 那是**"算不了"，不是"没问题"**。
> 裸 clone 里能跑通的是不需要依赖面那几样：
>
> ```bash
> node bin/depcheck-live.mjs --version    # depcheck-live 0.1.1
> node bin/depcheck-live.mjs selftest     # 8/8（现场造最小工程，不依赖本仓依赖）
> npm test                                # 223 tests / 193 pass / 30 skipped（skip = 需要真实五包）
> ```
>
> 要跑 `bench` / `bench --clean` 或对本仓自检，先装五包（`--no-save` 保住零依赖承诺）：
> `npm i --no-save chalk@6 zod@4 date-fns@4 commander@15 glob@14`

## 五个判定态

| 判定态 | 含义 |
|---|---|
| `RESOLVED` | 该符号在声明的入口下确实导出 |
| `MISSING-EXPORT` | 入口存在，但**没有这个导出** |
| `ESM-CJS-MISMATCH` | 入口只能 ESM 加载，`require()` 拿到命名空间对象，API 在 `.default` 下 |
| `NOT-EXPORTED-SUBPATH` | 子路径（如 `<pkg>/package.json`）被 `exports` 屏蔽 |
| `AMBIGUOUS` | 动态形态，不可静态判定（**不代表代码有错**） |

外加 `VERSION-BEHAVIOR-DRIFT`（`drift` 命令）与 `NO-BASELINE`（无离线指纹，**不猜**）。

## 退出码

| 码 | 含义 |
|---:|---|
| `0` | 无问题（仅 `AMBIGUOUS` 也算 0，但报告里显式计数） |
| `1` | 发现判定问题 |
| `3` | 算不了（依赖缺失 / `node_modules` 不存在 / `package.json` 不可解析 / 基准缺失） |
| `4` | 用法错误 |

`2` 保留不用。**"零命中"与"算不了"必须落在不同退出码**——这是本工具的可信度所在。
数值唯一定义见 `data/README.md` §5。

## 用法

```bash
depcheck-live check <path>            # 人读摘要
depcheck-live check <path> --json     # 机读
depcheck-live check <path> --with-drift
depcheck-live drift <path>            # 版本行为漂移（需离线基线）
depcheck-live snapshot <path>         # 只输出依赖面快照
depcheck-live scan <path>             # 只输出引用点
depcheck-live bench                   # 基准：C1–C6 逐条 + 逐项对账
depcheck-live bench --clean           # 干净工程零误报基准（C7）
depcheck-live selftest                # 自检：现场造最小工程断言退出码 0/1/3/4
depcheck-live --version
```

## 关键设计

**判 `ESM-CJS-MISMATCH` 只看 `exports` 的 `require` 分支，不看 `type`。**
实测 `zod` / `date-fns` / `glob` 都是 `type: module` 却**有** `require` 分支，`require()` 行为正常；
而 `chalk` / `commander` 没有，行为完全不同。只看 `type` 会把前三个全判成 MISMATCH——
**系统性假阳性**。判据原文见 `data/README.md` §5.2。

## 基准指标

以下是本工具在真机上的实跑结果，**可直接复算**（`bench` 面对的是真实 `node_modules`，
不是 mock）。两条命令各自输出**两种粒度**，它们量的是不同的东西，**不可混读**：

```bash
node bin/depcheck-live.mjs bench          # C1–C6：五判定态 + drift 的对照语料
node bin/depcheck-live.mjs bench --clean  # C7：干净工程零误报（反向断言）
node bin/depcheck-live.mjs selftest       # 退出码语义 0/1/3/4 自检
```

### 逐条级（引用点对账）

**每个引用点**的判定结果与语料真值逐条比对——这是"判得对不对"的直接证据。

| 命令 | 语料 | 引用点 | 对账通过 |
|---|---:|---:|---:|
| `bench` | 6 份（C1–C6） | 28 | **28 / 28** |
| `bench --clean` | 1 份（C7） | 7 | **7 / 7** |

### 计数级（语料级断言）

**每份语料**的退出码、`summary`、`byStatus`、负向断言逐项比对——这是"整份语料是否可信"的证据。
它与逐条级不是同一个数：一条语料的全绿可能只由 5 条引用点对账构成，也可能由 14 条断言的组合构成。

| 命令 | 语料级断言 | 通过 |
|---|---:|---:|
| `bench` | 49 条（6 份语料） | **49 / 49** |
| `bench --clean` | 14 条（1 份语料） | **14 / 14** |

### 自检（退出码语义）

`selftest` 在**本机现场造最小工程**（不读本仓路径、不联网），断言四条退出码语义各自被真的诱发：

| 断言 | 覆盖 |
|---|---:|
| `selftest` | **8 / 8**，覆盖退出码 `0` / `1` / `3` / `4` |

其中 `3` 有**两个独立触发源**（依赖缺失、基准缺失），各一条断言；`2` 保留不用，由一条断言钉住。

> **口径提醒**：「28 / 28 引用点对账通过」是**逐条级**；「6 份语料全绿」是**计数级**。
> 前者不蕴含后者（全扫到不等于每份语料自洽），后者也不蕴含前者（语料级断言可以过而某条引用点判错）。
> 数值的唯一定义见 `data/README.md` §5；本节的数字随语料增补而变，**不是**里程碑状态。

```bash
npm test                              # 单元/契约测试（node --test，逐文件）
node tools/check-sprint-layout.mjs    # 布局门（方法论装订）
node tools/check-desensitized.mjs     # 脱敏门
node tools/mutate-gates.mjs           # 两道门的变异验证
```

本项目遵循 `ai-tool-project-sprint` 方法论，入口见 `AGENTS.md`；
计划文档在 `plan/`，进度看 `plan/05`（**README 不承载里程碑状态**）。

## 隐私

纯本地、零上传、不采集源码内容。产物与日志中不出现用户绝对路径（一律相对化）。

## 许可

MIT。见 `LICENSE`。