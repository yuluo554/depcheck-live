// ═══ 表现层 · CLI 参数面与退出码 ═══
// 退出码语义唯一定义见 `data/README.md` §5.1；**本文件是唯一决定退出码的地方**。
//
// 手写参数解析而不是 `node:util` 的 parseArgs：parseArgs 在 node 20/22/24 上的错误行为
// 有差异（未知选项是抛还是返回），而退出码 4（用法错误）必须**完全可控**且逐版本一致。
//
// 用法错误一律 exit 4（不是 1、不是 2）——2 在本项目**保留不用**（与 1 合并，避免与
// shell 常见约定冲突）。

import { EXIT, TOOL, COMMANDS } from "./contract.mjs";

const USAGE = `用法: ${TOOL} <命令> [选项] [路径]

命令:
  check <path>      判定源码引用点是否对得上已装依赖（主命令）
  snapshot <path>   只输出依赖面快照
  scan <path>       只输出引用点
  drift <path>      版本行为漂移（需离线基线）
  selftest          自检（M4 落位）
  bench             基准（M3 落位）

选项:
  --json            机读输出
  --with-drift      在 check 中一并做 drift 判定
  --baseline-dir <路径>
                    drift 的离线基线目录（默认: <工程根>/data/fingerprints）
  --version         打印版本
  --help            打印本帮助

退出码: 0 无问题 / 1 有判定问题 / 3 算不了 / 4 用法错误
`;

/** 解析 argv（不含 node 与脚本路径）。返回 `{ok, opts, error}`，永不抛。 */
export function parseArgv(argv) {
  const opts = { json: false, withDrift: false, version: false, help: false, command: null, path: null, baselineDir: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--with-drift") opts.withDrift = true;
    else if (arg === "--baseline-dir") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) return { ok: false, opts, error: "--baseline-dir 需要参数" };
      opts.baselineDir = next;
      i += 1;
    } else if (arg === "--version" || arg === "-v") opts.version = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg.startsWith("-")) return { ok: false, opts, error: `未知选项: ${arg}` };
    else rest.push(arg);
  }
  if (opts.version || opts.help) return { ok: true, opts, error: null };

  if (rest.length === 0) return { ok: false, opts, error: "缺少命令" };
  const [command, ...tail] = rest;
  if (!COMMANDS.includes(command)) return { ok: false, opts, error: `未知命令: ${command}` };
  opts.command = command;

  if (command === "selftest" || command === "bench") {
    if (tail.length > 0) return { ok: false, opts, error: `${command} 不接受路径参数` };
    return { ok: true, opts, error: null };
  }
  if (tail.length !== 1) return { ok: false, opts, error: `${command} 需要且只接受一个路径参数` };
  opts.path = tail[0];
  return { ok: true, opts, error: null };
}

/** 退出码映射：唯一一处把"语义名"翻成数字。 */
export function exitCodeFor(semantic) {
  return EXIT[semantic] ?? EXIT.USAGE;
}

export { USAGE };