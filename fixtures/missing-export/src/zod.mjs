// C2 · 点 2：zod 的入口存在，导出集里只有 z 与 default
// 本项目不执行被测代码，本文件仅作静态分析输入。
import { notARealExport } from "zod";
module.exports = { notARealExport };