import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { parseDue, toDueText } from "../../lib/date";
import { t } from "../../lib/i18n";
import type { Task } from "../../lib/tauri-ipc";
import Modal from "../ui/Modal";

const PRIORITIES: { value: number; labelKey: string; color: string }[] = [
  { value: 1, labelKey: "S.Priority.Low", color: "#10B981" },
  { value: 2, labelKey: "S.Priority.Medium", color: "#F59E0B" },
  { value: 3, labelKey: "S.Priority.High", color: "#EF4444" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** 任务编辑对话框:标题 + 优先级 + 截止日期(时/分),对齐旧版 TaskEditDialog */
export default function TaskEditDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const patchTask = useAppStore((s) => s.patchTask);

  const cur = task.due_date ? parseDue(task.due_date) : null;
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority || 2);
  const [dueEnabled, setDueEnabled] = useState(!!task.due_date);
  const [date, setDate] = useState(
    cur
      ? `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`
      : toDueText(new Date(), false),
  );
  const [hour, setHour] = useState(cur ? cur.getHours() : 0);
  // 分钟 5 分钟步进,回填取最近一档(对齐旧版 SelectNearestMinute)
  const [minute, setMinute] = useState(
    cur ? Math.min(55, Math.round(cur.getMinutes() / 5) * 5) : 0,
  );

  const save = () => {
    const trimmed = title.trim();
    void patchTask({
      id: task.id,
      // 留空保留原标题(对齐旧版)
      ...(trimmed && trimmed !== task.title ? { title: trimmed } : {}),
      priority,
      due_date: dueEnabled && date ? `${date} ${pad(hour)}:${pad(minute)}` : "",
      quadrant_override: 0,
    });
    onClose();
  };

  return (
    <Modal
      title={t("S.TaskEdit.Title")}
      onClose={onClose}
      width={360}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover"
          >
            {t("S.Cancel")}
          </button>
          <button
            onClick={save}
            className="rounded-md bg-accent px-3.5 py-1.5 text-xs text-on-accent hover:opacity-90"
          >
            {t("S.Save")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs text-text-2">{t("S.TaskEdit.Content")}</p>
          <input
            autoFocus
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className="w-full rounded-md bg-input px-2.5 py-1.5 text-sm text-text-1 ring-1 ring-divider outline-none focus:ring-accent"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs text-text-2">{t("S.Label.Priority")}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                onClick={() => setPriority(p.value)}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs ring-1 ${
                  priority === p.value
                    ? "bg-selected text-text-1 ring-accent"
                    : "bg-input text-text-2 ring-divider hover:text-text-1"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-xs text-text-2">
            {t("S.TaskEdit.DueDate")}
            <input
              type="checkbox"
              checked={dueEnabled}
              onChange={(e) => setDueEnabled(e.target.checked)}
              className="accent-(--accent)"
            />
            {t("S.TaskEdit.Enable")}
          </label>
          <div
            className={`flex items-center gap-1.5 ${dueEnabled ? "" : "pointer-events-none opacity-45"}`}
          >
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-w-0 flex-1 rounded-md bg-input px-2 py-1.5 text-xs text-text-1 ring-1 ring-divider outline-none"
            />
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="rounded-md bg-input px-1.5 py-1.5 text-xs text-text-1 ring-1 ring-divider outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {pad(i)}
                </option>
              ))}
            </select>
            :
            <select
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="rounded-md bg-input px-1.5 py-1.5 text-xs text-text-1 ring-1 ring-divider outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i * 5}>
                  {pad(i * 5)}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-[11px] text-muted">{t("S.TaskEdit.DefaultTimeHint")}</p>
        </div>
      </div>
    </Modal>
  );
}
