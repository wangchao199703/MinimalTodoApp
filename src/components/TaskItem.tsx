import { useState } from "react";
import {
  Bell,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { childStats } from "../lib/sort";
import { dueState, countdownText, formatDue } from "../lib/date";
import { fireworksAt, playCelebration } from "../lib/effects";
import { t } from "../lib/i18n";
import type { Task } from "../lib/tauri-ipc";
import { Popover, MenuItem } from "./ui/Popover";
import { confirm } from "./ui/ConfirmDialog";
import DuePicker from "./DuePicker";
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

const DUE_CLASS: Record<string, string> = {
  overdue: "text-overdue",
  today: "text-warning",
  soon: "text-warning",
  normal: "text-text-2",
};

export default function TaskItem({ task, now }: { task: Task; now: Date }) {
  const tasks = useAppStore((s) => s.tasks);
  const toggleComplete = useAppStore((s) => s.toggleComplete);
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

  // 完成:烟花 + 音效(按设置)→ 滑出动画 → 落库
  const completeWithEffects = (e: React.MouseEvent) => {
    if (task.is_completed) {
      void toggleComplete(task);
      return;
    }
    const s = useAppStore.getState().settings;
    if ((s["effects_enabled"] ?? "1") === "1") fireworksAt(e.clientX, e.clientY);
    if (s["sound_enabled"] === "1") playCelebration();
    setCompleting(true);
    setTimeout(() => {
      setCompleting(false);
      void toggleComplete(task);
    }, 380);
  };

  const [doneChildren, totalChildren] = childStats(tasks, task.id);
  const ds = dueState(task.due_date, task.is_completed, now);

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
      style={{ marginLeft: task.indent_level * 18 }}
      className={`group relative flex items-center gap-2 rounded-lg border border-divider bg-card px-3 py-2 transition-colors hover:bg-card-hover ${
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

      {totalChildren > 0 ? (
        <button
          title={task.is_collapsed ? t("S.X.Expand") : t("S.X.Collapse")}
          onClick={() => void toggleCollapse(task)}
          className="-ml-1 flex h-4 w-4 shrink-0 items-center justify-center text-muted hover:text-text-1"
        >
          {task.is_collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
      ) : (
        task.indent_level === 0 && <span className="-ml-1 w-4 shrink-0" />
      )}

      <button
        title={task.is_completed ? t("S.X.Uncomplete") : t("S.X.Complete")}
        onClick={completeWithEffects}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{
          borderColor: task.is_completed ? "var(--accent)" : PRIORITY_COLOR[task.priority],
          background: task.is_completed ? "var(--accent)" : "transparent",
          color: "var(--accent-text)",
        }}
      >
        {task.is_completed && <Check size={10} strokeWidth={3} />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
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
          <span
            onDoubleClick={() => {
              setDraft(task.title);
              setEditing(true);
            }}
            className={`truncate text-sm ${
              task.is_completed ? "text-muted line-through" : "text-text-1"
            }`}
          >
            {task.title}
          </span>
        )}

        {(task.due_date || task.reminder_enabled || totalChildren > 0) && !editing && (
          <span className="mt-0.5 flex items-center gap-2 text-xs">
            {task.due_date && !task.is_completed && (
              <span title={formatDue(task.due_date)} className={DUE_CLASS[ds] ?? "text-text-2"}>
                {countdownText(task.due_date, now)}
              </span>
            )}
            {task.reminder_enabled && (
              <span className="flex items-center gap-0.5 text-accent">
                <Bell size={10} />
                {task.reminder_interval_minutes}分
              </span>
            )}
            {totalChildren > 0 && (
              <span className="text-muted">
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
