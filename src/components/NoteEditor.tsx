import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Baseline,
  Bold,
  CheckSquare,
  Code,
  Heading,
  Image as ImageIcon,
  Italic,
  List,
  ListTodo,
  Strikethrough,
  Table as TableIcon,
} from "lucide-react";
import { ipc } from "../lib/tauri-ipc";
import { useAppStore } from "../store/useAppStore";
import { t } from "../lib/i18n";
import { Popover, MenuItem } from "./ui/Popover";

/**
 * 便签所见即所得编辑器(tiptap):输入 Markdown 语法实时生效
 * (# +空格=标题、- 空格=列表、- [ ] =任务、**粗** 等 input rules),
 * 正文仍以 Markdown 文本持久化进 SQLite(notes.content)。
 * 图片走旧版 NoteImageStore 模式:文件存 %AppData%\MinimalTodoApp\note-images,
 * 正文只存 noteimg://文件名,渲染时经 asset 协议解析。
 */

/** 图片仓库目录(启动后由 NotesView 预取一次) */
let imageDir = "";
export async function ensureNoteImageDir(): Promise<void> {
  if (!imageDir) imageDir = await ipc.noteImageDir();
}

function resolveNoteImg(src: string | null | undefined): string {
  if (!src) return "";
  if (src.startsWith("noteimg://") && imageDir) {
    return convertFileSrc(`${imageDir}\\${src.slice("noteimg://".length)}`);
  }
  return src;
}

/** 图片节点:DB 里存 noteimg://文件名,展示时映射为 asset 协议 URL */
const NoteImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, src: resolveNoteImg(HTMLAttributes.src as string) }];
  },
});

