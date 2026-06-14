import { useEffect, useRef } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { useAppStore } from "./store/useAppStore";
import { parseDue, nowText } from "./lib/date";
import { applyFontSettings } from "./lib/font";
import { playReminder, normalizeSoundStyle } from "./lib/effects";
import { readMarkdownDrop } from "./lib/markdownIO";
import { f } from "./lib/i18n";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import ResizeBorders from "./components/ResizeBorders";
import TaskList from "./components/TaskList";
import QuickAdd from "./components/QuickAdd";
import QuadrantView from "./components/views/QuadrantView";
import TagBoardView from "./components/views/TagBoardView";
import NotesView from "./components/views/NotesView";
import CalendarView from "./components/views/CalendarView";
import Toasts from "./components/ui/Toasts";
import { ConfirmHost } from "./components/ui/ConfirmDialog";
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
          const st = useAppStore.getState().settings;
          if ((st["reminder_sound_enabled"] ?? "1") === "1") {
            playReminder(normalizeSoundStyle(st["reminder_sound_style"] || st["sound_style"] || "game"));
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
  "glass-light": {
    base: "linear-gradient(135deg, #e9edfa 0%, #dde5f8 30%, #e9e0f6 60%, #e9edfa 100%)",
    glow:
      "radial-gradient(ellipse at 20% 50%, rgba(124,114,246,0.16) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(96,165,250,0.14) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(244,114,182,0.1) 0%, transparent 50%)",
  },
  "glass-dark": {
    base: "linear-gradient(135deg, #0a0a0c 0%, #131316 35%, #1d1d22 65%, #0a0a0c 100%)",
    glow:
      "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.05) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 50%), radial-gradient(ellipse at 50% 80%, rgba(255,255,255,0.03) 0%, transparent 55%)",
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
  const importNotesToImportGroup = useAppStore((s) => s.importNotesToImportGroup);

  // 全界面兜底:任意视图拖入 .md → 归入「导入」便签分组(便签视图内的拖入已被其自身处理并 stopPropagation,不会到这)
  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const onRootDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return; // 内部排序拖拽(无 Files)不拦截
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onRootDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    void (async () => {
      const files = await readMarkdownDrop(e.dataTransfer);
      if (files.length > 0) await importNotesToImportGroup(files);
    })();
  };
  const theme = useAppStore((s) => s.theme);
  const scheduleOpen = useAppStore((s) => s.scheduleOpen);
  const saveSetting = useAppStore((s) => s.saveSetting);

  // 待办列固定宽度(对齐旧版 TaskColumn):日历是弹性列吸收窗口变化,
  // 故拖窗口边缘只改日历、待办不动;待办宽度只由中间分隔条调整。
  const [taskWidth, setTaskWidth] = useState(420);
  const calRef = useRef<HTMLElement>(null);
  const prevSchedule = useRef(false);

  // 中央区切换播 IntroScaleFade(对齐旧版 CentralViewAnimate):
  // 重触发 class 而非 key 重挂,保住 QuickAdd 草稿等局部状态
  const mainRef = useRef<HTMLElement>(null);
  const viewKey = view.kind === "group" ? `group:${view.groupId}` : view.kind;
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const el = mainRef.current;
    if (!el) return;
    el.classList.remove("view-in");
    void el.offsetWidth; // 强制 reflow,重新触发动画
    el.classList.add("view-in");
  }, [viewKey]);

  useEffect(() => {
    void init();
  }, [init]);

  // 打开日历=窗口右扩出日历、待办固定不变;关闭=缩回窗口、待办恢复弹性(对齐旧版 OpenSchedule)
  useEffect(() => {
    if (!loaded) return;
    const was = prevSchedule.current;
    prevSchedule.current = scheduleOpen;
    if (was === scheduleOpen) return;

    const win = getCurrentWindow();
    void (async () => {
      const maximized = await win.isMaximized();
      const size = await win.innerSize();
      const sf = await win.scaleFactor();
      const lw = size.width / sf;
      const lh = size.height / sf;
      const calW = Math.min(900, Math.max(280, Number(useAppStore.getState().settings["schedule_width"]) || 360));

      if (scheduleOpen) {
        // 待办锁定为点击瞬间(打开前)的宽度,确保打开后待办不缩
        const locked = useAppStore.getState().lockedTaskWidth;
        if (maximized) {
          setTaskWidth(Math.max(280, locked - calW)); // 最大化无法扩窗:从待办匀出日历
        } else {
          setTaskWidth(locked);
          // 窗口宽度瞬时右扩(对齐旧版:保持瞬时,避免与贴边/最大化/分隔条竞态),
          // 进场动效由面板的 FadeSlideIn(cal-in)承担
          await win.setSize(new LogicalSize(lw + calW, lh));
        }
      } else {
        // 关闭:记录日历当前宽度,瞬时缩回窗口,待办恢复弹性
        const cw = calRef.current?.offsetWidth ?? calW;
        saveSetting("schedule_width", String(Math.round(cw)));
        if (!maximized) await win.setSize(new LogicalSize(Math.max(360, lw - cw), lh));
      }
    })();
  }, [scheduleOpen, loaded, saveSetting]);

  // 窗口尺寸变化(resize 拖边 / 最大化 / 还原)后自动强制 WebView2 整表面重绘。
  //
  // 根因:主窗 transparent:true(为亚克力/圆角),WebView2 在窗口尺寸变化时不重绘
  // 新暴露区域,于是透出桌面壁纸(已知 artifact,见 tauri#12800)。
  //
  // 为何放前端、不放 Rust:Rust 用 set_size 微调触发重绘,但窗口处于最大化时
  // set_size 会取消最大化;且 set_size 自身又触发 Resized 易成反馈环。前端走纯 DOM
  // 重绘——对 OS 窗口尺寸零副作用、与是否最大化无关,也不会和贴边逻辑的 Moved/Resized 互扰。
  //
  // onResized 在 resize 与最大化/还原时都会触发;防抖到尺寸停止变化后再重绘一次,避免拖动中频繁抖动。
  useEffect(() => {
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    let disposed = false;

    // 纯 DOM 重绘:瞬时给根节点加一个不可见的合成层位移再撤回,强制 WebView2
    // 重新合成整个表面(不改 OS 窗口尺寸,故对最大化状态无副作用)。
    const repaint = () => {
      const el = document.documentElement;
      el.style.transform = "translateZ(0)";
      // 读取布局属性强制同步 reflow,确保上面的样式落地
      void el.offsetHeight;
      requestAnimationFrame(() => {
        el.style.transform = "";
      });
    };

    void getCurrentWindow()
      .onResized(() => {
        if (disposed) return;
        if (timer !== undefined) clearTimeout(timer);
        // 防抖:尺寸停止变化 120ms 后重绘一次
        timer = window.setTimeout(repaint, 120);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  // 禁用 WebView2 默认右键菜单(返回/刷新/打印…),输入框保留系统菜单
  useEffect(() => {
    const block = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

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

  // 中间分隔条:拖动只改待办列宽度(向右拖变宽),日历弹性自适应
  const startTaskResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = taskWidth;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(900, Math.max(280, startW + (ev.clientX - startX)));
      setTaskWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveSetting("task_width", String(Math.round(w)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const calOpen = scheduleOpen && view.kind !== "notes";

  return (
    // key=language:切换语言时整树重建,所有 t() 文案即时刷新。
    // 布局对齐 todo-flow:侧栏整列直通窗口顶部,标题栏只覆盖右侧内容区。
    <div
      key={language}
      className="flex h-full bg-window"
      onDragOver={onRootDragOver}
      onDrop={onRootDrop}
    >
      <ThemeBackdrop theme={theme} />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          {/* 待办列:开日历时固定宽度(只由中间分隔条调整),否则占满 */}
          <main
            ref={mainRef}
            style={calOpen ? { width: taskWidth } : undefined}
            className={`flex flex-col bg-content ${calOpen ? "shrink-0" : "min-w-0 flex-1"}`}
          >
            {view.kind === "quadrant" ? (
              <QuadrantView />
            ) : view.kind === "tagboard" ? (
              // 标签看板:全宽看板(已移除第二侧边栏)
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
          {/* 日历:弹性列(吸收窗口宽度变化 → 拖窗口边缘只改日历、待办不动);
              中间分隔条:拖动才改待办宽度。可把待办拖进日历某天设截止。 */}
          {calOpen && (
            <>
              <div
                onMouseDown={startTaskResize}
                className="w-1 shrink-0 cursor-col-resize bg-divider hover:bg-accent/40"
              />
              <aside ref={calRef} className="cal-in flex min-w-0 flex-1 flex-col bg-content">
                <CalendarView />
              </aside>
            </>
          )}
        </div>
      </div>
      <Toasts />
      <ConfirmHost />
      {updateInfo && <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />}
      <ResizeBorders />
    </div>
  );
}
