// 语料实跑：`fixtures/C1–C5` 的 `expected.json` 是**真值**，本文件让它们真的跑一遍。
//
// 为什么这条测试是必须的：`tests/fixtures.test.mjs` 只检查语料的**形状**（齐备、可解析、
// 有 status/evidence），形状对不代表真值对——一个"永远返回 RESOLVED"的实现能让形状检查全绿。
// 本文件把 `expected.json` 的每个 point 与 `check` 的真实输出逐条对账，才是可证伪的形态。
//
// 依赖面怎么来（**不改交付面**）：
//   语料目录只入仓 `package.json` + `INPUT.md` + `expected.json` + `src/`（见 plan/04 §1：
//   `node_modules/` 不入库）。实跑时把每份语料复制到临时目录，再把**本仓根部**的
//   `node_modules/` 以目录联接挂上去——五包是同一批安装，事实面完全相同。
//   这样既不用往仓库里塞 5 × 34 MB 的副本（那会让 `tools/mutate-gates.mjs` 的整仓复制炸掉），
//   又保证"跑的是真实五包"。
//
// 前提：本仓根有 `node_modules/`（五包装过）。没有时**显式 skip**，不假装通过。

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BIN = join(ROOT, "bin", "depcheck-live.mjs");
const FIXTURES = join(ROOT, "fixtures");
const ROOT_NM = join(ROOT, "node_modules");

const FIVE = ["chalk", "zod", "date-fns", "commander", "glob"];

/** C1–C5（C6 属 M3、C7 属 M4）。 */
const CASES = ["resolved-basic", "missing-export", "esm-cjs-mismatch", "subpath-blocked", "ambiguous-dynamic"];

/** 五包是否都在本仓根装好（缺一个就不跑，避免"半装"给出假结论）。 */
const depsReady = () => FIVE.every((p) => existsSync(join(ROOT_NM, p, "package.json")));

/**
 * 把一份语料落到临时工程目录：复制语料里的**入仓文件**，再把本仓 `node_modules` 挂上来。
 * @returns {string} 临时工程根的绝对路径
 */
function materialize(dir) {
  const work = mkdtempSync(join(tmpdir(), `depcheck-fixture-${dir}-`));
  cpSync(join(FIXTURES, dir), work, {
    recursive: true,
    filter: (src) => !src.includes("node_modules"), // 语料里不应该有它；有也不带
  });
  symlinkSync(ROOT_NM, join(work, "node_modules"), "junction");
  return work;
}

function runCheck(dir) {
  const r = spawnSync(process.execPath, [BIN, "check", dir, "--json"], { cwd: ROOT, encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    parsed = null;
  }
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", parsed };
}

const readExpected = (dir) => JSON.parse(readFileSync(join(FIXTURES, dir, "expected.json"), "utf8"));

/**
 * 把 findings 拉平成 `file|line|specifier` → status 的查找表。
 * `findings` 是**逐引用点的判定**（含 RESOLVED），与 `expected.json` 的 points 一一对应。
 */
function indexFindings(findings) {
  const map = new Map();
  for (const f of findings) {
    const key = `${f.file}|${f.line}|${f.specifier ?? ""}`;
    // 同一 key 若出现两次，说明抽取层把一个引用点算了两遍——按契约不该发生
    assert.ok(!map.has(key), `同一引用点被判两次: ${key}`);
    map.set(key, f);
  }
  return map;
}

for (const dir of CASES) {
  test(`${dir}：逐点 status 与 expected.json 一致（真值对账，不是形状检查）`, (t) => {
    if (!depsReady()) {
      t.skip(`本仓根 node_modules 缺五包之一（npm i --no-save ${FIVE.join(" ")}），无法实跑`);
      return;
    }
    const work = materialize(dir);
    try {
      const expected = readExpected(dir);
      const run = runCheck(work);
      assert.ok(run.parsed, `输出不是合法 JSON: ${run.out.slice(0, 300)}`);
      assert.equal(run.code, expected.expect.exitCode, `退出码应为 ${expected.expect.exitCode}，实际 ${run.code}`);

      const actual = indexFindings(run.parsed.findings);
      for (const point of expected.points) {
        const key = `${point.file}|${point.line}|${point.specifier ?? ""}`;
        const got = actual.get(key);
        assert.ok(got, `expected.json 的 ${point.id}（${key}）在实跑结果里找不到——抽取层漏了这条引用点`);
        assert.equal(got.status, point.status, `${point.id}（${key}）判定态应为 ${point.status}，实际 ${got.status}`);
      }

      // 反向：实跑出现的每个非 RESOLVED 判定，都必须能在 expected.json 里找到声明
      // （防"多判了一条没人认领的红"）
      const declared = new Set(expected.points.map((p) => `${p.file}|${p.line}|${p.specifier ?? ""}`));
      for (const [key, f] of actual) {
        if (f.status === "RESOLVED") continue;
        assert.ok(declared.has(key), `实跑多出一条未在 expected.json 声明的 ${f.status}: ${key}`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test(`${dir}：summary 与 expected.json 的 expect.summary 一致`, (t) => {
    if (!depsReady()) {
      t.skip(`本仓根 node_modules 缺五包之一`);
      return;
    }
    const work = materialize(dir);
    try {
      const want = readExpected(dir).expect.summary;
      const got = runCheck(work).parsed.summary;
      assert.equal(got.problems, want.problems, `${dir}: problems 应为 ${want.problems}，实际 ${got.problems}`);
      assert.equal(got.gaps, want.gaps, `${dir}: gaps 应为 ${want.gaps}，实际 ${got.gaps}`);
      if (want.ambiguous !== undefined) {
        assert.equal(got.ambiguous, want.ambiguous, `${dir}: ambiguous 应为 ${want.ambiguous}，实际 ${got.ambiguous}`);
      }
      if (want.minTotalPoints !== undefined) {
        assert.ok(got.totalPoints >= want.minTotalPoints, `${dir}: totalPoints 应 ≥ ${want.minTotalPoints}，实际 ${got.totalPoints}`);
      }
      if (want.byStatus) {
        for (const [status, count] of Object.entries(want.byStatus)) {
          assert.equal(got.byStatus[status] ?? 0, count, `${dir}: byStatus.${status} 应为 ${count}`);
        }
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
}

test("五包 + 五份语料的 parseState 全 OK（UNPARSEABLE = 0，M2 DoD1）", (t) => {
  if (!depsReady()) {
    t.skip(`本仓根 node_modules 缺五包之一，无法实跑`);
    return;
  }
  for (const dir of CASES) {
    const work = materialize(dir);
    try {
      const r = spawnSync(process.execPath, [BIN, "snapshot", work, "--json"], { cwd: ROOT, encoding: "utf8" });
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.ok, true, `${dir} snapshot 不可计算`);
      assert.equal(parsed.gaps.length, 0, `${dir} 出现 gaps: ${JSON.stringify(parsed.gaps)}`);
      for (const dep of parsed.deps) {
        assert.equal(dep.parseState, "OK", `${dir} 的 ${dep.name} parseState=${dep.parseState}（应为 OK）`);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
});