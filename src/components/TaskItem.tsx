import { useState } from "react";
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  Minus,
  Pencil,
  Pin,
  PinOff,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { childStats } from "../lib/sort";
import { dueState, countdownText, formatDue } from "../lib/date";
import { isRoundCheckbox } from "../lib/themes";
import { fireworksAt, playComplete, normalizeSoundStyle } from "../lib/effects";
import { t } from "../lib/i18n";
import type { Task } from "../lib/tauri-ipc";
import { Popover, MenuItem } from "./ui/Popover";
import { confirm } from "./ui/ConfirmDialog";
import DuePicker from "./DuePicker";
import { formatInterval } from "./ReminderPicker";
import TaskEditDialog from "./dialogs/TaskEditDialog";

const PRIORITY_COLOR: Record<number, string> = {
  1: "var(--success-text)",
  2: "var(--warning-text)",
  3: "var(--overdue-text)",
};

export const PRIORITY_KEY: Record<number, string> = {
  1: "S.Priority.Low",
  2: "S.Priority.Medium",
  3: "S.Priority.High",
};

/** 优先级信号强度图标(「信号强度」优先级展示用,低 1 格 / 中 2 格 / 高 3 格) */
const PRIORITY_ICON: Record<number, typeof SignalHigh> = {
  1: SignalLow,
  2: SignalMedium,
  3: SignalHigh,
};

const DUE_CLASS: Record<string, string> = {
  overdue: "text-overdue",
  today: "text-warning",
  soon: "text-warning",
  normal: "text-text-2",
};

