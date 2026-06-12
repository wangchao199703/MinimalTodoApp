import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Inbox,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useSortableItem } from "../../hooks/useSortableItem";
import { reorderIds } from "../../lib/dnd";
import { deriveTitle } from "../../lib/markdown";
import { t } from "../../lib/i18n";
import { ipc, type Note, type NoteGroup } from "../../lib/tauri-ipc";
import { confirm } from "../ui/ConfirmDialog";
import NoteEditor, { ensureNoteImageDir } from "../NoteEditor";

/** 把元素注册为「拖便签进分组」的释放目标(groupId 空串 = 收集箱) */
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

function NoteRow({ note, active }: { note: Note; active: boolean }) {
  const selectNote = useAppStore((s) => s.selectNote);
  const removeNote = useAppStore((s) => s.removeNote);
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("note", note.id);
  return (
    <div
      ref={ref}
      onClick={() => selectNote(note.id)}
      className={`group relative flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-selected text-text-1" : "text-text-2 hover:bg-card-hover"
      } ${isDragging ? "dragging" : ""}`}
    >
      {closestEdge && (
        <div
          className={`absolute inset-x-1 z-10 h-0.5 rounded bg-accent ${
            closestEdge === "top" ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{displayTitle(note)}</span>
      <button
        title={t("S.X.Delete")}
        onClick={(e) => {
          e.stopPropagation();
          void (async () => {
            if (await confirm({ title: t("S.Note.Delete"), message: t("S.Note.DeleteConfirm") }))
              void removeNote(note.id);
          })();
        }}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:text-overdue group-hover:flex"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function GroupSection({ group, notes }: { group: NoteGroup; notes: Note[] }) {
  const selectedNoteId = useAppStore((s) => s.selectedNoteId);
  const toggleCollapse = useAppStore((s) => s.toggleNoteGroupCollapse);
  const renameNoteGroup = useAppStore((s) => s.renameNoteGroup);
  const removeNoteGroup = useAppStore((s) => s.removeNoteGroup);
  const addNote = useAppStore((s) => s.addNote);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  // 拖便签到分组头 = 移入该分组(对齐旧版 NotesDropHandler)
  const { ref: dropRef, isOver } = useNoteGroupDrop(group.id);

  return (
    <div className="mb-1">
      <div
        ref={dropRef}
        className={`group flex items-center gap-1 rounded-md px-1 py-1 ${
          isOver ? "bg-selected ring-1 ring-accent" : ""
        }`}
      >
        <button
          onClick={() => void toggleCollapse(group)}
          className="flex h-4 w-4 items-center justify-center text-muted"
        >
          {group.is_collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft.trim()) void renameNoteGroup(group.id, draft.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="min-w-0 flex-1 rounded bg-input px-1 text-xs text-text-1 outline-none"
          />
        ) : (
          <span
            onDoubleClick={() => {
              setDraft(group.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-xs font-medium text-muted"
          >
            {group.name}
          </span>
        )}
        <button
          title={t("S.X.NewNote")}
          onClick={() => void addNote(group.id)}
          className="hidden h-5 w-5 items-center justify-center rounded text-muted hover:text-text-1 group-hover:flex"
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
                  message: t("S.Note.GroupDeleteConfirm"),
                })
              )
                void removeNoteGroup(group.id);
            })();
          }}
          className="hidden h-5 w-5 items-center justify-center rounded text-muted hover:text-overdue group-hover:flex"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {!group.is_collapsed &&
        notes.map((n) => <NoteRow key={n.id} note={n} active={selectedNoteId === n.id} />)}
    </div>
  );
}

function Editor({ note }: { note: Note }) {
  const patchNote = useAppStore((s) => s.patchNote);
  const settings = useAppStore((s) => s.settings);
  const [title, setTitle] = useState(note.custom_title);
  const contentRef = useRef(note.content);
  const timer = useRef<number | null>(null);

  // 图片仓库目录就绪后再挂编辑器,确保首次渲染图片即可解析
  const [imgReady, setImgReady] = useState(false);
  useEffect(() => {
    void ensureNoteImageDir().then(() => setImgReady(true));
  }, []);

  // 切换便签时重置本地草稿(正文由 NoteEditor 按 noteId 自行重载)
  useEffect(() => {
    setTitle(note.custom_title);
    contentRef.current = note.content;
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 800ms 防抖自动保存(对齐旧版手感)
  const scheduleSave = (nextContent: string, nextTitle: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void patchNote({
        id: note.id,
        content: nextContent,
        title: deriveTitle(nextContent),
        custom_title: nextTitle,
      });
    }, 800);
  };

  // 便签独立字体(0/空 = 继承全局)
  const noteFont = settings["note_font_family"] || "";
  const noteSize = Number(settings["note_font_size"] || "0");
  const noteSpacing = Number(settings["note_line_spacing"] || "0");
  const style: React.CSSProperties = {
    fontFamily: noteFont ? `"${noteFont}", var(--app-font)` : undefined,
    fontSize: noteSize > 0 ? noteSize : undefined,
    lineHeight: noteSpacing > 0 ? noteSpacing * 1.4 : undefined,
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-divider px-3 py-2">
        <input
          value={title}
          placeholder={note.title || t("S.X.UntitledNote")}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave(contentRef.current, e.target.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-1 outline-none placeholder:text-muted"
        />
      </div>
      {/* 所见即所得 Markdown 编辑器:输入 md 语法实时生效,正文持久化仍为 Markdown 文本 */}
      {imgReady && (
        <NoteEditor
          noteId={note.id}
          content={note.content}
          style={style}
          onChange={(md) => {
            contentRef.current = md;
            scheduleSave(md, title);
          }}
        />
      )}
    </div>
  );
}

export default function NotesView() {
  const notes = useAppStore((s) => s.notes);
  const noteGroups = useAppStore((s) => s.noteGroups);
  const selectedNoteId = useAppStore((s) => s.selectedNoteId);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const addNote = useAppStore((s) => s.addNote);
  const addNoteGroup = useAppStore((s) => s.addNoteGroup);
  const patchNote = useAppStore((s) => s.patchNote);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });
  const inboxDrop = useNoteGroupDrop("");

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
          const gid = target.data.groupId as string; // "" = 收集箱
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
  const inbox = byGroup.get(null) ?? [];
  const inboxCollapsed = settings["inbox_collapsed"] === "1";
  const selected = notes.find((n) => n.id === selectedNoteId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-52 shrink-0 flex-col border-r border-divider">
        <div className="flex shrink-0 items-center justify-between px-3 pt-2 pb-1">
          <span className="text-xs font-medium text-muted">{t("S.X.Notes")}</span>
          <span className="flex gap-0.5">
            <button
              title={t("S.X.NewNoteGroup")}
              onClick={() => void addNoteGroup(t("S.X.NewNoteGroup"))}
              className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-text-1"
            >
              <FolderPlus size={13} />
            </button>
            <button
              title={t("S.X.NewNote")}
              onClick={() => void addNote()}
              className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-text-1"
            >
              <FilePlus2 size={13} />
            </button>
          </span>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2 pt-0">
          <div className="mb-1">
            <div
              ref={inboxDrop.ref}
              className={`flex items-center gap-1 rounded-md px-1 py-1 ${
                inboxDrop.isOver ? "bg-selected ring-1 ring-accent" : ""
              }`}
            >
              <button
                onClick={() => saveSetting("inbox_collapsed", inboxCollapsed ? "0" : "1")}
                className="flex h-4 w-4 items-center justify-center text-muted"
              >
                {inboxCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              <Inbox size={11} className="text-muted" />
              <span className="text-xs font-medium text-muted">{t("S.X.Inbox")}</span>
              <span className="ml-auto text-xs text-muted">{inbox.length}</span>
            </div>
            {!inboxCollapsed &&
              inbox.map((n) => <NoteRow key={n.id} note={n} active={selectedNoteId === n.id} />)}
          </div>
          {noteGroups.map((g) => (
            <GroupSection key={g.id} group={g} notes={byGroup.get(g.id) ?? []} />
          ))}
        </div>
      </div>

      {selected ? (
        <Editor note={selected} />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center text-sm text-muted">
          {t("S.X.EmptyNotes")}
        </div>
      )}
    </div>
  );
}
