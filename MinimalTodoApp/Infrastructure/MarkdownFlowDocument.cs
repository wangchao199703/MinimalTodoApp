using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 便签正文的 Markdown ↔ FlowDocument 双向转换(供 RichTextBox 富文本编辑器加载/保存).
/// 支持的子集(语法集铁律):
///   块级 —— "# "/"## "/"### " 标题、"- " 无序列表、"- [ ] "/"- [x] " 任务项(可勾选)，一行一段;
///   行内 —— **加粗**、*斜体*、~~删除线~~、&lt;u&gt;下划线&lt;/u&gt;。
/// 采用「一行 = 一个 Paragraph」模型:RichTextBox 回车天然新建段落，与 markdown 换行一一对应。
/// 段落用 Tag("H1"/"H2"/"H3"/"Bullet"/"Task") 记录块类型;无序/任务的行首标记用 InlineUIContainer 承载(不可编辑)。
/// </summary>
public static class MarkdownFlowDocument
{
    // 标题相对基准字号的倍率(与旧 BlockFontSizeConverter 一致)
    private const double H1 = 1.6, H2 = 1.35, H3 = 1.15;

    // ===================== Markdown → FlowDocument =====================

    /// <summary>把 markdown 文本解析为 FlowDocument。onCheckChanged:任务复选框被勾选/取消时回调(用于触发保存)。</summary>
    public static FlowDocument ToFlowDocument(string? md, double baseFontSize, Action? onCheckChanged = null)
    {
        var doc = new FlowDocument { PagePadding = new Thickness(0) };
        var lines = (md ?? string.Empty).Replace("\r\n", "\n").Replace("\r", "\n").Split('\n');
        foreach (var line in lines)
            doc.Blocks.Add(BuildParagraph(line, baseFontSize, onCheckChanged));
        if (doc.Blocks.Count == 0)
            doc.Blocks.Add(new Paragraph { Margin = new Thickness(0) });
        return doc;
    }

    private static Paragraph BuildParagraph(string line, double baseSize, Action? onCheck)
    {
        var p = new Paragraph { Margin = new Thickness(0) };
        string text = line;
        string? tag = null;
        bool taskChecked = false;

        if (text.StartsWith("### ", StringComparison.Ordinal)) { tag = "H3"; text = text[4..]; }
        else if (text.StartsWith("## ", StringComparison.Ordinal)) { tag = "H2"; text = text[3..]; }
        else if (text.StartsWith("# ", StringComparison.Ordinal)) { tag = "H1"; text = text[2..]; }
        else if (text.StartsWith("- [x] ", StringComparison.Ordinal)
              || text.StartsWith("- [X] ", StringComparison.Ordinal)) { tag = "Task"; taskChecked = true; text = text[6..]; }
        else if (text.StartsWith("- [ ] ", StringComparison.Ordinal)) { tag = "Task"; text = text[6..]; }
        else if (text.StartsWith("- ", StringComparison.Ordinal)) { tag = "Bullet"; text = text[2..]; }

        ApplyBlockStyle(p, tag, baseSize);
        switch (tag)
        {
            case "Task": p.Inlines.Add(NewTaskMarker(taskChecked, onCheck)); break;
            case "Bullet": p.Inlines.Add(NewBulletMarker()); break;
        }

        foreach (var inl in ParseInlines(text)) p.Inlines.Add(inl);
        return p;
    }

    /// <summary>按块类型 Tag 设置段落的字号/字重(标题放大加粗;其余还原默认)。供加载与工具栏「标题循环」共用。</summary>
    public static void ApplyBlockStyle(Paragraph p, string? tag, double baseFontSize)
    {
        switch (tag)
        {
            case "H1": p.FontSize = baseFontSize * H1; p.FontWeight = FontWeights.Bold; break;
            case "H2": p.FontSize = baseFontSize * H2; p.FontWeight = FontWeights.Bold; break;
            case "H3": p.FontSize = baseFontSize * H3; p.FontWeight = FontWeights.SemiBold; break;
            default:
                p.ClearValue(System.Windows.Documents.Block.FontSizeProperty);
                p.ClearValue(System.Windows.Documents.Block.FontWeightProperty);
                break;
        }
    }

