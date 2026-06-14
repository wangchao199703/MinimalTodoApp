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

// 便签导入:从资源管理器拖入的 .md/.markdown 文件 → { 文件名(去扩展名), Markdown 文本 }
const MD_EXT = /\.(md|markdown)$/i;

/** 判断是否为可导入便签的 Markdown 文件(按扩展名,大小写不敏感) */
export function isMarkdownFile(file: File): boolean {
  return MD_EXT.test(file.name);
}

/** 文件名去扩展名,作为便签标题 */
export function stripMdExt(name: string): string {
  return name.replace(MD_EXT, "");
}

/**
 * 从一次拖放的 DataTransfer 里读出所有 Markdown 文件的文本。
 * 用网页 File API(file.text()),不依赖文件路径,与 Tauri OS 拖放无关。
 */
export async function readMarkdownDrop(
  dt: DataTransfer | null,
): Promise<{ name: string; content: string }[]> {
  const files = Array.from(dt?.files ?? []).filter(isMarkdownFile);
  return Promise.all(
    files.map(async (f) => ({ name: stripMdExt(f.name), content: await f.text() })),
  );
}

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
