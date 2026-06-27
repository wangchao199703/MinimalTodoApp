import Dexie, { type Table } from "dexie";
import type { Group, Note, NoteGroup, Task } from "../tauri-ipc";

/** 便签行:在 Note 基础上多一个索引列 is_deleted(回收站查询用);对外仍当作 Note。 */
export type NoteRow = Note & { is_deleted: 0 | 1 };

/** 便签/分组图标的二进制原图,按文件名存,kind 区分用途。 */
export interface ImageRow {
  name: string;
  blob: Blob;
  kind: "note" | "group";
}

export interface SettingRow {
  key: string;
  value: string;
}

/**
 * Web 版本地库(IndexedDB,经 Dexie 封装)。表结构对应桌面 SQLite 的 tasks/groups/notes/
 * note_groups/settings,外加 images 表替代桌面的文件仓库(note-images / group-icons)。
 * 主键统一 string UUID(`&id`),二级索引服务排序/分组/软删过滤。
 */
class WebDB extends Dexie {
  tasks!: Table<Task, string>;
  groups!: Table<Group, string>;
  notes!: Table<NoteRow, string>;
  noteGroups!: Table<NoteGroup, string>;
  settings!: Table<SettingRow, string>;
  images!: Table<ImageRow, string>;

  constructor() {
    super("minimal-todo-web");
    this.version(1).stores({
      tasks: "&id, order_index, group_id, parent_id, is_completed",
      groups: "&id, order_index",
      notes: "&id, order_index, group_id, is_deleted",
      noteGroups: "&id, order_index",
      settings: "&key",
      images: "&name, kind",
    });
  }
}

export const db = new WebDB();
