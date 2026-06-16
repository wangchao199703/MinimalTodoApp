import { Marked } from "marked";
import { ipc, type Note } from "./tauri-ipc";
import { t } from "./i18n";

// 用独立实例(避免 marked 全局单例在打包后的 interop 怪异);GFM 默认开,渲染表格/任务列表
const md2html = new Marked({ gfm: true, breaks: false });

// 导出 HTML 用的 .note-prose 样式子集(接近编辑器观感,打印 / 另存 PDF 友好;不依赖主题变量)
const EXPORT_CSS = `
  body { font-family: "Microsoft YaHei UI", system-ui, -apple-system, sans-serif; color:#1f2937; max-width:820px; margin:32px auto; padding:0 24px; line-height:1.7; }
  h1{font-size:1.8em;font-weight:700;margin:.6em 0}
  h2{font-size:1.5em;font-weight:700;margin:.6em 0}
  h3{font-size:1.25em;font-weight:600;margin:.5em 0}
  p{margin:.4em 0}
  ul,ol{margin:.4em 0;padding-left:1.6em}
  code{background:#f3f4f6;border-radius:4px;padding:.1em .35em;font-family:Consolas,Menlo,monospace;font-size:.92em}
  pre{background:#f3f4f6;border-radius:8px;padding:12px;overflow:auto}
  pre code{background:transparent;padding:0}
  blockquote{border-left:3px solid #d1d5db;margin:.5em 0;padding:.2em .9em;color:#6b7280}
  a{color:#2563eb;text-decoration:underline}
  hr{border:none;border-top:1px solid #e5e7eb;margin:1em 0}
  img{max-width:100%;border-radius:8px;margin:.4em 0}
  table{border-collapse:collapse;margin:.6em 0}
  th,td{border:1px solid #d1d5db;padding:.35em .6em;vertical-align:top}
  th{background:#f3f4f6;text-align:left}
  input[type=checkbox]{margin-right:.4em}
`;

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);

/**
 * 把单篇便签导出成独立 HTML 文件(桌面),返回完整路径。
 * 正文 Markdown 经 marked(GFM)渲染;noteimg://名 替换为 file:/// 绝对路径(本机打开可显示图片)。
 * PDF 路径:用户在浏览器打开该 HTML 后「打印 → 另存为 PDF」。
 */
export async function exportNoteHtml(note: Note): Promise<string> {
  const dir = (await ipc.noteImageDir()).replace(/\\/g, "/");
  const md = (note.content || "").replace(
    /noteimg:\/\/([^\s)"']+)/g,
    (_m, name: string) => `file:///${dir}/${name}`,
  );
  const body = await md2html.parse(md);
  const name = note.custom_title || note.title || t("S.X.UntitledNote");
  const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title><style>${EXPORT_CSS}</style></head><body>${body}</body></html>`;
  return ipc.exportFile(`${name}.html`, html);
}
