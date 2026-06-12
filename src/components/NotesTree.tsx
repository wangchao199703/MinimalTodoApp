import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { ChevronDown, ChevronRight, FilePlus2, Inbox, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { reorderIds } from "../lib/dnd";
import { t } from "../lib/i18n";
import { ipc, type Note, type NoteGroup } from "../lib/tauri-ipc";
import { confirm } from "./ui/ConfirmDialog";

/**
 * 主侧栏内的便签树(收集箱/分组/便签三级):
 * 原便签视图第二侧边栏整体迁入,配色改用 sidebar token。
 * 点便签 = 选中并跳到便签视图;拖拽重排/拖入分组逻辑原样保留。
 */

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
  const setView = useAppStore((s) => s.setView);
  const removeNote = useAppStore((s) => s.removeNote);
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("note", note.id);
  return (
    <div
      ref={ref}
      onClick={() => {
        selectNote(note.id);
        setView({ kind: "notes" });
      }}
      className={`group relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-1 pl-3 text-sm ${
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
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:text-overdue group-hover:flex"
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
  const setView = useAppStore((s) => s.setView);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  // 拖便签到分组头 = 移入该分组(对齐旧版 NotesDropHandler)
  const { ref: dropRef, isOver } = useNoteGroupDrop(group.id);

  return (
    <div>
      <div
        ref={dropRef}
        className={`group flex items-center gap-1 rounded-md px-1 py-1 ${
          isOver ? "bg-sidebar-selected ring-1 ring-accent" : ""
        }`}
      >
        <button
          onClick={() => void toggleCollapse(group)}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-sidebar-muted hover:text-sidebar-strong"
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
            className="min-w-0 flex-1 rounded bg-sidebar-hover px-1 text-xs text-sidebar-strong outline-none"
          />
        ) : (
          <span
            onDoubleClick={() => {
              setDraft(group.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-muted"
          >
            {group.name}
          </span>
        )}
        <button
          title={t("S.X.NewNote")}
          onClick={() => {
            void addNote(group.id);
            setView({ kind: "notes" });
          }}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:text-sidebar-strong group-hover:flex"
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
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:text-overdue group-hover:flex"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {!group.is_collapsed &&
        notes.map((n) => <NoteRow key={n.id} note={n} active={selectedNoteId === n.id} />)}
    </div>
  );
}

export default function NotesTree() {
  const notes = useAppStore((s) => s.notes);
  const noteGroups = useAppStore((s) => s.noteGroups);
  const selectedNoteId = useAppStore((s) => s.selectedNoteId);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
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

  return (
    <div ref={listRef} className="flex flex-col gap-0.5 pl-4">
      <div>
        <div
          ref={inboxDrop.ref}
          className={`flex items-center gap-1 rounded-md px-1 py-1 ${
            inboxDrop.isOver ? "bg-sidebar-selected ring-1 ring-accent" : ""
          }`}
        >
          <button
            onClick={() => saveSetting("inbox_collapsed", inboxCollapsed ? "0" : "1")}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-sidebar-muted hover:text-sidebar-strong"
          >
            {inboxCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <Inbox size={11} className="shrink-0 text-sidebar-muted" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-muted">
            {t("S.X.Inbox")}
          </span>
          {inbox.length > 0 && (
            <span className="text-xs text-sidebar-muted">{inbox.length}</span>
          )}
        </div>
        {!inboxCollapsed &&
          inbox.map((n) => <NoteRow key={n.id} note={n} active={selectedNoteId === n.id} />)}
      </div>
      {noteGroups.map((g) => (
        <GroupSection key={g.id} group={g} notes={byGroup.get(g.id) ?? []} />
      ))}
    </div>
  );
}
