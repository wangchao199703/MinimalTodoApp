import { useEffect, useRef, useState } from "react";
import {
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  LocateFixed,
  PanelLeftClose,
  PanelLeftOpen,
  Regex,
  Search,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { deriveTitle } from "../../lib/markdown";
import { readMarkdownDrop } from "../../lib/markdownIO";
import { f, t } from "../../lib/i18n";
import type { Note } from "../../lib/tauri-ipc";
import NoteEditor, { ensureNoteImageDir } from "../NoteEditor";
import NotesTree, { noteGroupColor } from "../NotesTree";
import NotesTrash from "../notes/NotesTrash";

// 便签视图 = 第二侧边栏(便签树 + 新建)+ 右侧编辑区

function Editor({ note }: { note: Note }) {
  const patchNote = useAppStore((s) => s.patchNote);
  const settings = useAppStore((s) => s.settings);
  const [title, setTitle] = useState(note.custom_title);
  const [stats, setStats] = useState<{ words: number; chars: number }>({ words: 0, chars: 0 });
  const contentRef = useRef(note.content);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<number | null>(null);

  // 图片仓库目录就绪后再挂编辑器,确保首次渲染图片即可解析
  const [imgReady, setImgReady] = useState(false);
  useEffect(() => {
    void ensureNoteImageDir().then(() => setImgReady(true));
  }, []);

  // 切换便签时重置本地草稿(正文由 NoteEditor 按 noteId 自行重载;源码态也在 NoteEditor 内重置)
  useEffect(() => {
    setTitle(note.custom_title);
    contentRef.current = note.content;
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外部(侧栏重命名等)改了 custom_title:同步到标题栏;用户正在输入标题时不打断
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(note.custom_title);
  }, [note.custom_title]); // eslint-disable-line react-hooks/exhaustive-deps

  // 800ms 防抖自动保存:正文与标题分别累积到 pending 合并提交。
  // 正文保存绝不携带 custom_title(三态:省略=不变),避免用旧的本地标题覆盖侧栏刚改的名。
  const pending = useRef<{ content?: string; title?: string; custom_title?: string }>({});
  const scheduleSave = (patch: { content?: string; title?: string; custom_title?: string }) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const next = pending.current;
      pending.current = {};
      void patchNote({ id: note.id, ...next });
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
          ref={titleRef}
          value={title}
          placeholder={note.title || t("S.X.UntitledNote")}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ custom_title: e.target.value });
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-text-1 outline-none placeholder:text-muted"
        />
      </div>
      {/* 所见即所得 Markdown 编辑器(「显示为源码」就地切换在 NoteEditor 内部) */}
      {imgReady && (
        <NoteEditor
          noteId={note.id}
          content={note.content}
          style={style}
          onChange={(md) => {
            contentRef.current = md;
            scheduleSave({ content: md, title: deriveTitle(md) });
          }}
          onStats={setStats}
        />
      )}
      {/* 底部状态栏:字数 + 最后修改时间(弱化色) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-divider px-3 py-1 text-xs text-text-2/70">
        <span>{f("S.X.NoteWordCount", stats.words, stats.chars)}</span>
        <span className="truncate">{f("S.X.NoteLastModified", note.updated_at)}</span>
      </div>
    </div>
  );
}

export default function NotesView() {
  const notes = useAppStore((s) => s.notes);
  const noteGroups = useAppStore((s) => s.noteGroups);
  const selectedNoteId = useAppStore((s) => s.selectedNoteId);
  const addNote = useAppStore((s) => s.addNote);
  const addNoteGroup = useAppStore((s) => s.addNoteGroup);
  const toggleNoteGroupCollapse = useAppStore((s) => s.toggleNoteGroupCollapse);
  const selectNote = useAppStore((s) => s.selectNote);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const importNotesFromFiles = useAppStore((s) => s.importNotesFromFiles);
  const selected = notes.find((n) => n.id === selectedNoteId) ?? null;

  // 定位到当前便签:展开其所在分组(若已折叠)并滚动到该行
  const locateCurrent = async () => {
    if (!selected) return;
    const g = noteGroups.find((x) => x.id === selected.group_id);
    if (g?.is_collapsed) await toggleNoteGroupCollapse(g);
    // 等分组展开后该行渲染出来再滚动
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-note-row="${selected.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  // 回收站(软删除便签)
  const notesTrashOpen = useAppStore((s) => s.notesTrashOpen);
  const setNotesTrashOpen = useAppStore((s) => s.setNotesTrashOpen);

  // 全局搜索:标题 + 正文,支持正则;Ctrl+F 聚焦
  const [query, setQuery] = useState("");
  const [regexOn, setRegexOn] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const q = query.trim();
  // 匹配器:正则非法时吞掉(返回永不匹配),不崩
  const matcher: ((s: string) => boolean) | null = !q
    ? null
    : regexOn
      ? (() => {
          try {
            const re = new RegExp(q, "i");
            return (s: string) => re.test(s);
          } catch {
            return () => false;
          }
        })()
      : (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const results = matcher
    ? notes.filter((n) => matcher(n.custom_title || n.title || "") || matcher(n.content || ""))
    : [];
  const snippet = (n: Note): string => {
    const text = (n.content || "").replace(/\s+/g, " ").trim();
    let idx = -1;
    if (q) {
      if (regexOn) {
        try {
          idx = text.search(new RegExp(q, "i"));
        } catch {
          idx = -1;
        }
      } else idx = text.toLowerCase().indexOf(q.toLowerCase());
    }
    if (idx <= 0) return text.slice(0, 70);
    const start = Math.max(0, idx - 20);
    return (start > 0 ? "…" : "") + text.slice(start, start + 70);
  };

  // 从资源管理器拖入 .md/.markdown → 新建便签(标题=文件名,正文=Markdown 文本);
  // 落在便签区空白处 = 不指定分组(后端落默认分组);落在某分组上由 NotesTree 处理(stopPropagation 截断,不冒泡到此)。
  // 注:WebView2 在 dragDropEnabled:false 下是否派发外部文件 drop 需运行时验证;此处仅用网页 File API,绝不开 OS 拖放(否则破坏排序)。
  const [fileOver, setFileOver] = useState(false);
  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const onAreaDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return; // 非外部文件(如内部排序拖拽)不拦截
    e.preventDefault(); // 必须 preventDefault 才会触发 drop
    e.stopPropagation(); // 便签区自行处理,不冒泡到 App 根的「导入」分组兜底
    e.dataTransfer.dropEffect = "copy";
    if (!fileOver) setFileOver(true);
  };
  const onAreaDragLeave = (e: React.DragEvent) => {
    // 只在真正离开整个区域时取消高亮(避免子元素间移动闪烁)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setFileOver(false);
  };
  const onAreaDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault(); // 阻止 WebView 默认导航到文件
    e.stopPropagation(); // 已在便签区落默认分组,不再冒泡到 App 根的「导入」分组兜底
    setFileOver(false);
    void (async () => {
      const files = await readMarkdownDrop(e.dataTransfer);
      if (files.length > 0) await importNotesFromFiles(files); // 不指定分组 → 默认分组
    })();
  };

  // 第二侧边栏宽度可拖动并持久化(默认 224,范围 60–460;下限按用户要求放到 60)
  const [navWidth, setNavWidth] = useState(() =>
    Math.min(460, Math.max(60, Number(settings["notes_sidebar_width"]) || 224)),
  );
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = navWidth;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(460, Math.max(60, startW + ev.clientX - startX));
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

  // 折叠态图标列按分组分桶,与展开态树保持一致
  const notesByGroup = new Map<string, Note[]>();
  for (const n of notes) {
    if (!n.group_id) continue;
    const list = notesByGroup.get(n.group_id) ?? [];
    list.push(n);
    notesByGroup.set(n.group_id, list);
  }

  return (
    <div
      className={`relative flex min-h-0 flex-1 ${fileOver ? "ring-2 ring-inset ring-accent" : ""}`}
      onDragOver={onAreaDragOver}
      onDragLeave={onAreaDragLeave}
      onDrop={onAreaDrop}
    >
      {fileOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-accent/5">
          <span className="rounded-md bg-popup px-3 py-1.5 text-sm font-medium text-text-1 shadow-lg ring-1 ring-divider">
            {t("S.X.DropMdToImport")}
          </span>
        </div>
      )}
      {collapsed ? (
        // 收起态:对齐主侧栏,只剩一列图标(新建便签 + 各便签),底部展开按钮
        <aside className="flex w-12 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          {/* 顶部 h-9 占位,与主侧栏标题区等高,保证首图标纵向对齐 */}
          <div data-tauri-drag-region className="h-9 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1 pt-0">
            <button
              title={t("S.X.NewNote")}
              onClick={() => void addNote()}
              className="nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-strong hover:bg-sidebar-hover"
            >
              <FilePlus2 size={14} />
            </button>
            {noteGroups.map((g) => {
              const color = noteGroupColor(settings, g.id);
              // 折叠分组:只显示一个分组图标(点击展开),不铺开其便签
              if (g.is_collapsed) {
                return (
                  <button
                    key={g.id}
                    title={g.name}
                    onClick={() => void toggleNoteGroupCollapse(g)}
                    className="nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-strong hover:bg-sidebar-hover"
                  >
                    <Folder size={14} style={{ color }} />
                  </button>
                );
              }
              // 展开分组:铺开其下各便签图标
              return (notesByGroup.get(g.id) ?? []).map((n) => {
                const active = n.id === selectedNoteId;
                return (
                  <button
                    key={n.id}
                    title={n.custom_title || n.title || t("S.X.UntitledNote")}
                    onClick={() => selectNote(n.id)}
                    className={`nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                      active
                        ? "bg-sidebar-selected text-sidebar-selected-fg"
                        : "text-sidebar-strong hover:bg-sidebar-hover"
                    }`}
                  >
                    <FileText size={14} style={{ color }} />
                  </button>
                );
              });
            })}
          </div>
          {/* 折叠/展开按钮统一放底部 */}
          <div className="shrink-0 p-1">
            <button
              title={t("S.X.ExpandSidebar")}
              onClick={toggleCollapsed}
              className="nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-strong hover:bg-sidebar-hover"
            >
              <PanelLeftOpen size={14} />
            </button>
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
                title={t("S.X.NoteLocate")}
                disabled={!selected}
                onClick={() => void locateCurrent()}
                className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <LocateFixed size={14} />
              </button>
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
            </div>
          </div>
          {/* 搜索框(标题 + 正文,正则可选;Ctrl+F 聚焦) */}
          <div className="shrink-0 px-2 pb-1.5">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-sidebar-muted"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("S.X.NoteSearch")}
                className="w-full rounded-md border border-sidebar-border bg-sidebar-hover py-1 pr-12 pl-7 text-xs text-sidebar-strong outline-none focus:border-accent"
              />
              <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
                <button
                  title={t("S.X.NoteSearchRegex")}
                  onClick={() => setRegexOn((v) => !v)}
                  className={`flex h-5 w-5 items-center justify-center rounded ${
                    regexOn ? "bg-accent text-on-accent" : "text-sidebar-muted hover:bg-sidebar-hover"
                  }`}
                >
                  <Regex size={12} />
                </button>
                {query && (
                  <button
                    title={t("S.Clear")}
                    onClick={() => setQuery("")}
                    className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
            {q ? (
              // 搜索结果列表(命中标题 / 正文)
              results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-sidebar-muted">{t("S.X.NoteSearchEmpty")}</div>
              ) : (
                <div className="flex flex-col gap-0.5 px-2">
                  {results.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (notesTrashOpen) void setNotesTrashOpen(false);
                        selectNote(n.id);
                      }}
                      className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left ${
                        n.id === selectedNoteId
                          ? "bg-sidebar-selected text-sidebar-selected-fg"
                          : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
                      }`}
                    >
                      <span className="truncate text-sm">
                        {n.custom_title || n.title || t("S.X.UntitledNote")}
                      </span>
                      <span className="truncate text-xs text-sidebar-muted">{snippet(n)}</span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <NotesTree />
            )}
          </div>
          {/* 折叠按钮统一放底部(对齐主侧栏) */}
          <div className="shrink-0 p-2 pt-1">
            <button
              title={t("S.X.CollapseSidebar")}
              onClick={toggleCollapsed}
              className="nav-lift flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <PanelLeftClose size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.X.CollapseSidebar")}</span>
            </button>
          </div>
        </aside>
      )}

      {/* 右侧:回收站 / 便签编辑区 */}
      {notesTrashOpen ? (
        <NotesTrash />
      ) : selected ? (
        <Editor note={selected} />
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-center text-sm text-muted">
          {t("S.X.EmptyNotes")}
        </div>
      )}
    </div>
  );
}
