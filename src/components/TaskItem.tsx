import { useState } from "react";
import { Check, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import type { Task } from "../lib/tauri-ipc";

export default function TaskItem({ task }: { task: Task }) {
  const toggleComplete = useAppStore((s) => s.toggleComplete);
  const renameTask = useAppStore((s) => s.renameTask);
  const removeTask = useAppStore((s) => s.removeTask);
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("task", task.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const commit = () => {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== task.title) void renameTask(task.id, title);
    else setDraft(task.title);
  };

  return (
    <div
      ref={ref}
      className={`group relative flex items-center gap-2.5 rounded-lg bg-card px-3 py-2.5 transition-colors hover:bg-card-hover ${
        isDragging ? "dragging" : ""
      }`}
    >
      {closestEdge && (
        <div
          className={`absolute inset-x-1 z-10 h-0.5 rounded bg-accent ${
            closestEdge === "top" ? "-top-1" : "-bottom-1"
          }`}
        />
      )}

      <button
        title={task.is_completed ? "取消完成" : "完成"}
        onClick={() => void toggleComplete(task)}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          task.is_completed
            ? "border-accent bg-accent text-on-accent"
            : "border-muted hover:border-accent"
        }`}
      >
        {task.is_completed && <Check size={10} strokeWidth={3} />}
      </button>

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
          className="min-w-0 flex-1 bg-transparent text-sm text-text-1 outline-none"
        />
      ) : (
        <span
          onDoubleClick={() => {
            setDraft(task.title);
            setEditing(true);
          }}
          className={`min-w-0 flex-1 truncate text-sm ${
            task.is_completed ? "text-muted line-through" : "text-text-1"
          }`}
        >
          {task.title}
        </span>
      )}

      <button
        title="删除"
        onClick={() => void removeTask(task.id)}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-overdue group-hover:flex"
      >
        <X size={13} />
      </button>
    </div>
  );
}
