#!/usr/bin/env node
// ═══ CLI 入口 ═══
// 只做三件事：解析 argv → 调编排层 → 打印 + 设退出码。判定逻辑一概不在这里。
//
// `selftest` / `bench` 在 M0 是**显式未实现**（exit 3，不是假装通过）：
// "这一层没跑"必须与"跑了没问题"可区分（`plan/05` §4 U 项纪律）。

import { resolve } from "node:path";
import { TOOL, EXIT } from "../src/contract.mjs";
import { parseArgv, exitCodeFor, USAGE } from "../src/cli.mjs";
import { checkAll, decideExit } from "../src/api.mjs";
import { renderHuman, renderJson } from "../src/report.mjs";
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

  if (opts.command === "selftest" || opts.command === "bench") {
    process.stderr.write(`${TOOL}: ${opts.command} 尚未实现（M${opts.command === "bench" ? "3/4" : "4"} 落位）\n`);
    return EXIT.CANNOT_COMPUTE;
  }

  const root = resolve(opts.path);
  if (opts.command === "snapshot" || opts.command === "scan" || opts.command === "drift") {
    // M2/M3 落位；此刻显式报"尚未实现"，不假装成功
    process.stderr.write(`${TOOL}: ${opts.command} 尚未实现（M${opts.command === "drift" ? "3" : "2"} 落位）\n`);
    return EXIT.CANNOT_COMPUTE;
  }

  const result = checkAll(root, { withDrift: opts.withDrift });
  process.stdout.write(opts.json ? renderJson(result) : renderHuman(result));
  return exitCodeFor(decideExit(result));
}

process.exitCode = main(process.argv.slice(2));