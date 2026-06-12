import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FilePlus2,
  FolderPlus,
  Inbox,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { renderMarkdown, deriveTitle } from "../../lib/markdown";
import { t } from "../../lib/i18n";
import type { Note, NoteGroup } from "../../lib/tauri-ipc";
import { confirm } from "../ui/ConfirmDialog";

function displayTitle(n: Note): string {
  return n.custom_title || n.title || t("S.X.UntitledNote");
}

function NoteRow({ note, active }: { note: Note; active: boolean }) {
  const selectNote = useAppStore((s) => s.selectNote);
  const removeNote = useAppStore((s) => s.removeNote);
  return (
    <div
      onClick={() => selectNote(note.id)}
      className={`group flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
        active ? "bg-selected text-text-1" : "text-text-2 hover:bg-card-hover"
      }`}
    >
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

  return (
    <div className="mb-1">
      <div className="group flex items-center gap-1 px-1 py-1">
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
  const [content, setContent] = useState(note.content);
  const [title, setTitle] = useState(note.custom_title);
  const [preview, setPreview] = useState(false);
  const timer = useRef<number | null>(null);

  // 切换便签时重置本地草稿
  useEffect(() => {
    setContent(note.content);
    setTitle(note.custom_title);
    setPreview(false);
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
            scheduleSave(content, e.target.value);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-1 outline-none placeholder:text-muted"
        />
        <button
          title={preview ? t("S.X.EditMode") : t("S.X.Preview")}
          onClick={() => setPreview(!preview)}
          className={`flex h-6 w-6 items-center justify-center rounded hover:bg-card-hover ${
            preview ? "text-accent" : "text-text-2"
          }`}
        >
          {preview ? <Pencil size={13} /> : <Eye size={13} />}
        </button>
      </div>
      {preview ? (
        <div
          style={style}
          className="md-body min-h-0 flex-1 overflow-y-auto px-4 py-3 select-text"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      ) : (
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            scheduleSave(e.target.value, title);
          }}
          spellCheck={false}
          style={style}
          className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm text-text-1 outline-none select-text"
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
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

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
            <div className="flex items-center gap-1 px-1 py-1">
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
