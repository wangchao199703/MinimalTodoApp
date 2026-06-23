import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ChevronRight,
  Download,
  FileCode,
  Eraser,
  FilePlus2,
  FileText,
  Folder,
  Palette,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { reorderIds } from "../lib/dnd";
import { readMarkdownDrop } from "../lib/markdownIO";
import { exportNoteHtml } from "../lib/notesExport";
import { f, t } from "../lib/i18n";
import { ipc, type Note, type NoteGroup } from "../lib/tauri-ipc";
import { confirm } from "./ui/ConfirmDialog";
import { Popover, MenuItem } from "./ui/Popover";
import ColorDialog from "./dialogs/ColorDialog";

/**
 * 便签视图的第二侧边栏树(分组/便签两级),用 sidebar token 配色。
 * 收集箱已实体化为普通分组(初始自带、可删可改名),树里只有真实分组。
 * 点便签 = 选中并跳到便签视图;拖拽重排/拖入分组逻辑原样保留。
 */

// 便签分组无独立颜色字段:图标默认无色,由用户右键设色,持久化在 settings.notegroup_color_<id>;分组下便签继承
export function noteGroupColor(
  settings: Record<string, string>,
  groupId: string | null,
): string | undefined {
  return (groupId && settings[`notegroup_color_${groupId}`]) || undefined;
}

/** 把元素注册为「拖便签进分组」的释放目标 */
function useNoteGroupDrop(groupId: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isOver, setIsOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "note",
      getData: () => ({ type: "note-group", groupId }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, [groupId]);
  return { ref, isOver };
}

function displayTitle(n: Note): string {
  return n.custom_title || n.title || t("S.X.UntitledNote");
}

