import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Moon, Square, Sun, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

const win = getCurrentWindow();

export default function TitleBar() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center border-b border-divider bg-titlebar px-3"
    >
      <span data-tauri-drag-region className="text-xs font-medium text-text-2">
        极简待办
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <button
          title={theme === "Light" ? "切换深色" : "切换浅色"}
          onClick={() => void setTheme(theme === "Light" ? "Dark" : "Light")}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          {theme === "Light" ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <button
          title="最小化"
          onClick={() => void win.minimize()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <Minus size={14} />
        </button>
        <button
          title="最大化"
          onClick={() => void win.toggleMaximize()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <Square size={11} />
        </button>
        <button
          title="关闭"
          onClick={() => void win.close()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-red-500 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
