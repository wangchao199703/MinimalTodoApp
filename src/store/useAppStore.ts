import { create } from "zustand";
import {
  ipc,
  type Group,
  type Note,
  type NoteGroup,
  type Task,
  type UpdateNoteRequest,
  type UpdateTaskRequest,
} from "../lib/tauri-ipc";
import { sortTree, descendantIds, type SortMode } from "../lib/sort";
import { nowText } from "../lib/date";
import { applyTheme, migrateThemeKey, type Theme } from "../lib/themes";
import { setLang, type Lang } from "../lib/i18n";

/** 视图分发:取代路由。内置视图 + 任意标签视图,可枚举即不需要 Router */
export type View =
  | { kind: "all" }
  | { kind: "completed" }
  | { kind: "quadrant" }
  | { kind: "tagboard" }
  | { kind: "notes" }
  | { kind: "group"; groupId: string };

export interface Toast {
  id: number;
  message: string;
}

interface AppState {
  loaded: boolean;
  tasks: Task[];
  groups: Group[];
  settings: Record<string, string>;
  view: View;
  theme: Theme;
  language: Lang;
  sortMode: SortMode;
  toasts: Toast[];
  notes: Note[];
  noteGroups: NoteGroup[];
  selectedNoteId: string | null;
  scheduleOpen: boolean;
  /** 打开日历瞬间锁定的待办列宽度(点击时同步读取,确保待办不缩) */
  lockedTaskWidth: number;

  init: () => Promise<void>;
  selectNote: (id: string | null) => void;
  addNote: (groupId?: string) => Promise<void>;
  patchNote: (req: UpdateNoteRequest) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  addNoteGroup: (name: string) => Promise<void>;
  renameNoteGroup: (id: string, name: string) => Promise<void>;
  toggleNoteGroupCollapse: (g: NoteGroup) => Promise<void>;
  removeNoteGroup: (id: string) => Promise<void>;
  setScheduleOpen: (open: boolean) => void;
  setView: (v: View) => void;
  setTheme: (key: Theme) => void;
  setLanguage: (lang: Lang) => void;
  setSortMode: (m: SortMode) => void;
  saveSetting: (key: string, value: string) => void;
  pushToast: (message: string) => void;
  dismissToast: (id: number) => void;

