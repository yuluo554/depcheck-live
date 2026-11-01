// ═══ 常量与契约层 ═══
// 本模块是**唯一**存放判定态枚举 / 退出码 / kind 枚举 / 支持扩展名的地方。
// 它与 `SKILL.md` 的契约块**双向断言**（tests/contract.test.mjs，M5）。
//
// 硬约束：本模块**不得** import 任何其它 src/ 模块——它必须能被单独加载去对账 SKILL.md，
// 一旦引入依赖，对账就会连带初始化别的层（架构测试 tests/architecture.test.mjs 会断言这条）。

/** 五判定态（冻结；新增必须同轮改 data/README §5 + 本文件 + SKILL.md 三处）。 */
export const STATUS = Object.freeze({
  RESOLVED: "RESOLVED",
  MISSING_EXPORT: "MISSING-EXPORT",
  ESM_CJS_MISMATCH: "ESM-CJS-MISMATCH",
  NOT_EXPORTED_SUBPATH: "NOT-EXPORTED-SUBPATH",
  AMBIGUOUS: "AMBIGUOUS",
});

/** 非判定态：仅 drift 用，表示"没有离线指纹，不猜"。 */
export const NO_BASELINE = "NO-BASELINE";

/** 版本行为漂移判定态。 */
export const DRIFT = "VERSION-BEHAVIOR-DRIFT";

/** 会进 findings 的判定态（顺序 = `plan/03` §4.4 判定顺序的尾部）。 */
export const PROBLEM_STATUSES = Object.freeze([
  STATUS.MISSING_EXPORT,
  STATUS.ESM_CJS_MISMATCH,
  STATUS.NOT_EXPORTED_SUBPATH,
]);

/** 解析失败态（不是"发现问题"，是"算不了"→ 进 gaps，影响退出码 3）。 */
export const UNPARSEABLE = "UNPARSEABLE";

/**
 * 退出码语义。**唯一定义见 `data/README.md` §5.1**，此处只做代码侧镜像。
 * 0 无问题 / 1 有问题 / 3 算不了 / 4 用法错误；2 保留不用（与 1 合并）。
 */
export const EXIT = Object.freeze({
  OK: 0,
  PROBLEMS: 1,
  CANNOT_COMPUTE: 3,
  USAGE: 4,
});

/** 引用点种类（`plan/03` §3）。`AMBIGUOUS` 是**一种 kind**，也是同名判定态。 */
export const KIND = Object.freeze([
  "import",
  "export-from",
  "require",
  "dynamic-import",
  "jest-mock",
  "string-literal",
  "ambiguous",
]);

/** 默认扫描的源码扩展名（`data/README.md` §5 首期范围）。 */
export const SOURCE_EXTENSIONS = Object.freeze([".js", ".cjs", ".mjs", ".ts", ".tsx", ".vue"]);

/** 默认跳过的目录名。 */
export const SKIP_DIRS = Object.freeze(["node_modules", ".git", "dist", "build", "coverage", ".cache"]);

/** 本工具名（输出与契约块共用一处）。 */
export const TOOL = "depcheck-live";

/** 支持的命令。M0 只有 check/snapshot/scan 可用骨架；selftest/bench/drift 随里程碑落位。 */
export const COMMANDS = Object.freeze(["check", "snapshot", "scan", "drift", "selftest", "bench"]);