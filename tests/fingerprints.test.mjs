// 指纹入库纪律（`plan/04` §4）：`--check` 逐字节一致 + 运行时口径与入库口径同构 + 冻结件可复算。
//
// 这条测试防的是三件事：
//   ① 入仓件被手改（"改真值凑实现"）——`--check` 重算比对必须红；
//   ② 生成器与 `src/resolve.mjs` 的规范化序列化漂移——两份口径必须对同一 exports 给同一指纹；
//   ③ 指纹依赖机器（键序/浮点/平台）——任何人只凭入仓件里的 `canonical` 就能复算出来。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, describeExports } from "../src/resolve.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PKGS_DIR = join(ROOT, "data", "packages");
const PACKAGES = ["chalk", "zod", "date-fns", "commander", "glob"];

const readPkg = (name) => JSON.parse(readFileSync(join(PKGS_DIR, `${name}.json`), "utf8"));

test("五包指纹件齐备（不多不少）", () => {
  const onDisk = readdirSync(PKGS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(onDisk, [...PACKAGES].sort(), "data/packages/ 必须正好是五包，陈旧件要删");
});

test("每份指纹件：能凭 canonical 独立复算出 fingerprint（不信生成器）", () => {
  for (const name of PACKAGES) {
    const rec = readPkg(name);
    const recomputed = createHash("sha256").update(rec.canonical, "utf8").digest("hex").slice(0, 12);
    assert.equal(recomputed, rec.fingerprint, `${name}: canonical → sha256 前 12 位必须等于 fingerprint`);
    assert.match(rec.fingerprint, /^[0-9a-f]{12}$/);
  }
});

test("入库口径与运行时口径同构：src/resolve.mjs 对同一 exports 给同一指纹", () => {
  for (const name of PACKAGES) {
    const rec = readPkg(name);
    assert.equal(
      fingerprint(rec.exports ?? undefined),
      rec.fingerprint,
      `${name}: 生成器与 resolve.mjs 的规范化序列化已漂移（两份口径必须同构）`,
    );
  }
});

test("五包的 require 分支判定与 data/README.md §1 D4–D6 记录一致", () => {
  // D4：chalk 无 require 分支；D5：zod/date-fns/glob 有；D6：commander 无
  const expected = { chalk: false, zod: true, "date-fns": true, commander: false, glob: true };
  for (const [name, want] of Object.entries(expected)) {
    const rec = readPkg(name);
    assert.equal(rec.hasRequireBranch, want, `${name} 的 hasRequireBranch 与 D4–D6 不符`);
    assert.equal(
      describeExports({ exports: rec.exports }).hasRequireBranch,
      want,
      `${name}: resolve.mjs 与入库件的判定不一致`,
    );
  }
});

test("五包的 ./package.json 暴露性与 data/README.md §1 D4–D6 一致", () => {
  // D4：chalk 不暴露；D5：zod/date-fns/glob 暴露；D6：commander 不暴露
  const expected = { chalk: false, zod: true, "date-fns": true, commander: false, glob: true };
  for (const [name, want] of Object.entries(expected)) {
    assert.equal(readPkg(name).exposesPackageJson, want, `${name} 的 ./package.json 暴露性不符`);
  }
});

test("gen-fingerprints --check 逐字节一致（双跑比对）", (t) => {
  // 没有 node_modules 时无法重算 → 明确 skip，**不假装通过**
  if (!existsSync(join(ROOT, "node_modules"))) {
    t.skip("本机无 node_modules（五包未装），--check 需由装包环境跑");
    return;
  }
  const out = execFileSync(process.execPath, [join(ROOT, "tools", "gen-fingerprints.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(out, /5\/5 份逐字节一致/);
});