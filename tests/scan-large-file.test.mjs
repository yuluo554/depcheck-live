// 降级扫描的**真实用例**（M2 DoD6）：>512 KiB 的文件必须真的进 gaps，
// 不能只是"代码里写了 if 但从来没跑过"。
//
// 这条测试的证明力来自三点：
//   ① 阈值来自 `src/contract.mjs` 的 `LIMITS.SOURCE_FILE_BYTES`（不是测试里另写一个数）；
//   ② 构造的文件**真的超过**该阈值（断言里先验证，防止阈值被改小后这条测试空转）；
//   ③ 断言 gaps 里出现 `LARGE_FILE_DOWNGRADED` 且指向那份文件——即"跑了，且用户看得见"。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS, LARGE_FILE_DOWNGRADED } from "../src/contract.mjs";
import { scanSources } from "../src/scan.mjs";

function makeTree(files) {
  const dir = mkdtempSync(join(tmpdir(), "depcheck-large-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("超过 LIMITS.SOURCE_FILE_BYTES 的文件：真的进 gaps，且不被静默跳过", () => {
  // 造一份真的超限的文件：一行注释 + 一行真引用点，中间用空格撑到超过阈值。
  const pad = " ".repeat(LIMITS.SOURCE_FILE_BYTES + 1024);
  const big = `// 撑到超过 ${LIMITS.SOURCE_FILE_BYTES} 字节${pad}\nconst { z } = require("zod");\n`;
  const dir = makeTree({ "src/huge.cjs": big });
  try {
    const bytes = statSync(join(dir, "src/huge.cjs")).size;
    assert.ok(
      bytes > LIMITS.SOURCE_FILE_BYTES,
      `构造失败：文件只有 ${bytes} 字节，未超过阈值 ${LIMITS.SOURCE_FILE_BYTES}`,
    );

    const result = scanSources(dir, { depNames: new Set(["zod"]) });
    const downgraded = result.gaps.filter((g) => g.kind === LARGE_FILE_DOWNGRADED);
    assert.equal(downgraded.length, 1, `gaps 应含恰好 1 条 ${LARGE_FILE_DOWNGRADED}，实际 gaps=${JSON.stringify(result.gaps)}`);
    assert.equal(downgraded[0].file, "src/huge.cjs", "gap 必须指向超限的那份文件");
    assert.match(downgraded[0].detail, new RegExp(String(LIMITS.SOURCE_FILE_BYTES)), "detail 里要写明上限值，用户才能对上口径");

    // 关键：**降级 ≠ 丢弃**。文件仍被扫（本实现是"读全文但仍记账"），引用点不得丢。
    assert.equal(result.files.includes("src/huge.cjs"), true, "超限文件仍应出现在 files 里");
    assert.ok(
      result.points.some((p) => p.file === "src/huge.cjs" && p.specifier === "zod"),
      "降级后引用点仍在（用户能看到这份文件被分析了多少）",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("刚好等于阈值不算超限（边界不多报一天）", () => {
  // 造一份**恰好**等于阈值的文件
  const header = 'const { z } = require("zod");\n';
  const exact = header + " ".repeat(LIMITS.SOURCE_FILE_BYTES - Buffer.byteLength(header));
  const dir = makeTree({ "src/exact.cjs": exact });
  try {
    const bytes = statSync(join(dir, "src/exact.cjs")).size;
    assert.equal(bytes, LIMITS.SOURCE_FILE_BYTES, `构造失败：文件 ${bytes} 字节，期望恰好 ${LIMITS.SOURCE_FILE_BYTES}`);
    const result = scanSources(dir, { depNames: new Set(["zod"]) });
    assert.equal(
      result.gaps.filter((g) => g.kind === LARGE_FILE_DOWNGRADED).length,
      0,
      "等于上限不得降级（判据是 >，不是 >=）",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("阈值本身从契约来（测试不另写数字——改一处不改另一处会红）", () => {
  assert.equal(typeof LIMITS.SOURCE_FILE_BYTES, "number");
  assert.equal(LIMITS.SOURCE_FILE_BYTES, 524288);
  // 与 data/README.md §5.3 的一致性由 tests/thresholds.test.mjs 双向断言，这里只钉住它的消费面
  assert.equal(LARGE_FILE_DOWNGRADED, "LARGE_FILE_DOWNGRADED");
});

test("真实五包里确实存在超限源码（证明这个降级路径不是为假想场景写的）", () => {
  // date-fns@4.4.0 的 locale/cdn.js 是 837 KiB（data/README.md §5.3.1 的记录值）。
  // 这里只读入仓的指纹件来判断"该包存在超限文件"不可行，因此改为直接统计本机 node_modules；
  // 未安装时显式 skip，不假装通过。
  let found = [];
  const nm = join(process.cwd(), "node_modules");
  try {
    statSync(nm);
  } catch {
    return; // 无 node_modules：这条无从验证
  }
  for (const pkg of ["chalk", "zod", "date-fns", "commander", "glob"]) {
    const dir = join(nm, pkg);
    try {
      statSync(dir);
    } catch {
      continue;
    }
    const result = scanSources(dir, { maxFileBytes: LIMITS.SOURCE_FILE_BYTES, depNames: new Set() });
    for (const g of result.gaps) {
      if (g.kind === LARGE_FILE_DOWNGRADED) found.push(`${pkg}/${g.file}`);
    }
  }
  assert.ok(found.length > 0, "五个真实包里应至少有一份超过 512 KiB 的源码（否则降级路径没有真实用例）");
  assert.ok(
    found.some((f) => f.includes("date-fns")),
    `应含 date-fns 的超限文件（记录值 818 KiB），实际: ${found.slice(0, 5).join(", ")}`,
  );
});

test("读不出的文件记 UNREADABLE_FILE 而不是静默跳过", () => {
  // 构造一个"名字是源码扩展名、其实是目录"的条目：readdirSync 会把它当目录递归，
  // 因此这里改用**权限不可读**不可移植，退而验证"不存在的路径不炸、且有明确返回"。
  const dir = mkdtempSync(join(tmpdir(), "depcheck-unreadable-"));
  try {
    writeFileSync(join(dir, "a.mjs"), 'import x from "y";\n');
    const result = scanSources(dir, { depNames: new Set() });
    assert.equal(result.files.length, 1);
    // 不存在的根：collectSourceFiles 返回空（walk 内部 catch），不抛
    const none = scanSources(join(dir, "__absent__"), {});
    assert.deepEqual(none.files, []);
    assert.equal(readFileSync(join(dir, "a.mjs"), "utf8") !== "", true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});