import { create } from "zustand";
import {
  ipc,
  type ClipItem,
  type ClipTag,
  type Group,
  type Note,
  type NoteGroup,
  type Task,
  type UpdateGroupRequest,
  type UpdateNoteRequest,
  type UpdateTaskRequest,
} from "../lib/tauri-ipc";
import { sortTree, descendantIds, type SortMode } from "../lib/sort";
import { deriveTitle } from "../lib/markdown";
import { nowText } from "../lib/date";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/env";
import { preloadImages } from "../lib/backend/objectUrl";
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
import { setLang, t, type Lang } from "../lib/i18n";
import { applyFontSettings } from "../lib/font";
import { ensureGroupIconDir } from "../components/ui/TagIcon";

/** 视图分发:取代路由。内置视图 + 任意标签视图,可枚举即不需要 Router */
export type View =
  | { kind: "all" }
  | { kind: "completed" }
  | { kind: "quadrant" }
  | { kind: "tagboard" }
  | { kind: "notes" }
  | { kind: "clipboard" }
  | { kind: "group"; groupId: string };

export interface Toast {
  id: number;
  message: string;
}

/** 底部「撤回」Toast(单槽、覆盖更新):删除/完成立刻生效,5 秒内可点撤回 */
export interface UndoToast {
  id: number;
  message: string;
  onUndo: () => void;
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
  undoToast: UndoToast | null;
  notes: Note[];
  noteGroups: NoteGroup[];
  selectedNoteId: string | null;
  /** 回收站:已软删除便签(进入回收站时按需拉取) */
  deletedNotes: Note[];
  /** 便签编辑区是否在显示回收站 */
  notesTrashOpen: boolean;
  /** 剪贴板记录(后台监听写入,init 拉取 + clip-added 事件追加) */
  clips: ClipItem[];
  /** 剪贴板标签 */
  clipTags: ClipTag[];
  /** 剪贴板第二侧栏当前选中的标签过滤(null = 全部) */
  clipFilterTagId: number | null;
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
  /** 从拖入的 .md 文件批量导入便签:标题=文件名(去扩展名),正文=Markdown 文本;可指定目标分组,导入后选中最后一条 */
  importNotesFromFiles: (
    files: { name: string; content: string }[],
    groupId?: string,
  ) => Promise<void>;
  /** 在任意界面拖入 .md:归入「导入」便签分组(没有则创建),并切到便签视图打开 */
  importNotesToImportGroup: (files: { name: string; content: string }[]) => Promise<void>;
  patchNote: (req: UpdateNoteRequest) => Promise<void>;
  removeNote: (id: string) => Promise<void>;
  /** 回收站:打开/关闭(打开时拉取已删便签),恢复,彻底删除,清空 */
  setNotesTrashOpen: (open: boolean) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  purgeNote: (id: string) => Promise<void>;
  emptyNoteTrash: () => Promise<void>;
  /** 清空某便签分组下的所有便签 */
  clearNoteGroupNotes: (groupId: string) => Promise<void>;
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
  /** 底部撤回 Toast:动作已生效后调用,关「撤回提示」开关时不弹;覆盖更新(只留最后一次) */
  showUndoToast: (message: string, onUndo: () => void) => void;
  dismissUndoToast: () => void;
  runUndo: () => void;

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
  ) => Promise<Task | undefined>;
  /** 四象限内新建待办:建顶层待办并钉到指定象限(1~4),乐观直接落该象限不闪 Q4 */
  addTaskToQuadrant: (title: string, quadrant: number) => Promise<void>;
  patchTask: (req: UpdateTaskRequest) => Promise<void>;
  toggleComplete: (task: Task) => Promise<void>;
  renameTask: (id: string, title: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  /** 清空某标签(分组)下的所有待办 */
  clearGroupTasks: (groupId: string) => Promise<void>;
  togglePin: (task: Task) => Promise<void>;
  setPriority: (id: string, priority: number) => Promise<void>;
  setDue: (id: string, due: string) => Promise<void>;
  toggleReminder: (task: Task, intervalMinutes?: number) => Promise<void>;
  toggleCollapse: (task: Task) => Promise<void>;
  indentTask: (task: Task) => Promise<void>;
  outdentTask: (task: Task) => Promise<void>;
  /** ids 为新的全局任务顺序(order_index 重排) */
  reorderTasks: (ids: string[]) => Promise<void>;
  /** 拖拽移动:把 source 放到 target 的上/下边,并让其层级=落点「下面那条」待办(支持改父级,连带子树) */
  moveTask: (sourceId: string, targetId: string, edge: "top" | "bottom") => Promise<void>;
  /** 清空全部已完成任务(对齐旧版「清空已完成」) */
  clearCompleted: () => Promise<void>;

  addGroup: (name: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  patchGroup: (req: UpdateGroupRequest) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  reorderGroups: (ids: string[]) => Promise<void>;

  // ---- 剪贴板 ----
  setClipFilterTag: (tagId: number | null) => void;
  removeClip: (id: number) => Promise<void>;
  /** 撤回剪贴项软删除:置回 is_deleted=0 并回填列表 */
  restoreClip: (id: number) => Promise<void>;
  /** 清空某剪切板标签下的所有剪贴项 */
  clearClipTagItems: (tagId: number) => Promise<void>;
  /** 清空「默认」分组(未归入任何分组)的所有剪贴项 */
  clearUngroupedClips: () => Promise<void>;
  toggleClipPin: (clip: ClipItem) => Promise<void>;
  addClipTag: (name: string) => Promise<void>;
  renameClipTag: (id: number, name: string) => Promise<void>;
  setClipTagColor: (id: number, color: string) => Promise<void>;
  removeClipTag: (id: number) => Promise<void>;
  /** 单标签语义:给剪贴项设标签(再次点同标签=取消,点别的标签=替换);tagId 传 null 清空 */
  setClipItemTag: (clipId: number, tagId: number | null) => Promise<void>;
  /** 把剪贴项内容写回系统剪贴板(右键复制) */
  copyClip: (clip: ClipItem) => Promise<void>;
  /** 剪贴项「加入待办」:建待办并打「剪切板」标签(分组没有则创建) */
  clipToTask: (clip: ClipItem) => Promise<void>;
  /** 剪贴项「加入便签」:建便签放「剪切板」便签分组(没有则创建) */
  clipToNote: (clip: ClipItem) => Promise<void>;
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
// 撤回 Toast 的自动消失计时器(模块级,覆盖更新时先清旧的)
let undoTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  tasks: [],
  groups: [],
  settings: {},
  view: { kind: "all" },
  theme: "light-classic",
  design: "apple",
  customDesigns: [],
  priorityStyle: "notion",
  language: "zh-CN",
  sortMode: "custom",
  toasts: [],
  undoToast: null,
  notes: [],
  noteGroups: [],
  selectedNoteId: null,
  deletedNotes: [],
  notesTrashOpen: false,
  clips: [],
  clipTags: [],
  clipFilterTagId: null,
  scheduleOpen: false,
  lockedTaskWidth: 420,

  init: async () => {
    const [tasks, groups, settings, notes, noteGroups, clips, clipTags] = await Promise.all([
      ipc.getTasks(),
      ipc.getGroups(),
      ipc.getSettings(),
      ipc.getNotes(),
      ipc.getNoteGroups(),
      ipc.getClips(),
      ipc.getClipTags(),
      // 预取分组自定义图标目录,确保侧栏首帧能解析 groupicon:// 图片
      ensureGroupIconDir(),
    ]);

    // Web 版:把 IndexedDB 里的便签插图/分组图标 Blob 预热成 objectURL(同步渲染可命中)
    if (!isTauri) await preloadImages();

    // 后台监听到的新剪贴项:实时插到列表最前(模块层注册一次,避免 StrictMode/HMR 重复)
    setupClipboardListener();

    const language: Lang = settings["language"] === "en" ? "en" : "zh-CN";
    setLang(language);

    // 旧版主题键(102 套时代)自动迁移到六主题
    const theme = migrateThemeKey(settings["theme"]);
    if (settings["theme"] !== theme) void ipc.setSetting("theme", theme);
    applyTheme(theme);
    // 内置键经 migrateDesign 归一(默认/已删旧键 → 经典 apple);custom:<id> 原样保留
    const rawDesign = settings["design"] || "apple";
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
    // 开机自启:默认开启;每次启动(重新)注册指向当前 exe —— 升级换新 exe 后自动更新关联文件。
    // 除非用户手动关闭过(autostart_disabled="1")才不再自动开。
    if (settings["autostart_disabled"] !== "1") void ipc.setAutostart(true).catch(() => {});

    const validSort: SortMode[] = ["custom", "due", "priority", "completed", "created", "title"];
    const sortMode = validSort.includes(settings["sort"] as SortMode)
      ? (settings["sort"] as SortMode)
      : "custom";

    // 恢复上次选中的视图(标签第二侧栏/具体标签已移除,具体标签回退到全部,标签看板保留)
    let view: View = { kind: "all" };
    const saved = settings["selected_group_id"];
    if (
      saved === "completed" ||
      saved === "quadrant" ||
      saved === "tagboard" ||
      saved === "notes" ||
      saved === "clipboard"
    )
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
      clips,
      clipTags,
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
    void ipc.setAutostart(true).catch(() => {}); // 自启存于系统,复位为默认(开)
    // 桌面:广播给所有窗口(含自身)各自重载;Web 单窗口直接重新 init 套用默认
    if (isTauri) void emit("settings-reset");
    else await useAppStore.getState().init();
  },

  // 选中便签即退出回收站视图(回收站现为侧栏分组项,点便签应回到编辑区)
  selectNote: (selectedNoteId) => set({ selectedNoteId, notesTrashOpen: false }),

  addNote: async (groupId) => {
    const note = await ipc.createNote(groupId);
    // 未指定分组时后端落到默认分组(可能自动新建「收集箱」),同步分组列表
    const noteGroups = groupId ? get().noteGroups : await ipc.getNoteGroups();
    set((s) => ({ notes: [note, ...s.notes], noteGroups, selectedNoteId: note.id }));
  },

  importNotesFromFiles: async (files, groupId) => {
    if (files.length === 0) return;
    // 逐个:先建空便签(后端可能自动建「收集箱」分组),再回填文件名标题 + Markdown 正文
    let lastId: string | null = null;
    const created: Note[] = [];
    for (const f of files) {
      const blank = await ipc.createNote(groupId);
      const next = await ipc.updateNote({
        id: blank.id,
        content: f.content,
        title: deriveTitle(f.content),
        custom_title: f.name, // 文件名(已去扩展名),作为用户标题
      });
      created.push(next);
      lastId = next.id;
    }
    // 未指定分组时后端可能新建默认分组,同步分组列表;否则沿用现有
    const noteGroups = groupId ? get().noteGroups : await ipc.getNoteGroups();
    const createdIds = new Set(created.map((n) => n.id));
    set((s) => ({
      // 新便签置顶(create_note 默认排在最前),过滤掉占位再插入回填后的版本
      notes: [...created, ...s.notes.filter((n) => !createdIds.has(n.id))],
      noteGroups,
      selectedNoteId: lastId, // 多份打开最后一条
    }));
  },

  importNotesToImportGroup: async (files) => {
    if (files.length === 0) return;
    const s = get();
    // 找现有「导入/Import」分组(兼容中英),没有则按当前语言新建
    let group =
      s.noteGroups.find((g) => g.name.trim() === "导入" || g.name.trim() === "Import") ?? null;
    if (!group) {
      group = await ipc.createNoteGroup(get().language === "en" ? "Import" : "导入");
      set((st) => ({ noteGroups: [...st.noteGroups, group as NoteGroup] }));
    }
    await get().importNotesFromFiles(files, group.id);
    get().setView({ kind: "notes" }); // 切到便签视图,打开导入的便签(importNotesFromFiles 已选中)
  },

  patchNote: async (req) => {
    const next = await ipc.updateNote(req);
    set((s) => ({ notes: s.notes.map((n) => (n.id === next.id ? next : n)) }));
  },

  removeNote: async (id) => {
    // 软删除:从正常列表移除(后端标记进回收站,可恢复)
    await ipc.deleteNote(id);
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
    }));
  },

  setNotesTrashOpen: async (open) => {
    if (open) {
      const deletedNotes = await ipc.getDeletedNotes();
      set({ deletedNotes, notesTrashOpen: true });
    } else {
      set({ notesTrashOpen: false });
    }
  },

  restoreNote: async (id) => {
    const restored = await ipc.restoreNote(id);
    // 从回收站移除 + 放回正常列表(置顶,与新建一致)
    set((s) => ({
      deletedNotes: s.deletedNotes.filter((n) => n.id !== id),
      notes: [restored, ...s.notes.filter((n) => n.id !== id)],
    }));
  },

  purgeNote: async (id) => {
    await ipc.purgeNote(id);
    set((s) => ({ deletedNotes: s.deletedNotes.filter((n) => n.id !== id) }));
  },

  emptyNoteTrash: async () => {
    await ipc.emptyNoteTrash();
    set({ deletedNotes: [] });
  },

  clearGroupTasks: async (groupId) => {
    // 清空某标签(分组)下的所有待办:逐个删(父删级联子,子已删则忽略),完成后重拉对齐状态
    const ids = get().tasks.filter((t) => t.group_id === groupId).map((t) => t.id);
    for (const id of ids) {
      try {
        await ipc.deleteTask(id);
      } catch {
        /* 已被父级级联删除,忽略 */
      }
    }
    set({ tasks: await ipc.getTasks() });
  },

  clearNoteGroupNotes: async (groupId) => {
    // 清空某便签分组下的所有便签
    const ids = get().notes.filter((n) => n.group_id === groupId).map((n) => n.id);
    for (const id of ids) {
      try {
        await ipc.deleteNote(id);
      } catch {
        /* 忽略 */
      }
    }
    set((s) => ({
      notes: s.notes.filter((n) => n.group_id !== groupId),
      selectedNoteId: ids.includes(s.selectedNoteId ?? "") ? null : s.selectedNoteId,
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
    // 广播给其他窗口(主窗口 ↔ 独立设置窗口)实时同步;Web 单窗口无需
    if (isTauri) void emit("settings-changed", { key, value });
  },

  pushToast: (message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => get().dismissToast(id), 6000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  showUndoToast: (message, onUndo) => {
    // 开关关闭则不弹(动作已生效:便签进回收站、剪贴项软删、待办已完成)
    if (get().settings["undo_toast_enabled"] === "0") return;
    if (undoTimer) clearTimeout(undoTimer);
    const id = ++toastSeq;
    set({ undoToast: { id, message, onUndo } });
    undoTimer = setTimeout(() => get().dismissUndoToast(), 5000);
  },

  dismissUndoToast: () => {
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = null;
    set({ undoToast: null });
  },

  runUndo: () => {
    const u = get().undoToast;
    if (!u) return;
    get().dismissUndoToast();
    u.onUndo();
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
    return task;
  },

  addTaskToQuadrant: async (title, quadrant) => {
    // createTask 无 quadrant 字段:先建顶层待办,乐观插入时即带 quadrant_override(直接落目标象限,不闪 Q4),再异步持久化覆盖
    const task = await ipc.createTask({ title });
    set((s) => ({ tasks: [{ ...task, quadrant_override: quadrant }, ...s.tasks] }));
    void ipc.updateTask({ id: task.id, quadrant_override: quadrant });
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

  moveTask: async (sourceId, targetId, edge) => {
    const s = get();
    if (sourceId === targetId) return;
    const byId = new Map(s.tasks.map((t) => [t.id, t]));
    const source = byId.get(sourceId);
    if (!source) return;
    // 被拖任务带整棵子树;不能落到自己的子孙上(否则成环)
    const descSet = new Set(descendantIds(s.tasks, sourceId));
    if (descSet.has(targetId)) return;

    // 1) 用可见渲染顺序定位「落点下面那条」待办,决定新层级/父级
    const visible = selectVisibleTasks({ tasks: s.tasks, view: s.view, sortMode: s.sortMode });
    const visRest = visible.filter((t) => t.id !== sourceId && !descSet.has(t.id));
    const tIdx = visRest.findIndex((t) => t.id === targetId);
    if (tIdx === -1) return;
    const insertAt = edge === "bottom" ? tIdx + 1 : tIdx;
    const below = visRest[insertAt] ?? null; // 下面那条;落到末尾则无 → 顶层
    const newParentId = below ? below.parent_id : null;
    const newLevel = below ? below.indent_level : 0;
    const delta = newLevel - source.indent_level;

    // 2) 全局顺序里把 source「子树块」整体移到 below 之前(无 below 则移到末尾)
    const flat = [...s.tasks].sort((a, b) => a.order_index - b.order_index);
    // 块 = source 在前,子孙按现有顺序在后(不依赖 order_index 是否严格 DFS 连续)
    const block = [sourceId, ...flat.filter((t) => descSet.has(t.id)).map((t) => t.id)];
    const blockSet = new Set(block);
    const rest = flat.filter((t) => !blockSet.has(t.id)).map((t) => t.id);
    let pos = below ? rest.indexOf(below.id) : rest.length;
    if (pos === -1) pos = rest.length;
    const newIds = [...rest.slice(0, pos), ...block, ...rest.slice(pos)];

    // 3) 落库:先改 source(及子孙)的层级/父级,再整体重排 order_index
    await s.patchTask({
      id: sourceId,
      parent_id: newParentId ?? "",
      indent_level: newLevel,
    });
    if (delta !== 0) {
      for (const cid of descSet) {
        const c = get().tasks.find((t) => t.id === cid);
        if (c) {
          await get().patchTask({
            id: cid,
            indent_level: Math.max(0, Math.min(6, c.indent_level + delta)),
          });
        }
      }
    }
    await get().reorderTasks(newIds);
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

  // ---- 剪贴板 ----

  setClipFilterTag: (clipFilterTagId) => set({ clipFilterTagId }),

  removeClip: async (id) => {
    // 软删除:标记 is_deleted=1(乐观移出列表),撤回可恢复;启动落定真正清除
    await ipc.softDeleteClip(id);
    set((s) => ({ clips: s.clips.filter((c) => c.id !== id) }));
  },

  restoreClip: async (id) => {
    await ipc.restoreClip(id);
    // 重拉对齐顺序(置顶在前、按 id 倒序),量小最稳
    const clips = await ipc.getClips();
    set({ clips });
  },

  clearClipTagItems: async (tagId) => {
    // 清空某剪切板标签下的所有剪贴项
    const ids = get()
      .clips.filter((c) => c.tag_ids.includes(tagId))
      .map((c) => c.id);
    for (const id of ids) {
      try {
        await ipc.deleteClip(id);
      } catch {
        /* 忽略 */
      }
    }
    set((s) => ({ clips: s.clips.filter((c) => !c.tag_ids.includes(tagId)) }));
  },

  clearUngroupedClips: async () => {
    // 清空「默认」分组(无任何标签)的剪贴项
    const ids = get()
      .clips.filter((c) => c.tag_ids.length === 0)
      .map((c) => c.id);
    for (const id of ids) {
      try {
        await ipc.deleteClip(id);
      } catch {
        /* 忽略 */
      }
    }
    set((s) => ({ clips: s.clips.filter((c) => c.tag_ids.length > 0) }));
  },

  toggleClipPin: async (clip) => {
    const pinned = !clip.pinned;
    await ipc.pinClip(clip.id, pinned);
    // 置顶项排在最前(对齐后端 ORDER BY pinned DESC, id DESC)
    set((s) => {
      const next = s.clips.map((c) => (c.id === clip.id ? { ...c, pinned } : c));
      return {
        clips: [...next].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.id - a.id),
      };
    });
  },

  addClipTag: async (name) => {
    // 同名会被后端拒绝 → 客户端自动加序号:新分组 / 新分组2 / 新分组3 …
    const existing = new Set(get().clipTags.map((t) => t.name));
    let unique = name;
    let n = 2;
    while (existing.has(unique)) {
      unique = `${name}${n}`;
      n += 1;
    }
    const tag = await ipc.createClipTag(unique);
    set((s) => (s.clipTags.some((t) => t.id === tag.id) ? {} : { clipTags: [...s.clipTags, tag] }));
  },

  renameClipTag: async (id, name) => {
    await ipc.renameClipTag(id, name);
    set((s) => ({ clipTags: s.clipTags.map((t) => (t.id === id ? { ...t, name } : t)) }));
  },

  setClipTagColor: async (id, color) => {
    await ipc.setClipTagColor(id, color);
    set((s) => ({ clipTags: s.clipTags.map((t) => (t.id === id ? { ...t, color } : t)) }));
  },

  removeClipTag: async (id) => {
    await ipc.deleteClipTag(id);
    set((s) => ({
      clipTags: s.clipTags.filter((t) => t.id !== id),
      // 各剪贴项剔除该标签关联
      clips: s.clips.map((c) => ({ ...c, tag_ids: c.tag_ids.filter((tid) => tid !== id) })),
      clipFilterTagId: s.clipFilterTagId === id ? null : s.clipFilterTagId,
    }));
  },

  setClipItemTag: async (clipId, tagId) => {
    const clip = get().clips.find((c) => c.id === clipId);
    if (!clip) return;
    // 单标签:再点当前已选标签 = 取消;tagId 为 null 也按清空处理
    const next = tagId != null && !clip.tag_ids.includes(tagId) ? tagId : null;
    // 后端单标签命令:先清该剪贴项全部关联,再(可选)写一个。tag_id<=0 = 清空
    await ipc.setClipItemTag(clipId, next ?? 0);
    set((s) => ({
      clips: s.clips.map((c) =>
        c.id === clipId ? { ...c, tag_ids: next == null ? [] : [next] } : c,
      ),
    }));
  },

  copyClip: async (clip) => {
    await ipc.copyClip(clip.id);
    get().pushToast(t("S.X.ClipCopied"));
  },

  clipToTask: async (clip) => {
    // 图片项无文本:用占位标题(运行时极少触发,加入待办主要面向文本)
    const title = (clip.text ?? "").trim() || "[图片]";
    const s = get();
    // find-or-create「剪切板」待办标签(兼容中英),参照 importNotesToImportGroup
    let group =
      s.groups.find((g) => g.name.trim() === "剪切板" || g.name.trim() === "Clipboard") ?? null;
    if (!group) {
      group = await ipc.createGroup(s.language === "en" ? "Clipboard" : "剪切板");
      set((st) => ({ groups: [...st.groups, group as Group] }));
    }
    await get().addTask(title, { group_id: group.id });
    get().pushToast(t("S.X.ClipAddedToTask"));
  },

  clipToNote: async (clip) => {
    const s = get();
    // find-or-create「剪切板」便签分组(兼容中英)
    let group =
      s.noteGroups.find((g) => g.name.trim() === "剪切板" || g.name.trim() === "Clipboard") ?? null;
    if (!group) {
      group = await ipc.createNoteGroup(s.language === "en" ? "Clipboard" : "剪切板");
      set((st) => ({ noteGroups: [...st.noteGroups, group as NoteGroup] }));
    }
    // 图片项:正文用 Markdown 图片引用 asset 路径;文本项:正文=文本
    const content =
      clip.kind === "image" && clip.image_path
        ? `![](${clip.image_path})`
        : (clip.text ?? "");
    const blank = await ipc.createNote(group.id);
    const next = await ipc.updateNote({
      id: blank.id,
      content,
      title: deriveTitle(content),
    });
    set((st) => ({ notes: [next, ...st.notes] }));
    get().pushToast(t("S.X.ClipAddedToNote"));
  },
}));

/**
 * 跨窗口设置同步:在模块层(每个窗口的 JS 仅加载一次)注册一次 settings-changed 监听,
 * 不放进 React effect——避免 StrictMode/HMR/组件重挂导致监听丢失或重复,
 * 这是「设置窗口改了主窗口不实时刷新」的根因。主窗口与设置窗口都调用一次即可。
 */
/**
 * 后台剪贴板监听 → 前端实时插入。
 * 模块层注册一次(不放 React effect,避免 StrictMode/HMR 丢监听或重复插入)。
 * 只在主窗口生效:设置窗口不展示剪贴板,无需监听。
 */
let clipboardListenerSetup = false;
function setupClipboardListener(): void {
  if (!isTauri) return; // Web 无后台剪贴板监听(也没有 Tauri 窗口/事件)
  if (clipboardListenerSetup) return;
  if (getCurrentWindow().label === "settings") return;
  clipboardListenerSetup = true;
  void listen<ClipItem>("clip-added", (e) => {
    const clip = e.payload;
    useAppStore.setState((s) => {
      if (s.clips.some((c) => c.id === clip.id)) return {} as Partial<AppState>;
      // 新项插到「非置顶区」最前(置顶项始终在最上)
      const pinned = s.clips.filter((c) => c.pinned);
      const rest = s.clips.filter((c) => !c.pinned);
      return { clips: [...pinned, clip, ...rest] };
    });
  });
  // 去重「移到最前」:后台删掉历史里的重复行,前端同步移除对应行
  void listen<number>("clip-removed", (e) => {
    const id = e.payload;
    useAppStore.setState((s) => ({ clips: s.clips.filter((c) => c.id !== id) }));
  });
  // 过期批量清理后:重拉一次列表对齐(量小,直接整表刷新最稳)
  void listen("clips-purged", () => {
    void ipc.getClips().then((clips) => useAppStore.setState({ clips }));
  });
  // 独立编辑窗口保存后:同步该剪贴项文本到主窗口列表
  void listen<{ id: number; text: string }>("clip-updated", (e) => {
    const { id, text } = e.payload;
    useAppStore.setState((s) => ({
      clips: s.clips.map((c) => (c.id === id ? { ...c, text } : c)),
    }));
  });
}

let settingsSyncSetup = false;
export function setupSettingsSync(): void {
  if (!isTauri) return; // Web 单窗口,无跨窗口设置同步
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
