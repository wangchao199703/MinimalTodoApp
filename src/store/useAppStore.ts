import { create } from "zustand";
import { ipc, type Group, type Task } from "../lib/tauri-ipc";

/** 视图分发:取代路由。内置视图 + 任意标签视图,可枚举即不需要 Router */
export type View =
  | { kind: "all" }
  | { kind: "completed" }
  | { kind: "group"; groupId: string };

export type ThemeName = "Light" | "Dark";

interface AppState {
  loaded: boolean;
  tasks: Task[];
  groups: Group[];
  settings: Record<string, string>;
  view: View;
  theme: ThemeName;

  init: () => Promise<void>;
  setView: (v: View) => void;
  setTheme: (t: ThemeName) => Promise<void>;

  addTask: (title: string) => Promise<void>;
  toggleComplete: (task: Task) => Promise<void>;
  renameTask: (id: string, title: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  /** ids 为新的全局任务顺序(order_index 重排) */
  reorderTasks: (ids: string[]) => Promise<void>;

  addGroup: (name: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  reorderGroups: (ids: string[]) => Promise<void>;
}

function applyThemeToDom(theme: ThemeName) {
  document.documentElement.dataset.theme = theme.toLowerCase();
}

/** 用返回的任务对象替换本地副本 */
function replaceTask(tasks: Task[], next: Task): Task[] {
  return tasks.map((t) => (t.id === next.id ? next : t));
}

export const useAppStore = create<AppState>((set, get) => ({
  loaded: false,
  tasks: [],
  groups: [],
  settings: {},
  view: { kind: "all" },
  theme: "Light",

  init: async () => {
    const [tasks, groups, settings] = await Promise.all([
      ipc.getTasks(),
      ipc.getGroups(),
      ipc.getSettings(),
    ]);
    const theme: ThemeName = settings["theme"] === "Dark" ? "Dark" : "Light";
    applyThemeToDom(theme);

    // 恢复上次选中的视图(被删除的标签则回退到全部)
    let view: View = { kind: "all" };
    const savedGroup = settings["selected_group_id"];
    if (savedGroup === "completed") view = { kind: "completed" };
    else if (savedGroup && groups.some((g) => g.id === savedGroup))
      view = { kind: "group", groupId: savedGroup };

    set({ tasks, groups, settings, theme, view, loaded: true });
  },

  setView: (view) => {
    set({ view });
    const key =
      view.kind === "group" ? view.groupId : view.kind === "completed" ? "completed" : "";
    void ipc.setSetting("selected_group_id", key);
  },

  setTheme: async (theme) => {
    applyThemeToDom(theme);
    set({ theme });
    await ipc.setSetting("theme", theme);
  },

  addTask: async (title) => {
    const { view } = get();
    const group_id = view.kind === "group" ? view.groupId : undefined;
    const task = await ipc.createTask({ title, group_id });
    // 新任务排在最前(order_index 为全局最小)
    set((s) => ({ tasks: [task, ...s.tasks] }));
  },

  toggleComplete: async (task) => {
    const next = await ipc.updateTask({
      id: task.id,
      is_completed: !task.is_completed,
      original_group_id: !task.is_completed ? (task.group_id ?? "") : undefined,
    });
    set((s) => ({ tasks: replaceTask(s.tasks, next) }));
  },

  renameTask: async (id, title) => {
    const next = await ipc.updateTask({ id, title });
    set((s) => ({ tasks: replaceTask(s.tasks, next) }));
  },

  removeTask: async (id) => {
    await ipc.deleteTask(id);
    // 后端按外键级联删除子孙,本地同步移除整族
    set((s) => {
      const doomed = new Set<string>([id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const t of s.tasks) {
          if (t.parent_id && doomed.has(t.parent_id) && !doomed.has(t.id)) {
            doomed.add(t.id);
            grew = true;
          }
        }
      }
      return { tasks: s.tasks.filter((t) => !doomed.has(t.id)) };
    });
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

/** 当前视图下可见的任务(已按 order_index 排序,置顶逻辑 M2 接入) */
export function selectVisibleTasks(s: Pick<AppState, "tasks" | "view">): Task[] {
  switch (s.view.kind) {
    case "all":
      return s.tasks.filter((t) => !t.is_completed);
    case "completed":
      return s.tasks.filter((t) => t.is_completed);
    case "group": {
      const id = s.view.groupId;
      return s.tasks.filter((t) => !t.is_completed && t.group_id === id);
    }
  }
}
