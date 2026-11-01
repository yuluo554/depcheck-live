// 交接单入口口径（`plan/HANDOFF-M<k>.md` = **M<k> 的入口文件**）的自洽校验。
//
// 口径（用户 2026-11-01 订正，skill 已同步）：`k` = **它开的那一棒**，不是"写完它的那一棒"。
//   M3 做完了 → M3 收尾写 `HANDOFF-M4.md`（M4 的入口）。
//
// 为什么需要这条测试（实测缺陷，不是设想）：
//   本仓布局门旧实现是 `for (const k of done)` —— **只枚举已 ✅ 的里程碑**。
//   于是"M1 收尾却没写 `HANDOFF-M2.md`"时门照旧全绿（实测报"2 份交接单齐"），
//   下一棒打开仓库**找不到入口**，被迫从零重建状态。
//   中间还踩过一次更深的坑：拿门的缺陷反过来定语义，把 `k` 说成"刚完成的里程碑号"、
//   要求启动命令"指向它自己"，方向整体反了。
//
// 这份测试与布局门 `LAYOUT.HANDOFFS` 分工：
//   · 布局门管**存在性与两半边**（done ∪ {current} 有入口；未开工不许有）
//   · 本测试管**文档内部自洽**（标题编号、启动命令指向、口径声明、引用不悬空）

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

/** 从状态副本推导 done / current（与布局门同口径：并集，真值不取自单一副本）。 */
function milestoneSets() {
  const states = new Map();
  for (const rel of ["plan/00-README总览.md", "plan/05-里程碑与发布.md"]) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    for (const line of text.split("\n")) {
      const m = /^\|\s*\*{0,2}M(\d+)\b/.exec(line);
      if (!m) continue;
      const k = Number(m[1]);
      if (!states.has(k)) states.set(k, new Set());
      states.get(k).add(/[⬜🟡]/.test(line) ? "pending" : "done");
    }
  }
  const all = [...states.keys()].sort((a, b) => a - b);
  const done = all.filter((k) => states.get(k).has("done"));
  const pending = all.filter((k) => !states.get(k).has("done"));
  return { all, done, current: pending.length ? Math.min(...pending) : null };
}

test("plan/ 下至少有 M0 与 M1 两份入口（阳性对照：判据不是空跑）", () => {
  assert.ok(handoffFiles.length >= 2, `实际找到 ${handoffFiles.length} 份：${handoffFiles.join(", ")}`);
  assert.ok(handoffFiles.includes("HANDOFF-M0.md"), "缺 HANDOFF-M0.md");
  assert.ok(handoffFiles.includes("HANDOFF-M1.md"), "缺 HANDOFF-M1.md");
});

test("★ 每个已开的里程碑（已 ✅ + 当前在做的）都有入口 `HANDOFF-M<k>.md`", () => {
  const { done, current } = milestoneSets();
  assert.ok(done.length > 0, "没推导出任何 ✅ 里程碑 —— 判据空跑");
  // ⚠️ M6 实测修正：这里原先写死 `assert.ok(current !== null, "…全部 ✅ 时本测试应改为只查 done")`
  //    —— 那句**报错文案自己**就说出了修法，但代码没照做。末棒 M6 翻 ✅ 后 `current === null`，
  //    整条测试必炸；而布局门 `LAYOUT.HANDOFFS` 同时正确地报"全部已 ✅，无当前里程碑"且全绿。
  //    **两边判据必须同口径：没有 ⬜ 时，已开的 = done。**
  //    这属于"判据锚了进度状态"同族（与 mutate-gates 的 H2 那个坑同源）：锚"总会有一个 ⬜"
  //    就是锚进度，末棒必死。修的是测试，不是门的语义。
  const required = [...done, ...(current === null ? [] : [current])].sort((a, b) => a - b);
  assert.ok(required.length > 0, "已开里程碑集合为空 —— 判据空跑");
  const missing = required.filter((k) => !existsSync(join(PLAN_DIR, `HANDOFF-M${k}.md`)));
  assert.deepEqual(
    missing,
    [],
    `这些已开里程碑缺入口文件（下一棒会找不到入口）：${missing.map((k) => `HANDOFF-M${k}.md`).join(", ")}`,
  );
});

