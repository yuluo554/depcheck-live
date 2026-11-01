// C5 · 点 5：字面量 + 变量拼接（**防"看到引号就当静态"**——它有字面量前缀，但整体不可静态确定）
// 本项目不执行被测代码，本文件仅作静态分析输入。
const suffix = "/package.json";
const mod = require("chalk" + suffix);
module.exports = { mod };