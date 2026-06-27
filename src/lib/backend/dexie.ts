import { nowText } from "../date";
import type {
  Backend,
  ClipTag,
  CreateTaskRequest,
  Group,
  Note,
  NoteGroup,
  Task,
  UpdateGroupRequest,
  UpdateNoteRequest,
  UpdateTaskRequest,
} from "../tauri-ipc";
import { db, type NoteRow } from "./db";
import { cacheImage } from "./objectUrl";

const uuid = () => crypto.randomUUID();

/** 顶层新建项排到最前:空表→0,否则 min(order_index)-1(对齐 Rust COALESCE(MIN,1)-1)。 */
async function topOrderIndex(orderBy: () => Promise<{ order_index: number } | undefined>): Promise<number> {
  const first = await orderBy();
  return first ? first.order_index - 1 : 0;
}
/** 追加到最后:空表→0/1,否则 max(order_index)+1。 */
async function bottomOrderIndex(
  orderBy: () => Promise<{ order_index: number } | undefined>,
  emptyValue: number,
): Promise<number> {
  const last = await orderBy();
  return last ? last.order_index + 1 : emptyValue;
}

/** 收集箱:取 order_index 最小的便签分组;无则按当前语言建一个并返回其 id。 */
async function defaultNoteGroupId(): Promise<string> {
  const first = await db.noteGroups.orderBy("order_index").first();
  if (first) return first.id;
  const lang = (await db.settings.get("language"))?.value;
  const group: NoteGroup = {
    id: uuid(),
    name: lang === "en" ? "Inbox" : "收集箱",
    order_index: 0,
    is_collapsed: false,
  };
  await db.noteGroups.add(group);
  return group.id;
}

