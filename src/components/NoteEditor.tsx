import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Baseline,
  Bold,
  Code,
  Heading,
  Image as ImageIcon,
  Italic,
  List,
  ListTodo,
  Strikethrough,
} from "lucide-react";
import { ipc } from "../lib/tauri-ipc";
import { t } from "../lib/i18n";

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      NoteImage,
      TextStyle,
      Color,
    ],
    content: legacyToMarkdown(content),
    contentType: "markdown",
    editorProps: {
      attributes: { class: "note-prose" },
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
      </div>
      <div style={style} className="note-editor min-h-0 flex-1 overflow-y-auto" onClick={() => editor.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