    public static InlineUIContainer NewTaskMarker(bool isChecked, Action? onCheck)
    {
        var cb = new CheckBox
        {
            IsChecked = isChecked,
            Focusable = false,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 6, 0),
        };
        if (onCheck != null)
        {
            cb.Checked += (_, _) => onCheck();
            cb.Unchecked += (_, _) => onCheck();
        }
        return new InlineUIContainer(cb) { BaselineAlignment = BaselineAlignment.Center };
    }

    /// <summary>由仓库文件名构建内嵌图片的行内容器(Image.Tag 存文件名供序列化)。</summary>
    public static InlineUIContainer NewImageInline(string fileName)
    {
        var img = new Image
        {
            Tag = fileName,
            Stretch = Stretch.Uniform,
            MaxWidth = 360,
            Margin = new Thickness(0, 2, 0, 2),
        };
        try
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;   // 立即读盘,不锁定文件
            bmp.UriSource = new Uri(NoteImageStore.ResolvePath(fileName));
            bmp.EndInit();
            img.Source = bmp;
            if (bmp.PixelWidth > 0) img.Width = Math.Min(360, bmp.PixelWidth);
        }
        catch { /* 图片缺失/损坏:占位空容器，不影响其它内容 */ }
        return new InlineUIContainer(img) { BaselineAlignment = BaselineAlignment.Center };
    }

    public static InlineUIContainer NewBulletMarker()
    {
        var dot = new TextBlock
        {
            Text = "•",
            FontWeight = FontWeights.Bold,
            Margin = new Thickness(2, 0, 8, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        return new InlineUIContainer(dot) { BaselineAlignment = BaselineAlignment.Center };
    }

    // ----- 行内标记解析:**加粗** *斜体* ~~删除线~~ <u>下划线</u>(可嵌套;不成对按字面) -----

    private static List<Inline> ParseInlines(string text)
    {
        var result = new List<Inline>();
        var buf = new StringBuilder();
        int i = 0;

        void Flush()
        {
            if (buf.Length > 0) { result.Add(new Run(buf.ToString())); buf.Clear(); }
        }

        while (i < text.Length)
        {
            // 内嵌图片 <img=文件名>:自包含标记(无闭合)，渲染为图片
            if (Starts(text, i, "<img="))
            {
                int gt = text.IndexOf('>', i);
                if (gt > i)
                {
                    string fileName = text.Substring(i + 5, gt - (i + 5));
                    Flush();
                    result.Add(NewImageInline(fileName));
                    i = gt + 1;
                    continue;
                }
            }

            var (open, close, factory) = MatchOpen(text, i);
            if (open != null)
            {
                int contentStart = i + open.Length;
                int closeAt = text.IndexOf(close!, contentStart, StringComparison.Ordinal);
                if (closeAt > contentStart)   // 找到且非空
                {
                    Flush();
                    var span = factory!();
                    foreach (var inner in ParseInlines(text[contentStart..closeAt]))
                        span.Inlines.Add(inner);
                    result.Add(span);
                    i = closeAt + close!.Length;
                    continue;
                }
            }
            buf.Append(text[i]);
            i++;
        }
        Flush();
        return result;
    }

    /// <summary>若 text 在 pos 处以某个开标记起始，返回(开标记, 闭标记, 构造 Span 的工厂)。顺序:** 先于 *。</summary>
    private static (string? open, string? close, Func<Span>? factory) MatchOpen(string text, int pos)
    {
        if (Starts(text, pos, "**")) return ("**", "**", () => new Bold());
        if (Starts(text, pos, "<u>")) return ("<u>", "</u>", () => new Underline());
        if (Starts(text, pos, "~~")) return ("~~", "~~", () => new Span { TextDecorations = TextDecorations.Strikethrough });

        // <color=#RRGGBB>…</color>:为选区着色(自定义内联标记，持久化到 markdown)
        if (Starts(text, pos, "<color=#"))
        {
            int gt = text.IndexOf('>', pos);
            if (gt > pos)
            {
                string open = text.Substring(pos, gt - pos + 1);
                string hex = open[7..^1];   // 去掉 "<color=" 与 ">"，得 "#RRGGBB"
                try
                {
                    var color = (Color)ColorConverter.ConvertFromString(hex)!;
                    return (open, "</color>", () => new Span { Foreground = new SolidColorBrush(color) });
                }
                catch { /* 非法颜色按字面处理 */ }
            }
        }

        // <size=NN>…</size>:为选区设置字号
        if (Starts(text, pos, "<size="))
        {
            int gt = text.IndexOf('>', pos);
            if (gt > pos)
            {
                string open = text.Substring(pos, gt - pos + 1);
                string num = open[6..^1];   // 去掉 "<size=" 与 ">"
                if (double.TryParse(num, NumberStyles.Float, CultureInfo.InvariantCulture, out double sz) && sz > 0)
                    return (open, "</size>", () => new Span { FontSize = sz });
            }
        }

        if (Starts(text, pos, "*")) return ("*", "*", () => new Italic());
        return (null, null, null);
    }

    private static bool Starts(string text, int pos, string token) =>
        pos + token.Length <= text.Length && string.CompareOrdinal(text, pos, token, 0, token.Length) == 0;

    // ===================== FlowDocument → Markdown =====================

    public static string ToMarkdown(FlowDocument doc)
    {
        var sb = new StringBuilder();
        bool first = true;
        foreach (var block in doc.Blocks)
        {
            if (block is not Paragraph p) continue;
            if (!first) sb.Append('\n');
            first = false;

            var tag = p.Tag as string;
            sb.Append(tag switch
            {
                "H1" => "# ",
                "H2" => "## ",
                "H3" => "### ",
                "Bullet" => "- ",
                "Task" => TaskChecked(p) ? "- [x] " : "- [ ] ",
                _ => string.Empty,
            });
            SerializeInlines(p.Inlines, default, sb);
        }
        return sb.ToString();
    }

    private static bool TaskChecked(Paragraph p) =>
        p.Inlines.FirstInline is InlineUIContainer c && c.Child is CheckBox cb && cb.IsChecked == true;

    /// <summary>行内格式上下文(沿继承链与本地属性累积)。</summary>
    private struct Fmt
    {
        public bool Bold, Italic, Underline, Strike;
        public string? Color;   // "#RRGGBB"，null=未着色
        public double? Size;    // 本地字号，null=默认
    }

    private static void SerializeInlines(InlineCollection inlines, Fmt ctx, StringBuilder sb)
    {
        foreach (var inl in inlines)
            Walk(inl, ctx, sb);
    }

    private static void Walk(Inline inline, Fmt ctx, StringBuilder sb)
    {
        switch (inline)
        {
            case InlineUIContainer uic:
                // 内嵌图片序列化为 <img=文件名>;行首标记(复选框/圆点)不参与文本序列化
                if (uic.Child is Image img && img.Tag is string fn && fn.Length > 0)
                    sb.Append($"<img={fn}>");
                return;
            case LineBreak:
                sb.Append('\n');                // 软换行:重载时会成为新段落(可接受)
                return;
            case Run r:
                EmitText(r.Text, Merge(ctx, r), sb);
                return;
            case Span s:
                var c = Merge(ctx, s);
                foreach (var child in s.Inlines) Walk(child, c, sb);
                return;
        }
    }

    /// <summary>合并元素自身的格式到上下文:元素类型(Bold/Italic/Underline) + 本地 FontWeight/FontStyle/TextDecorations。</summary>
    private static Fmt Merge(Fmt ctx, Inline inline)
    {
        if (inline is Bold) ctx.Bold = true;
        if (inline is Italic) ctx.Italic = true;
        if (inline is Underline) ctx.Underline = true;

        // 仅认本地设置的字重/字形,避免把标题段落继承下来的粗体误当成行内加粗
        if (inline.ReadLocalValue(TextElement.FontWeightProperty) is FontWeight fw
            && fw.ToOpenTypeWeight() >= FontWeights.Bold.ToOpenTypeWeight())
            ctx.Bold = true;
        if (inline.ReadLocalValue(TextElement.FontStyleProperty) is FontStyle fs && fs != FontStyles.Normal)
            ctx.Italic = true;
        if (inline.ReadLocalValue(Inline.TextDecorationsProperty) is TextDecorationCollection td)
        {
            if (td.Any(d => d.Location == TextDecorationLocation.Underline)) ctx.Underline = true;
            if (td.Any(d => d.Location == TextDecorationLocation.Strikethrough)) ctx.Strike = true;
        }

        // 本地着色/字号(仅认本地设置值，避免继承的基准字号/前景被误当作行内格式)
        if (inline.ReadLocalValue(TextElement.ForegroundProperty) is SolidColorBrush scb)
            ctx.Color = HexOf(scb.Color);
        if (inline.ReadLocalValue(TextElement.FontSizeProperty) is double sz && sz > 0)
            ctx.Size = sz;
        return ctx;
    }

    private static string HexOf(Color c) => $"#{c.R:X2}{c.G:X2}{c.B:X2}";

    private static void EmitText(string? text, Fmt f, StringBuilder sb)
    {
        if (string.IsNullOrEmpty(text)) return;
        string s = text;
        if (f.Strike) s = "~~" + s + "~~";
        if (f.Underline) s = "<u>" + s + "</u>";
        if (f.Italic) s = "*" + s + "*";
        if (f.Bold) s = "**" + s + "**";       // 加粗在最外层,与 ParseInlines 的 ** 优先匹配一致
        if (f.Color != null) s = $"<color={f.Color}>" + s + "</color>";
        if (f.Size.HasValue) s = $"<size={f.Size.Value.ToString("0.##", CultureInfo.InvariantCulture)}>" + s + "</size>";
        sb.Append(s);
    }

    // ===================== 旧块格式迁移 + 标题派生 =====================

    /// <summary>把旧版块列表(v1.2.0 早期)转为 markdown 文本(加载时一次性迁移用)。</summary>
    public static string BlocksToMarkdown(IEnumerable<NoteBlock> blocks)
    {
        var sb = new StringBuilder();
        bool first = true;
        foreach (var b in blocks)
        {
            if (!first) sb.Append('\n');
            first = false;
            sb.Append(b.Type switch
            {
                NoteBlockType.H1 => "# ",
                NoteBlockType.H2 => "## ",
                NoteBlockType.H3 => "### ",
                NoteBlockType.Bullet => "- ",
                NoteBlockType.Task => b.IsChecked ? "- [x] " : "- [ ] ",
                _ => string.Empty,
            });
            sb.Append(b.Text);
        }
        return sb.ToString();
    }

    /// <summary>取首个非空行去掉块前缀与行内标记的纯文本，截 30 字(便签标题派生)。</summary>
    public static string FirstLineTitle(string? md)
    {
        if (string.IsNullOrEmpty(md)) return string.Empty;
        foreach (var raw in md.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n'))
        {
            var line = StripInline(StripBlockPrefix(raw)).Trim();
            if (line.Length == 0) continue;
            return line.Length > 30 ? line[..30] : line;
        }
        return string.Empty;
    }

    private static string StripBlockPrefix(string line)
    {
        foreach (var prefix in new[] { "### ", "## ", "# ", "- [x] ", "- [X] ", "- [ ] ", "- " })
            if (line.StartsWith(prefix, StringComparison.Ordinal))
                return line[prefix.Length..];
        return line;
    }

    private static string StripInline(string line)
    {
        // 先去带参数的着色/字号/图片标记，再去固定标记(** 在 * 之前，避免被当成两个 *)
        line = Regex.Replace(line, "<img=[^>]*>", string.Empty);
        line = Regex.Replace(line, "</?color(=#[0-9A-Fa-f]{6})?>", string.Empty);
        line = Regex.Replace(line, "</?size(=[0-9.]+)?>", string.Empty);
        foreach (var token in new[] { "**", "<u>", "</u>", "~~", "*" })
            line = line.Replace(token, string.Empty);
        return line;
    }
}
