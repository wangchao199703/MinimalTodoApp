using System;
using System.Windows;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 本地化字符串助手:从当前合并字典(由 LanguageManager 在运行时替换)取出按 key 索引的字符串.
/// 供 C# 动态拼接文案使用(XAML 静态文本直接用 {DynamicResource S.Xxx}).
/// 找不到 key 时返回 key 本身(界面显示 S.Xxx，醒目但不崩，便于排查漏译).
/// </summary>
public static class Loc
{
    /// <summary>按 key 取本地化字符串;缺失时返回 key 本身.</summary>
    public static string T(string key)
        => Application.Current?.TryFindResource(key) as string ?? key;

    /// <summary>取出含占位符({0}{1}…)的模板并 string.Format;模板缺失或格式异常时安全兜底.</summary>
    public static string F(string key, params object[] args)
    {
        var tpl = T(key);
        try { return string.Format(tpl, args); }
        catch { return tpl; }
    }
}
