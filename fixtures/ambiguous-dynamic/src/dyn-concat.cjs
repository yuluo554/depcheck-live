// C5 · 点 2：模板字符串拼接（含插值 → 静态不可确定）
// 本项目不执行被测代码，本文件仅作静态分析输入。
const x = "chalk";
const mod = require(`chalk/${x}`);
module.exports = { mod };