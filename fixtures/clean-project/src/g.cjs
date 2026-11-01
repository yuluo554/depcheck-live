// C7 · 点 7：glob 的 exports 显式列了 "./raw" → 同一写法也是 RESOLVED
const raw = require("glob/raw");
module.exports = { raw };