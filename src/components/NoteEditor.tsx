import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/env";
import { imageUrl } from "../lib/backend/objectUrl";
import {
  Baseline,
  Bold,
  CheckSquare,
  Code,
  Code2,
  Copy,
  FileCode2,
  Heading,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListTodo,
  ListTree,
  Quote,
  Redo2,
  Scissors,
  Strikethrough,
  Table as TableIcon,
  Undo2,
} from "lucide-react";
import { ipc } from "../lib/tauri-ipc";
import { useAppStore } from "../store/useAppStore";
import { t } from "../lib/i18n";
import { Popover, MenuItem } from "./ui/Popover";
import { createSlashCommand } from "./notes/SlashCommand";

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
  if (src.startsWith("noteimg://")) {
    const name = src.slice("noteimg://".length);
    // Web:从 IndexedDB Blob 的 objectURL 缓存同步取;桌面:asset 协议
    if (!isTauri) return imageUrl(name);
    return imageDir ? convertFileSrc(`${imageDir}\\${name}`) : "";
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

// GFM 表格「分隔行」签名(| --- | :--: | … 至少两列):粘贴文本含此行即视为含 Markdown 表格
const MD_TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/m;
function looksLikeMarkdownTable(s: string): boolean {
  return MD_TABLE_DELIM.test(s);
}

// 块级 Markdown 语法特征(行首标志,误判率低):标题 / 无序·有序·任务列表 / 引用 / 代码块围栏 / 分隔线。
// 命中即把粘贴文本当 Markdown 解析(对齐拖入 .md 文件的行为),普通文本不含这些标志故不受影响。
const MD_BLOCK_SIGNS = [
  /^#{1,6}\s+\S/m, // # 标题
  /^\s*[-*+]\s+\S/m, // - 无序列表
  /^\s*\d+\.\s+\S/m, // 1. 有序列表
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // - [ ] 任务
  /^\s*>\s+\S/m, // > 引用
  /^\s*```/m, // ``` 代码块围栏
  /^\s*(---|\*\*\*|___)\s*$/m, // 分隔线
];
function looksLikeMarkdown(s: string): boolean {
  if (looksLikeMarkdownTable(s)) return true;
  return MD_BLOCK_SIGNS.some((re) => re.test(s));
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

/** 字数统计:词 = CJK 字 + 拉丁词串;字符 = 去空白后的长度 */
function computeStats(text: string): { words: number; chars: number } {
  const cjk = text.match(/[㐀-鿿぀-ヿ]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return { words: cjk + latin, chars: text.replace(/\s/g, "").length };
}

export default function NoteEditor({
  noteId,
  content,
  style,
  onChange,
  onStats,
}: {
  noteId: string;
  /** Markdown 正文(含旧版自定义标记) */
  content: string;
  style?: React.CSSProperties;
  /** 内容变化回调(已序列化回 Markdown) */
  onChange: (md: string) => void;
  /** 字数统计回调(状态栏用) */
  onStats?: (s: { words: number; chars: number }) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  // 源码态标记(供 onUpdate 闭包判断):源码态下编辑器是隐藏的「旧副本」,其变更不应保存,以 textarea 为准
  const sourceModeRef = useRef(false);
  // 斜杠命令「图片」项调起文件选择:用 ref 桥接到下方 pickImage(扩展在 useEditor 时就需引用)
  const pickImageRef = useRef<() => void>(() => {});
  const addTask = useAppStore((s) => s.addTask);
  const pushToast = useAppStore((s) => s.pushToast);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  // 选中文本右键菜单(加入待办):仅在有选区时弹出,空选区放行系统默认菜单
  const [selMenu, setSelMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  // 插入表格小面板:输入行 / 列后生成
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  // 插入链接小面板(Ctrl+K 或工具栏)
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // 文档大纲悬浮面板:默认展示,跟随用户上次选择(持久化 note_toc_open;"0"=关)
  const tocOpen = settings["note_toc_open"] !== "0";
  // 「显示为源码」:就地把正文区换成可编辑的 Markdown 源码(工具栏不变,非单独页面)
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  sourceModeRef.current = sourceMode;
  // 进入源码态时把编辑器光标位置映射到 textarea(避免跳行首)
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sourceCaretRef = useRef(0);

  const editor = useEditor({
    extensions: [
      // StarterKit v3 自带 Link:配置为不在编辑器内点击跳转 + 自动识别裸链(不要再单独加 Link,会重名)
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
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
      // 斜杠命令(/ 弹出快捷插入菜单)
      createSlashCommand(() => pickImageRef.current()),
    ],
    content: legacyToMarkdown(content),
    contentType: "markdown",
    editorProps: {
      attributes: { class: "note-prose" },
      // Ctrl/Cmd+K:打开插入链接面板(选区在链接上则预填其地址)
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          const link = view.state.selection.$from.marks().find((m) => m.type.name === "link");
          setLinkUrl((link?.attrs.href as string) ?? "");
          setLinkOpen(true);
          return true;
        }
        return false;
      },
      // Ctrl/Cmd+点击链接:用系统默认浏览器打开(不干扰编辑时的光标定位)
      handleClick: (view, pos, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const link = view.state.doc.resolve(pos).marks().find((m) => m.type.name === "link");
        const href = link?.attrs.href as string | undefined;
        if (!href) return false;
        event.preventDefault();
        if (isTauri) void invoke("open_url", { url: href });
        else window.open(href, "_blank", "noopener,noreferrer");
        return true;
      },
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
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        // 粘贴 Markdown 文本(标题/列表/引用/代码块/表格等)→ 解析成富文本渲染,对齐拖入 .md 文件。
        // 仅块级语法命中才解析,普通文本不受影响(避免误把含 # / - 的普通文字转格式)。
        if (text && looksLikeMarkdown(text)) {
          editor?.chain().focus().insertContent(text, { contentType: "markdown" }).run();
          return true;
        }
        // 粘贴图片(无文本时):存盘 note-images 后以 noteimg:// 引用插入(对齐旧版 Editor_Pasting)
        const files = Array.from(event.clipboardData?.files ?? []);
        const images = files.filter(isImageFile);
        if (images.length === 0 || text) return false; // 同时含文本走默认文本粘贴
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
      if (sourceModeRef.current) return; // 源码态以 textarea 为准,忽略隐藏编辑器的变更
      onChangeRef.current(editor.getMarkdown());
      onStatsRef.current?.(computeStats(editor.getText()));
    },
  });

  // 切换便签 / 首次挂载后上报一次字数(onUpdate 不会在加载时触发)
  useEffect(() => {
    if (editor) onStatsRef.current?.(computeStats(editor.getText()));
  }, [editor, noteId]);

  // 进入源码态:聚焦 textarea、把光标放到映射出的偏移,并把光标所在行垂直居中
  useEffect(() => {
    if (!sourceMode) return;
    const el = textareaRef.current;
    if (!el) return;
    const p = Math.min(sourceCaretRef.current, el.value.length);
    el.focus();
    el.setSelectionRange(p, p);
    // 估算光标行的纵向位置(按 \n 计行,长行折行的少量误差可接受),滚动到视口居中
    const cs = getComputedStyle(el);
    let lh = parseFloat(cs.lineHeight);
    if (Number.isNaN(lh)) lh = (parseFloat(cs.fontSize) || 14) * 1.625;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const line = el.value.slice(0, p).split("\n").length - 1;
    const caretY = padTop + line * lh;
    el.scrollTop = Math.max(0, caretY - el.clientHeight / 2 + lh / 2);
  }, [sourceMode]);

  // 切换便签时重载内容(同一编辑器实例复用),并退出源码态
  const loadedFor = useRef(noteId);
  useEffect(() => {
    if (!editor || loadedFor.current === noteId) return;
    loadedFor.current = noteId;
    setSourceMode(false);
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
  pickImageRef.current = pickImage; // 供斜杠命令「图片」项调用

  if (!editor) return null;

  // 文档大纲:遍历正文 H1–H3,点击滚动到对应标题(随编辑器更新重算)
  const headings: { level: number; text: string; pos: number }[] = [];
  if (tocOpen) {
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && (node.attrs.level as number) <= 3) {
        headings.push({ level: node.attrs.level as number, text: node.textContent || "—", pos });
      }
    });
  }
  const scrollToHeading = (pos: number) => {
    editor.chain().focus().setTextSelection(pos + 1).run();
    const dom = editor.view.domAtPos(pos + 1).node;
    const el = dom instanceof HTMLElement ? dom : (dom.parentElement ?? null);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

  const Btn = (p: {
    title: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      title={p.title}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()} // 不抢编辑器焦点
      onClick={p.onClick}
      className={`flex h-6 w-6 items-center justify-center rounded hover:bg-card-hover disabled:pointer-events-none disabled:opacity-35 ${
        p.active ? "bg-selected text-accent" : "text-text-2"
      }`}
    >
      {p.children}
    </button>
  );

  // 进入源码:用当前 Markdown 填充 textarea,并把光标精确映射到源码偏移。
  // 做法:在光标处插入一个私有区标记字符 → 序列化成 Markdown → indexOf 得到精确偏移 → 撤掉标记
  // (不进 undo 历史、sourceModeRef 抑制 onUpdate 保存,真实文档不受影响)。
  const enterSource = () => {
    const MARK = ""; // 私有区字符,正文几乎不可能出现
    const pos = editor.state.selection.head;
    sourceModeRef.current = true; // 先抑制接下来两次 dispatch 的保存
    let md = editor.getMarkdown();
    try {
      editor.view.dispatch(editor.state.tr.insertText(MARK, pos).setMeta("addToHistory", false));
      const withMark = editor.getMarkdown();
      editor.view.dispatch(
        editor.state.tr.delete(pos, pos + MARK.length).setMeta("addToHistory", false),
      );
      md = editor.getMarkdown();
      const caret = withMark.indexOf(MARK);
      sourceCaretRef.current = caret >= 0 ? caret : 0;
    } catch {
      sourceCaretRef.current = 0;
    }
    setSourceText(md);
    setSourceMode(true);
  };
  const exitSource = () => {
    // 内容没改就不重建,保留编辑器原有光标位置;改了才解析回(触发 onUpdate → 保存)
    if (sourceText !== editor.getMarkdown()) {
      editor.commands.setContent(sourceText, { contentType: "markdown" });
    }
    setSourceMode(false);
    editor.commands.focus();
  };

  // 应用链接面板:空地址=移除链接;无选区=插入「地址即文字」的链接;有选区=给选区加链接
  const applyLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* 工具栏(对齐旧版便签工具栏);窄窗口自动换行,避免字色/插图按钮被裁 */}
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-divider px-2 py-1">
        <Btn
          title={t("S.X.NoteUndo")}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={13} />
        </Btn>
        <Btn
          title={t("S.X.NoteRedo")}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={13} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-divider" />
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
        <Btn
          title={t("S.X.NoteQuote")}
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={13} />
        </Btn>
        <Btn
          title={t("S.X.NoteCodeBlock")}
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 size={13} />
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
        {/* 插入链接(Ctrl+K):点击弹出地址输入面板 */}
        <span className="relative">
          <Btn
            title={t("S.X.NoteLink")}
            active={editor.isActive("link")}
            onClick={() => {
              setLinkUrl((editor.getAttributes("link").href as string) ?? "");
              setLinkOpen(true);
            }}
          >
            <LinkIcon size={13} />
          </Btn>
          {linkOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLinkOpen(false)} />
              <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-md border border-divider bg-popup p-2 shadow-lg">
                <input
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyLink();
                    if (e.key === "Escape") setLinkOpen(false);
                  }}
                  placeholder={t("S.X.NoteLinkPlaceholder")}
                  className="w-full rounded border border-divider bg-input px-2 py-1 text-xs text-text-1 outline-none focus:border-accent"
                />
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => {
                      setLinkUrl("");
                      setLinkOpen(false);
                      editor.chain().focus().unsetLink().run();
                    }}
                    className="rounded px-2 py-1 text-xs text-muted hover:bg-card-hover"
                  >
                    {t("S.X.NoteLinkRemove")}
                  </button>
                  <button
                    onClick={applyLink}
                    className="rounded-md bg-accent px-2.5 py-1 text-xs text-on-accent hover:opacity-90"
                  >
                    {t("S.X.NoteLinkApply")}
                  </button>
                </div>
              </div>
            </>
          )}
        </span>
        <span className="mx-1 h-4 w-px bg-divider" />
        {/* 大纲默认显示;按钮=「不显示大纲」,图标为大纲加一道斜杠划掉;高亮=已隐藏 */}
        <Btn
          title={t("S.X.NoteOutlineHide")}
          active={!tocOpen}
          onClick={() => saveSetting("note_toc_open", tocOpen ? "0" : "1")}
        >
          <span className="relative inline-flex">
            <ListTree size={13} />
            <span className="pointer-events-none absolute top-1/2 left-1/2 h-[1.5px] w-[75%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
          </span>
        </Btn>
        {/* 显示为源码 / 返回编辑:就地切换正文区,工具栏保持与平时一致 */}
        <Btn
          title={sourceMode ? t("S.X.NoteShowWysiwyg") : t("S.X.NoteShowSource")}
          active={sourceMode}
          onClick={sourceMode ? exitSource : enterSource}
        >
          <FileCode2 size={13} />
        </Btn>
      </div>
      {/* 编辑器始终挂载(源码态仅隐藏),保证工具栏按钮操作的编辑器视图有效、不崩 */}
      <div
        style={style}
        className={`note-editor min-h-0 flex-1 overflow-y-auto ${sourceMode ? "hidden" : ""}`}
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
      {/* 源码视图:就地可编辑 Markdown(# 等符号可直接改),覆盖在编辑器位置 */}
      {sourceMode && (
        <textarea
          ref={textareaRef}
          value={sourceText}
          spellCheck={false}
          onChange={(e) => {
            setSourceText(e.target.value);
            onChangeRef.current(e.target.value);
          }}
          className="min-h-0 flex-1 resize-none bg-card p-4 font-mono text-sm leading-relaxed text-text-1 outline-none"
        />
      )}
      {selMenu && (
        <Popover at={selMenu} anchor={null} onClose={() => setSelMenu(null)} zIndex={200}>
          <div className="w-44">
            <MenuItem
              onClick={() => {
                const { text } = selMenu;
                setSelMenu(null);
                void navigator.clipboard.writeText(text);
              }}
            >
              <Copy size={13} />
              {t("S.X.NoteSelCopy")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                const { text } = selMenu;
                setSelMenu(null);
                void navigator.clipboard.writeText(text);
                // 剪切:复制后删除选区内容
                editor?.chain().focus().deleteSelection().run();
              }}
            >
              <Scissors size={13} />
              {t("S.X.NoteSelCut")}
            </MenuItem>
            <div className="my-1 h-px bg-divider" />
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
      {/* 文档大纲悬浮面板:右上角,点击标题滚动定位(默认开;源码态也保留;无标题时不显示浮层) */}
      {tocOpen && headings.length > 0 && (
        <div className="absolute top-10 right-3 z-30 max-h-[70%] w-56 overflow-y-auto rounded-md border border-divider bg-popup/95 p-1.5 shadow-lg backdrop-blur">
          <div className="mb-1 px-1.5 text-xs font-semibold text-muted">{t("S.X.NoteOutline")}</div>
          {headings.map((h, i) => (
            <button
              key={i}
              onClick={() => scrollToHeading(h.pos)}
              style={{ paddingLeft: `${(h.level - 1) * 12 + 6}px` }}
              className="block w-full truncate rounded py-1 pr-1.5 text-left text-xs text-text-2 hover:bg-card-hover hover:text-text-1"
            >
              {h.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
