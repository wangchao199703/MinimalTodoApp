import { useEffect, useRef, useState } from "react";
import { Bell, Calendar, Check, Flag, ListTree, Plus, Tag, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatDue } from "../lib/date";
import { t } from "../lib/i18n";
import { sortTree } from "../lib/sort";
import DuePicker from "./DuePicker";
import ReminderPicker, { formatInterval } from "./ReminderPicker";
import { PRIORITY_KEY } from "./TaskItem";
import { Popover } from "./ui/Popover";
import PopoverTitle from "./ui/PopoverTitle";
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
  const setPriorityAction = useAppStore((s) => s.setPriority);
  const setDueAction = useAppStore((s) => s.setDue);
  const patchTask = useAppStore((s) => s.patchTask);
  // 新建后弹快捷设置:默认关闭,不改老用户行为(见 CLAUDE.md)
  const quickAddPopup = useAppStore((s) => s.settings["quick_add_popup"] === "1");
  const [text, setText] = useState("");
  const [due, setDueLocal] = useState("");
  const [priority, setPriorityLocal] = useState(2);
  const [reminder, setReminder] = useState(0);
  const [tagId, setTagId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [dueAnchor, setDueAnchor] = useState<HTMLElement | null>(null);
  const [reminderAnchor, setReminderAnchor] = useState<HTMLElement | null>(null);
  const [priorityAnchor, setPriorityAnchor] = useState<HTMLElement | null>(null);
  const [tagAnchor, setTagAnchor] = useState<HTMLElement | null>(null);
  const [parentAnchor, setParentAnchor] = useState<HTMLElement | null>(null);
  // 新建后弹层:锚定到输入栏,作用于刚建的这条任务(只存 id,实时从 tasks 取最新值)
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [postAddId, setPostAddId] = useState<string | null>(null);
  const [postDueAnchor, setPostDueAnchor] = useState<HTMLElement | null>(null);
  const [postReminderAnchor, setPostReminderAnchor] = useState<HTMLElement | null>(null);

  // ESC 关闭新建后弹层(子选择器自带 ESC/外部点击,这里只兜底主弹层)
  useEffect(() => {
    if (!postAddId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPostAddId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [postAddId]);

  if (view.kind === "completed") return null;

  // 选了父待办则标签跟随父(对齐旧版),此时隐藏标签选择
  const parent = parentId ? tasks.find((t) => t.id === parentId) : null;
  const tag = tagId ? groups.find((g) => g.id === tagId) : null;
  // 父级候选:未完成任务,按树形顺序展示(带缩进)
  const parentCandidates = sortTree(tasks.filter((t) => !t.is_completed), "custom");

  // 新建后弹层作用的任务(实时取最新值;任务若被删则自动消失)
  const postTask = postAddId ? tasks.find((t) => t.id === postAddId) ?? null : null;
  const closePostAdd = () => {
    setPostAddId(null);
    setPostDueAnchor(null);
    setPostReminderAnchor(null);
  };

  const reset = () => {
    setText("");
    setDueLocal("");
    setPriorityLocal(2);
    setReminder(0);
    setTagId(null);
    setParentId(null);
  };

  const submit = async () => {
    const title = text.trim();
    if (!title) return;
    const created = await addTask(title, {
      due_date: due || undefined,
      priority,
      ...(reminder > 0 ? { reminder_enabled: true, reminder_interval_minutes: reminder } : {}),
      ...(parentId ? { parent_id: parentId } : tagId ? { group_id: tagId } : {}),
    });
    reset();
    // 对齐 WPF:新建后弹快捷设置小窗,锚定输入栏,改这条任务的优先级/截止/周期提醒
    // 非阻塞:输入框保持焦点,可继续连续新建;ESC / 点外部 / 完成均关闭
    if (quickAddPopup && created) setPostAddId(created.id);
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
      <div
        ref={rowRef}
        className="flex items-center gap-2 rounded-lg bg-input px-3 py-2 ring-1 ring-divider focus-within:ring-accent"
      >
        <Plus size={15} className="shrink-0 text-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder={t("S.Tag.AddPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-1 outline-none placeholder:text-muted"
        />
        {/* 优先级选择:点击弹上拉框选 高 / 中 / 低(对齐标签的交互与风格) */}
        <button
          title={`${t("S.Label.Priority")}:${t(PRIORITY_KEY[priority])}`}
          onClick={(e) => setPriorityAnchor(e.currentTarget)}
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
      {priorityAnchor && (
        <Popover anchor={priorityAnchor} onClose={() => setPriorityAnchor(null)}>
          <div className="w-32">
            <PopoverTitle>{t("S.Label.Priority")}</PopoverTitle>
            <div className="p-1">
              {[3, 2, 1].map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPriorityLocal(p);
                  setPriorityAnchor(null);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-card-hover ${
                  priority === p ? "text-accent" : "text-text-1"
                }`}
              >
                <Flag size={13} style={{ color: PRIORITY_COLOR[p] }} />
                <span className="min-w-0 flex-1 break-words">{t(PRIORITY_KEY[p])}</span>
              </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
      {tagAnchor && (
        <Popover anchor={tagAnchor} onClose={() => setTagAnchor(null)}>
          <div className="w-44">
            <PopoverTitle>{t("S.X.NewTaskTag")}</PopoverTitle>
            <div className="max-h-72 overflow-y-auto p-1">
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
                <span className="min-w-0 flex-1 break-words">{g.name}</span>
              </button>
            ))}
            {groups.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted">{t("S.Tag.Untagged")}</p>
            )}
            </div>
          </div>
        </Popover>
      )}
      {parentAnchor && (
        <Popover anchor={parentAnchor} onClose={() => setParentAnchor(null)}>
          <div className="w-56">
            <PopoverTitle>{t("S.X.NewTaskParent")}</PopoverTitle>
            <div className="max-h-72 overflow-y-auto p-1">
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
                <span className="min-w-0 flex-1 break-words">
                  {tk.title || t("S.X.UntitledNote")}
                </span>
              </button>
            ))}
            </div>
          </div>
        </Popover>
      )}

      {/* 新建后弹层:锚定输入栏,直接改这条任务的优先级 / 截止 / 周期提醒(对齐 WPF) */}
      {postTask && (
        <Popover anchor={rowRef.current} onClose={closePostAdd}>
          <div className="w-60 p-2">
            <div className="mb-2 flex items-center gap-1.5 px-0.5">
              <span className="min-w-0 flex-1 break-words text-xs font-medium text-text-1">
                {postTask.title || t("S.X.UntitledNote")}
              </span>
              <span className="shrink-0 text-[11px] text-muted">{t("S.X.QuickSetTitle")}</span>
            </div>

            {/* 优先级:高 / 中 / 低 段控 */}
            <div className="mb-2">
              <p className="mb-1 px-0.5 text-[11px] text-muted">{t("S.Label.Priority")}</p>
              <div className="grid grid-cols-3 gap-1">
                {[3, 2, 1].map((p) => (
                  <button
                    key={p}
                    onClick={() => void setPriorityAction(postTask.id, p)}
                    className={`flex items-center justify-center gap-1 rounded-md px-1 py-1 text-xs ring-1 ${
                      postTask.priority === p
                        ? "bg-selected text-accent ring-accent"
                        : "bg-input text-text-2 ring-divider hover:text-accent hover:ring-accent"
                    }`}
                  >
                    <Flag size={11} style={{ color: PRIORITY_COLOR[p] }} />
                    {t(PRIORITY_KEY[p])}
                  </button>
                ))}
              </div>
            </div>

            {/* 截止时间 */}
            <button
              onClick={(e) => setPostDueAnchor(e.currentTarget)}
              className="mb-1.5 flex w-full items-center gap-2 rounded-md bg-input px-2 py-1.5 text-xs text-text-1 ring-1 ring-divider hover:ring-accent"
            >
              <Calendar size={13} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-left">
                {postTask.due_date ? formatDue(postTask.due_date) : t("S.Label.DueTime")}
              </span>
              {postTask.due_date && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void setDueAction(postTask.id, "");
                  }}
                  className="text-muted hover:text-overdue"
                >
                  <X size={11} />
                </span>
              )}
            </button>

            {/* 周期提醒 */}
            <button
              onClick={(e) => setPostReminderAnchor(e.currentTarget)}
              className="mb-2 flex w-full items-center gap-2 rounded-md bg-input px-2 py-1.5 text-xs text-text-1 ring-1 ring-divider hover:ring-accent"
            >
              <Bell size={13} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate text-left">
                {postTask.reminder_enabled
                  ? formatInterval(postTask.reminder_interval_minutes)
                  : t("S.ChooseReminder")}
              </span>
              {postTask.reminder_enabled && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void patchTask({ id: postTask.id, reminder_enabled: false });
                  }}
                  className="text-muted hover:text-overdue"
                >
                  <X size={11} />
                </span>
              )}
            </button>

            <div className="flex justify-end">
              <button
                onClick={closePostAdd}
                className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs text-on-accent hover:opacity-90"
              >
                <Check size={12} />
                {t("S.X.QuickSetDone")}
              </button>
            </div>
          </div>
        </Popover>
      )}

      {postTask && postDueAnchor && (
        <DuePicker
          anchor={postDueAnchor}
          current={postTask.due_date}
          onPick={(d) => void setDueAction(postTask.id, d)}
          onClear={() => void setDueAction(postTask.id, "")}
          onClose={() => setPostDueAnchor(null)}
        />
      )}
      {postTask && postReminderAnchor && (
        <ReminderPicker
          anchor={postReminderAnchor}
          current={postTask.reminder_enabled ? postTask.reminder_interval_minutes : 0}
          onPick={(m) =>
            void patchTask({
              id: postTask.id,
              reminder_enabled: true,
              reminder_interval_minutes: m,
            })
          }
          onClear={() => void patchTask({ id: postTask.id, reminder_enabled: false })}
          onClose={() => setPostReminderAnchor(null)}
        />
      )}
    </div>
  );
}