  addTask: (title: string, extra?: { due_date?: string; priority?: number }) => Promise<void>;
  patchTask: (req: UpdateTaskRequest) => Promise<void>;
  toggleComplete: (task: Task) => Promise<void>;
  renameTask: (id: string, title: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  togglePin: (task: Task) => Promise<void>;
  setPriority: (id: string, priority: number) => Promise<void>;
  setDue: (id: string, due: string) => Promise<void>;
  toggleReminder: (task: Task, intervalMinutes?: number) => Promise<void>;
  toggleCollapse: (task: Task) => Promise<void>;
  indentTask: (task: Task) => Promise<void>;
  outdentTask: (task: Task) => Promise<void>;
  /** ids 为新的全局任务顺序(order_index 重排) */
  reorderTasks: (ids: string[]) => Promise<void>;

  addGroup: (name: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  reorderGroups: (ids: string[]) => Promise<void>;
}

function replaceTask(tasks: Task[], next: Task): Task[] {
  return tasks.map((t) => (t.id === next.id ? next : t));
}

let toastSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  tasks: [],
  groups: [],
  settings: {},
  view: { kind: "all" },
  theme: "light",
  language: "zh-CN",
  sortMode: "custom",
  toasts: [],
  notes: [],
  noteGroups: [],
  selectedNoteId: null,
  scheduleOpen: false,
  lockedTaskWidth: 420,

  init: async () => {
    const [tasks, groups, settings, notes, noteGroups] = await Promise.all([
      ipc.getTasks(),
      ipc.getGroups(),
      ipc.getSettings(),
      ipc.getNotes(),
      ipc.getNoteGroups(),
    ]);

    const language: Lang = settings["language"] === "en" ? "en" : "zh-CN";
    setLang(language);

    // 旧版主题键(102 套时代)自动迁移到六主题
    const theme = migrateThemeKey(settings["theme"]);
    if (settings["theme"] !== theme) void ipc.setSetting("theme", theme);
    applyTheme(theme);

    const validSort: SortMode[] = ["custom", "due", "priority", "completed", "created", "title"];
    const sortMode = validSort.includes(settings["sort"] as SortMode)
      ? (settings["sort"] as SortMode)
      : "custom";

    // 恢复上次选中的视图(被删除的标签则回退到全部)
    let view: View = { kind: "all" };
    const saved = settings["selected_group_id"];
    if (saved === "completed" || saved === "quadrant" || saved === "tagboard" || saved === "notes")
      view = { kind: saved };
    else if (saved && groups.some((g) => g.id === saved))
      view = { kind: "group", groupId: saved };

    set({
      tasks,
      groups,
      settings,
      theme,
      language,
      view,
      sortMode,
      notes,
      noteGroups,
      selectedNoteId: notes[0]?.id ?? null,
      scheduleOpen: settings["schedule_open"] === "1",
      loaded: true,
    });
  },

  selectNote: (selectedNoteId) => set({ selectedNoteId }),

  addNote: async (groupId) => {
    const note = await ipc.createNote(groupId);
    set((s) => ({ notes: [note, ...s.notes], selectedNoteId: note.id }));
  },

  patchNote: async (req) => {
    const next = await ipc.updateNote(req);
    set((s) => ({ notes: s.notes.map((n) => (n.id === next.id ? next : n)) }));
  },

  removeNote: async (id) => {
    await ipc.deleteNote(id);
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
    }));
  },

  addNoteGroup: async (name) => {
    const g = await ipc.createNoteGroup(name);
    set((s) => ({ noteGroups: [...s.noteGroups, g] }));
  },

  renameNoteGroup: async (id, name) => {
    const next = await ipc.updateNoteGroup(id, { name });
    set((s) => ({ noteGroups: s.noteGroups.map((g) => (g.id === id ? next : g)) }));
  },

  toggleNoteGroupCollapse: async (g) => {
    const next = await ipc.updateNoteGroup(g.id, { is_collapsed: !g.is_collapsed });
    set((s) => ({ noteGroups: s.noteGroups.map((x) => (x.id === g.id ? next : x)) }));
  },

  removeNoteGroup: async (id) => {
    await ipc.deleteNoteGroup(id);
    set((s) => ({
      noteGroups: s.noteGroups.filter((g) => g.id !== id),
      // 外键已把便签移回收集箱,本地同步
      notes: s.notes.map((n) => (n.group_id === id ? { ...n, group_id: null } : n)),
    }));
  },

  setScheduleOpen: (scheduleOpen) => {
    set({ scheduleOpen });
    get().saveSetting("schedule_open", scheduleOpen ? "1" : "0");
  },

  setView: (view) => {
    set({ view });
    const key = view.kind === "group" ? view.groupId : view.kind === "all" ? "" : view.kind;
    get().saveSetting("selected_group_id", key);
  },

  setTheme: (key) => {
    applyTheme(key);
    set({ theme: key });
    get().saveSetting("theme", key);
  },

  setLanguage: (language) => {
    setLang(language);
    set({ language });
    get().saveSetting("language", language);
  },

  setSortMode: (sortMode) => {
    set({ sortMode });
    get().saveSetting("sort", sortMode);
  },

  saveSetting: (key, value) => {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    void ipc.setSetting(key, value);
  },

  pushToast: (message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => get().dismissToast(id), 6000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  addTask: async (title, extra) => {
    const { view } = get();
    const group_id = view.kind === "group" ? view.groupId : undefined;
    const task = await ipc.createTask({ title, group_id, ...extra });
    // 新任务排在最前(order_index 为全局最小)
    set((s) => ({ tasks: [task, ...s.tasks] }));
  },

  patchTask: async (req) => {
    const next = await ipc.updateTask(req);
    set((s) => ({ tasks: replaceTask(s.tasks, next) }));
  },

  toggleComplete: async (task) => {
    const completing = !task.is_completed;
    const next = await ipc.updateTask({
      id: task.id,
      is_completed: completing,
      original_group_id: completing ? (task.group_id ?? "") : undefined,
    });
    let tasks = replaceTask(get().tasks, next);
    if (completing) {
      // 整族完成:父任务勾选时全部子孙一并完成(对齐旧版)
      for (const cid of descendantIds(tasks, task.id)) {
        const child = tasks.find((t) => t.id === cid);
        if (child && !child.is_completed) {
          const done = await ipc.updateTask({
            id: cid,
            is_completed: true,
            original_group_id: child.group_id ?? "",
          });
          tasks = replaceTask(tasks, done);
        }
      }
    }
    set({ tasks });
  },

  renameTask: async (id, title) => {
    await get().patchTask({ id, title });
  },

  removeTask: async (id) => {
    await ipc.deleteTask(id);
    set((s) => {
      const doomed = new Set([id, ...descendantIds(s.tasks, id)]);
      return { tasks: s.tasks.filter((t) => !doomed.has(t.id)) };
    });
  },

  togglePin: async (task) => {
    await get().patchTask({ id: task.id, is_pinned: !task.is_pinned });
  },

  setPriority: async (id, priority) => {
    // 改优先级会让自动派生的象限变化,清掉手动覆盖(对齐旧版)
    await get().patchTask({ id, priority, quadrant_override: 0 });
  },

  setDue: async (id, due) => {
    await get().patchTask({ id, due_date: due, quadrant_override: 0 });
  },

  toggleReminder: async (task, intervalMinutes) => {
    await get().patchTask({
      id: task.id,
      reminder_enabled: !task.reminder_enabled,
      reminder_interval_minutes: intervalMinutes ?? task.reminder_interval_minutes,
      last_reminded_at: nowText(),
    });
  },

  toggleCollapse: async (task) => {
    await get().patchTask({ id: task.id, is_collapsed: !task.is_collapsed });
  },

  indentTask: async (task) => {
    if (task.indent_level >= 6) return;
    const s = get();
    // 在自定义顺序里向上找同级任务作为新父级
    const flat = sortTree(
      s.tasks.filter((t) => !t.is_completed),
      "custom",
    );
    const idx = flat.findIndex((t) => t.id === task.id);
    let parent: Task | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (flat[i].indent_level === task.indent_level) {
        parent = flat[i];
        break;
      }
      if (flat[i].indent_level < task.indent_level) break;
    }
    if (!parent) return;
    await s.patchTask({ id: task.id, parent_id: parent.id, indent_level: task.indent_level + 1 });
    // 子孙层级同步 +1
    for (const cid of descendantIds(s.tasks, task.id)) {
      const c = get().tasks.find((t) => t.id === cid);
      if (c) await get().patchTask({ id: cid, indent_level: c.indent_level + 1 });
    }
  },

  outdentTask: async (task) => {
    if (!task.parent_id) return;
    const s = get();
    const parent = s.tasks.find((t) => t.id === task.parent_id);
    await s.patchTask({
      id: task.id,
      parent_id: parent?.parent_id ?? "",
      indent_level: Math.max(0, task.indent_level - 1),
    });
    for (const cid of descendantIds(s.tasks, task.id)) {
      const c = get().tasks.find((t) => t.id === cid);
      if (c) await get().patchTask({ id: cid, indent_level: Math.max(0, c.indent_level - 1) });
    }
  },

  reorderTasks: async (ids) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    set((s) => ({
      tasks: [...s.tasks]
        .map((t) => ({ ...t, order_index: pos.get(t.id) ?? t.order_index }))
        .sort((a, b) => a.order_index - b.order_index),
    }));
    await ipc.reorderTasks(ids);
  },

  addGroup: async (name) => {
    const group = await ipc.createGroup(name);
    set((s) => ({ groups: [...s.groups, group] }));
  },

  renameGroup: async (id, name) => {
    const next = await ipc.updateGroup({ id, name });
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? next : g)) }));
  },

  removeGroup: async (id) => {
    await ipc.deleteGroup(id);
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
      // 后端外键已把任务置为无标签,本地同步
      tasks: s.tasks.map((t) => (t.group_id === id ? { ...t, group_id: null } : t)),
      view: s.view.kind === "group" && s.view.groupId === id ? { kind: "all" } : s.view,
    }));
  },

  reorderGroups: async (ids) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    set((s) => ({
      groups: [...s.groups].sort(
        (a, b) => (pos.get(a.id) ?? a.order_index) - (pos.get(b.id) ?? b.order_index),
      ),
    }));
    await ipc.reorderGroups(ids);
  },
}));

/**
 * 当前视图下可见的任务(树形展平,折叠已隐藏)。
 * 标签视图按「根任务的标签」过滤,子任务始终跟随父任务显示。
 */
export function selectVisibleTasks(
  s: Pick<AppState, "tasks" | "view" | "sortMode">,
): Task[] {
  if (s.view.kind === "completed") {
    return s.tasks
      .filter((t) => t.is_completed)
      .sort((a, b) => a.order_index - b.order_index);
  }

  const uncompleted = s.tasks.filter((t) => !t.is_completed);
  const flat = sortTree(uncompleted, s.sortMode);
  if (s.view.kind !== "group") return flat;

  const groupId = s.view.groupId;
  const byId = new Map(uncompleted.map((t) => [t.id, t]));
  const rootOf = (t: Task): Task => {
    let cur = t;
    while (cur.parent_id) {
      const p = byId.get(cur.parent_id);
      if (!p) break;
      cur = p;
    }
    return cur;
  };
  return flat.filter((t) => rootOf(t).group_id === groupId);
}
