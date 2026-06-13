import { useState } from "react";
import { Bell, Calendar, Flag, ListTree, Plus, Tag, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatDue } from "../lib/date";
import { t } from "../lib/i18n";
import { sortTree } from "../lib/sort";
import DuePicker from "./DuePicker";
import ReminderPicker, { formatInterval } from "./ReminderPicker";
import { PRIORITY_KEY } from "./TaskItem";
import { Popover } from "./ui/Popover";
import TagIcon from "./ui/TagIcon";

const PRIORITY_COLOR: Record<number, string> = {
  1: "var(--success-text)",
  2: "var(--warning-text)",
  3: "var(--overdue-text)",
};

export default function QuickAdd() {
  const view = useAppStore((s) => s.view);
  const groups = useAppStore((s) => s.groups);
  const tasks = useAppStore((s) => s.tasks);
  const addTask = useAppStore((s) => s.addTask);
  const [text, setText] = useState("");
  const [due, setDueLocal] = useState("");
  const [priority, setPriorityLocal] = useState(2);
  const [reminder, setReminder] = useState(0);
  const [tagId, setTagId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [dueAnchor, setDueAnchor] = useState<HTMLElement | null>(null);
  const [reminderAnchor, setReminderAnchor] = useState<HTMLElement | null>(null);
  const [tagAnchor, setTagAnchor] = useState<HTMLElement | null>(null);
  const [parentAnchor, setParentAnchor] = useState<HTMLElement | null>(null);

  if (view.kind === "completed") return null;

  // 选了父待办则标签跟随父(对齐旧版),此时隐藏标签选择
  const parent = parentId ? tasks.find((t) => t.id === parentId) : null;
  const tag = tagId ? groups.find((g) => g.id === tagId) : null;
  // 父级候选:未完成任务,按树形顺序展示(带缩进)
  const parentCandidates = sortTree(tasks.filter((t) => !t.is_completed), "custom");

  const reset = () => {
    setText("");
    setDueLocal("");
    setPriorityLocal(2);
    setReminder(0);
    setTagId(null);
    setParentId(null);
  };

  const submit = () => {
    const title = text.trim();
    if (!title) return;
    void addTask(title, {
      due_date: due || undefined,
      priority,
      ...(reminder > 0 ? { reminder_enabled: true, reminder_interval_minutes: reminder } : {}),
      ...(parentId ? { parent_id: parentId } : tagId ? { group_id: tagId } : {}),
    });
    reset();
  };

  const Chip = ({
    icon,
    label,
    onClear,
  }: {
    icon: React.ReactNode;
    label: string;
    onClear: () => void;
  }) => (
    <span className="flex items-center gap-1 rounded-full bg-selected px-2 py-0.5 text-xs text-text-1">
      {icon}
      <span className="max-w-32 truncate">{label}</span>
      <button onClick={onClear} className="text-muted hover:text-overdue">
        <X size={10} />
      </button>
    </span>
  );

  return (
    <div className="shrink-0 border-t border-divider bg-titlebar p-2.5">
      {(due || reminder > 0 || tag || parent) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1 px-1">
          {parent && (
            <Chip
              icon={<ListTree size={10} />}
              label={`${t("S.X.NewTaskAsChildOf")} ${parent.title || t("S.X.UntitledNote")}`}
              onClear={() => setParentId(null)}
            />
          )}
          {tag && !parent && (
            <Chip
              icon={<TagIcon icon={tag.icon} iconImage={tag.icon_image} color={tag.color} size={10} />}
              label={tag.name}
              onClear={() => setTagId(null)}
            />
          )}
          {due && (
            <Chip
              icon={<Calendar size={10} />}
              label={formatDue(due)}
              onClear={() => setDueLocal("")}
            />
          )}
          {reminder > 0 && (
            <Chip
              icon={<Bell size={10} />}
              label={formatInterval(reminder)}
              onClear={() => setReminder(0)}
            />
          )}
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
        {/* 标签选择(选了父待办则隐藏:标签跟随父) */}
        {!parent && (
          <button
            title={t("S.X.NewTaskTag")}
            onClick={(e) => setTagAnchor(e.currentTarget)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-card-hover ${
              tag ? "text-accent" : "text-muted hover:text-accent"
            }`}
          >
            <Tag size={13} />
          </button>
        )}
        {/* 父待办选择(直接建为子待办) */}
        <button
          title={t("S.X.NewTaskParent")}
          onClick={(e) => setParentAnchor(e.currentTarget)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-card-hover ${
            parent ? "text-accent" : "text-muted hover:text-accent"
          }`}
        >
          <ListTree size={13} />
        </button>
        <button
          title={reminder > 0 ? t("S.SetAsReminder") : t("S.ChooseReminder")}
          onClick={(e) => setReminderAnchor(e.currentTarget)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-card-hover ${
            reminder > 0 ? "text-accent" : "text-muted hover:text-accent"
          }`}
        >
          <Bell size={13} />
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
      {reminderAnchor && (
        <ReminderPicker
          anchor={reminderAnchor}
          current={reminder}
          onPick={setReminder}
          onClear={() => setReminder(0)}
          onClose={() => setReminderAnchor(null)}
        />
      )}
      {tagAnchor && (
        <Popover anchor={tagAnchor} onClose={() => setTagAnchor(null)}>
          <div className="max-h-72 w-44 overflow-y-auto p-1">
            <button
              onClick={() => {
                setTagId(null);
                setTagAnchor(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-2 hover:bg-card-hover"
            >
              <Tag size={13} className="text-muted" />
              {t("S.Tag.Untagged")}
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setTagId(g.id);
                  setTagAnchor(null);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card-hover ${
                  tagId === g.id ? "text-accent" : "text-text-1"
                }`}
              >
                <TagIcon icon={g.icon} iconImage={g.icon_image} color={g.color} size={13} />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted">{t("S.Tag.Untagged")}</p>
            )}
          </div>
        </Popover>
      )}
      {parentAnchor && (
        <Popover anchor={parentAnchor} onClose={() => setParentAnchor(null)}>
          <div className="max-h-72 w-56 overflow-y-auto p-1">
            {parentCandidates.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted">{t("S.X.EmptyList")}</p>
            )}
            {parentCandidates.map((tk) => (
              <button
                key={tk.id}
                onClick={() => {
                  setParentId(tk.id);
                  setParentAnchor(null);
                }}
                style={{ paddingLeft: 8 + tk.indent_level * 12 }}
                className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs hover:bg-card-hover ${
                  parentId === tk.id ? "text-accent" : "text-text-1"
                }`}
              >
                <ListTree size={12} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">
                  {tk.title || t("S.X.UntitledNote")}
                </span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
