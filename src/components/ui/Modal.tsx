import { X } from "lucide-react";
import { Portal } from "./Popover";

/** 居中模态框:确认框层级 z-300(对齐分层约定) */
export default function Modal(props: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-[290] bg-black/40" onClick={props.onClose} />
      <div
        className="fixed top-1/2 left-1/2 z-[300] flex max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-divider bg-popup shadow-2xl"
        style={{ width: props.width ?? 420 }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-divider px-4 py-2.5">
          <span className="text-sm font-semibold text-text-1">{props.title}</span>
          <button
            onClick={props.onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-card-hover hover:text-text-1"
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
