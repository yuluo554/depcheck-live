// ═══ 版本（单一来源） ═══
// 版本唯一定义处 = `package.json` 的 `version`（`plan/00` §2.1）。
// 这里用 readFileSync + JSON.parse 而不是 `import ... with { type: "json" }`：
// import attributes 的语法在 node 20/22/24 上不一致（`assert` vs `with`），
// 一处读文件可以跨版本稳定——而"跨版本稳定"正是本项目 CI 矩阵要证明的事。
//
// 另：tag 与 package.json 的一致性由 `tools/check-release.mjs` 在发布期对账（M6）。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export function readVersion() {
  try {
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    return typeof pkg.version === "string" ? pkg.version : "0.0.0-unknown";
  } catch {
    return "0.0.0-unknown";
  }
}