test("★ 不得超前：未开工的里程碑（⬜ 且非当前）不许有入口文件", () => {
  const { all, done, current } = milestoneSets();
  const notOpened = all.filter((k) => !done.includes(k) && k !== current);
  const premature = notOpened.filter((k) => existsSync(join(PLAN_DIR, `HANDOFF-M${k}.md`)));
  assert.deepEqual(
    premature,
    [],
    `这些里程碑还没开工却有入口文件（等于给没跑的棒预写"当前进度+证据"）：` +
      `${premature.map((k) => `HANDOFF-M${k}.md`).join(", ")}`,
  );
  // 野编号（不在状态表里的里程碑）同样算超前
  const stray = handoffFiles
    .map((f) => Number(f.match(/M(\d+)/)[1]))
    .filter((k) => !all.includes(k));
  assert.deepEqual(stray, [], `这些编号不在这 ${all.length} 个里程碑里，属超前入口：${stray.map((k) => `M${k}`).join(", ")}`);
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

test("每份交接单的第 4 行都声明『它是 M<k> 的入口文件』（防口径漂移）", () => {
  // 这条声明是"入口语义"的依据；改回"收尾单"口径就等于把缺陷重新写进文档
  for (const file of handoffFiles) {
    const k = Number(file.match(/M(\d+)/)[1]);
    const head = readFileSync(join(PLAN_DIR, file), "utf8").split("\n").slice(0, 6).join("\n");
    assert.match(
      head,
      new RegExp(`M${k}\\s*的?入口`),
      `${file} 的前 6 行缺『本文件是 M${k} 的入口文件』口径声明`,
    );
    assert.ok(
      !/刚完成的里程碑号/.test(head),
      `${file} 仍写着旧口径『k = 刚完成的里程碑号』——那是拿门的旧缺陷反过来定语义，必须改掉`,
    );
  }
});

test("★ 每份交接单的『下一棒启动命令』指向**下一个里程碑的入口**，且该里程碑已开时文件必须存在", () => {
  const { all, done, current } = milestoneSets();
  const opened = new Set([...done, ...(current === null ? [] : [current])]);
  const last = Math.max(...all);
  let checked = 0;

  for (const file of handoffFiles) {
    const k = Number(file.match(/M(\d+)/)[1]);
    const text = readFileSync(join(PLAN_DIR, file), "utf8");
    const marker = text.indexOf("下一棒启动命令");
    if (marker < 0) continue;
    // 只认**启动命令那一行**（下面常有"⚠️ 此处曾被写反过"之类的叙述，不是命令本身）
    const cmdLine = text
      .slice(marker)
      .split("\n")
      .find((l) => l.includes("/goal") && l.includes("HANDOFF-M"));
    assert.ok(cmdLine, `${file} 的「下一棒启动命令」小节里找不到 /goal … HANDOFF-M<k>.md 形态的命令行`);
    const m = /HANDOFF-M(\d+)\.md/.exec(cmdLine);
    assert.ok(m, `${file} 的启动命令里找不到 HANDOFF-M<k>.md：${cmdLine.trim()}`);
    const target = Number(m[1]);
    checked += 1;

    if (k === last) {
      // 末棒（收官）没有 M<k+1> 可开：指向自己合法
      assert.equal(target, k, `${file} 是末棒 M${k}，启动命令应指向自己（或改写成收官说明），实际指向 M${target}`);
      continue;
    }

    // 非末棒：必须指向**下一个**里程碑的入口
    assert.equal(
      target,
      k + 1,
      `${file} 的启动命令指向 HANDOFF-M${target}，应指向 HANDOFF-M${k + 1}（= M${k + 1} 的入口）` +
        `（k = 它开的那一棒；M${k} 收尾要写的是下一棒的入口）`,
    );

    // 存在性只在"该里程碑已开"时要求：
    //   M<k+1> 若是当前在做的 → 入口此刻就该在（缺失 = 上一棒欠账，正是本仓撞过的缺陷）；
    //   M<k+1> 若还没开工 → 它的入口由 M<k> 收尾时写，此刻不在是**正常的**
    //   （要求它现在就存在，等于逼 M<k> 提前写还没开工里程碑的入口 = 超前入口）。
    if (opened.has(k + 1)) {
      assert.ok(
        existsSync(join(PLAN_DIR, `HANDOFF-M${k + 1}.md`)),
        `${file} 的启动命令指向 plan/HANDOFF-M${k + 1}.md，而 M${k + 1} 已开（${done.includes(k + 1) ? "已 ✅" : "当前在做"}），` +
          `该入口文件必须已存在（缺失 = 上一棒欠账，下一棒会读到空）`,
      );
    }
  }
  assert.ok(checked > 0, "没有任何交接单带「下一棒启动命令」小节 —— 判据空跑");
});

test("未开工里程碑的入口即使被引用也不得提前存在（防『为了指针好看而预写』）", () => {
  // 反向闸门：上面那条允许"指向还没开工的里程碑"，这里钉住"那就必须真的还没有"。
  const { all, done, current } = milestoneSets();
  const notOpened = all.filter((k) => !done.includes(k) && k !== current);
  const premature = notOpened.filter((k) => existsSync(join(PLAN_DIR, `HANDOFF-M${k}.md`)));
  assert.deepEqual(
    premature,
    [],
    `这些里程碑还没开工，入口文件不该存在（提前写 = 编造"当前进度+证据"）：` +
      `${premature.map((k) => `HANDOFF-M${k}.md`).join(", ")}`,
  );
});