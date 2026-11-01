// C5 · 点 1：变量间接 require（specifier 由运行时决定）
// 本项目不执行被测代码，本文件仅作静态分析输入。
const name = "chalk";
const mod = require(name);
module.exports = { mod };