// 系统通知(Windows 右下角):周期提醒在 app 最小化/隐藏/失焦时也能弹。
//
// 为何与 app 内 toast 区分:窗口可见时,app 内 toast 已经够醒目,再发一条 OS
// 通知反而重复打扰;只有窗口最小化/隐藏(此时 toast 看不见)才需要 OS 通知补位。
// 对齐旧版 WPF 的托盘气泡(NotifyIcon balloon):正文用「每 N 提醒一次 / 到期时间」。

import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isTauri } from "./env";
import { f } from "./i18n";

/** 缓存通知权限,避免每次提醒都走一次 IPC */
let permission: "granted" | "denied" | "unknown" = "unknown";

/** 对齐旧版气泡正文:有截止日则带「{due} 到期.每 {interval} 提醒一次.」,否则只说间隔 */
function buildBody(intervalMinutes: number, dueDate: string | null): string {
  const interval =
    intervalMinutes >= 60
      ? f("S.Fmt.IntervalHours", String(Math.round((intervalMinutes / 60) * 10) / 10))
      : f("S.Fmt.IntervalMinutes", String(intervalMinutes));
  return dueDate
    ? f("S.Fmt.ReminderMsgWithDue", dueDate, interval)
    : f("S.Fmt.ReminderMsg", interval);
}

/** 仅当窗口当前不可见(隐藏/贴边收起)或最小化时返回 true —— 此时 app 内 toast 看不见,需 OS 通知补位 */
async function windowHidden(): Promise<boolean> {
  if (!isTauri) return document.hidden; // Web:页面切走/标签隐藏才补 OS 通知
  try {
    const win = getCurrentWindow();
    const [visible, minimized] = await Promise.all([win.isVisible(), win.isMinimized()]);
    return !visible || minimized;
  } catch {
    // 拿不到窗口状态时保守发通知,确保「最小化必弹」不漏
    return true;
  }
}

/** Web Notification 权限(已授权/申请一次);无 API 或被拒返回 false。 */
async function ensureWebPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/**
 * 周期提醒触发时调用:窗口最小化/隐藏才发系统通知(可见时由 app 内 toast 承担)。
 * 标题用「待办:{title}」,正文对齐旧版气泡。失败静默,不影响提醒主流程。
 */
export async function notifyReminder(
  title: string,
  intervalMinutes: number,
  dueDate: string | null,
): Promise<void> {
  try {
    if (!(await windowHidden())) return;
    const notifTitle = f("S.Fmt.ReminderToastTitle", title);
    const body = buildBody(intervalMinutes, dueDate);

    if (!isTauri) {
      if (await ensureWebPermission()) new Notification(notifTitle, { body });
      return;
    }

    if (permission === "unknown") {
      permission = (await isPermissionGranted()) ? "granted" : "unknown";
    }
    if (permission !== "granted") {
      const res = await requestPermission();
      permission = res === "granted" ? "granted" : "denied";
    }
    if (permission !== "granted") return;

    sendNotification({ title: notifTitle, body });
  } catch {
    // 通知失败不影响提醒主流程
  }
}
