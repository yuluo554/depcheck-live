// C3 · against-zod —— type: module，但 exports 有 require 分支（→ 真 CJS 产物）。
// 本项目不执行被测代码，本文件仅作静态分析输入。
const { z } = require("zod");
module.exports = { z };