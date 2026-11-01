// C7 · 点 1：zod 是 type: module 但 exports 里**有** require 分支 → 这个 require 合法（RESOLVED）
const { z } = require("zod");
module.exports = { z };