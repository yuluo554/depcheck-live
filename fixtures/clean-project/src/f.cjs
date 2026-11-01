// C7 · 点 6：zod 的 exports 显式列了 "./package.json" → 不是屏蔽（RESOLVED）
const pkg = require("zod/package.json");
module.exports = { pkg };