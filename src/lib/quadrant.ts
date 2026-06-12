import type { Task } from "./tauri-ipc";
import { dueState } from "./date";

export interface QuadrantOptions {
  /** true:仅「高」算重要;false:中+高都算重要 */
  importantHighOnly: boolean;
  /** true:「3天内到期」也算紧急 */
  urgentIncludeSoon: boolean;
}

export type Quadrant = 1 | 2 | 3 | 4;

/** Q1 重要且紧急 / Q2 重要不紧急 / Q3 紧急不重要 / Q4 不重要不紧急;手动覆盖优先 */
export function quadrantOf(t: Task, opts: QuadrantOptions, now?: Date): Quadrant {
  if (t.quadrant_override && t.quadrant_override >= 1 && t.quadrant_override <= 4) {
    return t.quadrant_override as Quadrant;
  }
  const important = opts.importantHighOnly ? t.priority === 3 : t.priority >= 2;
  const ds = dueState(t.due_date, false, now);
  const urgent =
    ds === "overdue" || ds === "today" || (opts.urgentIncludeSoon && ds === "soon");
  if (important && urgent) return 1;
  if (important) return 2;
  if (urgent) return 3;
  return 4;
}

/** 标题/描述用旧版本地化键(立即处理 / 重要 & 紧急 …) */
export const QUADRANT_META: Record<
  Quadrant,
  { titleKey: string; descKey: string; color: string }
> = {
  1: { titleKey: "S.Quadrant.Q1Title", descKey: "S.Quadrant.Q1Desc", color: "var(--overdue-text)" },
  2: { titleKey: "S.Quadrant.Q2Title", descKey: "S.Quadrant.Q2Desc", color: "var(--warning-text)" },
  3: { titleKey: "S.Quadrant.Q3Title", descKey: "S.Quadrant.Q3Desc", color: "var(--accent)" },
  4: { titleKey: "S.Quadrant.Q4Title", descKey: "S.Quadrant.Q4Desc", color: "var(--muted-text)" },
};
