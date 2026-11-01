// `data/fingerprints/` 的**基线自洽**与 `tools/gen-baselines.mjs --check` 的可执行形态。
//
// 为什么单独一条：基线的 byte 是 `drift` 判据的输入。基线一旦是编的、或不可独立复算，
// `drift` 的结论就整体失去证据力（`plan/04` §3 第 3 条："不得改真值凑实现"的同族）。
//
// 判据三条：
//   ① 每份基线都能离线复算：`fingerprint === sha12(canonical)`；
//   ② 溯源齐：`baselineVersion` + `provenance.sha512`；
//   ③ 生成器 `--check` 实跑通过（不是"我看了一下像对的"）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(ROOT, "data", "fingerprints");

/** 与生成器/解析层**必须逐字节同构**的规范化序列化。 */
function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return "null";
}
const sha12 = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);

const files = () => (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).sort() : []);

test("data/fingerprints/ 非空（C6 的 DRIFT 正例需要真基线，不能全体 skip）", () => {
  assert.ok(files().length > 0, "data/fingerprints/ 下没有任何基线——C6 的 DRIFT 正例将无处取真值");
});

test("每份基线都能离线复算指纹（fingerprint === sha12(canonical)）", () => {
  for (const f of files()) {
    const data = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    assert.equal(
      data.fingerprint,
      sha12(data.canonical),
      `data/fingerprints/${f} 的指纹无法由入仓的 canonical 复算（基线可能被手改过）`,
    );
  }
});

test("每份基线都有溯源（baselineVersion + provenance.sha512 + tarball）", () => {
  for (const f of files()) {
    const data = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    assert.equal(typeof data.baselineVersion, "string", `${f} 缺 baselineVersion`);
    assert.ok(data.baselineVersion.length > 0, `${f} 的 baselineVersion 为空`);
    assert.ok(data.provenance, `${f} 缺 provenance（不可复核）`);
    assert.equal(typeof data.provenance.sha512, "string", `${f} 缺 provenance.sha512`);
    assert.ok(data.provenance.sha512.length >= 128, `${f} 的 sha512 长度不足（sha512 hex 应为 128 字符）`);
    assert.match(String(data.provenance.tarball), /^npm:/, `${f} 的 provenance.tarball 应写清来源（npm:<pkg>@<ver>）`);
  }
});

test("基线的 surfaces 形状：值数组排序去重，或 null（null = 读不出，不是'没有'）", () => {
  for (const f of files()) {
    const data = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    assert.ok(data.surfaces && typeof data.surfaces === "object", `${f} 缺 surfaces`);
    for (const [subpath, views] of Object.entries(data.surfaces)) {
      for (const view of ["import", "require"]) {
        assert.ok(view in views, `${f} 的 surfaces["${subpath}"] 缺 ${view} 视角`);
        const names = views[view];
        if (names === null) continue;
        assert.ok(Array.isArray(names), `${f} 的 surfaces["${subpath}"].${view} 既不是数组也不是 null`);
        const sorted = [...new Set(names)].sort();
        assert.deepEqual(names, sorted, `${f} 的 surfaces["${subpath}"].${view} 未排序去重`);
      }
    }
  }
});

test("通配键不展开入仓（判定单位是具体子路径，不是模式）", () => {
  for (const f of files()) {
    const data = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    const patternKeys = Object.keys(data.surfaces).filter((k) => k.includes("*"));
    assert.deepEqual(patternKeys, [], `${f} 的 surfaces 里出现了通配键 ${patternKeys.join(",")}——应记进 skippedPatternKeys`);
  }
});

test("生成器 --check 实跑通过（基线自洽，不需要重新取 tarball）", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "gen-baselines.mjs"), "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `gen-baselines --check 应退出 0，实际 ${r.status}：\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /自洽/, `--check 的输出应自报判据：${r.stdout}`);
});

test("生成器 --list 能报出已入仓基线（门要自己报数，'0 命中'与'扫了 0 个'同形）", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "gen-baselines.mjs"), "--list"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  for (const f of files()) {
    const name = f.slice(0, -5);
    assert.match(r.stdout, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `--list 应报出 ${name}`);
  }
});

test("zod 基线的关键符号与已装版本对得上（C6 点 1/2 的真值锚点）", () => {
  const path = join(DIR, "zod.json");
  if (!existsSync(path)) {
    assert.fail("缺 data/fingerprints/zod.json——C6 的 DRIFT 正例需要它");
  }
  const base = JSON.parse(readFileSync(path, "utf8"));
  const imp = new Set(base.surfaces["."].import);
  // 点 1 的锚：ZodSchema 在基线里有（已装 4.6.7 里没有，见 C6 evidence）
  assert.ok(imp.has("ZodSchema"), "基线应含 ZodSchema（C6 点 1 的'基线有'一侧）");
  // 点 2 的锚：z 两版都在
  assert.ok(imp.has("z"), "基线应含 z（C6 点 2 的'两版都在'一侧）");
  assert.equal(base.baselineVersion, "3.25.76", "基线版本应与 C6 expected.json 声明一致");
});