/** 收集任务及其全部后代 id(deleteTask 级联用,对齐 Rust 外键 ON DELETE CASCADE)。 */
function withDescendants(all: Task[], rootId: string): string[] {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of all) {
      if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/** Web 不支持的桌面专属命令:统一返回安全默认值(不抛,避免 Web 下偶发调用崩溃)。 */
const noop = async (): Promise<void> => {};

/**
 * Dexie/IndexedDB 后端:实现 Backend 接口的「Web 子集」(待办/标签/便签/设置/图片),
 * 桌面专属命令(剪贴板/截图/贴图/托盘/窗口/数据迁移)给安全默认值。语义逐条对齐 Rust:
 * order_index 计算、三态补丁(省略=不变、""=清空、quadrant_override 0=清除)、便签软删、默认分组自愈。
 */
export const dexieBackend: Backend = {
  // ---- 标签(分组) ----
  getGroups: () => db.groups.orderBy("order_index").toArray(),
  createGroup: async (name) => {
    const group: Group = {
      id: uuid(),
      name,
      order_index: await bottomOrderIndex(() => db.groups.orderBy("order_index").last(), 0),
      color: "",
      icon: "",
      icon_image: "",
      is_collapsed: false,
    };
    await db.groups.add(group);
    return group;
  },
  updateGroup: async (req: UpdateGroupRequest) => {
    const g = await db.groups.get(req.id);
    if (!g) throw new Error("标签不存在");
    const next: Group = { ...g };
    if (req.name !== undefined) next.name = req.name;
    if (req.color !== undefined) next.color = req.color;
    if (req.icon !== undefined) next.icon = req.icon;
    if (req.icon_image !== undefined) next.icon_image = req.icon_image;
    if (req.is_collapsed !== undefined) next.is_collapsed = req.is_collapsed;
    await db.groups.put(next);
    return next;
  },
  deleteGroup: async (id) => {
    await db.transaction("rw", db.tasks, db.groups, async () => {
      const affected = await db.tasks.where("group_id").equals(id).toArray();
      for (const t of affected) await db.tasks.update(t.id, { group_id: null });
      await db.groups.delete(id);
    });
  },
  reorderGroups: async (ids) => {
    await db.transaction("rw", db.groups, async () => {
      for (let i = 0; i < ids.length; i++) await db.groups.update(ids[i], { order_index: i });
    });
  },

  // ---- 待办 ----
  getTasks: () => db.tasks.orderBy("order_index").toArray(),
  createTask: async (req: CreateTaskRequest) => {
    const isChild = !!req.parent_id;
    const order_index = isChild
      ? await bottomOrderIndex(() => db.tasks.orderBy("order_index").last(), 1)
      : await topOrderIndex(() => db.tasks.orderBy("order_index").first());
    const task: Task = {
      id: uuid(),
      title: req.title,
      is_completed: false,
      due_date: req.due_date ?? null,
      group_id: req.group_id ?? null,
      original_group_id: null,
      priority: req.priority ?? 2,
      order_index,
      indent_level: req.indent_level ?? 0,
      parent_id: req.parent_id ?? null,
      is_collapsed: false,
      is_pinned: false,
      quadrant_override: null,
      reminder_enabled: req.reminder_enabled ?? false,
      reminder_interval_minutes: req.reminder_interval_minutes ?? 30,
      last_reminded_at: null,
      created_at: nowText(),
    };
    await db.tasks.add(task);
    return task;
  },
  updateTask: async (req: UpdateTaskRequest) => {
    const t = await db.tasks.get(req.id);
    if (!t) throw new Error("任务不存在");
    const next: Task = { ...t };
    if (req.title !== undefined) next.title = req.title;
    if (req.is_completed !== undefined) next.is_completed = req.is_completed;
    if (req.due_date !== undefined) next.due_date = req.due_date === "" ? null : req.due_date;
    if (req.group_id !== undefined) next.group_id = req.group_id === "" ? null : req.group_id;
    if (req.original_group_id !== undefined)
      next.original_group_id = req.original_group_id === "" ? null : req.original_group_id;
    if (req.priority !== undefined) next.priority = req.priority;
    if (req.indent_level !== undefined) next.indent_level = req.indent_level;
    if (req.parent_id !== undefined) next.parent_id = req.parent_id === "" ? null : req.parent_id;
    if (req.is_collapsed !== undefined) next.is_collapsed = req.is_collapsed;
    if (req.is_pinned !== undefined) next.is_pinned = req.is_pinned;
    if (req.quadrant_override !== undefined)
      next.quadrant_override = req.quadrant_override === 0 ? null : req.quadrant_override;
    if (req.reminder_enabled !== undefined) next.reminder_enabled = req.reminder_enabled;
    if (req.reminder_interval_minutes !== undefined)
      next.reminder_interval_minutes = req.reminder_interval_minutes;
    if (req.last_reminded_at !== undefined)
      next.last_reminded_at = req.last_reminded_at === "" ? null : req.last_reminded_at;
    await db.tasks.put(next);
    return next;
  },
  deleteTask: async (id) => {
    const all = await db.tasks.toArray();
    await db.tasks.bulkDelete(withDescendants(all, id));
  },
  reorderTasks: async (ids) => {
    await db.transaction("rw", db.tasks, async () => {
      for (let i = 0; i < ids.length; i++) await db.tasks.update(ids[i], { order_index: i });
    });
  },

  // ---- 设置 ----
  getSettings: async () => {
    const rows = await db.settings.toArray();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  setSetting: async (key, value) => {
    await db.settings.put({ key, value });
  },

  // ---- 便签 ----
  getNotes: async () =>
    (await db.notes.where("is_deleted").equals(0).sortBy("order_index")) as Note[],
  createNote: async (groupId) => {
    const row: NoteRow = {
      id: uuid(),
      title: "",
      custom_title: "",
      content: "",
      group_id: groupId ?? (await defaultNoteGroupId()),
      order_index: await topOrderIndex(() => db.notes.orderBy("order_index").first()),
      created_at: nowText(),
      updated_at: nowText(),
      deleted_at: null,
      is_deleted: 0,
    };
    await db.notes.add(row);
    return row;
  },
  updateNote: async (req: UpdateNoteRequest) => {
    const n = await db.notes.get(req.id);
    if (!n) throw new Error("便签不存在");
    const next: NoteRow = { ...n };
    if (req.title !== undefined) next.title = req.title;
    if (req.custom_title !== undefined) next.custom_title = req.custom_title;
    if (req.content !== undefined) next.content = req.content;
    if (req.group_id !== undefined)
      next.group_id = req.group_id === "" ? await defaultNoteGroupId() : req.group_id;
    next.updated_at = nowText();
    await db.notes.put(next);
    return next;
  },
  deleteNote: async (id) => {
    await db.notes.update(id, { is_deleted: 1, deleted_at: nowText() });
  },
  reorderNotes: async (ids) => {
    await db.transaction("rw", db.notes, async () => {
      for (let i = 0; i < ids.length; i++) await db.notes.update(ids[i], { order_index: i });
    });
  },
  getDeletedNotes: async () =>
    (await db.notes.where("is_deleted").equals(1).sortBy("order_index")) as Note[],
  restoreNote: async (id) => {
    await db.notes.update(id, { is_deleted: 0, deleted_at: null });
    const n = await db.notes.get(id);
    if (!n) throw new Error("便签不存在");
    return n;
  },
  purgeNote: async (id) => {
    await db.notes.delete(id);
  },
  emptyNoteTrash: async () => {
    await db.notes.where("is_deleted").equals(1).delete();
  },
  getNoteGroups: () => db.noteGroups.orderBy("order_index").toArray(),
  createNoteGroup: async (name) => {
    const group: NoteGroup = {
      id: uuid(),
      name,
      order_index: await bottomOrderIndex(() => db.noteGroups.orderBy("order_index").last(), 0),
      is_collapsed: false,
    };
    await db.noteGroups.add(group);
    return group;
  },
  updateNoteGroup: async (id, fields) => {
    const g = await db.noteGroups.get(id);
    if (!g) throw new Error("便签分组不存在");
    const next: NoteGroup = { ...g };
    if (fields.name !== undefined) next.name = fields.name;
    if (fields.is_collapsed !== undefined) next.is_collapsed = fields.is_collapsed;
    await db.noteGroups.put(next);
    return next;
  },
  deleteNoteGroup: async (id) => {
    const lang = (await db.settings.get("language"))?.value;
    const inboxName = lang === "en" ? "Inbox" : "收集箱";
    await db.transaction("rw", db.notes, db.noteGroups, async () => {
      await db.noteGroups.delete(id);
      const remaining = await db.noteGroups.orderBy("order_index").first();
      let targetId: string;
      if (remaining) {
        targetId = remaining.id;
      } else {
        const inbox: NoteGroup = { id: uuid(), name: inboxName, order_index: 0, is_collapsed: false };
        await db.noteGroups.add(inbox);
        targetId = inbox.id;
      }
      const orphans = await db.notes.where("group_id").equals(id).toArray();
      for (const o of orphans) await db.notes.update(o.id, { group_id: targetId });
    });
  },

  // ---- 图片(便签插图 / 分组自定义图标):存 IndexedDB Blob ----
  saveNoteImage: async (bytes, ext) => {
    const name = `${uuid()}.${ext}`;
    const blob = new Blob([bytes as BlobPart]);
    await db.images.put({ name, blob, kind: "note" });
    cacheImage(name, blob);
    return name;
  },
  noteImageDir: async () => "",
  saveGroupIcon: async (bytes, ext) => {
    const name = `${uuid()}.${ext}`;
    const blob = new Blob([bytes as BlobPart]);
    await db.images.put({ name, blob, kind: "group" });
    cacheImage(name, blob);
    return name;
  },
  groupIconDir: async () => "",
  listGroupIcons: async () =>
    (await db.images.where("kind").equals("group").toArray()).map((i) => i.name),

  // ---- 桌面专属:Web 安全降级 ----
  exportFile: async () => "",
  saveClipImage: async () => "",
  setAcrylic: noop,
  setAutostart: noop,
  getAutostart: async () => false,
  rebuildTray: noop,
  setDockHold: noop,
  updateHotkeys: noop,
  pauseHotkeys: noop,
  openSettingsWindow: noop,
  resetSettings: async () => {
    await db.settings.where("key").notEqual("language").delete();
  },
  getDataDir: async () => "",
  migrateDataDir: async () => false,
  restartApp: noop,
  getClips: async () => [],
  softDeleteClip: noop,
  restoreClip: async () => null,
  deleteClip: noop,
  pinClip: noop,
  getClipTags: async () => [],
  createClipTag: async (name): Promise<ClipTag> => ({ id: 0, name, color: "" }),
  renameClipTag: noop,
  setClipTagColor: noop,
  deleteClipTag: noop,
  addClipTag: noop,
  removeClipTag: noop,
  setClipItemTag: noop,
  updateClipText: noop,
  copyClip: noop,
  pasteClipToPrevious: noop,
  openClipEditorWindow: noop,
  takeClipEditorTarget: async () => null,
  takeCaptureTarget: async () => null,
  saveCapturePng: async () => "",
  copyCaptureToClipboard: noop,
  saveCaptureAs: noop,
  discardCapture: noop,
  openPinWindow: noop,
  takePinTarget: async () => null,
  unregisterPin: noop,
  closeAllPins: noop,
};
