import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";
import { dexieBackend } from "./backend/dexie";

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

/** 截图冻结帧元数据:合成 PNG 路径 + 虚拟桌面物理矩形(x/y 可为负) */
export interface CaptureTarget {
  path: string;
  vx: number;
  vy: number;
  vw: number;
  vh: number;
}

/** 单个桌面贴图的图片元数据:PNG 路径 + 图像物理尺寸 */
export interface PinTarget {
  path: string;
  phys_w: number;
  phys_h: number;
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
  /** 软删除时间(回收站);null = 未删除 */
  deleted_at: string | null;
}

export interface NoteGroup {
  id: string;
  name: string;
  order_index: number;
  is_collapsed: boolean;
  /** 父分组 id(null = 顶层);支持无限嵌套子分组 */
  parent_id: string | null;
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
  /** 用户备注(可选) */
  note: string | null;
}

/** 剪贴板标签(独立于待办标签) */
export interface ClipTag {
  id: number;
  name: string;
  color: string;
}

/** Tauri 桌面后端:全部命令经 invoke 调 Rust。也是 Backend 接口的类型基准。 */
const tauriBackend = {
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
  /** 回收站:已软删除便签列表 */
  getDeletedNotes: () => invoke<Note[]>("get_deleted_notes"),
  restoreNote: (id: string) => invoke<Note>("restore_note", { id }),
  purgeNote: (id: string) => invoke<void>("purge_note", { id }),
  emptyNoteTrash: () => invoke<void>("empty_note_trash"),
  getNoteGroups: () => invoke<NoteGroup[]>("get_note_groups"),
  createNoteGroup: (name: string, parentId?: string | null) =>
    invoke<NoteGroup>("create_note_group", { name, parent_id: parentId ?? null }),
  updateNoteGroup: (
    id: string,
    fields: { name?: string; is_collapsed?: boolean; parent_id?: string | null },
  ) => {
    // parent_id 是双层语义:字段存在(即便为 null)才下发,告诉后端「要改 parent」
    const payload: Record<string, unknown> = { id };
    if (fields.name !== undefined) payload.name = fields.name;
    if (fields.is_collapsed !== undefined) payload.is_collapsed = fields.is_collapsed;
    if ("parent_id" in fields) payload.parent_id = fields.parent_id ?? null;
    return invoke<NoteGroup>("update_note_group", payload);
  },
  deleteNoteGroup: (id: string) => invoke<void>("delete_note_group", { id }),
  reorderNoteGroups: (ids: string[]) => invoke<void>("reorder_note_groups", { ids }),

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
  /** 有弹层打开时置位:贴边窗口编辑期间不自动收起 */
  setDockHold: (hold: boolean) => invoke<void>("set_dock_hold", { hold }),
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
  softDeleteClip: (id: number) => invoke<void>("soft_delete_clip", { id }),
  restoreClip: (id: number) => invoke<ClipItem | null>("restore_clip", { id }),
  deleteClip: (id: number) => invoke<void>("delete_clip", { id }),
  pinClip: (id: number, pinned: boolean) => invoke<void>("pin_clip", { id, pinned }),
  updateClipNote: (id: number, note: string | null) => invoke<void>("update_clip_note", { id, note }),
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
  /** 双击剪贴项:写剪贴板 + 还原上一个外部窗口焦点 + 模拟 Ctrl+V 粘贴 */
  pasteClipToPrevious: (clipId: number) =>
    invoke<void>("paste_clip_to_previous", { clip_id: clipId }),

  // ---- 剪贴项编辑窗口 ----
  /** 打开/聚焦独立的剪贴项编辑窗口,编辑指定剪贴项 */
  openClipEditorWindow: (clipId: number) =>
    invoke<void>("open_clip_editor_window", { clip_id: clipId }),
  /** 编辑窗口挂载后取走待编辑的剪贴项 id(并清空) */
  takeClipEditorTarget: () => invoke<number | null>("take_clip_editor_target"),

  // ---- 截图 + 桌面贴图 ----
  /** 遮罩窗挂载后取走本次冻结帧元数据(路径 + 虚拟桌面物理矩形) */
  takeCaptureTarget: () => invoke<CaptureTarget | null>("take_capture_target"),
  /** 写一张 PNG(canvas 导出的「选区+标注」字节)到截图临时目录,返回绝对路径 */
  saveCapturePng: (bytes: Uint8Array) => invoke<string>("save_capture_png", bytes, { headers: {} }),
  /** 把截图 PNG 写入系统剪贴板 */
  copyCaptureToClipboard: (pngPath: string) =>
    invoke<void>("copy_capture_to_clipboard", { png_path: pngPath }),
  /** 另存:把临时 PNG 复制到用户选定的目标路径 */
  saveCaptureAs: (srcPath: string, destPath: string) =>
    invoke<void>("save_capture_as", { src_path: srcPath, dest_path: destPath }),
  /** 删除截图临时文件(遮罩取消/确认后清 cap-*.png) */
  discardCapture: (path: string) => invoke<void>("discard_capture", { path }),
  /** 开一个桌面贴图悬浮窗(物理位置/尺寸) */
  openPinWindow: (
    pngPath: string,
    physX: number,
    physY: number,
    physW: number,
    physH: number,
  ) =>
    invoke<void>("open_pin_window", {
      png_path: pngPath,
      phys_x: physX,
      phys_y: physY,
      phys_w: physW,
      phys_h: physH,
    }),
  /** 贴图窗挂载后按 label 取走图片元数据 */
  takePinTarget: (label: string) => invoke<PinTarget | null>("take_pin_target", { label }),
  /** 贴图窗关闭前:出活跃集合 + 删其临时 PNG */
  unregisterPin: (label: string, pngPath: string) =>
    invoke<void>("unregister_pin", { label, png_path: pngPath }),
  /** 关闭所有贴图窗 */
  closeAllPins: () => invoke<void>("close_all_pins"),
};

/** 后端接口:以 Tauri 实现为类型基准,Dexie/IndexedDB 实现据此对齐。 */
export type Backend = typeof tauriBackend;

/**
 * 按运行环境选后端:桌面(Tauri)= invoke 调 Rust;浏览器(Web/PWA)= Dexie/IndexedDB。
 * 导入方 `import { ipc } from "../lib/tauri-ipc"` 的用法完全不变。
 */
export const ipc: Backend = isTauri ? tauriBackend : dexieBackend;
