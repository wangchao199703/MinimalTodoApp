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
import UpdateDialog from "./components/dialogs/UpdateDialog";
import { checkForUpdate, type UpdateInfo } from "./lib/updater";
import { useState } from "react";

/** 自动更新检查:启动 4 秒后 + 每 12 小时(对齐旧版节奏) */
function useUpdateCheck(loaded: boolean) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const check = () => {
      void checkForUpdate(false).then((info) => {
        if (info) setUpdateInfo(info);
      });
    };
    const initial = setTimeout(check, 4000);
    const interval = setInterval(check, 12 * 3600 * 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [loaded]);
  return { updateInfo, setUpdateInfo };
}

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

/** 玻璃系主题的应用内渐变底:基础 135° 渐变 + 同色系径向光晕(风格同 todo-flow Glass) */
const BACKDROPS: Record<string, { base: string; glow: string }> = {
  glass: {
    base: "linear-gradient(135deg, #1a1a2e 0%, #16213e 30%, #0f3460 60%, #1a1a2e 100%)",
    glow:
      "radial-gradient(ellipse at 20% 50%, rgba(124,114,246,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(167,139,250,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(99,102,241,0.08) 0%, transparent 50%)",
  },
  "glass-ocean": {
    base: "linear-gradient(135deg, #0f2027 0%, #15323e 30%, #1b4a5e 60%, #0f2027 100%)",
    glow:
      "radial-gradient(ellipse at 20% 50%, rgba(56,189,248,0.14) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(34,211,238,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(14,165,233,0.08) 0%, transparent 50%)",
  },
  "glass-forest": {
    base: "linear-gradient(135deg, #0d1f15 0%, #123026 30%, #175c40 60%, #0d1f15 100%)",
    glow:
      "radial-gradient(ellipse at 20% 50%, rgba(52,211,153,0.13) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(5,150,105,0.08) 0%, transparent 50%)",
  },
  "glass-sunset": {
    base: "linear-gradient(135deg, #2b1224 0%, #3c1a2c 30%, #5a2433 60%, #2b1224 100%)",
    glow:
      "radial-gradient(ellipse at 20% 50%, rgba(251,113,89,0.14) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(244,114,182,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(249,115,22,0.08) 0%, transparent 50%)",
  },
};

function ThemeBackdrop({ theme }: { theme: string }) {
  const bd = BACKDROPS[theme];
  if (!bd) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0" style={{ background: bd.base }} />
      <div className="absolute inset-0" style={{ background: bd.glow }} />
    </div>
  );
}

/** 视图分发中心:无路由,所有视图由 store 的 view 状态条件渲染 */
export default function App() {
  const loaded = useAppStore((s) => s.loaded);
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const language = useAppStore((s) => s.language);
  const scheduleOpen = useAppStore((s) => s.scheduleOpen);
  const theme = useAppStore((s) => s.theme);

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
  const { updateInfo, setUpdateInfo } = useUpdateCheck(loaded);

  if (!loaded) return null;

  return (
    // key=language:切换语言时整树重建,所有 t() 文案即时刷新。
    // 布局对齐 todo-flow:侧栏整列直通窗口顶部,标题栏只覆盖右侧内容区。
    <div key={language} className="flex h-full bg-window">
      <ThemeBackdrop theme={theme} />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
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
      </div>
      <Toasts />
      {updateInfo && <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />}
    </div>
  );
}
