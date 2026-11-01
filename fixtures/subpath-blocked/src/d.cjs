// C4 · 点 4（反例）：zod 显式列了 "./package.json" → 同一写法必须 RESOLVED
// 本项目不执行被测代码，本文件仅作静态分析输入。
const sub = require("zod/package.json");
module.exports = { sub };