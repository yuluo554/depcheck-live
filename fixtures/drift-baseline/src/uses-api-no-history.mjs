// C6 · 点 3（诚实性阀门）：date-fns 声明 ^3.0.0、装 4.4.0，但**没有离线基线** → 必须 NO-BASELINE（不猜）。详见 INPUT.md
import { addDays } from "date-fns";

export const next = addDays;