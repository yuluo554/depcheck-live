// C4 · 点 2：commander 的 exports 只有 "." 一个键，未列 ./package.json → 屏蔽
// 本项目不执行被测代码，本文件仅作静态分析输入。
const sub = require("commander/package.json");
module.exports = { sub };