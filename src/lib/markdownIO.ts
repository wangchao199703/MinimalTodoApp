// 待办清单 ↔ Markdown 互转(对齐旧版 MarkdownService):
// 导出:分组 = ## 二级标题,任务 = - [ ] / - [x],子任务每级缩进两空格;
// 导入:解析标题为分组、列表项为任务,无法识别的行忽略。

import { t } from "./i18n";
import type { Group, Task } from "./tauri-ipc";

export function buildExportMarkdown(groups: Group[], tasks: Task[]): string {
  const lines: string[] = [];
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  lines.push(`# ${t("S.AppName")}`);
  lines.push("");
  lines.push(
    `> ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
  );
  lines.push("");

  const emit = (sectionName: string, sectionTasks: Task[]) => {
    if (sectionTasks.length === 0) return;
    lines.push(`## ${sectionName}`);
    lines.push("");
    for (const it of sectionTasks) {
      const indent = "  ".repeat(Math.max(0, it.indent_level));
      const box = it.is_completed ? "[x]" : "[ ]";
      const due = it.due_date ? `  (${t("S.TaskEdit.DueDate")} ${it.due_date})` : "";
      lines.push(`${indent}- ${box} ${it.title}${due}`);
    }
    lines.push("");
  };

  const sorted = [...tasks].sort((a, b) => a.order_index - b.order_index);
  for (const g of groups) {
    emit(g.name, sorted.filter((task) => task.group_id === g.id));
  }
  emit(t("S.Tag.Untagged"), sorted.filter((task) => !task.group_id));

  return lines.join("\n");
}

// 便签导入:从资源管理器拖入的文本/代码文件 → { 文件名(去扩展名), Markdown 文本 }
const MD_EXT = /\.(md|markdown)$/i;

// 可导入为便签的纯文本/代码扩展名(md/markdown 单列,作 Markdown 原样导入)。
// 其余按「代码块」包裹导入,verbatim 保形、不被 Markdown 语法(# / * 等)误解析。
const TEXT_EXT = new Set([
  "txt", "text", "log", "csv", "tsv",
  "sql", "json", "json5", "jsonc", "xml", "yaml", "yml", "toml", "ini", "conf", "env", "properties",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "css", "scss", "less", "html", "htm", "vue", "svelte",
  "py", "rb", "go", "rs", "java", "kt", "c", "h", "cpp", "hpp", "cc", "cs", "php", "swift", "m",
  "sh", "bash", "zsh", "ps1", "bat", "cmd", "lua", "pl", "r", "dart", "scala", "groovy", "gradle",
  "dockerfile", "makefile", "diff", "patch", "tex",
]);

function extOfName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 判断是否为可导入便签的 Markdown 文件(按扩展名,大小写不敏感) */
export function isMarkdownFile(file: File): boolean {
  return MD_EXT.test(file.name);
}

/** 判断是否为可导入便签的文本/代码文件(md/markdown 或常见文本/代码扩展名) */
export function isImportableTextFile(file: File): boolean {
  if (isMarkdownFile(file)) return true;
  if (TEXT_EXT.has(extOfName(file.name))) return true;
  // 无扩展名但 MIME 标注为文本(如 text/plain)也放行
  return !!file.type && file.type.startsWith("text/");
}

/** 文件名去扩展名,作为便签标题 */
export function stripMdExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * 从一次拖放的 DataTransfer 里读出所有可导入文本文件的内容。
 * md/markdown 原样作 Markdown;其余文本/代码包成 ```<ext> 代码块,保形不被误解析。
 * 用网页 File API(file.text()),不依赖文件路径,与 Tauri OS 拖放无关。
 */
export async function readTextDrop(
  dt: DataTransfer | null,
): Promise<{ name: string; content: string }[]> {
  const files = Array.from(dt?.files ?? []).filter(isImportableTextFile);
  return Promise.all(
    files.map(async (f) => {
      const raw = await f.text();
      if (isMarkdownFile(f)) return { name: stripMdExt(f.name), content: raw };
      const lang = extOfName(f.name);
      // 代码块包裹:用 4 个反引号围栏,内容含 ``` 也不破栏
      const content = `\`\`\`\`${lang}\n${raw.replace(/\s+$/, "")}\n\`\`\`\``;
      return { name: stripMdExt(f.name), content };
    }),
  );
}

/** 兼容旧调用名:等价于 readTextDrop(已支持 md 之外的文本/代码文件) */
export const readMarkdownDrop = readTextDrop;

export interface ParsedTask {
  group: string;
  title: string;
  completed: boolean;
  indent: number;
}

export function parseImportMarkdown(markdown: string): ParsedTask[] {
  const result: ParsedTask[] = [];
  if (!markdown.trim()) return result;

  let currentGroup = "";
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    const trimmed = line.trimStart();

    // 标题行作为分组名
    if (trimmed.startsWith("#")) {
      const name = trimmed.replace(/^#+/, "").trim();
      if (name) currentGroup = name;
      continue;
    }

    // 缩进:每 2 空格(或 1 Tab)一级
    let leading = 0;
    for (const c of line) {
      if (c === " ") leading += 1;
      else if (c === "\t") leading += 2;
      else break;
    }
    const indent = Math.min(Math.floor(leading / 2), 6);

    // 列表行:- / * / +,可带 [ ] / [x]
    let body = trimmed;
    if (/^[-*+]\s/.test(body)) body = body.slice(2);
    else continue;

    let completed = false;
    if (body.startsWith("[ ]")) body = body.slice(3);
    else if (body.startsWith("[x]") || body.startsWith("[X]")) {
      completed = true;
      body = body.slice(3);
    }

    // 去掉导出时附加的「(截止 …)」尾注(中英都可能)
    let title = body.trim().replace(/\s*[((][^()()]*\d{4}-\d{2}-\d{2}[^()()]*[))]\s*$/, "");
    title = title.trim();
    if (title) result.push({ group: currentGroup, title, completed, indent });
  }
  return result;
}
