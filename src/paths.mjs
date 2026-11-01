// ═══ 路径工具（输出层唯一出处） ═══
// 纪律：产物与日志中**不得出现用户绝对路径**（`plan/01` §六 隐私红线）。
// 所有对外的路径字符串都必须经过本模块——这样脱敏门与它的回归测试只需要盯一处。
//
// 跨盘符实测坑（Windows）：`path.relative("C:/a", "D:/b")` 会抛
// `ValueError`/返回绝对路径。这里显式 `try/except` 等价处理并回落，别让一次路径相对化
// 把整条命令打挂。

import { isAbsolute, relative, sep } from "node:path";

/** 把绝对路径相对化到 `root`；失败（跨盘符 / 不同根）时回落到 basename 链。 */
export function toRelative(root, abs) {
  try {
    const rel = relative(root, abs);
    if (rel === "") return ".";
    // relative() 跨盘符时在某些实现返回绝对路径——那种情况不算相对化成功
    if (isAbsolute(rel)) return basenameChain(abs);
    return normalizeSlashes(rel);
  } catch {
    return basenameChain(abs);
  }
}

/** 统一成正斜杠（输出要在任何平台逐字节一致，反斜杠会让双跑比对在不同平台失真）。 */
export function normalizeSlashes(p) {
  return p.split(sep).join("/").split("\\").join("/");
}

/** 回落：只保留最后两段（已足够定位，且不含盘符与用户名）。 */
function basenameChain(abs) {
  const parts = normalizeSlashes(abs).split("/").filter(Boolean);
  return parts.slice(-2).join("/") || "<unresolved>";
}

/** 输出去重 + 稳定排序（确定性：所有集合遍历前必须先排序）。 */
export function stableSort(items) {
  return [...items].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}