import { useState } from "react";
import { X } from "lucide-react";
import { Portal } from "./Popover";

/**
 * 居中模态框:确认框层级 z-300(对齐分层约定)。
 * 标题栏可拖动移位:位移走 CSS `translate` 属性(与居中的 -50% 合成),
 * 不占用 `transform`(留给 modal-in 的 scale 动画,避免双重位移坑)。
 */
export default function Modal(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  // 相对居中位的拖动偏移(px),默认 0 即正中
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const base = drag;
    const move = (ev: MouseEvent) =>
      setDrag({ dx: base.dx + ev.clientX - sx, dy: base.dy + ev.clientY - sy });
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <Portal>
      <div className="backdrop-in fixed inset-0 z-[290] bg-black/40" onClick={props.onClose} />
      <div
        className="modal-in fixed top-1/2 left-1/2 z-[300] flex max-h-[85vh] flex-col rounded-xl border border-divider bg-popup shadow-2xl"
        style={{
          width: props.width ?? 420,
          translate: `calc(-50% + ${drag.dx}px) calc(-50% + ${drag.dy}px)`,
        }}
      >
        <div
          onMouseDown={startDrag}
          className="flex shrink-0 cursor-move items-center justify-between border-b border-divider px-4 py-2.5 select-none"
        >
          <span className="text-sm font-semibold text-text-1">{props.title}</span>
          <button
            onMouseDown={(e) => e.stopPropagation()} // 关闭按钮不触发拖动
            onClick={props.onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-card-hover hover:text-text-1"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{props.children}</div>
        {props.footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-divider px-4 py-2.5">
            {props.footer}
          </div>
        )}
      </div>
    </Portal>
  );
}
