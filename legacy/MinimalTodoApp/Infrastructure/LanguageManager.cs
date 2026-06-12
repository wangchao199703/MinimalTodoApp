using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;

namespace MinimalTodoApp.Infrastructure;

/// <summary>一种界面语言的描述.Display 用语言自身的写法(中文/English)，不随当前语言变化.</summary>
public record LanguageInfo(string Key, string Display);

/// <summary>
/// 通过替换 App.Resources.MergedDictionaries 中的字符串字典实现运行时语言切换.
/// 镜像 <see cref="ThemeManager"/> 的做法,但字符串字典放在 Lang/ 目录(不与主题 Themes/ 冲突)，
/// 且按引用增删 + 插到 Controls.xaml 之前,绝不占用 index 0(那是 ThemeManager 的约定位置).
/// </summary>
public static class LanguageManager
{
    public const string Chinese = "zh-CN";
    public const string English = "en";

    private static readonly List<LanguageInfo> All = new()
    {
        new LanguageInfo(Chinese, "中文"),
        new LanguageInfo(English, "English"),
    };

    /// <summary>当前已插入资源树的字符串字典(用于切换时按引用移除).</summary>
    private static ResourceDictionary? _currentDict;

    public static string Current { get; private set; } = Chinese;

    /// <summary>语言切换完成(字典已替换)后触发,供 ViewModel 刷新动态生成的文案.</summary>
    public static event Action? LanguageChanged;

    public static List<LanguageInfo> AllLanguages() => All;

    public static void Apply(string lang)
    {
        if (string.IsNullOrWhiteSpace(lang) || All.All(l => l.Key != lang))
            lang = Chinese;

        string file = lang == English ? "Strings.en.xaml" : "Strings.zh.xaml";
        var newDict = new ResourceDictionary
        {
            Source = new Uri($"pack://application:,,,/MinimalTodoApp;component/Lang/{file}", UriKind.Absolute)
        };

        Current = lang;

        var dicts = Application.Current.Resources.MergedDictionaries;

        // 移除上一个字符串字典(按引用)
        if (_currentDict != null)
            dicts.Remove(_currentDict);

        // 兜底:移除任何 Lang/Strings.* 字典(含 App.xaml 里声明的默认项)，始终只留一个
        for (int i = dicts.Count - 1; i >= 0; i--)
        {
            var src = dicts[i].Source?.OriginalString ?? string.Empty;
            if (src.Contains("Lang/Strings.", StringComparison.OrdinalIgnoreCase))
                dicts.RemoveAt(i);
        }

        // 插到 Controls.xaml 之前(找不到则追加到末尾)
        int controlsIdx = -1;
        for (int i = 0; i < dicts.Count; i++)
        {
            var src = dicts[i].Source?.OriginalString ?? string.Empty;
            if (src.Contains("Controls.xaml", StringComparison.OrdinalIgnoreCase))
            {
                controlsIdx = i;
                break;
            }
        }
        if (controlsIdx >= 0) dicts.Insert(controlsIdx, newDict);
        else dicts.Add(newDict);

        _currentDict = newDict;
        LanguageChanged?.Invoke();
    }
}
