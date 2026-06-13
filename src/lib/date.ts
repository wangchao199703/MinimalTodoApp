// 日期统一约定:"YYYY-MM-DD HH:mm" 空格分隔;只有日期时为 "YYYY-MM-DD"
import { f, t } from "./i18n";

export function parseDue(s: string): Date {
  return new Date(s.replace(" ", "T"));
}

export function toDueText(d: Date, withTime = true): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}

export function nowText(): string {
  return toDueText(new Date());
}

export type DueState = "none" | "completed" | "overdue" | "today" | "soon" | "normal";

const DAY = 24 * 60 * 60 * 1000;

/** 临近 = 3 天内到期(对齐旧版口径) */
export function dueState(
  due: string | null,
  completed: boolean,
  now: Date = new Date(),
): DueState {
  if (completed) return "completed";
  if (!due) return "none";
  const d = parseDue(due);
  if (d.getTime() <= now.getTime()) return "overdue";
  if (toDueText(d, false) === toDueText(now, false)) return "today";
  if (d.getTime() - now.getTime() <= 3 * DAY) return "soon";
  return "normal";
}

/** 倒计时文案(本地化键对齐旧版 S.Fmt.Overdue* / S.Fmt.Remain*) */
export function countdownText(due: string, now: Date = new Date()): string {
  const diff = parseDue(due).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);

  if (diff < 0) {
    if (days > 0) return f("S.Fmt.OverdueDays", days);
    if (hours > 0) return f("S.Fmt.OverdueHours", hours);
    return f("S.Fmt.OverdueMinutes", Math.max(minutes, 1));
  }
  if (days > 0)
    return hours > 0 ? f("S.Fmt.RemainDaysHours", days, hours) : f("S.Fmt.RemainDays", days);
  if (hours > 0)
    return minutes > 0
      ? f("S.Fmt.RemainHoursMinutes", hours, minutes)
      : f("S.Fmt.RemainHours", hours);
  return f("S.Fmt.RemainMinutes", Math.max(minutes, 1));
}

/** 截止时间的简短展示,如 "6月15日 14:30";今年内不显示年份 */
export function formatDue(due: string): string {
  const d = parseDue(due);
  const time =
    due.includes(" ") || due.includes("T")
      ? ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      : "";
  const year = d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}年`;
  return `${year}${d.getMonth() + 1}月${d.getDate()}日${time}`;
}

export interface QuickTime {
  label: string;
  minutes: number;
}

/** 快捷时间选项(对齐旧版 5m~4w),label 按当前语言生成 */
export function quickTimes(): QuickTime[] {
  const u = (k: string) => t("S.X.U." + k);
  return [
    { label: `5${u("Min")}`, minutes: 5 },
    { label: `10${u("Min")}`, minutes: 10 },
    { label: `30${u("Min")}`, minutes: 30 },
    { label: `1${u("Hour")}`, minutes: 60 },
    { label: `2${u("Hour")}`, minutes: 120 },
    { label: `5${u("Hour")}`, minutes: 300 },
    { label: `1${u("Day")}`, minutes: 1440 },
    { label: `2${u("Day")}`, minutes: 2880 },
    { label: `5${u("Day")}`, minutes: 7200 },
    { label: `1${u("Week")}`, minutes: 10080 },
    { label: `2${u("Week")}`, minutes: 20160 },
    { label: `4${u("Week")}`, minutes: 40320 },
  ];
}

export function quickTimeToDue(minutes: number, now: Date = new Date()): string {
  return toDueText(new Date(now.getTime() + minutes * 60000));
}
