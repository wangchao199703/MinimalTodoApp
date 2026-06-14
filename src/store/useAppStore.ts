import { create } from "zustand";
import {
  ipc,
  type Group,
  type Note,
  type NoteGroup,
  type Task,
  type UpdateGroupRequest,
  type UpdateNoteRequest,
  type UpdateTaskRequest,
} from "../lib/tauri-ipc";
import { sortTree, descendantIds, type SortMode } from "../lib/sort";
import { nowText } from "../lib/date";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  applyTheme,
  migrateThemeKey,
  migrateDesign,
  applyActiveDesign,
  parseCustomDesigns,
  applyPriorityStyle,
  migratePriorityStyle,
  type Theme,
  type CustomDesign,
  type PriorityStyle,
} from "../lib/themes";
import { setLang, type Lang } from "../lib/i18n";
import { applyFontSettings } from "../lib/font";
import { ensureGroupIconDir } from "../components/ui/TagIcon";

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
  /** 当前生效版式:内置键(如 "apple")或自定义 "custom:<id>" */
  design: string;
  customDesigns: CustomDesign[];
  priorityStyle: PriorityStyle;
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
  /** 独立设置窗口的轻量引导:只加载 settings + 套用主题/语言/字体 */
  initSettingsWindow: () => Promise<void>;
  /** 应用来自其他窗口的设置变更(不再持久化/广播,避免回环) */
  applyRemoteSetting: (key: string, value: string) => void;
  /** 恢复默认设置(保留语言);广播给所有窗口重载 */
  resetSettings: () => Promise<void>;
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
  /** 切换生效版式(内置键或 "custom:<id>") */
  setDesign: (value: string) => void;
  /** 编辑版式某维度(勾选框形状/大小/粗细 或 子任务进度):内置版式则派生新自定义版式,已是自定义则就地更新 */
  editCheckbox: (dim: "shape" | "size" | "width" | "progress", value: string) => void;
  /** 删除某自定义版式(若正生效则退回其基础版式) */
  deleteCustomDesign: (id: string) => void;
  setPriorityStyle: (key: PriorityStyle) => void;
  setLanguage: (lang: Lang) => void;
  setSortMode: (m: SortMode) => void;
  saveSetting: (key: string, value: string) => void;
  pushToast: (message: string) => void;
  dismissToast: (id: number) => void;

  addTask: (
    title: string,
    extra?: {
      due_date?: string;
      priority?: number;
      reminder_enabled?: boolean;
      reminder_interval_minutes?: number;
      /** 显式指定标签(新建栏标签选择器);省略时回退当前标签视图 */
      group_id?: string;
      /** 指定父待办则建为子待办:标签跟随父、缩进 = 父+1(对齐旧版 AddTask) */
      parent_id?: string;
    },
  ) => Promise<void>;
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
  /** 清空全部已完成任务(对齐旧版「清空已完成」) */
  clearCompleted: () => Promise<void>;

  addGroup: (name: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  patchGroup: (req: UpdateGroupRequest) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  reorderGroups: (ids: string[]) => Promise<void>;
}

function replaceTask(tasks: Task[], next: Task): Task[] {
  return tasks.map((t) => (t.id === next.id ? next : t));
}

/** 沿 parent_id 链找根任务(防环 16 层) */
function rootOfTask(byId: Map<string, Task>, t: Task): Task {
  let cur = t;
  let guard = 16;
  while (cur.parent_id && guard-- > 0) {
    const p = byId.get(cur.parent_id);
    if (!p) break;
    cur = p;
  }
  return cur;
}

let toastSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  tasks: [],
  groups: [],
  settings: {},
  view: { kind: "all" },
  theme: "light-classic",
  design: "linear",
  customDesigns: [],
  priorityStyle: "notion",
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
      // 预取分组自定义图标目录,确保侧栏首帧能解析 groupicon:// 图片
      ensureGroupIconDir(),
    ]);

    const language: Lang = settings["language"] === "en" ? "en" : "zh-CN";
    setLang(language);

    // 旧版主题键(102 套时代)自动迁移到六主题
    const theme = migrateThemeKey(settings["theme"]);
    if (settings["theme"] !== theme) void ipc.setSetting("theme", theme);
    applyTheme(theme);
    // 内置键经 migrateDesign 归一(已删的 classic → 默认 linear);custom:<id> 原样保留
    const rawDesign = settings["design"] || "linear";
    const design = rawDesign.startsWith("custom:") ? rawDesign : migrateDesign(rawDesign);
    const customDesigns = parseCustomDesigns(settings["custom_designs"]);
    applyActiveDesign(design, settings["custom_designs"]);
    const priorityStyle = migratePriorityStyle(settings["priority_style"]);
    applyPriorityStyle(priorityStyle);
    applyFontSettings(
      settings["font_family"] || "Microsoft YaHei UI",
      Number(settings["font_size"] || "14"),
      Number(settings["line_spacing"] || "1.1"),
    );

    const validSort: SortMode[] = ["custom", "due", "priority", "completed", "created", "title"];
    const sortMode = validSort.includes(settings["sort"] as SortMode)
      ? (settings["sort"] as SortMode)
      : "custom";

    // 恢复上次选中的视图(标签第二侧栏/具体标签已移除,具体标签回退到全部,标签看板保留)
    let view: View = { kind: "all" };
    const saved = settings["selected_group_id"];
    if (saved === "completed" || saved === "quadrant" || saved === "tagboard" || saved === "notes")
      view = { kind: saved };

    set({
      tasks,
      groups,
      settings,
      theme,
      design,
      customDesigns,
      priorityStyle,
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

  initSettingsWindow: async () => {
    const settings = await ipc.getSettings();
    const language: Lang = settings["language"] === "en" ? "en" : "zh-CN";
    setLang(language);
    const theme = migrateThemeKey(settings["theme"]);
    applyTheme(theme);
    const rawDesign = settings["design"] || "linear";
    const design = rawDesign.startsWith("custom:") ? rawDesign : migrateDesign(rawDesign);
    const customDesigns = parseCustomDesigns(settings["custom_designs"]);
    applyActiveDesign(design, settings["custom_designs"]);
    const priorityStyle = migratePriorityStyle(settings["priority_style"]);
    applyPriorityStyle(priorityStyle);
    applyFontSettings(
      settings["font_family"] || "Microsoft YaHei UI",
      Number(settings["font_size"] || "14"),
      Number(settings["line_spacing"] || "1.1"),
    );
    set({ settings, theme, design, customDesigns, priorityStyle, language, loaded: true });
  },

  applyRemoteSetting: (key, value) => {
    const cur = get();
    if (cur.settings[key] === value) return; // 与本地一致(含自身广播回环)→ 跳过
    const settings = { ...cur.settings, [key]: value };
    const patch: Partial<AppState> = { settings };
    if (key === "theme") {
      const th = migrateThemeKey(value);
      applyTheme(th);
      patch.theme = th;
    } else if (key === "design" || key === "custom_designs") {
      // 版式或自定义版式表变更:用合并后的设置重新解析并应用
      applyActiveDesign(settings["design"] || "linear", settings["custom_designs"]);
      patch.design = settings["design"] || "linear";
      patch.customDesigns = parseCustomDesigns(settings["custom_designs"]);
    } else if (key === "priority_style") {
      const ps = migratePriorityStyle(value);
      applyPriorityStyle(ps);
      patch.priorityStyle = ps;
    } else if (key === "language") {
      const lang: Lang = value === "en" ? "en" : "zh-CN";
      setLang(lang);
      patch.language = lang;
    } else if (key === "schedule_open") {
      patch.scheduleOpen = value === "1";
    }
    set(patch);
    if (key === "font_family" || key === "font_size" || key === "line_spacing") {
      applyFontSettings(
        settings["font_family"] || "Microsoft YaHei UI",
        Number(settings["font_size"] || "14"),
        Number(settings["line_spacing"] || "1.1"),
      );
    }
  },

  resetSettings: async () => {
    await ipc.resetSettings(); // 清空设置表(保留 language / imported_at)
    void ipc.setAutostart(false).catch(() => {}); // 自启存于系统,单独复位为默认(关)
    // 广播给所有窗口(含自身):各自重载,套用默认主题/字体/行距/侧栏等
    void emit("settings-reset");
  },

  selectNote: (selectedNoteId) => set({ selectedNoteId }),

  addNote: async (groupId) => {
    const note = await ipc.createNote(groupId);
    // 未指定分组时后端落到默认分组(可能自动新建「收集箱」),同步分组列表
    const noteGroups = groupId ? get().noteGroups : await ipc.getNoteGroups();
    set((s) => ({ notes: [note, ...s.notes], noteGroups, selectedNoteId: note.id }));
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
    // 后端把组内便签归入剩余的第一个分组(必要时自动新建「收集箱」),整体回灌
    const [notes, noteGroups] = await Promise.all([ipc.getNotes(), ipc.getNoteGroups()]);
    set({ notes, noteGroups });
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

  setDesign: (value) => {
    const customsRaw = get().settings["custom_designs"];
    applyActiveDesign(value, customsRaw);
    set({ design: value });
    get().saveSetting("design", value);
  },

  editCheckbox: (dim, value) => {
    const { design, customDesigns } = get();
    let nextDesign = design;
    let next: CustomDesign[];
    if (design.startsWith("custom:")) {
      // 已是自定义版式:就地更新该维度
      const id = design.slice(7);
      next = customDesigns.map((c) => (c.id === id ? { ...c, [dim]: value } : c));
    } else {
      // 当前是内置版式:派生一个新的自定义版式(每次都新建)
      const id = `d${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      const created: CustomDesign = {
        id,
        base: migrateDesign(design),
        shape: "",
        size: "",
        width: "",
        progress: "",
        [dim]: value,
      };
      next = [...customDesigns, created];
      nextDesign = `custom:${id}`;
    }
    set({ customDesigns: next, design: nextDesign });
    get().saveSetting("custom_designs", JSON.stringify(next));
    if (nextDesign !== design) get().saveSetting("design", nextDesign);
    applyActiveDesign(nextDesign, JSON.stringify(next));
  },

  deleteCustomDesign: (id) => {
    const { design, customDesigns } = get();
    const target = customDesigns.find((c) => c.id === id);
    const next = customDesigns.filter((c) => c.id !== id);
    // 若删的是当前生效版式,退回其基础版式
    const nextDesign = design === `custom:${id}` ? (target?.base ?? "linear") : design;
    set({ customDesigns: next, design: nextDesign });
    get().saveSetting("custom_designs", JSON.stringify(next));
    if (nextDesign !== design) get().saveSetting("design", nextDesign);
    applyActiveDesign(nextDesign, JSON.stringify(next));
  },

  setPriorityStyle: (key) => {
    applyPriorityStyle(key);
    set({ priorityStyle: key });
    get().saveSetting("priority_style", key);
  },

  setLanguage: (language) => {
    setLang(language);
    set({ language });
    get().saveSetting("language", language);
    // 托盘菜单随语言即时重建(对齐旧版)
    void ipc.rebuildTray(language === "en");
  },

  setSortMode: (sortMode) => {
    set({ sortMode });
    get().saveSetting("sort", sortMode);
  },

  saveSetting: (key, value) => {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    void ipc.setSetting(key, value);
    // 广播给其他窗口(主窗口 ↔ 独立设置窗口)实时同步
    void emit("settings-changed", { key, value });
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
    const { view, tasks } = get();
    const { group_id: tagId, parent_id, ...rest } = extra ?? {};
    // 标签:显式选择 > 当前标签视图(旧路径,标签看板全宽后已不触发)> 无
    let group_id = tagId ?? (view.kind === "group" ? view.groupId : undefined);
    let indent_level: number | undefined;
    if (parent_id) {
      // 建为子待办:跟随父的标签,缩进 = 父 + 1(封顶 6),对齐旧版 AddTask
      const parent = tasks.find((t) => t.id === parent_id);
      if (parent) {
        group_id = parent.group_id ?? undefined;
        indent_level = Math.min(parent.indent_level + 1, 6);
      }
    }
    const task = await ipc.createTask({ title, group_id, parent_id, indent_level, ...rest });
    // 新任务排在最前(order_index 为全局最小);子待办由 sortTree 按 parent_id 归位到父下
    set((s) => ({ tasks: [task, ...s.tasks] }));
  },

  patchTask: async (req) => {
    const next = await ipc.updateTask(req);
    set((s) => ({ tasks: replaceTask(s.tasks, next) }));
  },

  toggleComplete: async (task) => {
    // 取消完成 / 从已完成还原:自身 + 全部后代一起取消打钩
    // (整族一起完成,还原也整族一起还原;否则父还原后子任务仍是勾选态)
    if (task.is_completed) {
      let tasks = get().tasks;
      const ids = [task.id, ...descendantIds(tasks, task.id)];
      const setUndone = async (id: string) => {
        const t = tasks.find((x) => x.id === id);
        if (!t || !t.is_completed) return;
        const next = await ipc.updateTask({ id, is_completed: false });
        tasks = replaceTask(tasks, next);
      };
      for (const id of ids) await setUndone(id);
      set({ tasks });
      return;
    }

    // 完成:对齐旧版父子逻辑(MainViewModel.OnItemPropertyChanged)
    let tasks = get().tasks;
    const setDone = async (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t || t.is_completed) return;
      const done = await ipc.updateTask({
        id,
        is_completed: true,
        original_group_id: t.group_id ?? "",
      });
      tasks = replaceTask(tasks, done);
    };
    const completeWithDescendants = async (id: string) => {
      await setDone(id);
      for (const cid of descendantIds(tasks, id)) await setDone(cid);
    };

    const parent = task.parent_id ? tasks.find((x) => x.id === task.parent_id) : null;
    // 活子待办:有父且父未完成 —— 只打钩、不整族完成、不消失
    const isLiveChild = !!parent && !parent.is_completed;

    if (!isLiveChild) {
      // 顶层 / 父已完成:整族完成(随后因「根已完成」从未完成视图消失)
      await completeWithDescendants(task.id);
    } else {
      await setDone(task.id);
      // 向上传播:某父的所有直接子都完成 → 自动完成该父(逐级向上检查)
      let pid: string | null = task.parent_id ?? null;
      while (pid) {
        const cur = tasks.find((x) => x.id === pid);
        if (!cur || cur.is_completed) break;
        const kids = tasks.filter((x) => x.parent_id === pid);
        if (kids.length === 0 || !kids.every((k) => k.is_completed)) break;
        await setDone(pid);
        pid = cur.parent_id ?? null;
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

  clearCompleted: async () => {
    // 只清「根任务已完成」的整族(活子任务的单独打钩不算已完成视图项)
    const all = get().tasks;
    const byId = new Map(all.map((t) => [t.id, t]));
    const doomed = all.filter((t) => t.is_completed && rootOfTask(byId, t).is_completed);
    const doomedIds = new Set(doomed.map((t) => t.id));
    for (const t of doomed) await ipc.deleteTask(t.id);
    set((s) => ({ tasks: s.tasks.filter((t) => !doomedIds.has(t.id)) }));
  },

  addGroup: async (name) => {
    const group = await ipc.createGroup(name);
    set((s) => ({ groups: [...s.groups, group] }));
  },

  renameGroup: async (id, name) => {
    await get().patchGroup({ id, name });
  },

  patchGroup: async (req) => {
    const next = await ipc.updateGroup(req);
    set((s) => ({ groups: s.groups.map((g) => (g.id === req.id ? next : g)) }));
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
 * 跨窗口设置同步:在模块层(每个窗口的 JS 仅加载一次)注册一次 settings-changed 监听,
 * 不放进 React effect——避免 StrictMode/HMR/组件重挂导致监听丢失或重复,
 * 这是「设置窗口改了主窗口不实时刷新」的根因。主窗口与设置窗口都调用一次即可。
 */
let settingsSyncSetup = false;
export function setupSettingsSync(): void {
  if (settingsSyncSetup) return;
  settingsSyncSetup = true;
  void listen<{ key: string; value: string }>("settings-changed", (e) => {
    useAppStore.getState().applyRemoteSetting(e.payload.key, e.payload.value);
  });
  // 恢复默认后:每个窗口各自重载(主窗口全量 init,设置窗口轻量 init)
  void listen("settings-reset", () => {
    if (getCurrentWindow().label === "settings") {
      void useAppStore.getState().initSettingsWindow();
    } else {
      void useAppStore.getState().init();
    }
  });
}

/**
 * 当前视图下可见的任务(树形展平,折叠已隐藏)。
 * 标签视图按「根任务的标签」过滤,子任务始终跟随父任务显示。
 */
export function selectVisibleTasks(
  s: Pick<AppState, "tasks" | "view" | "sortMode">,
): Task[] {
  // 以「根任务是否完成」划分:整族未完成 → 未完成视图(含其下已完成的子任务,原地划线保留);
  // 整族已完成 → 已完成视图(对齐旧版 RootOf(i).IsCompleted 过滤)。
  const byId = new Map(s.tasks.map((t) => [t.id, t]));
  const rootDone = (t: Task) => rootOfTask(byId, t).is_completed;

  if (s.view.kind === "completed") {
    // 走 sortTree 构树 + 尊重折叠(否则已完成视图里展开/折叠子任务无效)
    const done = s.tasks.filter((t) => t.is_completed && rootDone(t));
    return sortTree(done, s.sortMode);
  }

  // 未完成视图:根未完成的任务(已完成的活子任务也在其中,TaskItem 按 is_completed 划线)
  const visible = s.tasks.filter((t) => !rootDone(t));
  const flat = sortTree(visible, s.sortMode);
  if (s.view.kind !== "group") return flat;

  const groupId = s.view.groupId;
  return flat.filter((t) => rootOfTask(byId, t).group_id === groupId);
}
