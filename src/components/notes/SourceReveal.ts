import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode, Mark } from "@tiptap/pm/model";

/**
 * Typora 式「源码显形」:光标进入某块 / 某行内标记时,用 widget 装饰显示对应的 Markdown 符号
 * (标题 #、引用 >、列表 - / N.、加粗 ** 等、链接 [文字](url))。光标移走即还原为纯富文本。
 * 装饰纯展示、不进文档,getMarkdown / 持久化不受影响。
 */

const KEY = new PluginKey("sourceReveal");

function syn(text: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "md-syntax";
  el.textContent = text;
  return el;
}

/** 块前缀:返回该 textblock 应显示的 Markdown 前缀(无则 null) */
function blockPrefix(state: EditorState, node: PMNode, pos: number): string | null {
  if (node.type.name === "heading") return "#".repeat(node.attrs.level as number) + " ";
  if (node.type.name !== "paragraph") return null;
  const $p = state.doc.resolve(pos + 1);
  for (let d = $p.depth; d >= 1; d--) {
    const anc = $p.node(d);
    const name = anc.type.name;
    if (name === "taskItem") return anc.attrs.checked ? "- [x] " : "- [ ] ";
    if (name === "listItem") {
      const list = $p.node(d - 1);
      if (list && list.type.name === "orderedList") {
        const start = (list.attrs.start as number) ?? 1;
        return `${start + $p.index(d - 1)}. `;
      }
      return "- ";
    }
    if (name === "blockquote") return "> ";
  }
  return null;
}

interface MarkTarget {
  name: string;
  open: string;
  close: (m: Mark) => string;
}
const TARGETS: MarkTarget[] = [
  { name: "bold", open: "**", close: () => "**" },
  { name: "italic", open: "*", close: () => "*" },
  { name: "strike", open: "~~", close: () => "~~" },
  { name: "code", open: "`", close: () => "`" },
  { name: "link", open: "[", close: (m) => `](${(m.attrs.href as string) ?? ""})` },
];

/** 行内标记 / 链接:光标所在 textblock 里,找出包含光标的连续标记区间,在首尾插入符号 widget */
function inlineDecos(state: EditorState, decos: Decoration[]): void {
  const { $from } = state.selection;
  const from = $from.pos;
  const tb = $from.parent;
  if (!tb.isTextblock) return;
  const tbStart = $from.start();
  const segs: { from: number; to: number; marks: readonly Mark[] }[] = [];
  tb.forEach((child, offset) => {
    if (child.isText) {
      segs.push({ from: tbStart + offset, to: tbStart + offset + child.nodeSize, marks: child.marks });
    }
  });
  for (const tgt of TARGETS) {
    // 找「包含光标」的连续区间(同一标记类型的相邻文本段)
    let rf = -1;
    let rt = -1;
    let mk: Mark | null = null;
    for (const seg of segs) {
      const m = seg.marks.find((x) => x.type.name === tgt.name) ?? null;
      if (m) {
        if (rf === -1) {
          rf = seg.from;
          mk = m;
        }
        rt = seg.to;
      } else if (rf !== -1) {
        if (from >= rf && from <= rt) break; // 当前区间含光标,定下
        rf = -1;
        rt = -1;
        mk = null;
      }
    }
    if (rf !== -1 && mk && from >= rf && from <= rt) {
      decos.push(
        Decoration.widget(rf, () => syn(tgt.open), { side: -1, ignoreSelection: true, key: `${tgt.name}-o` }),
      );
      const closeText = tgt.close(mk);
      decos.push(
        Decoration.widget(rt, () => syn(closeText), { side: 1, ignoreSelection: true, key: `${tgt.name}-c` }),
      );
    }
  }
}

function build(state: EditorState): DecorationSet {
  const decos: Decoration[] = [];
  const $f = state.selection.$from;

  // 块前缀(光标所在 textblock)
  if ($f.parent.isTextblock && $f.depth >= 1) {
    const tbPos = $f.before($f.depth);
    const pre = blockPrefix(state, $f.parent, tbPos);
    if (pre) {
      decos.push(
        Decoration.widget(tbPos + 1, () => syn(pre), { side: -1, ignoreSelection: true, key: "blk" }),
      );
    }
  }

  // 分割线:被整块选中时显示 ---
  if (state.selection instanceof NodeSelection) {
    const n = state.selection.node;
    if (n.type.name === "horizontalRule") {
      const p = state.selection.from;
      decos.push(Decoration.node(p, p + n.nodeSize, { class: "md-hr-reveal" }));
    }
  }

  // 行内标记 / 链接
  inlineDecos(state, decos);

  return DecorationSet.create(state.doc, decos);
}

export const SourceReveal = Extension.create({
  name: "sourceReveal",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: KEY,
        props: {
          decorations: (state) => build(state),
        },
      }),
    ];
  },
});
