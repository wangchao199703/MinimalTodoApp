// 极小 Markdown 渲染器:标题/粗斜体/行内代码/代码块/列表/链接/引用。
// 先转义 HTML 再做标记替换,杜绝注入;不追求完整规范,够便签用。

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="md-link">$1</a>',
    );
}

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      closeList();
      out.push(inCode ? "</pre>" : '<pre class="md-pre">');
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const n = h[1].length;
      out.push(`<h${n} class="md-h${n}">${inline(h[2])}</h${n}>`);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!listOpen) {
        out.push('<ul class="md-ul">');
        listOpen = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    const quote = /^&gt;\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote class="md-quote">${inline(quote[1])}</blockquote>`);
      continue;
    }
    closeList();
    if (line.trim() === "") out.push("<br/>");
    else out.push(`<p class="md-p">${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

/** 从 Markdown 正文派生标题:第一行非空文本去掉标记(图片/HTML 标记行跳过内容) */
export function deriveTitle(md: string): string {
  const first = md.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return first
    .replace(/^#{1,4}\s+/, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^[-*+]\s+(\[[ xX]\]\s*)?/, "")
    .replace(/[*`>]/g, "")
    .trim()
    .slice(0, 60);
}
