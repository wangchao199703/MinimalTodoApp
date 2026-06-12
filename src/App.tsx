import { useEffect } from "react";
import { useAppStore } from "./store/useAppStore";
import { parseDue, nowText } from "./lib/date";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import TaskList from "./components/TaskList";
import QuickAdd from "./components/QuickAdd";
import QuadrantView from "./components/views/QuadrantView";
import TagBoardView from "./components/views/TagBoardView";
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
          pushToast(t.title);
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

  useEffect(() => {
    void init();
  }, [init]);

  useReminderLoop();

  if (!loaded) return null;

  return (
    <div className="flex h-full flex-col bg-window">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-content">
          {view.kind === "quadrant" ? (
            <QuadrantView />
          ) : view.kind === "tagboard" ? (
            <TagBoardView />
          ) : (
            <>
              <TaskList />
              <QuickAdd />
            </>
          )}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
