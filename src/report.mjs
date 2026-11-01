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

/** `snapshot` 人读：每个直接依赖一行事实（不含判定结论——那是 `check` 的事）。 */
export function renderSnapshot(snapshot) {
  if (!snapshot.ok) return `${TOOL}: 无法计算（${snapshot.reason}）\n`;
  const lines = [`${TOOL} snapshot · 直接依赖 ${snapshot.deps.length} 个`];
  for (const d of snapshot.deps) {
    const parts = [
      `${d.name}@${d.installedVersion ?? "<未安装>"}`,
      `type=${d.type ?? "commonjs(默认)"}`,
      `parseState=${d.parseState}`,
      `require分支=${d.hasRequireBranch === null ? "<未知>" : d.hasRequireBranch ? "有" : "无"}`,
      `./package.json=${d.exposesPackageJson ? "暴露" : "屏蔽"}`,
      `指纹=${d.exportsFingerprint ?? "-"}`,
    ];
    lines.push(`  ${parts.join(" · ")}`);
    if (d.ignoredExportKeys?.length > 0) {
      lines.push(`    被 Node 忽略的 exports 键: ${d.ignoredExportKeys.join(", ")}`);
    }
  }
  if (snapshot.gaps.length > 0) {
    lines.push("");
    lines.push("算不了（计入覆盖缺口，不代表代码有错）：");
    for (const g of snapshot.gaps) {
      lines.push(`  ${g.kind}${g.pkg ? ` [${g.pkg}]` : ""} ${g.detail ?? ""}`.trimEnd());
    }
  }
  return `${lines.join("\n")}\n`;
}

/** `scan` 人读：逐引用点一行（`AMBIGUOUS` 显式列出，不静默）。 */
export function renderScan(scan) {
  const lines = [`${TOOL} scan · 源码 ${scan.files.length} 个文件 · 引用点 ${scan.points.length} 个`];
  for (const p of scan.points) {
    const imp = p.imported?.length > 0 ? ` {${p.imported.join(",")}}` : "";
    const spec = p.specifier === null ? `<不可静态确定>` : p.specifier;
    lines.push(`  ${p.file}:${p.line} ${p.kind} ${spec}${imp}`);
    if (p.note) lines.push(`    ${p.note}`);
  }
  if (scan.gaps.length > 0) {
    lines.push("");
    lines.push("算不了（计入覆盖缺口，不代表代码有错）：");
    for (const g of scan.gaps) {
      const where = g.file ? ` ${g.file}${g.line ? `:${g.line}` : ""}` : "";
      lines.push(`  ${g.kind}${g.pkg ? ` [${g.pkg}]` : ""}${where} ${g.detail ?? ""}`.trimEnd());
    }
  }
  return `${lines.join("\n")}\n`;
}