// `drift` 判据的可证伪形态（`data/README.md` §5.5）。
//
// 本文件钉住三条口径，每条都配一个"写错了就会红"的构造：
//   ① 无基线 → NO-BASELINE（不猜），且**不**进 problems；
//   ② 判据是符号行为不是 semver（版本号跨 major 但符号在 → 不报漂移）；
//   ③ 判定单位是引用点不是整包（同包里一个符号没了、另一个还在 → 1 红 1 绿）。
// 另有 C6 真值的实跑对账（`fixtures/drift-baseline/`）。
//
// 基线不伪造：这里的基线文件都是**测试内构造的最小 fixture**，写在临时目录里；
// 真实基线（`data/fingerprints/zod.json`）由 `tests/baselines.test.mjs` 单独验。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeDriftPoint, readBaseline } from "../src/drift.mjs";
import { decideDriftExit, decideExit } from "../src/api.mjs";
import { DRIFT, NO_BASELINE, STATUS } from "../src/contract.mjs";

/** 造一个已装依赖记录（`index` 是 `describeExports` 的形状，这里手工给最小可用形态）。 */
function makeDep({ name = "chalk", version = "6.0.1", type = "module", exportNames = ["red", "default"] } = {}) {
  const pkgDir = mkdtempSync(join(tmpdir(), "drift-dep-"));
  mkdirSync(join(pkgDir, "source"), { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name, version, type, exports: { ".": { import: "./source/index.js", default: "./source/index.js" } } }),
  );
  writeFileSync(
    join(pkgDir, "source", "index.js"),
    exportNames.filter((n) => n !== "default").map((n) => `export function ${n}() {}`).join("\n") +
      (exportNames.includes("default") ? "\nexport default {};\n" : "\n"),
  );
  return {
    name,
    installedVersion: version,
    declaredRange: "^6.0.0",
    type,
    pkgDir,
    index: {
      entries: [{ key: ".", value: { import: "./source/index.js", default: "./source/index.js" }, kind: "exact" }],
      ignored: [],
    },
  };
}

/** 写一份最小基线到临时目录。 */
function makeBaselineDir(records) {
  const dir = mkdtempSync(join(tmpdir(), "drift-base-"));
  for (const [name, record] of Object.entries(records)) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(record));
  }
  return dir;
}

const point = (specifier, imported, file = "src/a.mjs", line = 1, kind = "import") => ({
  file,
  line,
  kind,
  specifier,
  imported,
});

