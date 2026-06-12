import { useState } from "react";
import { Calendar, Flag, Plus, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatDue } from "../lib/date";
import { t } from "../lib/i18n";
import DuePicker from "./DuePicker";
import { PRIORITY_KEY } from "./TaskItem";

const PRIORITY_COLOR: Record<number, string> = {
  1: "var(--success-text)",
  2: "var(--warning-text)",
  3: "var(--overdue-text)",
};

export default function QuickAdd() {
  const view = useAppStore((s) => s.view);
  const addTask = useAppStore((s) => s.addTask);
  const [text, setText] = useState("");
  const [due, setDueLocal] = useState("");
  const [priority, setPriorityLocal] = useState(2);
  const [dueAnchor, setDueAnchor] = useState<HTMLElement | null>(null);

  if (view.kind === "completed") return null;

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    setText("");
    setDueLocal("");
    setPriorityLocal(2);
    void addTask(title, { due_date: due || undefined, priority });
  };

  return (
    <div className="shrink-0 border-t border-divider bg-titlebar p-2.5">
      {due && (
        <div className="mb-1.5 flex items-center gap-1 px-1">
          <span className="flex items-center gap-1 rounded-full bg-selected px-2 py-0.5 text-xs text-text-1">
            <Calendar size={10} />
            {formatDue(due)}
            <button onClick={() => setDueLocal("")} className="text-muted hover:text-overdue">
              <X size={10} />
            </button>
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2 ring-1 ring-divider focus-within:ring-accent">
        <Plus size={15} className="shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("S.Tag.AddPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-1 outline-none placeholder:text-muted"
        />
        <button
          title={`${t("S.Label.Priority")}:${t(PRIORITY_KEY[priority])}`}
          onClick={() => setPriorityLocal(priority === 3 ? 1 : priority + 1)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-card-hover"
        >
          <Flag size={13} style={{ color: PRIORITY_COLOR[priority] }} />
        </button>
        <button
          title={t("S.Label.DueTime")}
          onClick={(e) => setDueAnchor(e.currentTarget)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-card-hover hover:text-accent"
        >
          <Calendar size={13} />
        </button>
      </div>

      {dueAnchor && (
        <DuePicker
          anchor={dueAnchor}
          current={due || null}
          onPick={setDueLocal}
          onClear={() => setDueLocal("")}
          onClose={() => setDueAnchor(null)}
        />
      )}
    </div>
  );
}
