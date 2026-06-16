import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion";
import { createRoot, type Root } from "react-dom/client";
import type { CSSProperties, ReactNode } from "react";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListTodo,
  Minus,
  Quote,
  Table as TableIcon,
} from "lucide-react";
import { t } from "../../lib/i18n";

/** 斜杠命令项:标题 + 关键词(用于过滤)+ 图标 + 执行(先删掉 /查询,再执行动作) */
export interface SlashItem {
  title: string;
  keywords: string;
  icon: ReactNode;
  run: (p: { editor: Editor; range: Range }) => void;
}

function buildItems(onImage: () => void): SlashItem[] {
  const del = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);
  return [
    { title: t("S.X.SlashH1"), keywords: "h1 heading 标题 一级", icon: <Heading1 size={15} />, run: ({ editor, range }) => del(editor, range).setHeading({ level: 1 }).run() },
    { title: t("S.X.SlashH2"), keywords: "h2 heading 标题 二级", icon: <Heading2 size={15} />, run: ({ editor, range }) => del(editor, range).setHeading({ level: 2 }).run() },
    { title: t("S.X.SlashH3"), keywords: "h3 heading 标题 三级", icon: <Heading3 size={15} />, run: ({ editor, range }) => del(editor, range).setHeading({ level: 3 }).run() },
    { title: t("S.X.SlashBullet"), keywords: "bullet list ul 列表 项目符号", icon: <List size={15} />, run: ({ editor, range }) => del(editor, range).toggleBulletList().run() },
    { title: t("S.X.SlashTask"), keywords: "task todo check 任务 待办", icon: <ListTodo size={15} />, run: ({ editor, range }) => del(editor, range).toggleTaskList().run() },
    { title: t("S.X.SlashQuote"), keywords: "quote blockquote 引用", icon: <Quote size={15} />, run: ({ editor, range }) => del(editor, range).toggleBlockquote().run() },
    { title: t("S.X.SlashCode"), keywords: "code codeblock 代码块", icon: <Code2 size={15} />, run: ({ editor, range }) => del(editor, range).toggleCodeBlock().run() },
    { title: t("S.X.SlashDivider"), keywords: "divider hr rule 分割线", icon: <Minus size={15} />, run: ({ editor, range }) => del(editor, range).setHorizontalRule().run() },
    { title: t("S.X.SlashTable"), keywords: "table 表格", icon: <TableIcon size={15} />, run: ({ editor, range }) => del(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { title: t("S.X.SlashImage"), keywords: "image img 图片 插图", icon: <ImageIcon size={15} />, run: ({ editor, range }) => { del(editor, range).run(); onImage(); } },
  ];
}

/** 纯展示菜单(由 render 生命周期用 createRoot 挂载) */
function SlashMenu({
  items,
  selected,
  onSelect,
  style,
}: {
  items: SlashItem[];
  selected: number;
  onSelect: (i: number) => void;
  style: CSSProperties;
}) {
  if (items.length === 0) return null;
  return (
    <div
      style={style}
      className="fixed z-[250] max-h-72 w-56 overflow-y-auto rounded-md border border-divider bg-popup p-1 shadow-lg"
    >
      {items.map((it, i) => (
        <button
          key={it.title}
          // 用 mousedown + preventDefault,避免点选时编辑器失焦丢选区
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(i);
          }}
          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
            i === selected ? "bg-selected text-text-1" : "text-text-2 hover:bg-card-hover"
          }`}
        >
          <span className="text-muted">{it.icon}</span>
          <span className="min-w-0 flex-1 break-words">{it.title}</span>
        </button>
      ))}
    </div>
  );
}

function makeRender() {
  return () => {
    let root: Root | null = null;
    let el: HTMLDivElement | null = null;
    let items: SlashItem[] = [];
    let selected = 0;
    let pick: ((item: SlashItem) => void) | null = null;
    let rect: (() => DOMRect | null) | null = null;

    const draw = () => {
      if (!root) return;
      const r = rect?.();
      const style: CSSProperties = r
        ? { left: r.left, top: r.bottom + 6 }
        : { left: -9999, top: -9999 };
      root.render(
        <SlashMenu
          items={items}
          selected={selected}
          onSelect={(i) => items[i] && pick?.(items[i])}
          style={style}
        />,
      );
    };

    return {
      onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
        items = props.items;
        selected = 0;
        pick = (it) => props.command(it);
        rect = props.clientRect ?? null;
        el = document.createElement("div");
        document.body.appendChild(el);
        root = createRoot(el);
        draw();
      },
      onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
        items = props.items;
        pick = (it) => props.command(it);
        rect = props.clientRect ?? null;
        if (selected > items.length - 1) selected = Math.max(0, items.length - 1);
        draw();
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        const { event } = props;
        if (event.key === "ArrowDown") {
          selected = items.length ? (selected + 1) % items.length : 0;
          draw();
          return true;
        }
        if (event.key === "ArrowUp") {
          selected = items.length ? (selected - 1 + items.length) % items.length : 0;
          draw();
          return true;
        }
        if (event.key === "Enter") {
          if (items[selected]) pick?.(items[selected]);
          return true;
        }
        if (event.key === "Escape") {
          exitSuggestion(props.view);
          return true;
        }
        return false;
      },
      onExit: () => {
        root?.unmount();
        el?.remove();
        root = null;
        el = null;
      },
    };
  };
}

/** 工厂:在正文输入 `/` 触发命令菜单。`onImage` 用于「图片」项调起文件选择(由 NoteEditor 提供)。 */
export function createSlashCommand(onImage: () => void) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          items: ({ query }) => {
            const q = query.trim().toLowerCase();
            const all = buildItems(onImage);
            return q
              ? all.filter(
                  (it) =>
                    it.title.toLowerCase().includes(q) || it.keywords.toLowerCase().includes(q),
                )
              : all;
          },
          command: ({ editor, range, props }) => props.run({ editor, range }),
          render: makeRender(),
        }),
      ];
    },
  });
}
