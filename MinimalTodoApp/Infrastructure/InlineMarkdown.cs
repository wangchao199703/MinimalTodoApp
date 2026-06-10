using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 行内 Markdown 渲染:把成对的 ** 加粗标记解析为 Bold Run 填充 TextBlock.Inlines.
/// 便签块编辑器的显示层用法:&lt;TextBlock inf:InlineMarkdown.Text="{Binding Text}"/&gt;。
/// 仅支持 **加粗**(范围铁律)；不成对的 ** 按字面渲染.
/// </summary>
public static class InlineMarkdown
{
    public static readonly DependencyProperty TextProperty = DependencyProperty.RegisterAttached(
        "Text", typeof(string), typeof(InlineMarkdown), new PropertyMetadata(null, OnTextChanged));

    public static string? GetText(DependencyObject obj) => (string?)obj.GetValue(TextProperty);
    public static void SetText(DependencyObject obj, string? value) => obj.SetValue(TextProperty, value);

    private static void OnTextChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not TextBlock tb) return;
        tb.Inlines.Clear();
        var text = e.NewValue as string ?? string.Empty;

        int pos = 0;
        while (pos < text.Length)
        {
            int open = text.IndexOf("**", pos, StringComparison.Ordinal);
            if (open < 0) break;
            int close = text.IndexOf("**", open + 2, StringComparison.Ordinal);
            if (close < 0) break;                      // 不成对:剩余按字面
            if (close == open + 2) { pos = open + 2; continue; }   // 空加粗(****)按字面跳过

            if (open > pos) tb.Inlines.Add(new Run(text[pos..open]));
            tb.Inlines.Add(new Bold(new Run(text[(open + 2)..close])));
            pos = close + 2;
        }
        if (pos < text.Length) tb.Inlines.Add(new Run(text[pos..]));
    }

    /// <summary>去掉行内标记，返回纯文本(供提取待办的标题与便签标题派生).</summary>
    public static string PlainText(string? text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        var result = new System.Text.StringBuilder(text.Length);
        int pos = 0;
        while (pos < text.Length)
        {
            int open = text.IndexOf("**", pos, StringComparison.Ordinal);
            if (open < 0) break;
            int close = text.IndexOf("**", open + 2, StringComparison.Ordinal);
            if (close < 0) break;
            result.Append(text, pos, open - pos);
            result.Append(text, open + 2, close - (open + 2));
            pos = close + 2;
        }
        result.Append(text, pos, text.Length - pos);
        return result.ToString();
    }
}
