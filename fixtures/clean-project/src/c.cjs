// C7 · 点 3：glob 同上（type: module + 有 require 分支）→ 这个 require 合法（RESOLVED）
const { globSync } = require("glob");
module.exports = { globSync };