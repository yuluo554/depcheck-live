// 交接单指针自洽（`plan/HANDOFF-M<k>.md` 的「下一棒启动命令」必须指向**它自己**）。
//
// 为什么需要这条测试（实测缺陷，不是设想）：
//   `HANDOFF-M<k>` 的 `k` = **刚完成的里程碑号**（`AGENTS.md` §一/§二 + 每份交接单第 4 行的自我声明）。
//   下一棒的待办就写在**本文件 §三**里，所以启动命令必须读**本文件**。
//   但 M0 把它写成了 `HANDOFF-M1.md`（当时不存在）→ M1 照抄成 `HANDOFF-M2.md`
//   → 下一棒读到空文件、被迫从零重建状态。**这个人手抄的 off-by-one 已经真实发生过一次。**
//
// 判据只读仓库内文件。三种形态都要管：
//   ① 交接单里的 `/goal 读取 … plan/HANDOFF-M<k>.md` 必须等于**本文件自己的编号**；
//   ② 不许指向一个**当前不存在**的交接单（那正是"读空文件"的形态）；
//   ③ 交接单自述的标题编号必须与文件名一致（防止复制上一份后忘改标题）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PLAN_DIR = join(ROOT, "plan");

const handoffFiles = readdirSync(PLAN_DIR)
  .filter((f) => /^HANDOFF-M\d+\.md$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

test("plan/ 下至少有 M0 与 M1 两份交接单（阳性对照：判据不是空跑）", () => {
  assert.ok(handoffFiles.length >= 2, `实际找到 ${handoffFiles.length} 份：${handoffFiles.join(", ")}`);
  assert.ok(handoffFiles.includes("HANDOFF-M0.md"), "缺 HANDOFF-M0.md");
  assert.ok(handoffFiles.includes("HANDOFF-M1.md"), "缺 HANDOFF-M1.md");
});

test("每份交接单的标题编号与文件名一致（防复制上一份后忘改标题）", () => {
  for (const file of handoffFiles) {
    const k = Number(file.match(/M(\d+)/)[1]);
    const firstLine = readFileSync(join(PLAN_DIR, file), "utf8").split("\n")[0];
    assert.match(
      firstLine,
      new RegExp(`^#\\s*HANDOFF-M${k}\\b`),
      `${file} 的首行标题编号与文件名不符：${JSON.stringify(firstLine.slice(0, 60))}`,
    );
  }
});

test("★ 每份交接单的「下一棒启动命令」指向**本文件自己**，不是下一个编号", () => {
  let checked = 0;
  for (const file of handoffFiles) {
    const k = Number(file.match(/M(\d+)/)[1]);
    const text = readFileSync(join(PLAN_DIR, file), "utf8");
    const marker = text.indexOf("下一棒启动命令");
    if (marker < 0) continue; // 由布局门的七节判据管；这里不重复判"缺节"
    const section = text.slice(marker);
    // 只认**启动命令那一行**：`/goal 读取 "…\plan\HANDOFF-M<k>.md" 继续完成任务`
    // （下面常有"⚠️ 此处曾是 off-by-one 缺陷"之类的叙述，那些不是命令本身）
    const cmdLine = section.split("\n").find((l) => l.includes("/goal") && l.includes("HANDOFF-M"));
    assert.ok(cmdLine, `${file} 的「下一棒启动命令」小节里找不到 /goal … HANDOFF-M<k>.md 形态的命令行`);
    const m = /HANDOFF-M(\d+)\.md/.exec(cmdLine);
    assert.ok(m, `${file} 的启动命令里找不到 HANDOFF-M<k>.md：${cmdLine.trim()}`);
    checked += 1;
    assert.equal(
      Number(m[1]),
      k,
      `${file} 的「下一棒启动命令」指向 HANDOFF-M${m[1]}，应指向本文件 HANDOFF-M${k}` +
        `（k = 刚完成的里程碑号；下一棒的待办写在本文件 §三）`,
    );
  }
  assert.ok(checked > 0, "没有任何交接单带「下一棒启动命令」小节 —— 判据空跑");
});

test("交接单的「下一棒启动命令」不许指向一个当前不存在的交接单（那正是『读空文件』的形态）", () => {
  // ⚠️ 判据面只取**启动命令那一行**，不是全文。
  //    `§三 下一棒待办` 里出现 `写 plan/HANDOFF-M<k+1>.md` 是**正当的前瞻引用**
  //    （那是下一棒的收尾动作，此刻当然还没写）；把它判红 = 判据瞄错靶子
  //    （同族：HANDOFF-M0 §五.5 记的"变异靶子必须落在判据的实际扫描面上"）。
  const problems = [];
  for (const file of handoffFiles) {
    const text = readFileSync(join(PLAN_DIR, file), "utf8");
    const marker = text.indexOf("下一棒启动命令");
    if (marker < 0) continue;
    const cmdLine = text.slice(marker).split("\n").find((l) => l.includes("/goal") && l.includes("HANDOFF-M"));
    if (!cmdLine) continue;
    for (const m of cmdLine.matchAll(/HANDOFF-M(\d+)\.md/g)) {
      if (!existsSync(join(PLAN_DIR, `HANDOFF-M${m[1]}.md`))) {
        problems.push(`${file} 的启动命令引用了不存在的 plan/HANDOFF-M${m[1]}.md`);
      }
    }
  }
  assert.deepEqual(problems, [], `启动命令指向了还不存在的文件（会让下一棒读到空）：\n  ${problems.join("\n  ")}`);
});

test("每份交接单的第 4 行都声明了『k = 刚完成的里程碑号』口径（防口径漂移）", () => {
  // 这条口径是"指针必须指向自己"的**依据**；口径若被改掉，上面那条测试的正当性就没了
  for (const file of handoffFiles) {
    const text = readFileSync(join(PLAN_DIR, file), "utf8");
    assert.match(
      text,
      /k\s*=\s*刚完成的里程碑号/,
      `${file} 缺『k = 刚完成的里程碑号』口径声明（它是"指针指向自己"的依据，见 AGENTS.md §一）`,
    );
  }
});