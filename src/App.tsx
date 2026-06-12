import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "./store/useAppStore";
import { parseDue, nowText } from "./lib/date";
import { applyFontSettings } from "./lib/font";
import { playReminderDing } from "./lib/effects";
import { f } from "./lib/i18n";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import TaskList from "./components/TaskList";
import QuickAdd from "./components/QuickAdd";
import SchedulePanel from "./components/SchedulePanel";
import QuadrantView from "./components/views/QuadrantView";
import TagBoardView from "./components/views/TagBoardView";
import NotesView from "./components/views/NotesView";
import Toasts from "./components/ui/Toasts";

/** 周期提醒轮询:每 30 秒检查一次(对齐旧版) */
function useReminderLoop() {
  useEffect(() => {
    const check = () => {
      const { tasks, pushToast, patchTask } = useAppStore.getState();
      const now = Date.now();
      for (const t of tasks) {
        if (!t.reminder_enabled || t.is_completed) continue;
        const base = t.last_reminded_at ?? t.created_at;
        if (now - parseDue(base).getTime() >= t.reminder_interval_minutes * 60000) {
          pushToast(f("S.Fmt.ReminderToastTitle", t.title));
          if ((useAppStore.getState().settings["reminder_sound_enabled"] ?? "1") === "1") {
            playReminderDing();
          }
          void patchTask({ id: t.id, last_reminded_at: nowText() });
        }
      }
    };
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, []);
}

/** 视图分发中心:无路由,所有视图由 store 的 view 状态条件渲染 */
export default function App() {
  const loaded = useAppStore((s) => s.loaded);
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const language = useAppStore((s) => s.language);
  const scheduleOpen = useAppStore((s) => s.scheduleOpen);

  useEffect(() => {
    void init();
  }, [init]);

  // 启动后套用持久化的窗口置顶与字体设置
  useEffect(() => {
    if (!loaded) return;
    const s = useAppStore.getState().settings;
    if (s["always_on_top"] === "1") void getCurrentWindow().setAlwaysOnTop(true);
    applyFontSettings(
      s["font_family"] || "Microsoft YaHei UI",
      Number(s["font_size"] || "14"),
      Number(s["line_spacing"] || "1.1"),
    );
  }, [loaded]);

  useReminderLoop();

  if (!loaded) return null;

  return (
    // key=language:切换语言时整树重建,所有 t() 文案即时刷新
    <div key={language} className="flex h-full flex-col bg-window">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-content">
          {view.kind === "quadrant" ? (
            <QuadrantView />
          ) : view.kind === "tagboard" ? (
            <TagBoardView />
          ) : view.kind === "notes" ? (
            <NotesView />
          ) : (
            <>
              <TaskList />
              <QuickAdd />
            </>
          )}
        </main>
        {scheduleOpen && view.kind !== "notes" && <SchedulePanel />}
      </div>
      <Toasts />
    </div>
  );
}
