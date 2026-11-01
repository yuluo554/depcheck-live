// C5 · 点 3：动态 import 变量
// 本项目不执行被测代码，本文件仅作静态分析输入。
async function load(someVar) {
  const m = await import(someVar);
  return m;
}
module.exports = { load };