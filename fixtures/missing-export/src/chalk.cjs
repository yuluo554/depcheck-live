// C2 · 点 4（反例）：同一行取到的 red 确实在 chalk 里，但它在 .default 下、不在 CJS 命名空间上
// → 按判定顺序（plan/03 §4.4）必须落 ESM-CJS-MISMATCH，而不是 MISSING-EXPORT
// 本项目不执行被测代码，本文件仅作静态分析输入。
const { red } = require("chalk");
module.exports = { red };