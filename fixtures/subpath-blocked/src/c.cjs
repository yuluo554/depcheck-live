// C4 · 点 3：chalk 只暴露 "."，任何内部文件路径一律封装（Node 原文：all subpaths are encapsulated）
// 本项目不执行被测代码，本文件仅作静态分析输入。
const sub = require("chalk/source/index.js");
module.exports = { sub };