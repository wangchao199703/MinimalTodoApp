import { useEffect, useRef, useState } from "react";
import { FilePlus2, FileText, FolderPlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { deriveTitle } from "../../lib/markdown";
import { t } from "../../lib/i18n";
import type { Note } from "../../lib/tauri-ipc";
import NoteEditor, { ensureNoteImageDir } from "../NoteEditor";
import NotesTree, { colorForId } from "../NotesTree";

// 便签视图 = 第二侧边栏(便签树 + 新建)+ 右侧编辑区

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
  // 经 CSS 变量下发到 .note-prose 自身(见 index.css),空/0 则回退默认/全局
  const style = {
    "--note-font-family": noteFont ? `"${noteFont}", var(--app-font)` : undefined,
    "--note-font-size": noteSize > 0 ? `${noteSize}px` : undefined,
    "--note-line-height": noteSpacing > 0 ? String(noteSpacing * 1.4) : undefined,
  } as React.CSSProperties;

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
  const addNote = useAppStore((s) => s.addNote);
  const addNoteGroup = useAppStore((s) => s.addNoteGroup);
  const selectNote = useAppStore((s) => s.selectNote);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const selected = notes.find((n) => n.id === selectedNoteId) ?? null;

  // 第二侧边栏宽度可拖动并持久化(默认 224,范围 160–460)
  const [navWidth, setNavWidth] = useState(() =>
    Math.min(460, Math.max(160, Number(settings["notes_sidebar_width"]) || 224)),
  );
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = navWidth;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(460, Math.max(160, startW + ev.clientX - startX));
      setNavWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveSetting("notes_sidebar_width", String(Math.round(w)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 第二侧边栏收起:收起后只剩一条窄边 + 展开按钮
  const collapsed = settings["notes_sidebar_collapsed"] === "1";
  const toggleCollapsed = () =>
    saveSetting("notes_sidebar_collapsed", collapsed ? "0" : "1");

  return (
    <div className="flex min-h-0 flex-1">
      {collapsed ? (
        // 收起态:对齐主侧栏,只剩一列图标(新建便签 + 各便签),底部展开按钮
        <aside className="flex w-12 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="shrink-0 p-1 pt-2">
            <button
              title={t("S.X.ExpandSidebar")}
              onClick={toggleCollapsed}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1">
            <button
              title={t("S.X.NewNote")}
              onClick={() => void addNote()}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <FilePlus2 size={16} />
            </button>
            {notes.map((n) => {
              const active = n.id === selectedNoteId;
              return (
                <button
                  key={n.id}
                  title={n.custom_title || n.title || t("S.X.UntitledNote")}
                  onClick={() => selectNote(n.id)}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                    active
                      ? "bg-sidebar-selected text-sidebar-selected-fg"
                      : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
                  }`}
                >
                  <FileText size={16} style={{ color: colorForId(n.group_id ?? "") }} />
                </button>
              );
            })}
          </div>
        </aside>
      ) : (
        /* 第二侧边栏:便签树 + 顶部新建按钮(便签 / 分组),右边缘可拖动改宽 */
        <aside
          style={{ width: navWidth }}
          className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        >
          <div
            onMouseDown={startResize}
            className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40"
          />
          <div className="flex h-9 shrink-0 items-center justify-between pr-2 pl-3">
            <span className="text-xs font-semibold text-sidebar-strong">{t("S.X.Notes")}</span>
            <div className="flex items-center gap-0.5">
              <button
                title={t("S.X.NewNote")}
                onClick={() => void addNote()}
                className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <FilePlus2 size={14} />
              </button>
              <button
                title={t("S.X.NewNoteGroup")}
                onClick={() => void addNoteGroup(t("S.X.NewNoteGroup"))}
                className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <FolderPlus size={14} />
              </button>
              <button
                title={t("S.X.CollapseSidebar")}
                onClick={toggleCollapsed}
                className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
            <NotesTree />
          </div>
        </aside>
      )}

      {/* 右侧编辑区 */}
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
