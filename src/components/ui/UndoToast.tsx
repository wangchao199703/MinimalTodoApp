import { Undo2, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { t } from "../../lib/i18n";
import { Portal } from "./Popover";

/**
 * 全局「撤回」Toast(底部居中、单槽、覆盖更新):删除/完成立刻生效后弹出,
 * 5 秒内点「撤回」回滚;底部一条随时间递减的进度条(key 重挂随每次新 Toast 重置)。
 */
export default function UndoToast() {
  const undoToast = useAppStore((s) => s.undoToast);
  const runUndo = useAppStore((s) => s.runUndo);
  const dismiss = useAppStore((s) => s.dismissUndoToast);
  if (!undoToast) return null;

  return (
    <Portal>
      <div className="fixed bottom-8 left-1/2 z-[300] -translate-x-1/2">
        <div
          key={undoToast.id}
          className="toast-in relative flex min-w-64 items-center gap-3 overflow-hidden rounded-lg border border-divider bg-sidebar px-3.5 py-2.5 shadow-xl"
        >
          <span className="max-w-72 text-sm break-words text-sidebar-strong">
            {undoToast.message}
          </span>
          <button
            onClick={runUndo}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-sidebar-hover"
          >
            <Undo2 size={13} />
            {t("S.X.Undo")}
          </button>
          <button
            onClick={dismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:text-sidebar-strong"
          >
            <X size={12} />
          </button>
          {/* 5 秒倒计时进度条:key 随 toast id 重挂,动画从满到空 */}
          <span
            key={`bar-${undoToast.id}`}
            className="undo-bar pointer-events-none absolute bottom-0 left-0 h-0.5 bg-accent"
          />
        </div>
      </div>
    </Portal>
  );
}
