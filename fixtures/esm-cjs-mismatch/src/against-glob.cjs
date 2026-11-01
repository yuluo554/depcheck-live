// C3 · against-glob —— require 视角落在 dist/commonjs/index.min.js（该目录自带 type: commonjs）。
// 本项目不执行被测代码，本文件仅作静态分析输入。
const { globSync } = require("glob");
module.exports = { globSync };