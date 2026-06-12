import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}

/**
 * 通用弹层:Portal 到 body + fixed 定位,避免被 overflow 容器裁剪。
 * z 分层约定:弹层 50,右键菜单 200,确认框 300。
 */
export function Popover(props: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  /** 直接指定坐标(右键菜单用),优先于 anchor */
  at?: { x: number; y: number };
  zIndex?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let top: number;
    let left: number;
    if (props.at) {
      top = props.at.y;
      left = props.at.x;
    } else if (props.anchor) {
      const r = props.anchor.getBoundingClientRect();
      top = r.bottom + 4;
      left = r.left;
    } else {
      return;
    }
    // 视口边缘修正
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, top - h - 8 - (props.at ? 0 : 28));
    setPos({ top, left });
  }, [props.anchor, props.at]);

  const z = props.zIndex ?? 50;
  return (
    <Portal>
      <div className="fixed inset-0" style={{ zIndex: z - 1 }} onClick={props.onClose} onContextMenu={(e) => { e.preventDefault(); props.onClose(); }} />
      <div
        ref={ref}
        className="fixed rounded-lg border border-divider bg-popup p-1 shadow-lg"
        style={{ zIndex: z, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      >
        {props.children}
      </div>
    </Portal>
  );
}

export function MenuItem(props: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-card-hover ${
        props.danger ? "text-overdue" : "text-text-1"
      }`}
    >
      {props.children}
    </button>
  );
}
