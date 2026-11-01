// C3 · against-date-fns —— 入口是 245 行 re-export 桶，展开后 addDays 在导出集里。
// 本项目不执行被测代码，本文件仅作静态分析输入。
const { addDays } = require("date-fns");
module.exports = { addDays };