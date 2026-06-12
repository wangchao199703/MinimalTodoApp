import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import CalendarView from "./views/CalendarView";

/** 右侧日历面板:与左侧主内容之间有可拖动分隔条调宽度(对齐旧版 ScheduleWidth) */
export default function CalendarPanel() {
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [width, setWidth] = useState(() =>
    Math.min(900, Math.max(360, Number(settings["schedule_width"]) || 520)),
  );

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let w = startW;
    const move = (ev: MouseEvent) => {
      // 面板在右侧:向左拖(clientX 减小)变宽
      w = Math.min(900, Math.max(360, startW - (ev.clientX - startX)));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveSetting("schedule_width", String(Math.round(w)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <aside
      style={{ width }}
      className="relative flex shrink-0 flex-col border-l border-divider bg-content"
    >
      {/* 左边缘拖拽手柄 */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 -left-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40"
      />
      <CalendarView />
    </aside>
  );
}