test("无基线 → NO-BASELINE，且不是'发现问题'（§5.5 第 1 条）", () => {
  const dep = makeDep();
  const deps = new Map([["chalk", dep]]);
  const emptyDir = mkdtempSync(join(tmpdir(), "drift-none-"));
  try {
    const got = judgeDriftPoint(point("chalk", ["red"]), deps, emptyDir);
    assert.equal(got.status, NO_BASELINE);
    assert.equal(got.pkg, "chalk");
    assert.match(got.detail, /不猜/);
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("基线版本 == 已装版本 → 恒不漂移（同一份导出面，是恒等式不是猜）", () => {
  const dep = makeDep({ exportNames: ["red", "default"] });
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({
    chalk: { name: "chalk", baselineVersion: "6.0.1", surfaces: { ".": { import: ["red", "default"], require: null } } },
  });
  try {
    // 即便基线里写了已装版本没有的符号，同版本也不判漂移（口径：同一份导出面）
    const got = judgeDriftPoint(point("chalk", ["red"]), deps, baseDir);
    assert.equal(got.status, null);
    assert.match(got.detail, /基线版本/);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("符号在基线有、已装没有 → VERSION-BEHAVIOR-DRIFT（§5.5 第 2 条）", () => {
  const dep = makeDep({ exportNames: ["red", "default"] }); // 已装只有 red
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({
    chalk: { name: "chalk", baselineVersion: "5.0.0", surfaces: { ".": { import: ["red", "blue"], require: null } } },
  });
  try {
    const got = judgeDriftPoint(point("chalk", ["blue"]), deps, baseDir);
    assert.equal(got.status, DRIFT);
    assert.deepEqual(got.missing, ["blue"]);
    assert.equal(got.baselineVersion, "5.0.0");
    assert.equal(got.installedVersion, "6.0.1");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("版本跨 major 但符号仍在 → 不报漂移（防'版本号变大就报红'）", () => {
  const dep = makeDep({ exportNames: ["red", "default"] });
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({
    chalk: { name: "chalk", baselineVersion: "3.0.0", surfaces: { ".": { import: ["red", "blue"], require: null } } },
  });
  try {
    const got = judgeDriftPoint(point("chalk", ["red"]), deps, baseDir);
    assert.equal(got.status, null, `red 两版都在，不该判漂移：${JSON.stringify(got)}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("判定单位是引用点：同一包两个引用点一个红一个绿（§5.5 第 3 条）", () => {
  const dep = makeDep({ exportNames: ["red", "default"] });
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({
    chalk: { name: "chalk", baselineVersion: "5.0.0", surfaces: { ".": { import: ["red", "blue"], require: null } } },
  });
  try {
    const gone = judgeDriftPoint(point("chalk", ["blue"], "src/a.mjs", 2), deps, baseDir);
    const kept = judgeDriftPoint(point("chalk", ["red"], "src/b.mjs", 2), deps, baseDir);
    assert.equal(gone.status, DRIFT, "取 blue 的点应红");
    assert.equal(kept.status, null, "取 red 的点应绿——按包比会把这条也判红");
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("基线里本来也没有的符号不归 drift 管（那是 MISSING-EXPORT 的判据，不重复判）", () => {
  const dep = makeDep({ exportNames: ["red", "default"] });
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({
    chalk: { name: "chalk", baselineVersion: "5.0.0", surfaces: { ".": { import: ["red"], require: null } } },
  });
  try {
    // notARealExport 在两版都没有 → drift 层不该出声（留 null，交给 check 层判 MISSING-EXPORT）
    const got = judgeDriftPoint(point("chalk", ["notARealExport"]), deps, baseDir);
    assert.equal(got.status, null, `两版都没有的符号不该由 drift 判红：${JSON.stringify(got)}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("只加载包、不取符号的引用点不在 drift 判定面内（返回 null）", () => {
  const dep = makeDep();
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({ chalk: { name: "chalk", baselineVersion: "5.0.0", surfaces: { ".": { import: ["red"], require: null } } } });
  try {
    assert.equal(judgeDriftPoint(point("chalk", []), deps, baseDir), null);
    assert.equal(judgeDriftPoint(point("chalk", ["*"]), deps, baseDir), null);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("动态形态 / 非依赖引用不在 drift 判定面内（不制造噪音）", () => {
  const dep = makeDep();
  const deps = new Map([["chalk", dep]]);
  const baseDir = makeBaselineDir({ chalk: { name: "chalk", baselineVersion: "5.0.0", surfaces: { ".": { import: ["red"], require: null } } } });
  try {
    assert.equal(judgeDriftPoint({ file: "src/a.mjs", line: 1, kind: "ambiguous", specifier: null, imported: [] }, deps, baseDir), null);
    assert.equal(judgeDriftPoint(point("./local", ["x"], "src/a.mjs", 1, "import"), deps, baseDir), null);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(dep.pkgDir, { recursive: true, force: true });
  }
});

test("基线文件读不出/形状不对 → 一律当无基线（不猜，不崩）", () => {
  const dir = mkdtempSync(join(tmpdir(), "drift-bad-"));
  try {
    writeFileSync(join(dir, "bad1.json"), "{ 这不是 JSON");
    writeFileSync(join(dir, "bad2.json"), JSON.stringify({ name: "x" })); // 缺 baselineVersion
    writeFileSync(join(dir, "bad3.json"), JSON.stringify({ baselineVersion: "1.0.0" })); // 缺 surfaces
    for (const name of ["bad1", "bad2", "bad3", "nonexistent"]) {
      assert.equal(readBaseline(dir, name), null, `${name} 应返回 null`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("退出码：只有 NO-BASELINE → 3（基准缺失算不了，不是 0）", () => {
  const result = { ok: true, findings: [], gaps: [{ kind: NO_BASELINE, pkg: "x" }] };
  assert.equal(decideDriftExit(result), "CANNOT_COMPUTE");
  // check 的同一条口径（§5.1 的 3 触发含基准缺失）
  assert.equal(decideExit({ ok: true, findings: [], gaps: [{ kind: NO_BASELINE, pkg: "x" }] }), "CANNOT_COMPUTE");
});

test("退出码：有 DRIFT → 1（即使同时有 gaps）", () => {
  const result = {
    ok: true,
    findings: [{ status: DRIFT }],
    gaps: [{ kind: NO_BASELINE, pkg: "y" }],
  };
  assert.equal(decideDriftExit(result), "PROBLEMS");
});

test("NO-BASELINE 不是判定态：它不在 STATUS 枚举里，也不能当 findings 的 status", () => {
  assert.equal(Object.values(STATUS).includes(NO_BASELINE), false);
  assert.equal(Object.values(STATUS).includes(DRIFT), false);
  assert.equal(NO_BASELINE, "NO-BASELINE");
  assert.equal(DRIFT, "VERSION-BEHAVIOR-DRIFT");
});