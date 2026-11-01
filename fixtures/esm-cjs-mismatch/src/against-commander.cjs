// C3 · against-commander —— 与 against-chalk 同为"exports 无 require 分支"，但 Command 在命名空间上。
// 本项目不执行被测代码，本文件仅作静态分析输入。
const { Command } = require("commander");
module.exports = { Command };