// C1 · resolved-basic —— 五条引用点全部命中（只在第 3–7 行，行号是 expected.json 的定位依据）
// 本项目不执行被测代码，本文件仅作静态分析输入。
import chalkDefault from "chalk";
const { z } = require("zod");
const { addDays } = require("date-fns");
const { globSync } = require("glob");
const { Command } = require("commander");
module.exports = { chalkDefault, z, addDays, globSync, Command };