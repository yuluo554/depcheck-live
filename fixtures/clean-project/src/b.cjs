// C7 · 点 2：date-fns 同上（type: module + 有 require 分支）→ 这个 require 合法（RESOLVED）
const { addDays } = require("date-fns");
module.exports = { addDays };