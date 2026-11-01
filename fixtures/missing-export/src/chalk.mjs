// C2 · 点 1：chalk 的入口存在，但导出集里没有 notARealExport（ESM 视角）
// 本项目不执行被测代码，本文件仅作静态分析输入。
import { notARealExport } from "chalk";
module.exports = { notARealExport };