/** 旧版自定义标记 → 标准形式:<img=fn> → 图片节点,<color=#x>…</color> → span 颜色 */
function legacyToMarkdown(s: string): string {
  return s
    .replace(/<img=([^>]+)>/g, (_m, fn: string) => `![](noteimg://${fn.trim()})`)
    .replace(/<color=(#[0-9a-fA-F]{3,8})>/g, '<span style="color: $1">')
    .replace(/<\/color>/g, "</span>");
}

const IMG_EXT = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp"]);

function extOf(file: File): string {
  const byName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMG_EXT.has(byName)) return byName;
  const byType = file.type.split("/").pop()?.toLowerCase() ?? "";
  return IMG_EXT.has(byType) ? byType : "png";
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || IMG_EXT.has(file.name.split(".").pop()?.toLowerCase() ?? "");
}

export default function NoteEditor({
  noteId,
  content,
  style,
  onChange,
}: {
  noteId: string;
  /** Markdown 正文(含旧版自定义标记) */
  content: string;
  style?: React.CSSProperties;
  /** 内容变化回调(已序列化回 Markdown) */
  onChange: (md: string) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const addTask = useAppStore((s) => s.addTask);
  const pushToast = useAppStore((s) => s.pushToast);
  // 选中文本右键菜单(加入待办):仅在有选区时弹出,空选区放行系统默认菜单
  const [selMenu, setSelMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  // 插入表格小面板:输入行 / 列后生成
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      NoteImage,
      // 表格(可拖动列宽);序列化经 @tiptap/markdown 的 HTML 兜底嵌入正文,可往返持久化
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
    ],
    content: legacyToMarkdown(content),
    contentType: "markdown",
    editorProps: {
      attributes: { class: "note-prose" },
      // 复制纯文本:用 ProseMirror 原生取文本(块间单换行、软换行 \n),再**逐行裁掉行尾空白**
      // ——这是用户反馈「每行末尾多一个空格」的根因(正文 / 序列化里残留的行尾空格)。
      // 最后折叠多余空行 + 裁掉首尾空白。只影响 text/plain,text/html 仍由 PM 生成,粘到富文本不丢格式。
      clipboardTextSerializer: (slice) =>
        slice.content
          .textBetween(0, slice.content.size, "\n", (leaf) =>
            leaf.type.name === "hardBreak" ? "\n" : "",
          )
          .split("\n")
          .map((line) => line.replace(/[ \t]+$/, ""))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/^\s+|\s+$/g, ""),
      // 粘贴图片:存盘 note-images 后以 noteimg:// 引用插入(对齐旧版 Editor_Pasting)
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const images = files.filter(isImageFile);
        // 同时含文本时走默认文本粘贴(对齐旧版)
        if (images.length === 0 || event.clipboardData?.getData("text/plain")) return false;
        void insertImageFiles(images);
        return true;
      },
      // 拖入图片文件:同粘贴(对齐旧版 Editor_PreviewDrop)
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const images = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile);
        if (images.length === 0) return false;
        void insertImageFiles(images);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getMarkdown());
    },
  });

  // 切换便签时重载内容(同一编辑器实例复用)
  const loadedFor = useRef(noteId);
  useEffect(() => {
    if (!editor || loadedFor.current === noteId) return;
    loadedFor.current = noteId;
    editor.commands.setContent(legacyToMarkdown(content), { contentType: "markdown" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, editor]);

  const insertImageFiles = async (files: File[]) => {
    if (!editor) return;
    await ensureNoteImageDir();
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const name = await ipc.saveNoteImage(bytes, extOf(f));
      editor.chain().focus().setImage({ src: `noteimg://${name}` }).run();
    }
  };

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []).filter(isImageFile);
      if (files.length > 0) void insertImageFiles(files);
    };
    input.click();
  };

  if (!editor) return null;

  // 标题循环:普通 → H1 → H2 → H3 → 普通(对齐旧版 HeadingButton)
  const cycleHeading = () => {
    const cur = [1, 2, 3].find((l) => editor.isActive("heading", { level: l }));
    const chain = editor.chain().focus();
    if (cur === 3) chain.setParagraph().run();
    else chain.setHeading({ level: ((cur ?? 0) + 1) as 1 | 2 | 3 }).run();
  };

  const COLORS = [
    "#E11D48", "#EA580C", "#F59E0B", "#16A34A", "#0891B2",
    "#2563EB", "#7C3AED", "#DB2777",
  ];

  const Btn = (p: { title: string; active?: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      title={p.title}
      onMouseDown={(e) => e.preventDefault()} // 不抢编辑器焦点
      onClick={p.onClick}
      className={`flex h-6 w-6 items-center justify-center rounded hover:bg-card-hover ${
        p.active ? "bg-selected text-accent" : "text-text-2"
      }`}
    >
      {p.children}
    </button>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* 工具栏(对齐旧版便签工具栏);窄窗口自动换行,避免字色/插图按钮被裁 */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-divider px-2 py-1">
        <Btn title={t("S.Note.Heading")} active={editor.isActive("heading")} onClick={cycleHeading}>
          <Heading size={13} />
        </Btn>
        <Btn
          title={t("S.Note.Bold")}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={13} />
        </Btn>
        <Btn
          title={t("S.Note.Italic")}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={13} />
        </Btn>
        <Btn
          title={t("S.Note.Strikethrough")}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={13} />
        </Btn>
        <Btn
          title="Code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={13} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-divider" />
        <Btn
          title={t("S.Note.Bullet")}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={13} />
        </Btn>
        <Btn
          title={t("S.Note.TaskList")}
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListTodo size={13} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-divider" />
        {/* 字体颜色:小色板,点选给选区着色;再点当前色清除 */}
        <span className="group/color relative">
          <Btn title={t("S.Note.TextColor")} onClick={() => {}}>
            <Baseline size={13} />
          </Btn>
          <span className="absolute top-full left-0 z-50 hidden gap-1 rounded-md border border-divider bg-popup p-1.5 shadow-lg group-hover/color:flex">
            {COLORS.map((c) => (
              <button
                key={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() =>
                  editor.isActive("textStyle", { color: c })
                    ? editor.chain().focus().unsetColor().run()
                    : editor.chain().focus().setColor(c).run()
                }
                className="h-4 w-4 rounded-sm ring-1 ring-divider hover:scale-110"
                style={{ background: c }}
              />
            ))}
          </span>
        </span>
        <Btn title={t("S.Note.InsertImage")} onClick={pickImage}>
          <ImageIcon size={13} />
        </Btn>
        {/* 插入表格:点击弹出小面板,输入行 / 列后生成 */}
        <span className="relative">
          <Btn
            title={t("S.X.NoteTable")}
            active={editor.isActive("table")}
            onClick={() => setTableOpen((o) => !o)}
          >
            <TableIcon size={13} />
          </Btn>
          {tableOpen && (
            <>
              {/* 点击空白处关闭 */}
              <div className="fixed inset-0 z-40" onClick={() => setTableOpen(false)} />
              <div className="absolute top-full left-0 z-50 mt-1 w-44 rounded-md border border-divider bg-popup p-2 shadow-lg">
                <div className="mb-2 flex items-center gap-2 text-xs text-text-2">
                  <label className="flex items-center gap-1">
                    {t("S.X.NoteTableRows")}
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={tableRows}
                      onChange={(e) =>
                        setTableRows(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="w-12 rounded border border-divider bg-input px-1 py-0.5 text-text-1 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    {t("S.X.NoteTableCols")}
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={tableCols}
                      onChange={(e) =>
                        setTableCols(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="w-12 rounded border border-divider bg-input px-1 py-0.5 text-text-1 outline-none focus:border-accent"
                    />
                  </label>
                </div>
                <button
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true })
                      .run();
                    setTableOpen(false);
                  }}
                  className="w-full rounded-md bg-accent px-2 py-1 text-xs text-on-accent hover:opacity-90"
                >
                  {t("S.X.NoteTableInsert")}
                </button>
              </div>
            </>
          )}
        </span>
      </div>
      <div
        style={style}
        className="note-editor min-h-0 flex-1 overflow-y-auto"
        onClick={() => editor.chain().focus().run()}
        onContextMenu={(e) => {
          // 取当前选区纯文本;有选中才接管右键(加入待办),否则放行浏览器默认菜单
          const { from, to } = editor.state.selection;
          if (from === to) return;
          const text = editor.state.doc
            .textBetween(from, to, "\n", (leaf) => (leaf.type.name === "hardBreak" ? "\n" : ""))
            .trim();
          if (!text) return;
          e.preventDefault();
          setSelMenu({ x: e.clientX, y: e.clientY, text });
        }}
      >
        <EditorContent editor={editor} />
      </div>
      {selMenu && (
        <Popover at={selMenu} anchor={null} onClose={() => setSelMenu(null)} zIndex={200}>
          <div className="w-44">
            <MenuItem
              onClick={() => {
                const { text } = selMenu;
                setSelMenu(null);
                // 选区多行 → 每非空行一条待办;单行 → 一条。加入默认清单(无分组)
                const lines = text
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean);
                const titles = lines.length > 0 ? lines : [text];
                void (async () => {
                  for (const title of titles) await addTask(title);
                  pushToast(t("S.X.NoteAddedToTask"));
                })();
              }}
            >
              <CheckSquare size={13} />
              {t("S.X.NoteSelToTask")}
            </MenuItem>
          </div>
        </Popover>
      )}
    </div>
  );
}
