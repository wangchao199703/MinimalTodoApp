using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Infrastructure;

/// <summary>一套可选主题的描述.Preview/PreviewText 为色板预览用的颜色字符串.IsCustom 标识用户自定义.</summary>
public record ThemeInfo(string Key, string Display, string Preview, string PreviewText, bool IsCustom = false);

/// <summary>
/// 通过替换 App.Resources.MergedDictionaries 中的主题字典实现动态主题切换.
/// 内置主题来自 Themes/*.xaml；自定义主题在运行时由颜色字典直接构建 ResourceDictionary.
/// 主题字典统一放在 index 0，Controls.xaml 中所有颜色均使用 DynamicResource 引用.
/// </summary>
public static class ThemeManager
{
    public const string Light = "Light";
    public const string Dark = "Dark";
    public const string Glass = "Glass";
    public const string Transparent = "Transparent";

    /// <summary>主题需包含的全部颜色键(自定义主题须覆盖这些键).</summary>
    public static readonly string[] ColorKeys =
    {
        "WindowBg", "TitleBarBg", "SidebarBg", "ContentBg", "CardBg", "CardHoverBg",
        "InputBg", "PrimaryText", "SecondaryText", "MutedText", "Accent", "AccentText",
        "Divider", "SelectedItemBg", "OverdueText", "WarningText", "SuccessText"
    };

    /// <summary>内置主题(文件名 Key 必须与 Themes 目录下 xaml 同名).
    /// 第二字段存的是翻译键(S.Theme.*)，在 <see cref="AllThemes"/> 中按当前语言解析为 Display.</summary>
    private static readonly List<ThemeInfo> Builtin = new()
    {
        new ThemeInfo("Light", "S.Theme.Light", "#FFFFFF", "#1F2329"),
        new ThemeInfo("Dark",  "S.Theme.Dark",  "#26282C", "#E6E8EB"),
        new ThemeInfo("Nord",  "S.Theme.Nord",  "#3B4252", "#ECEFF4"),
        new ThemeInfo("Ocean", "S.Theme.Ocean", "#173540", "#E0F2F1"),
        new ThemeInfo("Forest","S.Theme.Forest","#EAEFE0", "#26331F"),
        new ThemeInfo("Rose",  "S.Theme.Rose",  "#FDEBF0", "#3D1F2A"),
        // 低饱和主题
        new ThemeInfo("Oat",      "S.Theme.Oat",      "#F5F2EC", "#3A352D"),
        new ThemeInfo("Haze",     "S.Theme.Haze",     "#F0F2F5", "#2F3640"),
        new ThemeInfo("Sage",     "S.Theme.Sage",     "#EEF1EC", "#313A30"),
        new ThemeInfo("Graphite", "S.Theme.Graphite", "#2A2C2E", "#E4E6E8"),
        new ThemeInfo("Clay",     "S.Theme.Clay",     "#F3EEEA", "#3B332E"),
        new ThemeInfo("Fog",      "S.Theme.Fog",      "#F1F3F4", "#313539"),
        new ThemeInfo("Slate",    "S.Theme.Slate",    "#282D33", "#DDE3EA"),
        // 莫兰迪配色（低饱和灰调）
        new ThemeInfo("Morandi1", "S.Theme.Morandi1", "#E9ECEF", "#2E353B"),
        new ThemeInfo("Morandi2", "S.Theme.Morandi2", "#EAEDE7", "#313630"),
        new ThemeInfo("Morandi3", "S.Theme.Morandi3", "#EEE9EA", "#382F32"),
        // 马卡龙配色（清甜粉彩）
        new ThemeInfo("Macaron1", "S.Theme.Macaron1", "#E8F6F1", "#1E3B34"),
        new ThemeInfo("Macaron2", "S.Theme.Macaron2", "#FCEEF2", "#4A2A33"),
        new ThemeInfo("Macaron3", "S.Theme.Macaron3", "#FBF6E3", "#423D24"),
        // 敦煌配色（壁画土色 + 石青/土红/描金）
        new ThemeInfo("Dunhuang1", "S.Theme.Dunhuang1", "#F3EBDA", "#3A2E20"),
        new ThemeInfo("Dunhuang2", "S.Theme.Dunhuang2", "#F4E9DD", "#3D2A22"),
        new ThemeInfo("Dunhuang3", "S.Theme.Dunhuang3", "#211A14", "#EDE2CE"),
        // 蒙德里安配色（三原色撞色）
        new ThemeInfo("Mondrian1", "S.Theme.Mondrian1", "#FAFAF7", "#1A1A1A"),
        new ThemeInfo("Mondrian2", "S.Theme.Mondrian2", "#F8FAFC", "#15202B"),
        new ThemeInfo("Mondrian3", "S.Theme.Mondrian3", "#161616", "#F2F2F2"),
        new ThemeInfo("Transparent", "S.Theme.Transparent", "#80FFFFFF", "#1F2329"),
        new ThemeInfo("Glass", "S.Theme.Glass", "#80222831", "#F5F7FA"),
    };

