import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { deriveTitle } from "../../lib/markdown";
import { t } from "../../lib/i18n";
import type { Note } from "../../lib/tauri-ipc";
import NoteEditor, { ensureNoteImageDir } from "../NoteEditor";

// 便签视图 = 纯编辑区(列表/分组树已合并进主侧栏的 NotesTree)

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
  const selectedNoteId = useAppStore((s) => s.selectedNoteId);
  const selected = notes.find((n) => n.id === selectedNoteId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
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
