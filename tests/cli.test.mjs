// CLI 参数面与退出码语义（`data/README.md` §5.1）。
// 退出码 lock 进测试是本项目的必需项："零命中"与"算不了"必须不同码。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgv, exitCodeFor } from "../src/cli.mjs";
import { EXIT } from "../src/contract.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(ROOT, "bin", "depcheck-live.mjs");

const run = (args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
};

/** 造一个最小可判定工程：package.json + node_modules/<pkg>/package.json + 源码。 */
function makeProject(files) {
  const dir = mkdtempSync(join(tmpdir(), "depcheck-cli-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const CHALK_PKG = JSON.stringify({
  name: "chalk",
  version: "6.0.1",
  type: "module",
  exports: { ".": { types: "./index.d.ts", import: "./source/index.js", default: "./source/index.js" } },
});
const CHALK_ENTRY = "export function red() {}\nexport default { red };\n";

const ZOD_PKG = JSON.stringify({
  name: "zod",
  version: "4.6.7",
  type: "module",
  exports: { ".": { import: "./index.mjs", require: "./index.cjs" } },
});
const ZOD_ENTRY_ESM = "export const z = 1;\n";
const ZOD_ENTRY_CJS = "exports.z = 1;\n";

test("退出码语义表：0/1/3/4，2 保留不用", () => {
  assert.equal(exitCodeFor("OK"), 0);
  assert.equal(exitCodeFor("PROBLEMS"), 1);
  assert.equal(exitCodeFor("CANNOT_COMPUTE"), 3);
  assert.equal(exitCodeFor("USAGE"), 4);
  assert.equal(EXIT.OK, 0);
  assert.equal(EXIT.PROBLEMS, 1);
  assert.equal(EXIT.CANNOT_COMPUTE, 3);
  assert.equal(EXIT.USAGE, 4);
  assert.equal(Number(Object.hasOwn(EXIT, "RESERVED_2")), 0, "2 必须保留不用");
});

test("用法错误一律 4（未知选项 / 缺命令 / 未知命令 / 路径参数个数）", () => {
  assert.equal(run(["--nope"]).code, 4);
  assert.equal(run([]).code, 4);
  assert.equal(run(["nope"]).code, 4);
  assert.equal(run(["check"]).code, 4);
  assert.equal(run(["check", "a", "b"]).code, 4);
  assert.equal(run(["selftest", "x"]).code, 4);
});

test("--version 与 --help 退出 0", () => {
  assert.equal(run(["--version"]).code, 0);
  assert.match(run(["--version"]).out, /^depcheck-live \d/);
  assert.equal(run(["--help"]).code, 0);
  assert.match(run(["--help"]).out, /退出码/);
});

test("parseArgv 不接受未知选项（不吞参数）", () => {
  const r = parseArgv(["--unknown", "check", "."]);
  assert.equal(r.ok, false);
  assert.match(r.error, /未知选项/);
});

test("无 package.json → 退出 3（算不了，不是'没问题'）", () => {
  const dir = makeProject({ "a.mjs": 'import x from "chalk";\n' });
  try {
    const r = run(["check", "."], dir);
    assert.equal(r.code, 3, `实际 code=${r.code}`);
    assert.match(r.out, /无法计算/);
    assert.match(r.out, /NO_PACKAGE_JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("有 package.json 但无 node_modules → 退出 3", () => {
  const dir = makeProject({ "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}' });
  try {
    const r = run(["check", "."], dir);
    assert.equal(r.code, 3);
    assert.match(r.out, /NO_NODE_MODULES/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("干净的已解析引用 → 退出 0，且 totalPoints > 0（证明不是空跑）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","type":"module","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.mjs": 'import { red } from "chalk";\n',
  });
  try {
    const r = run(["check", ".", "--json"], dir);
    const parsed = JSON.parse(r.out);
    assert.equal(r.code, 0, `应 0，实际 ${r.code}；输出 ${r.out.slice(0, 400)}`);
    assert.ok(parsed.summary.totalPoints > 0, "必须真的抽到引用点，否则这条是空跑");
    assert.equal(parsed.summary.problems, 0);
    // `findings` 是**逐引用点的判定**（含 RESOLVED），问题数看 summary.problems——
    // 把 findings.length 当"问题数"会把干净的 RESOLVED 读成问题（口径见 plan/00 §6）
    assert.equal(parsed.findings.filter((f) => f.status !== "RESOLVED").length, 0);
    assert.equal(parsed.gaps.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("缺导出 → 退出 1（MISSING-EXPORT）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","type":"module","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.mjs": 'import { notARealExport } from "chalk";\n',
  });
  try {
    const r = run(["check", ".", "--json"], dir);
    assert.equal(r.code, 1, `应 1，实际 ${r.code}`);
    const parsed = JSON.parse(r.out);
    const problem = parsed.findings.filter((f) => f.status !== "RESOLVED");
    assert.equal(problem.length, 1);
    assert.equal(problem[0].status, "MISSING-EXPORT");
    assert.deepEqual(problem[0].missing, ["notARealExport"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("同代码不同包对照组：require(chalk) 判 MISMATCH，require(zod) 判 RESOLVED（退出码 1 vs 0）", () => {
  const misMatchDir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": "export default { red(){} };\n",
    "src/a.cjs": 'const chalk = require("chalk");\n',
  });
  const zodDir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"zod":"^4.6.7"}}',
    "node_modules/zod/package.json": ZOD_PKG,
    "node_modules/zod/index.mjs": ZOD_ENTRY_ESM,
    "node_modules/zod/index.cjs": ZOD_ENTRY_CJS,
    "src/a.cjs": 'const zod = require("zod");\n',
  });
  try {
    const a = run(["check", ".", "--json"], misMatchDir);
    const b = run(["check", ".", "--json"], zodDir);
    const pa = JSON.parse(a.out);
    const pb = JSON.parse(b.out);
    assert.equal(a.code, 1, `chalk 侧应 1，实际 ${a.code}: ${a.out.slice(0, 300)}`);
    const problemsA = pa.findings.filter((f) => f.status !== "RESOLVED");
    assert.equal(problemsA.length, 1);
    assert.equal(problemsA[0].status, "ESM-CJS-MISMATCH");
    assert.equal(problemsA[0].hasRequireBranch, false, "判据必须是 exports 无 require 分支");
    assert.equal(b.code, 0, `zod 侧应 0，实际 ${b.code}: ${b.out.slice(0, 300)}`);
    // 同一个 require 写法，zod 有 require 分支 → 必须判 RESOLVED（假阳性防线）
    assert.equal(pb.findings.filter((f) => f.status !== "RESOLVED").length, 0);
    assert.equal(pb.summary.byStatus.RESOLVED, 1);
  } finally {
    rmSync(misMatchDir, { recursive: true, force: true });
    rmSync(zodDir, { recursive: true, force: true });
  }
});

test("子路径被 exports 屏蔽 → NOT-EXPORTED-SUBPATH，退出 1", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.cjs": 'const p = require("chalk/package.json");\n',
  });
  try {
    const r = run(["check", ".", "--json"], dir);
    assert.equal(r.code, 1);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.findings[0].status, "NOT-EXPORTED-SUBPATH");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("仅 AMBIGUOUS、无确证问题 → 退出 0，但报告里显式列计数（§5.1 硬纪律）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.cjs": "const name = 'chalk';\nconst c = require(name);\n",
  });
  try {
    const r = run(["check", ".", "--json"], dir);
    const parsed = JSON.parse(r.out);
    assert.equal(r.code, 0, `仅 AMBIGUOUS 应 0，实际 ${r.code}: ${r.out.slice(0, 300)}`);
    assert.equal(parsed.summary.ambiguous, 1, "AMBIGUOUS 必须被计数并在报告里显式出现");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json 双跑逐字节一致（确定性）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1","zod":"^4.6.7"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "node_modules/zod/package.json": ZOD_PKG,
    "node_modules/zod/index.mjs": ZOD_ENTRY_ESM,
    "node_modules/zod/index.cjs": ZOD_ENTRY_CJS,
    "src/a.mjs": 'import { red } from "chalk";\nimport { z } from "zod";\n',
  });
  try {
    const a = run(["check", ".", "--json"], dir);
    const b = run(["check", ".", "--json"], dir);
    assert.equal(a.out, b.out, "同输入两次运行必须逐字节一致");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("输出中不含绝对路径（隐私红线）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.mjs": 'import { nope } from "chalk";\n',
  });
  try {
    const r = run(["check", "."], dir);
    assert.ok(!r.out.includes(dir), `输出里出现了工程绝对路径: ${r.out.slice(0, 400)}`);
    assert.ok(!/[A-Za-z]:[\\/]/.test(r.out), `输出里出现了盘符路径: ${r.out.slice(0, 400)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("selftest 已落位（M4）：真跑自检并退出 0，不再是'尚未实现'的 3", () => {
  const r = run(["selftest"]);
  assert.equal(r.code, 0, `selftest 应退出 0，实际 ${r.code}：${r.err}`);
  assert.doesNotMatch(r.err, /尚未实现/, "M4 已落位，不得再报'尚未实现'");
  assert.match(r.out, /条断言/);
});

test("drift 已落位（M3）：无基线时退出 3，不是 0（'没跑'与'跑了没问题'必须不同码）", () => {
  // 最小工程：声明 date-fns 但 data/fingerprints 下没有它的基线 → 只有 NO-BASELINE
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.mjs": 'import { red } from "chalk";\nexport const x = red;\n',
  });
  try {
    const r = run(["drift", ".", "--json"], dir);
    assert.equal(r.code, 3, `无基线应 3，实际 ${r.code}：${r.out.slice(0, 300)}`);
    const parsed = JSON.parse(r.out);
    assert.ok(parsed.gaps.some((g) => g.kind === "NO-BASELINE"), "缺基线必须记 NO-BASELINE 进 gaps");
    assert.equal(parsed.summary.problems, 0, "NO-BASELINE 不得算成 problems");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("drift：基线版本 == 已装版本时不判漂移（同一份导出面，不是猜）", () => {
  // 造一个"已装版本就是基线版本"的工程：基线声明 6.0.1，装的也是 6.0.1
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "data/fingerprints/chalk.json": JSON.stringify({
      name: "chalk",
      baselineVersion: "6.0.1",
      surfaces: { ".": { import: ["red", "default"], require: null } },
    }),
    "src/a.mjs": 'import { red } from "chalk";\nexport const x = red;\n',
  });
  try {
    const r = run(["drift", ".", "--json"], dir);
    assert.equal(r.code, 0, `同版本不该报漂移，实际 ${r.code}：${r.out.slice(0, 300)}`);
    assert.equal(JSON.parse(r.out).summary.problems, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("drift：符号在基线有、已装没有 → DRIFT，退出 1", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    // 已装版本 6.0.1 的导出面只有 red；基线（旧版 5.0.0）里还有一个 blue
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "data/fingerprints/chalk.json": JSON.stringify({
      name: "chalk",
      baselineVersion: "5.0.0",
      surfaces: { ".": { import: ["red", "blue", "default"], require: null } },
    }),
    "src/a.mjs": 'import { blue } from "chalk";\nexport const x = blue;\n',
  });
  try {
    const r = run(["drift", ".", "--json"], dir);
    assert.equal(r.code, 1, `真漂移应退出 1，实际 ${r.code}：${r.out.slice(0, 400)}`);
    const parsed = JSON.parse(r.out);
    const f = parsed.findings.find((x) => x.status === "VERSION-BEHAVIOR-DRIFT");
    assert.ok(f, "应有一条 VERSION-BEHAVIOR-DRIFT");
    assert.deepEqual(f.missing, ["blue"]);
    assert.equal(parsed.summary.problems, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("drift：引用的符号在两版都在 → 不报漂移（防'版本号变大就报红'）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "data/fingerprints/chalk.json": JSON.stringify({
      name: "chalk",
      baselineVersion: "5.0.0",
      surfaces: { ".": { import: ["red", "blue", "default"], require: null } },
    }),
    // red 在基线里也有、已装里也有 → 本点不漂移
    "src/a.mjs": 'import { red } from "chalk";\nexport const x = red;\n',
  });
  try {
    const r = run(["drift", ".", "--json"], dir);
    assert.equal(r.code, 0, `符号仍在不该报漂移，实际 ${r.code}：${r.out.slice(0, 400)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshot：事实层算得出 → 退出 0；不缺依赖时不因'没判定'退出 1", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
  });
  try {
    const r = run(["snapshot", ".", "--json"], dir);
    assert.equal(r.code, 0, `应 0，实际 ${r.code}：${r.out.slice(0, 300)}`);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.deps.length, 1);
    assert.equal(parsed.deps[0].name, "chalk");
    assert.equal(parsed.deps[0].parseState, "OK");
    assert.equal(parsed.deps[0].hasRequireBranch, false, "chalk 实测无 require 分支");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshot：缺依赖包 → 退出 3（覆盖率缺口算不了，不是'没问题'）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1","zod":"^4.6.7"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
  });
  try {
    const r = run(["snapshot", ".", "--json"], dir);
    assert.equal(r.code, 3, `缺一个包应 3，实际 ${r.code}`);
    const parsed = JSON.parse(r.out);
    assert.ok(parsed.gaps.some((g) => g.pkg === "zod" && g.kind === "NO_PACKAGE_JSON"));
    const zod = parsed.deps.find((d) => d.name === "zod");
    assert.equal(zod.installedVersion, null, "缺失依赖不得冒充已安装");
    assert.equal(zod.parseState, "NO_PACKAGE_JSON");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scan：抽出引用点并按 file/line 排序；AMBIGUOUS 显式出现；退出 0", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/b.mjs": 'import { red } from "chalk";\n',
    "src/a.cjs": 'const name = "chalk";\nconst m = require(name);\n',
  });
  try {
    const r = run(["scan", ".", "--json"], dir);
    assert.equal(r.code, 0, `应 0，实际 ${r.code}：${r.out.slice(0, 300)}`);
    const parsed = JSON.parse(r.out);
    // 排序：a.cjs 在 b.mjs 之前
    assert.equal(parsed.points[0].file, "src/a.cjs");
    assert.equal(parsed.points[0].kind, "ambiguous", "动态 require 必须显式落 ambiguous");
    const staticPoint = parsed.points.find((p) => p.file === "src/b.mjs");
    assert.equal(staticPoint.specifier, "chalk");
    assert.deepEqual(staticPoint.imported, ["red"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("snapshot / scan 的输出也不含绝对路径（隐私红线）", () => {
  const dir = makeProject({
    "package.json": '{"name":"p","version":"0.0.0","dependencies":{"chalk":"^6.0.1"}}',
    "node_modules/chalk/package.json": CHALK_PKG,
    "node_modules/chalk/source/index.js": CHALK_ENTRY,
    "src/a.mjs": 'import { red } from "chalk";\n',
  });
  try {
    for (const cmd of ["snapshot", "scan"]) {
      const r = run([cmd, "."], dir);
      assert.ok(!r.out.includes(dir), `${cmd} 输出里出现了工程绝对路径`);
      assert.ok(!/[A-Za-z]:[\\/]/.test(r.out), `${cmd} 输出里出现了盘符路径`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});