function NoteRow({ note, active, color }: { note: Note; active: boolean; color?: string }) {
  const selectNote = useAppStore((s) => s.selectNote);
  const setView = useAppStore((s) => s.setView);
  const removeNote = useAppStore((s) => s.removeNote);
  const restoreNote = useAppStore((s) => s.restoreNote);
  const patchNote = useAppStore((s) => s.patchNote);
  const showUndoToast = useAppStore((s) => s.showUndoToast);
  const pushToast = useAppStore((s) => s.pushToast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // 行内重命名期间禁止拖拽,避免在输入框里按下被当成拖拽
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>(
    "note",
    note.id,
    "vertical",
    () => !editing,
  );
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // 重命名 = 改 custom_title(用户标题);留空或未变则不动(对齐分组双击重命名)
  const beginRename = () => {
    setDraft(displayTitle(note));
    setEditing(true);
  };
  const commitRename = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== displayTitle(note)) void patchNote({ id: note.id, custom_title: v });
  };

  // 删除立即生效(软删 → 进回收站,瞬间消失),底部弹「撤回」(撤回 = restoreNote)
  const deleteWithUndo = () => {
    void removeNote(note.id);
    showUndoToast(t("S.X.UndoToast.NoteDeleted"), () => void restoreNote(note.id));
  };
  const exportMd = async () => {
    const file = `${displayTitle(note)}.md`;
    try {
      // 单篇便签导出为 .md(正文已是 Markdown 文本),落到桌面;文件名=便签标题
      await ipc.exportFile(file, note.content ?? "");
      pushToast(f("S.X.NoteExportedTo", file));
    } catch (e) {
      pushToast(`${t("S.X.NoteExportFailed")}:${String((e as Error)?.message ?? e)}`);
    }
  };
  const exportHtml = async () => {
    try {
      const path = await exportNoteHtml(note);
      const file = path.split(/[\\/]/).pop() ?? path;
      pushToast(f("S.X.NoteExportedHtmlTo", file));
    } catch (e) {
      pushToast(`${t("S.X.NoteExportFailed")}:${String((e as Error)?.message ?? e)}`);
    }
  };

  return (
    <div
      ref={ref}
      data-note-row={note.id}
      onClick={() => {
        if (editing) return;
        selectNote(note.id);
        setView({ kind: "notes" });
      }}
      onDoubleClick={beginRename}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`nav-lift group relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-1 pl-7 text-sm ${
        active
          ? "bg-sidebar-selected text-sidebar-selected-fg"
          : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
      } ${isDragging ? "dragging" : ""}`}
    >
      {closestEdge && (
        <div
          className={`absolute inset-x-1 z-10 h-0.5 rounded bg-accent ${
            closestEdge === "top" ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      <FileText size={14} className="shrink-0" style={{ color }} />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 rounded bg-sidebar-hover px-1 text-sm text-sidebar-strong outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate">{displayTitle(note)}</span>
      )}
      {!editing && (
        <button
          title={t("S.X.Delete")}
          onClick={(e) => {
            e.stopPropagation();
            deleteWithUndo();
          }}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:text-overdue group-hover:flex"
        >
          <X size={12} />
        </button>
      )}
      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-44">
            <MenuItem
              onClick={() => {
                setMenu(null);
                beginRename();
              }}
            >
              <Pencil size={13} />
              {t("S.Note.Rename")}
            </MenuItem>
            <div className="my-1 h-px bg-divider" />
            <MenuItem
              onClick={() => {
                setMenu(null);
                void exportMd();
              }}
            >
              <Download size={13} />
              {t("S.X.NoteExportMd")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                void exportHtml();
              }}
            >
              <FileCode size={13} />
              {t("S.X.NoteExportHtml")}
            </MenuItem>
            <div className="my-1 h-px bg-divider" />
            <MenuItem
              danger
              onClick={() => {
                setMenu(null);
                deleteWithUndo();
              }}
            >
              <Trash2 size={13} />
              {t("S.X.Delete")}
            </MenuItem>
          </div>
        </Popover>
      )}
    </div>
  );
}

function GroupSection({ group, notes }: { group: NoteGroup; notes: Note[] }) {
  const selectedNoteId = useAppStore((s) => s.selectedNoteId);
  const toggleCollapse = useAppStore((s) => s.toggleNoteGroupCollapse);
  const renameNoteGroup = useAppStore((s) => s.renameNoteGroup);
  const removeNoteGroup = useAppStore((s) => s.removeNoteGroup);
  const clearNoteGroupNotes = useAppStore((s) => s.clearNoteGroupNotes);
  const addNote = useAppStore((s) => s.addNote);
  const setView = useAppStore((s) => s.setView);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  // 拖便签到分组头 = 移入该分组(对齐旧版 NotesDropHandler)
  const { ref: dropRef, isOver } = useNoteGroupDrop(group.id);
  // 从资源管理器拖入 .md 到分组头 = 导入便签并归类到该分组(网页 File API,与内部排序拖拽互不干扰)
  const importNotesFromFiles = useAppStore((s) => s.importNotesFromFiles);
  const [fileOver, setFileOver] = useState(false);
  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const onFileDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation(); // 命中分组:不冒泡到便签区容器(否则会落到默认分组)
    e.dataTransfer.dropEffect = "copy";
    if (!fileOver) setFileOver(true);
  };
  const onFileDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setFileOver(false);
    void (async () => {
      const files = await readMarkdownDrop(e.dataTransfer);
      if (files.length > 0) await importNotesFromFiles(files, group.id);
    })();
  };
  // 分组图标颜色:默认无色,右键自定义(持久化 notegroup_color_<id>),分组下便签继承
  const color = noteGroupColor(settings, group.id);

  return (
    <div>
      {/* 分组头:与一级导航行同版式(图标+文字+计数);整行点击折叠,
          折叠箭头/新建/删除平时隐藏、悬停淡入(计数淡出让位),双击重命名 */}
      <div className="group/sec relative flex items-center">
        <div
          ref={dropRef}
          onClick={() => {
            if (!editing) void toggleCollapse(group);
          }}
          onDoubleClick={() => {
            setDraft(group.name);
            setEditing(true);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          onDragOver={onFileDragOver}
          onDragLeave={() => setFileOver(false)}
          onDrop={onFileDrop}
          className={`nav-lift flex w-full min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            isOver || fileOver
              ? "bg-sidebar-selected ring-1 ring-accent"
              : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
          }`}
        >
          <Folder size={14} className="shrink-0" style={{ color }} />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                setEditing(false);
                if (draft.trim()) void renameNoteGroup(group.id, draft.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="min-w-0 flex-1 rounded bg-sidebar-hover px-1 text-sm text-sidebar-strong outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{group.name}</span>
          )}
          {notes.length > 0 && (
            <span className="text-xs text-sidebar-muted transition-opacity duration-150 group-hover/sec:opacity-0">
              {notes.length}
            </span>
          )}
        </div>
        <span className="pointer-events-none absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/sec:pointer-events-auto group-hover/sec:opacity-100">
          <button
            title={group.is_collapsed ? t("S.X.ExpandSidebar") : t("S.X.CollapseSidebar")}
            onClick={() => void toggleCollapse(group)}
            className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
          >
            <ChevronRight
              size={12}
              className={`transition-transform duration-150 ${group.is_collapsed ? "" : "rotate-90"}`}
            />
          </button>
          <button
            title={t("S.X.NewNote")}
            onClick={() => {
              void addNote(group.id);
              setView({ kind: "notes" });
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
          >
            <FilePlus2 size={12} />
          </button>
          <button
            title={t("S.X.Delete")}
            onClick={() => {
              void (async () => {
                if (
                  await confirm({
                    title: t("S.Note.DeleteGroup"),
                    message: t("S.X.NoteGroupDeleteConfirm"),
                  })
                )
                  void removeNoteGroup(group.id);
              })();
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-overdue"
          >
            <Trash2 size={12} />
          </button>
        </span>
      </div>
      {!group.is_collapsed &&
        notes.map((n) => (
          <NoteRow key={n.id} note={n} active={selectedNoteId === n.id} color={color} />
        ))}
      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-32">
            <MenuItem
              onClick={() => {
                setMenu(null);
                setDraft(group.name);
                setEditing(true);
              }}
            >
              <Pencil size={13} />
              {t("S.Note.RenameGroup")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                setColorOpen(true);
              }}
            >
              <Palette size={13} />
              {t("S.Group.ChangeColor")}
            </MenuItem>
            <MenuItem
              onClick={async () => {
                setMenu(null);
                if (
                  await confirm({
                    title: t("S.X.Clear"),
                    message: f("S.X.ConfirmClearNoteGroup", group.name),
                  })
                )
                  void clearNoteGroupNotes(group.id);
              }}
            >
              <Eraser size={13} />
              {t("S.X.Clear")}
            </MenuItem>
          </div>
        </Popover>
      )}
      {colorOpen && (
        <ColorDialog
          value={color || ""}
          onPick={(c) => saveSetting(`notegroup_color_${group.id}`, c)}
          onClear={() => saveSetting(`notegroup_color_${group.id}`, "")}
          onClose={() => setColorOpen(false)}
        />
      )}
    </div>
  );
}

/** 回收站行:置于分组列表底部,作为一个分组式入口(替代原工具栏按钮),点击进入回收站视图 */
function TrashRow() {
  const notesTrashOpen = useAppStore((s) => s.notesTrashOpen);
  const setNotesTrashOpen = useAppStore((s) => s.setNotesTrashOpen);
  return (
    <div className="mt-0.5 border-t border-sidebar-border pt-1">
      <div
        onClick={() => void setNotesTrashOpen(!notesTrashOpen)}
        className={`nav-lift flex w-full min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
          notesTrashOpen
            ? "bg-sidebar-selected text-sidebar-selected-fg"
            : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
        }`}
      >
        <Trash2 size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t("S.X.NoteTrash")}</span>
      </div>
    </div>
  );
}

export default function NotesTree() {
  const notes = useAppStore((s) => s.notes);
  const noteGroups = useAppStore((s) => s.noteGroups);
  const patchNote = useAppStore((s) => s.patchNote);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

  // 便签拖拽:行间重排 / 拖到分组头移入分组(对齐旧版 NotesDropHandler)
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "note",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const state = useAppStore.getState();
        const srcId = source.data.id as string;
        const src = state.notes.find((n) => n.id === srcId);
        if (!src) return;

        if (target.data.type === "note-group") {
          const gid = target.data.groupId as string;
          if ((src.group_id ?? "") !== gid) void patchNote({ id: srcId, group_id: gid });
          return;
        }

        // 便签 → 便签:重排,跨组时同时改归属
        const tgt = state.notes.find((n) => n.id === target.data.id);
        if (!tgt) return;
        const ordered = [...state.notes].sort((a, b) => a.order_index - b.order_index);
        const ids = reorderIds(
          ordered.map((n) => n.id),
          srcId,
          tgt.id,
          extractClosestEdge(target.data),
        );
        const pos = new Map(ids.map((id, i) => [id, i]));
        useAppStore.setState({
          notes: [...state.notes]
            .map((n) => ({ ...n, order_index: pos.get(n.id) ?? n.order_index }))
            .sort((a, b) => a.order_index - b.order_index),
        });
        void ipc.reorderNotes(ids);
        if ((src.group_id ?? null) !== (tgt.group_id ?? null)) {
          void patchNote({ id: srcId, group_id: tgt.group_id ?? "" });
        }
      },
    });
  }, [patchNote]);

  const byGroup = new Map<string | null, Note[]>();
  for (const n of notes) {
    const list = byGroup.get(n.group_id) ?? [];
    list.push(n);
    byGroup.set(n.group_id, list);
  }

  return (
    <div ref={listRef} className="flex flex-col gap-0.5 px-2">
      {noteGroups.map((g) => (
        <GroupSection key={g.id} group={g} notes={byGroup.get(g.id) ?? []} />
      ))}
      {/* 回收站:分组式入口,固定在分组列表底部 */}
      <TrashRow />
    </div>
  );
}
