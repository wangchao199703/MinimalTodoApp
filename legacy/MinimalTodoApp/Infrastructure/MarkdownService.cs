using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Infrastructure;

/// <summary>从 Markdown 解析出的一条任务(分组 / 标题 / 是否完成 / 缩进层级).</summary>
public record MarkdownTask(string Group, string Title, bool Completed, int Indent);

/// <summary>
/// 待办清单与 Markdown 文本之间的相互转换.
/// 导出格式:每个分组一个二级标题(## 分组名)，其下用「- [ ] / - [x]」列出任务，
/// 子待办以每级两个空格缩进表达层级，可被本程序及绝大多数 Markdown 编辑器识别.
/// </summary>
public static class MarkdownService
{
    /// <summary>把分组与任务导出为 Markdown 文本.</summary>
    public static string Export(IEnumerable<TodoGroup> groups, IReadOnlyCollection<TodoItem> items)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# 待办清单");
        sb.AppendLine();
        sb.AppendLine($"> 导出时间:{DateTime.Now:yyyy-MM-dd HH:mm}");
        sb.AppendLine();

        foreach (var g in groups)
        {
            var groupItems = items.Where(i => i.GroupId == g.Id)
                                  .OrderBy(i => i.OrderIndex)
                                  .ToList();
            if (groupItems.Count == 0) continue;

            sb.AppendLine($"## {g.Name}");
            sb.AppendLine();
            foreach (var it in groupItems)
            {
                string indent = new string(' ', Math.Max(0, it.IndentLevel) * 2);
                string box = it.IsCompleted ? "[x]" : "[ ]";
                string due = it.DueDate.HasValue ? $"  (截止 {it.DueDate.Value:yyyy-MM-dd HH:mm})" : string.Empty;
                sb.AppendLine($"{indent}- {box} {it.Title}{due}");
            }
            sb.AppendLine();
        }

        return sb.ToString();
    }

    /// <summary>从 Markdown 文本解析出任务列表.无法识别为任务的行将被忽略.</summary>
    public static List<MarkdownTask> Parse(string markdown)
    {
        var result = new List<MarkdownTask>();
        if (string.IsNullOrWhiteSpace(markdown)) return result;

        string currentGroup = "导入";
        var lines = markdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');

        foreach (var raw in lines)
        {
            string line = raw.TrimEnd();
            if (line.Length == 0) continue;

            string trimmedStart = line.TrimStart();

            // 二级(或更高级)标题作为分组名
            if (trimmedStart.StartsWith("#"))
            {
                string name = trimmedStart.TrimStart('#').Trim();
                if (name.Length > 0) currentGroup = name;
                continue;
            }

            // 计算缩进:前导空格数 /2，或前导 Tab 数
            int leading = 0;
            foreach (char c in line)
            {
                if (c == ' ') leading++;
                else if (c == '\t') leading += 2;
                else break;
            }
            int indent = leading / 2;

            // 识别任务行:- [ ] / - [x] / * [ ] / + [ ]，兼容无复选框的「- 文本」
            string body = trimmedStart;
            if (body.StartsWith("- ") || body.StartsWith("* ") || body.StartsWith("+ "))
                body = body.Substring(2);
            else
                continue; // 非列表行，忽略

            bool completed = false;
            if (body.StartsWith("[ ]")) { completed = false; body = body.Substring(3); }
            else if (body.StartsWith("[x]") || body.StartsWith("[X]")) { completed = true; body = body.Substring(3); }

            string title = body.Trim();
            // 去掉导出时附加的「(截止 ...)」尾注
            int dueIdx = title.IndexOf("(截止", StringComparison.Ordinal);
            if (dueIdx > 0) title = title.Substring(0, dueIdx).Trim();

            if (title.Length == 0) continue;
            result.Add(new MarkdownTask(currentGroup, title, completed, Math.Min(indent, 6)));
        }

        return result;
    }
}