    private static readonly Dictionary<string, CustomTheme> Custom =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>当前已插入到资源树的主题字典(用于切换时移除).</summary>
    private static ResourceDictionary? _currentThemeDict;

    private static readonly HashSet<string> BuiltinKeys =
        new(Builtin.Select(t => t.Key), StringComparer.OrdinalIgnoreCase);

    public static string Current { get; private set; } = Light;

    /// <summary>内置 + 自定义的完整主题列表(供 UI 绑定).内置项的 Display 按当前语言解析.</summary>
    public static List<ThemeInfo> AllThemes() =>
        Builtin.Select(t => t with { Display = Loc.T(t.Display) })
               .Concat(Custom.Values.Select(ToInfo))
               .ToList();

    private static ThemeInfo ToInfo(CustomTheme c) =>
        new(c.Key, c.Display, c.Preview, c.PreviewText, IsCustom: true);

    /// <summary>启动时载入持久化的自定义主题.</summary>
    public static void LoadCustomThemes(IEnumerable<CustomTheme>? themes)
    {
        Custom.Clear();
        if (themes == null) return;
        foreach (var t in themes)
            if (!string.IsNullOrWhiteSpace(t.Key))
                Custom[t.Key] = t;
    }

    /// <summary>新增或更新一个自定义主题，返回其 ThemeInfo.</summary>
    public static ThemeInfo AddOrUpdateCustom(CustomTheme theme)
    {
        Custom[theme.Key] = theme;
        return ToInfo(theme);
    }

    public static void RemoveCustom(string key) => Custom.Remove(key);

    /// <summary>读取某主题的全部颜色(用于在主题编辑器里预填基色).</summary>
    public static Dictionary<string, string> ReadColors(string key)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (Custom.TryGetValue(key, out var ct))
        {
            foreach (var kv in ct.Colors) result[kv.Key] = kv.Value;
            return result;
        }

        try
        {
            var dict = new ResourceDictionary
            {
                Source = new Uri($"pack://application:,,,/MinimalTodoApp;component/Themes/{key}.xaml", UriKind.Absolute)
            };
            foreach (var k in ColorKeys)
                if (dict[k] is SolidColorBrush b)
                    result[k] = b.Color.ToString();
        }
        catch { /* ignore */ }

        return result;
    }

    public static void Apply(string theme)
    {
        if (string.IsNullOrWhiteSpace(theme))
            theme = Light;

        ResourceDictionary newDict;

        if (Custom.TryGetValue(theme, out var ct))
        {
            newDict = BuildFromColors(ct.Colors);
        }
        else
        {
            if (!BuiltinKeys.Contains(theme))
                theme = Light;
            newDict = new ResourceDictionary
            {
                Source = new Uri($"pack://application:,,,/MinimalTodoApp;component/Themes/{theme}.xaml", UriKind.Absolute)
            };
        }

        Current = theme;

        var dicts = Application.Current.Resources.MergedDictionaries;

        // 移除上一个主题字典(自定义无 Source，靠引用移除)
        if (_currentThemeDict != null)
            dicts.Remove(_currentThemeDict);

        // 兜底:移除任何内置主题字典(保留 Controls.xaml)
        for (int i = dicts.Count - 1; i >= 0; i--)
        {
            var src = dicts[i].Source?.OriginalString ?? string.Empty;
            if (BuiltinKeys.Any(k => src.Contains($"Themes/{k}.xaml", StringComparison.OrdinalIgnoreCase)))
                dicts.RemoveAt(i);
        }

        // 主题字典必须在最前，确保 Controls.xaml 能解析到其颜色键
        dicts.Insert(0, newDict);
        _currentThemeDict = newDict;
    }

    /// <summary>由颜色字典构建 ResourceDictionary(缺失键用明亮主题兜底).</summary>
    private static ResourceDictionary BuildFromColors(IDictionary<string, string> colors)
    {
        var fallback = ReadColors(Light);
        var rd = new ResourceDictionary();
        foreach (var key in ColorKeys)
        {
            string hex = colors.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v)
                ? v
                : (fallback.TryGetValue(key, out var f) ? f : "#FF808080");
            Color c;
            try { c = (Color)ColorConverter.ConvertFromString(hex); }
            catch { c = Colors.Gray; }
            rd[key] = new SolidColorBrush(c);
        }
        return rd;
    }
}
