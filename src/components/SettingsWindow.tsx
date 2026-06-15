import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { t } from "../lib/i18n";
import SettingsPanel from "./dialogs/SettingsPanel";
import ResizeBorders from "./ResizeBorders";
import { ConfirmHost } from "./ui/ConfirmDialog";
import Toasts from "./ui/Toasts";

/**
 * 独立设置窗口(URL 带 ?window=settings,由 main.tsx 路由):
 * 自绘无边框、可拖到屏幕任意位置(含主窗口外)。改动经 settings-changed 事件
 * 与主窗口双向实时同步(主题/字体/语言/各开关)。
 */
export default function SettingsWindow() {
  const loaded = useAppStore((s) => s.loaded);
  const language = useAppStore((s) => s.language);

  useEffect(() => {
    void useAppStore.getState().initSettingsWindow();
    // 跨窗口同步监听已在 main.tsx 模块层注册(setupSettingsSync),此处不再重复
    // 禁用 WebView 默认右键菜单(输入控件保留系统菜单)
    const block = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest("input, textarea, select")) return;
      ev.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  if (!loaded) return null;

  return (
    // key=language:切语言整树重建,所有 t() 即时刷新(对齐主窗口做法)
    <div key={language} className="flex h-screen flex-col overflow-hidden bg-popup text-text-1">
      <ResizeBorders />
      {/* 自绘标题栏:整条可拖动移窗 + 关闭按钮 */}
      <div
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center justify-between border-b border-divider px-3 select-none"
      >
        <span data-tauri-drag-region className="text-sm font-semibold">
          {t("S.Settings.Title")}
        </span>
        <button
          title={t("S.Close")}
          onClick={() => void getCurrentWindow().close()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-red-500 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <SettingsPanel />
      </div>
      {/* 设置窗口自带确认框宿主(恢复默认等需要二次确认) */}
      <ConfirmHost />
      {/* 设置窗口自带 Toast 宿主:检查更新失败/数据迁移等反馈必须就地可见(否则按钮像没反应) */}
      <Toasts />
    </div>
  );
}