export default function TaskItem({ task, now }: { task: Task; now: Date }) {
  const tasks = useAppStore((s) => s.tasks);
  const groups = useAppStore((s) => s.groups);
  const design = useAppStore((s) => s.design);
  const customDesigns = useAppStore((s) => s.customDesigns);
  const toggleComplete = useAppStore((s) => s.toggleComplete);
  const showUndoToast = useAppStore((s) => s.showUndoToast);
  const renameTask = useAppStore((s) => s.renameTask);
  const removeTask = useAppStore((s) => s.removeTask);
  const togglePin = useAppStore((s) => s.togglePin);
  const setPriority = useAppStore((s) => s.setPriority);
  const setDue = useAppStore((s) => s.setDue);
  const toggleReminder = useAppStore((s) => s.toggleReminder);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const indentTask = useAppStore((s) => s.indentTask);
  const outdentTask = useAppStore((s) => s.outdentTask);

  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("task", task.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dueAnchor, setDueAnchor] = useState<HTMLElement | null>(null);
  const [completing, setCompleting] = useState(false);
  const [editDialog, setEditDialog] = useState(false);

  // 完成:烟花 + 音效(按设置)。活子待办(父未完成、非全部子完成)只打钩留原位、不播滑出动画(对齐旧版)
  const completeWithEffects = (e: React.MouseEvent) => {
    if (task.is_completed) {
      void toggleComplete(task);
      return;
    }
    const s = useAppStore.getState().settings;
    if ((s["effects_enabled"] ?? "1") === "1") fireworksAt(e.clientX, e.clientY);
    if ((s["sound_enabled"] ?? "1") === "1")
      playComplete(normalizeSoundStyle(s["complete_sound_style"] || s["sound_style"] || "cute"));
    const parent = task.parent_id ? tasks.find((t) => t.id === task.parent_id) : null;
    const isLiveChild = !!parent && !parent.is_completed;
    if (isLiveChild) {
      // 不消失、不滑出,立即打钩(留在父下,划线)
      void toggleComplete(task);
      return;
    }
    // 顶层/整族完成:滑出消失 → 写库;弹底部「撤回」Toast(撤回 = 反勾整族)
    setCompleting(true);
    setTimeout(() => {
      setCompleting(false);
      void toggleComplete(task);
      showUndoToast(t("S.X.UndoToast.TaskCompleted"), () => {
        const tk = useAppStore.getState().tasks.find((x) => x.id === task.id);
        if (tk?.is_completed) void toggleComplete(tk);
      });
    }, 380);
  };

  const [doneChildren, totalChildren] = childStats(tasks, task.id);
  const ds = dueState(task.due_date, task.is_completed, now);
  const group = task.group_id ? groups.find((g) => g.id === task.group_id) : null;
  const PriIcon = PRIORITY_ICON[task.priority] ?? SignalMedium;
  // 半满态:有子任务且部分(非全部)完成,父本身未完成 —— 复选框显示「➖/圆点」
  const indeterminate =
    !task.is_completed && totalChildren > 0 && doneChildren > 0 && doneChildren < totalChildren;
  const progress = totalChildren > 0 ? Math.round((doneChildren / totalChildren) * 100) : 0;

  const commit = () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== task.title) void renameTask(task.id, title);
    else setDraft(task.title);
  };

  const confirmDelete = async () => {
    if (
      await confirm({
        title: totalChildren > 0 ? t("S.X.DeleteWithChildren") : t("S.X.Delete"),
        message: totalChildren > 0 ? t("S.X.ConfirmDeleteTaskTree") : t("S.X.ConfirmDeleteTask"),
      })
    ) {
      void removeTask(task.id);
    }
  };

  return (
    <div
      ref={ref}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      data-level={task.indent_level}
      style={
        {
          "--lvl": task.indent_level,
          "--pri": PRIORITY_COLOR[task.priority],
          "--pct-num": progress,
        } as React.CSSProperties
      }
      className={`task-item group relative flex items-center gap-2 rounded-lg border border-divider bg-card py-2 pr-3 pl-1.5 transition-colors hover:bg-card-hover ${
        isDragging ? "dragging" : ""
      } ${completing ? "completing" : ""}`}
    >
      {closestEdge && (
        <div
          className={`absolute inset-x-1 z-10 h-0.5 rounded bg-accent ${
            closestEdge === "top" ? "-top-1" : "-bottom-1"
          }`}
        />
      )}

      {/* 优先级信号图标:仅「信号强度」优先级展示显示(CSS 控制),按 --pri 着色 */}
      {!task.is_completed && (
        <span className="task-pri-icon shrink-0" style={{ color: "var(--pri)" }}>
          <PriIcon size={14} />
        </span>
      )}

      <button
        title={task.is_completed ? t("S.X.Uncomplete") : t("S.X.Complete")}
        onClick={completeWithEffects}
        className={`task-check flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          task.is_completed ? "is-done" : ""
        } ${indeterminate ? "is-indeterminate" : ""} ${
          totalChildren > 0 && !task.is_completed ? "is-parent" : ""
        }`}
      >
        {task.is_completed ? (
          <Check size={10} strokeWidth={3} />
        ) : (
          indeterminate && <Minus className="task-half" size={11} strokeWidth={3} />
        )}
        {/* 进度环(仅「勾选框」进度模式显示,CSS 控制):按勾选框形状渲染 圆 / 圆角方 */}
        {totalChildren > 0 && !task.is_completed && (
          <svg className="task-ring" viewBox="0 0 36 36" aria-hidden="true">
            {isRoundCheckbox(design, customDesigns) ? (
              <>
                <circle className="task-ring-track" cx="18" cy="18" r="15.5" />
                <circle className="task-ring-fill" cx="18" cy="18" r="15.5" pathLength={100} />
              </>
            ) : (
              <>
                <rect className="task-ring-track" x="2.5" y="2.5" width="31" height="31" rx="5" />
                <rect
                  className="task-ring-fill"
                  x="2.5"
                  y="2.5"
                  width="31"
                  height="31"
                  rx="5"
                  pathLength={100}
                />
              </>
            )}
          </svg>
        )}
      </button>

      <div className="task-body flex min-w-0 flex-1 flex-col">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            className="min-w-0 bg-transparent text-sm text-text-1 outline-none"
          />
        ) : (
          <div className="task-title-row flex min-w-0 items-start gap-1.5">
            {/* 优先级标记(高优先级 ! 等):由 prio-* 设置按 data-pri 用 CSS ::before 注入 */}
            <span className="task-pri-mark shrink-0" />
            {/* 优先级小圆点:文档(notion)优先级展示用(CSS 控制) */}
            <span className="task-pri-dot shrink-0" style={{ background: "var(--pri)" }} />
            <span
              onDoubleClick={() => {
                setDraft(task.title);
                setEditing(true);
              }}
              className={`task-title min-w-0 break-words text-sm ${
                task.is_completed ? "text-muted line-through" : "text-text-1"
              }`}
            >
              {task.title}
            </span>
            {/* 标签后缀:经典版式隐藏,其余版式以 #标签 展示(CSS 控制) */}
            {group && <span className="task-tag shrink-0 text-xs text-muted">{group.name}</span>}
          </div>
        )}

        {/* 子任务进度条:父任务专属,经典隐藏、其余版式显示(粗细按版式) */}
        {totalChildren > 0 && !editing && (
          <div className="task-progress mt-1">
            <div className="task-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {(task.due_date || task.reminder_enabled || totalChildren > 0) && !editing && (
          <span className="task-meta mt-0.5 flex items-center gap-2 text-xs">
            {task.due_date && !task.is_completed && (
              <span title={formatDue(task.due_date)} className={DUE_CLASS[ds] ?? "text-text-2"}>
                {countdownText(task.due_date, now)}
              </span>
            )}
            {task.reminder_enabled && (
              <span className="flex items-center gap-0.5 text-accent">
                <Bell size={10} />
                {formatInterval(task.reminder_interval_minutes)}
              </span>
            )}
            {totalChildren > 0 && (
              <span className="task-subcount text-muted">
                {doneChildren}/{totalChildren}
              </span>
            )}
          </span>
        )}
      </div>

      {task.is_pinned && <Pin size={12} className="shrink-0 text-accent" />}

      <button
        title={t("S.Label.DueTime")}
        onClick={(e) => setDueAnchor(e.currentTarget)}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-accent group-hover:flex"
      >
        <Calendar size={13} />
      </button>
      <button
        title={t("S.X.Delete")}
        onClick={() => void confirmDelete()}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-overdue group-hover:flex"
      >
        <X size={13} />
      </button>

      {/* 折叠箭头:统一放行右边缘(勾选框靠左,防误触);苹果/极客 hover 才显,经典/可爱常驻 */}
      {totalChildren > 0 && (
        <button
          title={task.is_collapsed ? t("S.X.Expand") : t("S.X.Collapse")}
          onClick={() => void toggleCollapse(task)}
          className="task-collapse flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition-opacity hover:text-text-1"
        >
          {task.is_collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
      )}

      {dueAnchor && (
        <DuePicker
          anchor={dueAnchor}
          current={task.due_date}
          onPick={(due) => void setDue(task.id, due)}
          onClear={() => void setDue(task.id, "")}
          onClose={() => setDueAnchor(null)}
        />
      )}

      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-44">
            <MenuItem
              onClick={() => {
                setMenu(null);
                setEditDialog(true);
              }}
            >
              <Pencil size={13} />
              {t("S.X.Edit")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                void togglePin(task);
                setMenu(null);
              }}
            >
              {task.is_pinned ? <PinOff size={13} /> : <Pin size={13} />}
              {task.is_pinned ? t("S.X.Unpin") : t("S.X.Pin")}
            </MenuItem>

            <div className="my-1 h-px bg-divider" />
            <div className="px-2.5 py-1 text-xs text-muted">{t("S.Label.Priority")}</div>
            {[3, 2, 1].map((p) => (
              <MenuItem
                key={p}
                onClick={() => {
                  void setPriority(task.id, p);
                  setMenu(null);
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: PRIORITY_COLOR[p] }}
                />
                {t(PRIORITY_KEY[p])}
                {task.priority === p && <Check size={12} className="ml-auto text-accent" />}
              </MenuItem>
            ))}

            <div className="my-1 h-px bg-divider" />
            <MenuItem
              onClick={() => {
                void toggleReminder(task);
                setMenu(null);
              }}
            >
              <Bell size={13} />
              {task.reminder_enabled ? t("S.X.ReminderOff") : t("S.X.ReminderOn")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                void indentTask(task);
                setMenu(null);
              }}
            >
              <CornerDownRight size={13} />
              {t("S.X.MakeSubtask")}
            </MenuItem>
            {task.parent_id && (
              <MenuItem
                onClick={() => {
                  void outdentTask(task);
                  setMenu(null);
                }}
              >
                <CornerUpLeft size={13} />
                {t("S.X.Outdent")}
              </MenuItem>
            )}

            <div className="my-1 h-px bg-divider" />
            <MenuItem
              danger
              onClick={() => {
                setMenu(null);
                void confirmDelete();
              }}
            >
              <Trash2 size={13} />
              {totalChildren > 0 ? t("S.X.DeleteWithChildren") : t("S.X.Delete")}
            </MenuItem>
          </div>
        </Popover>
      )}

      {editDialog && <TaskEditDialog task={task} onClose={() => setEditDialog(false)} />}
    </div>
  );
}
