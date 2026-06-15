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

/** 剪贴板记录(字段与 Rust serde 输出 snake_case 一致) */
export interface ClipItem {
  id: number;
  /** "text" | "image" */
  kind: "text" | "image";
  text: string | null;
  /** 图片绝对路径(asset 协议读原图用) */
  image_path: string | null;
  /** data:image/png;base64,... 内嵌缩略图(列表始终可渲染) */
  thumbnail_b64: string | null;
  hash: string;
  /** 毫秒时间戳 */
  created_at: number;
  pinned: boolean;
  /** 关联的剪贴板标签 id */
  tag_ids: number[];
}

/** 剪贴板标签(独立于待办标签) */
export interface ClipTag {
  id: number;
  name: string;
  color: string;
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

  /** 导出文本到桌面,返回完整路径 */
  exportFile: (fileName: string, content: string) =>
    invoke<string>("export_file", { file_name: fileName, content }),

  /** 把剪贴项图片(库内 PNG 绝对路径)复制到桌面,返回完整路径 */
  saveClipImage: (srcPath: string, fileName: string) =>
    invoke<string>("save_clip_image", { src_path: srcPath, file_name: fileName }),

  /** 便签图片:原始字节走 IPC,扩展名放 header;返回仓库内文件名 */
  saveNoteImage: (bytes: Uint8Array, ext: string) =>
    invoke<string>("save_note_image", bytes, { headers: { "x-ext": ext } }),
  noteImageDir: () => invoke<string>("note_image_dir"),

  /** 分组自定义图标:原始字节走 IPC,扩展名放 header;返回仓库内文件名 */
  saveGroupIcon: (bytes: Uint8Array, ext: string) =>
    invoke<string>("save_group_icon", bytes, { headers: { "x-ext": ext } }),
  groupIconDir: () => invoke<string>("group_icon_dir"),
  listGroupIcons: () => invoke<string[]>("list_group_icons"),

  setAcrylic: (enabled: boolean, dark: boolean) =>
    invoke<void>("set_acrylic", { enabled, dark }),
  setAutostart: (enabled: boolean) => invoke<void>("set_autostart", { enabled }),
  getAutostart: () => invoke<boolean>("get_autostart"),
  /** 切语言后即时重建托盘菜单 */
  rebuildTray: (en: boolean) => invoke<void>("rebuild_tray", { en }),
  /** 改了快捷键设置后,按最新设置重新注册全局快捷键 */
  updateHotkeys: () => invoke<void>("update_hotkeys"),
  /** 录制快捷键期间暂停全局热键(否则会被系统吞掉,录不到) */
  pauseHotkeys: () => invoke<void>("pause_hotkeys"),
  /** 打开/聚焦独立的设置窗口(可拖出主窗口) */
  openSettingsWindow: () => invoke<void>("open_settings_window"),
  /** 恢复默认设置(保留语言) */
  resetSettings: () => invoke<void>("reset_settings"),

  // ---- 数据存储位置 ----
  /** 当前数据根目录(绝对路径) */
  getDataDir: () => invoke<string>("get_data_dir"),
  /** 把全部数据迁到 newDir(copy→校验→切换指针→标记旧根待清理),返回是否需重启 */
  migrateDataDir: (newDir: string) => invoke<boolean>("migrate_data_dir", { new_dir: newDir }),
  /** 原地重启 app(迁移后让库在新位置重新打开) */
  restartApp: () => invoke<void>("restart_app"),

  // ---- 剪贴板 ----
  getClips: () => invoke<ClipItem[]>("get_clips"),
  deleteClip: (id: number) => invoke<void>("delete_clip", { id }),
  pinClip: (id: number, pinned: boolean) => invoke<void>("pin_clip", { id, pinned }),
  getClipTags: () => invoke<ClipTag[]>("get_clip_tags"),
  createClipTag: (name: string) => invoke<ClipTag>("create_clip_tag", { name }),
  renameClipTag: (id: number, name: string) => invoke<void>("rename_clip_tag", { id, name }),
  setClipTagColor: (id: number, color: string) =>
    invoke<void>("set_clip_tag_color", { id, color }),
  deleteClipTag: (id: number) => invoke<void>("delete_clip_tag", { id }),
  addClipTag: (clipId: number, tagId: number) =>
    invoke<void>("add_clip_tag", { clip_id: clipId, tag_id: tagId }),
  removeClipTag: (clipId: number, tagId: number) =>
    invoke<void>("remove_clip_tag", { clip_id: clipId, tag_id: tagId }),
  /** 单标签语义:替换该剪贴项的标签(tagId<=0 清空) */
  setClipItemTag: (clipId: number, tagId: number) =>
    invoke<void>("set_clip_item_tag", { clip_id: clipId, tag_id: tagId }),
  /** 编辑剪贴项文本(独立编辑窗手动保存) */
  updateClipText: (clipId: number, text: string) =>
    invoke<void>("update_clip_text", { clip_id: clipId, text }),
  /** 把剪贴项内容写回系统剪贴板(右键复制) */
  copyClip: (clipId: number) => invoke<void>("copy_clip", { clip_id: clipId }),

  // ---- 剪贴项编辑窗口 ----
  /** 打开/聚焦独立的剪贴项编辑窗口,编辑指定剪贴项 */
  openClipEditorWindow: (clipId: number) =>
    invoke<void>("open_clip_editor_window", { clip_id: clipId }),
  /** 编辑窗口挂载后取走待编辑的剪贴项 id(并清空) */
  takeClipEditorTarget: () => invoke<number | null>("take_clip_editor_target"),
};
