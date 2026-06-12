// 日期统一约定:"YYYY-MM-DD HH:mm" 空格分隔;只有日期时为 "YYYY-MM-DD"

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

/** 倒计时文案:已逾期N天/N小时/N分钟,剩余N天N小时 / N小时M分钟 / N分钟 */
export function countdownText(due: string, now: Date = new Date()): string {
  const diff = parseDue(due).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / DAY);
  const hours = Math.floor((abs % DAY) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);

  let span: string;
  if (days > 0) span = hours > 0 ? `${days}天${hours}小时` : `${days}天`;
  else if (hours > 0) span = minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  else span = `${Math.max(minutes, 1)}分钟`;

  return diff < 0 ? `已逾期${span}` : `剩余${span}`;
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

/** 快捷时间选项(对齐旧版 5m~1w) */
export const QUICK_TIMES: QuickTime[] = [
  { label: "5分钟", minutes: 5 },
  { label: "10分钟", minutes: 10 },
  { label: "30分钟", minutes: 30 },
  { label: "1小时", minutes: 60 },
  { label: "2小时", minutes: 120 },
  { label: "5小时", minutes: 300 },
  { label: "1天", minutes: 1440 },
  { label: "2天", minutes: 2880 },
  { label: "5天", minutes: 7200 },
  { label: "1周", minutes: 10080 },
];

export function quickTimeToDue(minutes: number, now: Date = new Date()): string {
  return toDueText(new Date(now.getTime() + minutes * 60000));
}
