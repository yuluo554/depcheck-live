#!/usr/bin/env node
// ═══ CLI 入口 ═══
// 只做三件事：解析 argv → 调编排层 → 打印 + 设退出码。判定逻辑一概不在这里。
//
// `selftest` / `bench` 在 M0 是**显式未实现**（exit 3，不是假装通过）：
// "这一层没跑"必须与"跑了没问题"可区分（`plan/05` §4 U 项纪律）。

import { resolve } from "node:path";
import { TOOL, EXIT } from "../src/contract.mjs";
import { parseArgv, exitCodeFor, USAGE } from "../src/cli.mjs";
import { checkAll, decideExit, decideSnapshotExit, decideScanExit, decideDriftExit, driftCommand } from "../src/api.mjs";
import { snapshotAll, scanAll } from "../src/commands.mjs";
import { renderHuman, renderJson, renderSnapshot, renderScan, renderDrift } from "../src/report.mjs";
import { benchAll, renderBench } from "../src/bench.mjs";
import { readVersion } from "../src/version.mjs";

function main(argv) {
  const parsed = parseArgv(argv);
  if (!parsed.ok) {
    process.stderr.write(`${TOOL}: ${parsed.error}\n\n${USAGE}`);
    return EXIT.USAGE;
  }
  const { opts } = parsed;

  if (opts.version) {
    process.stdout.write(`${TOOL} ${readVersion()}\n`);
    return EXIT.OK;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return EXIT.OK;
  }

  if (opts.command === "selftest") {
    process.stderr.write(`${TOOL}: selftest 尚未实现（M4 落位）\n`);
    return EXIT.CANNOT_COMPUTE;
  }
  if (opts.command === "bench") {
    const bench = benchAll(process.cwd());
    process.stdout.write(opts.json ? renderJson(bench) : renderBench(bench));
    if (!bench.ok) return exitCodeFor(bench.reason ? "CANNOT_COMPUTE" : "PROBLEMS");
    return exitCodeFor("OK");
  }

  const root = resolve(opts.path);

  // `snapshot` / `scan`（M2 落位）：只摊开事实，不做判定，因此**永不因"发现问题"退出 1**。
  // 它们的退出码只看"事实层算不算得出来"（3）与"一切正常"（0）。
  if (opts.command === "snapshot") {
    const snapshot = snapshotAll(root);
    process.stdout.write(opts.json ? renderJson(snapshot) : renderSnapshot(snapshot));
    return exitCodeFor(decideSnapshotExit(snapshot));
  }
  if (opts.command === "scan") {
    const scan = scanAll(root);
    process.stdout.write(opts.json ? renderJson(scan) : renderScan(scan));
    return exitCodeFor(decideScanExit(scan));
  }
  if (opts.command === "drift") {
    // 基线目录默认 <工程根>/data/fingerprints；`--baseline-dir` 让基线可放在工程外
    // （语料目录只入仓 package.json/INPUT.md/expected.json/src，装不下指纹库）。
    const driftOpts = opts.baselineDir ? { baselineDir: resolve(opts.baselineDir) } : {};
    const drift = driftCommand(root, driftOpts);
    process.stdout.write(opts.json ? renderJson(drift) : renderDrift(drift));
    return exitCodeFor(decideDriftExit(drift));
  }

  const result = checkAll(root, { withDrift: opts.withDrift, drift: opts.baselineDir ? { baselineDir: resolve(opts.baselineDir) } : {} });
  process.stdout.write(opts.json ? renderJson(result) : renderHuman(result));
  return exitCodeFor(decideExit(result));
}

process.exitCode = main(process.argv.slice(2));