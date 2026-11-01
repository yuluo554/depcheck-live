// C5 · 点 4：配置对象里的运行时生成值，**经加载调用**才构成引用点
// 注意：配置对象里的**字面量**包名是 plan/03 §3 的 `string-literal` 引用点（合法计入），
// 所以本点刻意只放变量，构造"运行时才决定是哪个包"的形态。
// 本项目不执行被测代码，本文件仅作静态分析输入。
const pluginName = process.env.PLUGIN;
const config = {
  plugins: [pluginName],
};
const loader = require(config.plugins[0]);
module.exports = { config, loader };