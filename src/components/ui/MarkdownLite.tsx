import { Fragment, type ReactNode } from "react";

// 轻量 Markdown 渲染:仅覆盖发布说明/更新提示里实际用到的语法
// (#~#### 标题、- / * 列表、**粗体**、*斜体*、`代码`、> 引用、--- 分隔线)。
// 不引第三方库、不注入 HTML,纯 React 节点渲染,够用且无 XSS 面。

/** 行内:**粗** / *斜* / `代码`,按出现顺序切片渲染 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 优先级:代码 > 粗体 > 斜体;非贪婪匹配,逐段消费
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-card-hover px-1 py-0.5 text-[0.92em]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-text-1">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 把 Markdown 文本渲染为只读节点(块级:标题/列表/引用/分隔线/段落) */
export default function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key++} className="my-1 ml-4 list-disc space-y-0.5">
        {list}
      </ul>,
    );
    list = [];
  };
  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(
      <p key={key++} className="my-1">
        {para.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {renderInline(l)}
          </Fragment>
        ))}
      </p>,
    );
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();

    if (t === "") {
      flushList();
      flushPara();
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(t)) {
      flushList();
      flushPara();
      blocks.push(<hr key={key++} className="my-2 border-divider" />);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      flushList();
      flushPara();
      const level = h[1].length;
      const size = level <= 1 ? "text-sm font-bold" : level === 2 ? "text-sm font-semibold" : "text-xs font-semibold";
      blocks.push(
        <p key={key++} className={`mt-2 mb-1 text-text-1 ${size}`}>
          {renderInline(h[2])}
        </p>,
      );
      continue;
    }
    const li = /^[-*+]\s+(.*)$/.exec(t);
    if (li) {
      flushPara();
      list.push(<li key={key++}>{renderInline(li[1])}</li>);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(t);
    if (q) {
      flushList();
      flushPara();
      blocks.push(
        <p key={key++} className="my-1 border-l-2 border-divider pl-2 text-muted italic">
          {renderInline(q[1])}
        </p>,
      );
      continue;
    }
    flushList();
    para.push(t);
  }
  flushList();
  flushPara();

  return <div className={className}>{blocks}</div>;
}
