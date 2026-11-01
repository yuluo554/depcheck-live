// C4 · 点 5（反例）：glob 显式列了 "./raw" → RESOLVED
// 本项目不执行被测代码，本文件仅作静态分析输入。
const sub = require("glob/raw");
module.exports = { sub };