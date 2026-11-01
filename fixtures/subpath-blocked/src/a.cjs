// C4 · 点 1：chalk 的 exports 只有 types / default 两个条件键，未列 ./package.json → 屏蔽
// 本项目不执行被测代码，本文件仅作静态分析输入。
const sub = require("chalk/package.json");
module.exports = { sub };