// 契约测试的变异验证（M5）：在临时副本里逐组改坏一处，断言 tests/contract.test.mjs 会红。
//
// 为什么必须有这一步：M4 的招牌发现是"声明了但没人读"。一份**全绿**的契约测试，
// 与一份**什么也不验**的契约测试，输出完全一样。只有"改坏一处就红"才算真门。
// M4 用的手法是临时副本（不是工作树改完再 git checkout —— 那会冲掉本轮未提交的修改）。
//
// 用法：node tools/verify-contract-mutations.mjs
// 每组：复制仓库必需文件到临时目录 → 改坏一处 → 跑契约测试 → 断言 FAIL 且报错文本对得上。

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const MUTATIONS = [
  {
    id: "M1-判定态少一个",
    file: "SKILL.md",
    from: "`AMBIGUOUS` |",
    to: "|",
    expect: /缺判定态 AMBIGUOUS|缺值：AMBIGUOUS/,
  },
  {
    id: "M2-判定态多一个（不是枚举成员）",
    file: "SKILL.md",
    from: "| 判定态 | `RESOLVED`",
    to: "| 判定态 | `OUT-OF-SCOPE` `RESOLVED`",
    expect: /OUT-OF-SCOPE/,
  },
  {
    id: "M3-退出码漏 3",
    file: "SKILL.md",
    from: "`3` 算不了 · ",
    to: "",
    expect: /缺 CANNOT_COMPUTE=3|退出码「退出码」行缺值/,
  },
  {
    id: "M4-命令名拼错",
    file: "SKILL.md",
    from: "`selftest` `bench`",
    to: "`selftest2` `bench`",
    expect: /selftest2|缺命令 selftest/,
  },
  {
    id: "M5-契约块标记被删（判据面消失）",
    file: "SKILL.md",
    // ⚠️ 必须带换行锚定到**独占一行的**标记：说明段落里也引用了这个标记的字面量，
    //    裸子串 replace 会改到那段说明上，真标记还在 → 变异本身无效（第一版就是这么逃的）。
    from: "\n<!-- CONTRACT:END -->\n",
    to: "\n",
    expect: /CONTRACT:END/,
  },
  {
    id: "M6-把 CPR 边界说反（宣称 CJS 取错名字报 MISSING-EXPORT）",
    file: "SKILL.md",
    from: "**CJS 视角取一个不存在的符号，不会报 `MISSING-EXPORT`。**",
    to: "**CJS 视角取一个不存在的符号，会报 `MISSING-EXPORT`。**",
    expect: /§5.4.2|固有边界/,
  },
  {
    id: "M7-源码删掉一个判定态（contract → SKILL 失配）",
    file: "src/contract.mjs",
    from: '  AMBIGUOUS: "AMBIGUOUS",\n',
    to: "",
    expect: /AMBIGUOUS|STATUS 应恰好 5 个/,
  },
  {
    id: "M8-四格表悬空引用复活（run()）",
    file: "plan/00-README总览.md",
    from: "`src/api.mjs::checkAll()` + `src/api.mjs::decideExit()`",
    to: "`src/api.mjs::run()`",
    expect: /没有 export 这个函数|悬空/,
  },
  {
    id: "M9-SKILL 复制阈值数字（第三份副本）",
    file: "SKILL.md",
    from: "本文件只声明**枚举成员**，不复制数值——复制会让第三份副本各自漂移。",
    to: "本文件只声明**枚举成员**，不复制数值——复制会让第三份副本各自漂移。上限 4096 键、512 KiB。",
    expect: /复制了阈值/,
  },
  {
    id: "M10-引用点种类少一个",
    file: "SKILL.md",
    from: "`string-literal` `ambiguous`",
    to: "`string-literal`",
    expect: /缺引用点种类 ambiguous|缺值：ambiguous/,
  },
];

const COPY = ["SKILL.md", "package.json", "src", "tests", "plan", "data", "fixtures", "bin", "tools", "AGENTS.md", "README.md", ".github"];

function runCase(m) {
  const work = mkdtempSync(join(tmpdir(), "depcheck-contract-mut-"));
  try {
    for (const rel of COPY) cpSync(join(ROOT, rel), join(work, rel), { recursive: true });
    const target = join(work, m.file);
    const before = readFileSync(target, "utf8");
    if (!before.includes(m.from)) {
      return { id: m.id, ok: false, detail: `变异靶子不在文件里：${JSON.stringify(m.from)} — 测试写法或文档变了，本组需同步` };
    }
    writeFileSync(target, before.replace(m.from, m.to), "utf8");
    const r = spawnSync(process.execPath, ["--test", "tests/contract.test.mjs"], { cwd: work, encoding: "utf8" });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    const failed = r.status !== 0;
    if (!failed) return { id: m.id, ok: false, detail: "改坏后仍然全绿（假门：这条变异没被任何断言拦住）" };
    if (!m.expect.test(out)) return { id: m.id, ok: false, detail: `红了，但报错文本对不上预期 ${m.expect}（红错了地方）` };
    return { id: m.id, ok: true, detail: "CAUGHT" };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// 阳性对照：未改坏的副本必须全绿（否则"改坏就红"可能是文件复制坏了导致的假红）
function control() {
  const work = mkdtempSync(join(tmpdir(), "depcheck-contract-ctl-"));
  try {
    for (const rel of COPY) cpSync(join(ROOT, rel), join(work, rel), { recursive: true });
    const r = spawnSync(process.execPath, ["--test", "tests/contract.test.mjs"], { cwd: work, encoding: "utf8" });
    return { id: "对照-未改坏", ok: r.status === 0, detail: r.status === 0 ? "全绿" : `未改坏却红了：${(r.stdout ?? "").slice(-300)}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const results = [control(), ...MUTATIONS.map(runCase)];
let bad = 0;
process.stdout.write(`契约测试变异验证 · ${results.length} 组\n`);
for (const r of results) {
  if (!r.ok) bad++;
  process.stdout.write(`${r.ok ? "CAUGHT" : "MISS  "}  ${r.id}  ${r.detail}\n`);
}
process.stdout.write(`结论: ${bad === 0 ? `${results.length}/${results.length} 全部符合预期` : `${bad} 组不符预期`}\n`);
process.exitCode = bad === 0 ? 0 : 1;