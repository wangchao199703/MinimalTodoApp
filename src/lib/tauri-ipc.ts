import { invoke } from "@tauri-apps/api/core";

// 字段名与 Rust serde 输出(snake_case)严格一致,不要做命名转换

export interface Task {
  id: string;
  title: string;
  is_completed: boolean;
  /** "YYYY-MM-DD HH:mm",空格分隔 */
  due_date: string | null;
  /** null = 无标签 */
  group_id: string | null;
  original_group_id: string | null;
  /** 1=低 2=中 3=高 */
  priority: number;
  order_index: number;
  indent_level: number;
  parent_id: string | null;
  is_collapsed: boolean;
  is_pinned: boolean;
  quadrant_override: number | null;
  reminder_enabled: boolean;
  reminder_interval_minutes: number;
  last_reminded_at: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  order_index: number;
  color: string;
  icon: string;
  icon_image: string;
  is_collapsed: boolean;
}

export interface CreateTaskRequest {
  title: string;
  group_id?: string;
  due_date?: string;
  priority?: number;
  parent_id?: string;
  indent_level?: number;
  reminder_enabled?: boolean;
  reminder_interval_minutes?: number;
}

/** 补丁更新:省略 = 不变;可清空字段传空串 "" = 清空 */
export interface UpdateTaskRequest {
  id: string;
  title?: string;
  is_completed?: boolean;
  due_date?: string;
  group_id?: string;
  original_group_id?: string;
  priority?: number;
  indent_level?: number;
  parent_id?: string;
  is_collapsed?: boolean;
  is_pinned?: boolean;
  /** 0 = 清除手动覆盖 */
  quadrant_override?: number;
  reminder_enabled?: boolean;
  reminder_interval_minutes?: number;
  last_reminded_at?: string;
}

export interface UpdateGroupRequest {
  id: string;
  name?: string;
  color?: string;
  icon?: string;
  icon_image?: string;
  is_collapsed?: boolean;
}

export interface Note {
  id: string;
  /** 从正文派生的标题 */
  title: string;
  /** 用户手动命名(优先于派生标题) */
  custom_title: string;
  /** Markdown 正文 */
  content: string;
  /** null = 收集箱 */
  group_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface NoteGroup {
  id: string;
  name: string;
  order_index: number;
  is_collapsed: boolean;
}

export interface UpdateNoteRequest {
  id: string;
  title?: string;
  custom_title?: string;
  content?: string;
  /** "" = 移回收集箱 */
  group_id?: string;
}

export const ipc = {
  getGroups: () => invoke<Group[]>("get_groups"),
  createGroup: (name: string) => invoke<Group>("create_group", { name }),
  updateGroup: (req: UpdateGroupRequest) => invoke<Group>("update_group", { req }),
  deleteGroup: (id: string) => invoke<void>("delete_group", { id }),
  reorderGroups: (ids: string[]) => invoke<void>("reorder_groups", { ids }),

  getTasks: () => invoke<Task[]>("get_tasks"),
  createTask: (req: CreateTaskRequest) => invoke<Task>("create_task", { req }),
  updateTask: (req: UpdateTaskRequest) => invoke<Task>("update_task", { req }),
  deleteTask: (id: string) => invoke<void>("delete_task", { id }),
  reorderTasks: (ids: string[]) => invoke<void>("reorder_tasks", { ids }),

  getSettings: () => invoke<Record<string, string>>("get_settings"),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),

  getNotes: () => invoke<Note[]>("get_notes"),
  createNote: (groupId?: string) => invoke<Note>("create_note", { group_id: groupId }),
  updateNote: (req: UpdateNoteRequest) => invoke<Note>("update_note", { req }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),
  reorderNotes: (ids: string[]) => invoke<void>("reorder_notes", { ids }),
  getNoteGroups: () => invoke<NoteGroup[]>("get_note_groups"),
  createNoteGroup: (name: string) => invoke<NoteGroup>("create_note_group", { name }),
  updateNoteGroup: (id: string, fields: { name?: string; is_collapsed?: boolean }) =>
    invoke<NoteGroup>("update_note_group", { id, ...fields }),
  deleteNoteGroup: (id: string) => invoke<void>("delete_note_group", { id }),

  setAcrylic: (enabled: boolean, dark: boolean) =>
    invoke<void>("set_acrylic", { enabled, dark }),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  getAutostart: () => invoke<boolean>("get_autostart"),
};
