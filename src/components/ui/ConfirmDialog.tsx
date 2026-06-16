import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { Portal } from "./Popover";

interface ConfirmOptions {
  title: string;
  message: string;
  /** 默认 S.Confirm */
  confirmText?: string;
  /** 默认 S.Cancel */
  cancelText?: string;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

/**
 * 命令式二次确认(对齐旧版 ConfirmDialog 用法):
 * `if (await confirm({ title, message })) { ... }`。
 * 依赖 App 根部挂载的 <ConfirmHost />;未挂载时直接放行(不阻塞操作)。
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(true);
  return new Promise((resolve) => show!({ ...opts, resolve }));
}

/** 确认框宿主:模态层级 z-300(对齐分层约定) */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    show = setPending;
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!pending) return null;

  const close = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <Portal>
      <div className="backdrop-in fixed inset-0 z-[290] bg-black/40" onClick={() => close(false)} />
      <div className="modal-in fixed top-1/2 left-1/2 z-[300] w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-divider bg-popup p-5 shadow-2xl">
        <p className="text-sm font-semibold text-text-1">{pending.title}</p>
        <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-text-2">
          {pending.message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => close(false)}
            className="rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover"
          >
            {pending.cancelText ?? t("S.Cancel")}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className="rounded-md bg-overdue px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            {pending.confirmText ?? t("S.Confirm")}
          </button>
        </div>
      </div>
    </Portal>
  );
}
