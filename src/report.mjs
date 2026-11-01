// ═══ 表现层 · 报告渲染 ═══
// 三条渲染纪律（`plan/03` §6.1）：
//   ① 零判定：本层不复算任何判定，只把 result 排版；
//   ② 零外部资源：不含链接 / 图片 / 外部 URL；路径一律相对化（经 paths.mjs）；
//   ③ 确定性：同 result 两次渲染逐字节一致（有序遍历 + 无时钟）。
//
// 人读与机读共用同一份 result —— "行为等价三方对账"的第一方。

import { TOOL } from "./contract.mjs";

/** 人读摘要。不得引入时钟/随机/绝对路径。 */
export function renderHuman(result) {
  const lines = [];
  if (!result.ok) {
    lines.push(`${TOOL}: 无法计算（${result.reason}）`);
    return `${lines.join("\n")}\n`;
  }
  const s = result.summary;
  lines.push(`${TOOL} · 引用点 ${s.totalPoints} 个`);
  lines.push(
    `  已解析 ${s.resolved} · 判定问题 ${s.problems} · 不可静态判定 ${s.ambiguous} · 算不了 ${s.gaps}`,
  );
  for (const [status, count] of Object.entries(s.byStatus)) {
    lines.push(`  ${status}: ${count}`);
  }
  if (result.findings.length > 0) {
    lines.push("");
    lines.push("问题：");
    for (const f of result.findings) {
      const where = f.line ? `${f.file}:${f.line}` : f.file ?? "<unknown>";
      const extra = f.missing ? ` 缺导出 ${f.missing.join(",")}` : "";
      const pkg = f.pkg ? ` [${f.pkg}]` : "";
      lines.push(`  ${f.status}${pkg} ${where}${extra}`);
      if (f.rule) lines.push(`    判据: ${f.rule}`);
    }
  }
  if (result.gaps.length > 0) {
    lines.push("");
    lines.push("算不了（计入覆盖缺口，不代表代码有错）：");
    for (const g of result.gaps) {
      const where = g.file ? ` ${g.file}${g.line ? `:${g.line}` : ""}` : "";
      lines.push(`  ${g.kind}${g.pkg ? ` [${g.pkg}]` : ""}${where} ${g.detail ?? ""}`.trimEnd());
    }
  }
  return `${lines.join("\n")}\n`;
}

/** 机读。键序稳定（对象构造顺序固定 + 行内数组已排序）。 */
export function renderJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}