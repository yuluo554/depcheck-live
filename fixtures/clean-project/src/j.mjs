// C7 · 点 10：文案里的裸字符串不是包引用（字符串兜底的双条件抑制，§5.3 第 3 条）
// 下面第 3 行才是引用点所在行
const label = "this is a chalk-like label";
export const text = label;