import { Bell, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Portal } from "./Popover";

/** 应用内提醒气泡(对齐旧版 ToastWindow 的角色) */
export default function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <Portal>
      <div className="fixed top-12 left-1/2 z-[300] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast-in flex items-center gap-2 rounded-lg border border-divider bg-popup px-3 py-2 shadow-lg"
          >
            <Bell size={14} className="shrink-0 text-accent" />
            <span className="max-w-72 text-sm break-words whitespace-pre-wrap text-text-1">
              {t.message}
            </span>
            <button
              onClick={() => dismiss(t.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-text-1"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </Portal>
  );
}
