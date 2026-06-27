import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 自绘窗口(decorations:false)的边缘缩放手柄:8 个方向贴在窗口四边四角,
 * 按下时调 Tauri startResizeDragging 触发系统级缩放。z 在内容之上、模态之下。
 */
const HANDLES: { dir: string; cls: string }[] = [
  { dir: "North", cls: "top-0 left-2 right-2 h-[3px] cursor-ns-resize" },
  { dir: "South", cls: "bottom-0 left-2 right-2 h-[3px] cursor-ns-resize" },
  { dir: "West", cls: "left-0 top-2 bottom-2 w-[3px] cursor-ew-resize" },
  { dir: "East", cls: "right-0 top-2 bottom-2 w-[3px] cursor-ew-resize" },
  { dir: "NorthWest", cls: "top-0 left-0 h-2.5 w-2.5 cursor-nwse-resize" },
  { dir: "NorthEast", cls: "top-0 right-0 h-2.5 w-2.5 cursor-nesw-resize" },
  { dir: "SouthWest", cls: "bottom-0 left-0 h-2.5 w-2.5 cursor-nesw-resize" },
  { dir: "SouthEast", cls: "bottom-0 right-0 h-2.5 w-2.5 cursor-nwse-resize" },
];

export default function ResizeBorders() {
  const start = (dir: string) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // 类型由 Tauri 校验;传方向字符串。getCurrentWindow() 延迟到事件里调,避免模块加载即触发(Web 无 Tauri)
    void getCurrentWindow().startResizeDragging(dir as never);
  };
  return (
    <>
      {HANDLES.map((h) => (
        <div
          key={h.dir}
          onMouseDown={start(h.dir)}
          className={`fixed z-[100] ${h.cls}`}
        />
      ))}
    </>
  );
}
