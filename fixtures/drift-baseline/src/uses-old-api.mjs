// C6 · 点 1（正例）：ZodSchema 在 zod 3.25.76 的 . 导出面上存在，4.6.7 已移除 → 真漂移。详见 INPUT.md
import { ZodSchema } from "zod";

export const schema = ZodSchema;