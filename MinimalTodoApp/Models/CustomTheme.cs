using System.Collections.Generic;

namespace MinimalTodoApp.Models;

/// <summary>
/// 用户自定义主题:保存全部颜色键(与内置主题一致的 17 个键)，运行时由
/// <see cref="Infrastructure.ThemeManager"/> 直接构建 ResourceDictionary 应用.
/// </summary>
public class CustomTheme
{
    /// <summary>唯一键(持久化用，形如 "Custom_xxxx").</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>显示名称.</summary>
    public string Display { get; set; } = "自定义";

    /// <summary>键 -> 十六进制颜色字符串，键名与主题 xaml 中完全一致.</summary>
    public Dictionary<string, string> Colors { get; set; } = new();

    /// <summary>主题列表预览用的主色(取 WindowBg).</summary>
    public string Preview =>
        Colors.TryGetValue("WindowBg", out var c) ? c : "#FFFFFF";

    /// <summary>预览文字色(取 PrimaryText).</summary>
    public string PreviewText =>
        Colors.TryGetValue("PrimaryText", out var c) ? c : "#1F2329";
}
