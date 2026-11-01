// C2 · 点 3：date-fns 的入口是 245 行 export * 桶文件，展开后 251 个名字，也不含 notARealExport
// 本项目不执行被测代码，本文件仅作静态分析输入。
import { notARealExport } from "date-fns";
module.exports = { notARealExport };