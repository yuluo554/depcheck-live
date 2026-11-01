// C7 · 点 8 的目标文件：`import "./local.mjs"` 是工程内相对引用，静态分析能解析到它，
// 但它不在「依赖引用」判定面内（不得计入 problems）。
export default { name: "local" };