using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Infrastructure;

/// <summary>一套可选主题的描述.Preview/PreviewText 为色板预览用的颜色字符串.IsCustom 标识用户自定义.Group 为风格分组键.</summary>
public record ThemeInfo(string Key, string Display, string Preview, string PreviewText, bool IsCustom = false, string Group = "");

/// <summary>
/// 通过替换 App.Resources.MergedDictionaries 中的主题字典实现动态主题切换.
/// 内置主题有两种来源:Themes/*.xaml(经典/透明等) 与 <see cref="BuiltinThemes"/> 代码调色板(各风格分组);
/// 自定义主题与代码调色板都在运行时由颜色字典直接构建 ResourceDictionary.
/// 主题字典统一放在 index 0，Controls.xaml 中所有颜色均使用 DynamicResource 引用.
/// </summary>
public static class ThemeManager
{
    public const string Light = "Light";
    public const string Dark = "Dark";
    public const string Glass = "Glass";
    public const string Transparent = "Transparent";

    /// <summary>动态"常用"分组键(非某主题固有，由 VM 按最近使用拼装).</summary>
    public const string CommonGroup = "Common";
    /// <summary>用户收藏主题归入的分组键(动态，由 VM 按收藏顺序拼装，置于"常用"之后).</summary>
    public const string FavoritesGroup = "Favorites";
    /// <summary>自定义主题归入的分组键.</summary>
    public const string CustomGroup = "Custom";

    /// <summary>主题需包含的全部颜色键(自定义主题须覆盖这些键).</summary>
    public static readonly string[] ColorKeys =
    {
        "WindowBg", "TitleBarBg", "SidebarBg", "ContentBg", "CardBg", "CardHoverBg",
        "InputBg", "PrimaryText", "SecondaryText", "MutedText", "Accent", "AccentText",
        "Divider", "SelectedItemBg", "OverdueText", "WarningText", "SuccessText"
    };

    /// <summary>颜色键 + 弹窗背景(PopupBg 不在 ColorKeys 内，但同样需随主题构建).</summary>
    private static readonly string[] AllColorKeys = ColorKeys.Append("PopupBg").ToArray();

    /// <summary>分组展示顺序(常用为动态分组，由 VM 置于最前)。</summary>
    public static readonly string[] GroupOrder =
    {
        BuiltinThemes.Classic, BuiltinThemes.Morandi, BuiltinThemes.Macaron,
        BuiltinThemes.Dunhuang, BuiltinThemes.Mondrian, BuiltinThemes.Memphis,
        BuiltinThemes.Rococo, BuiltinThemes.Matisse, BuiltinThemes.Transparent, CustomGroup
    };

    /// <summary>分组本地化显示名(S.ThemeGroup.*)。</summary>
    public static string GroupDisplay(string group) => Loc.T("S.ThemeGroup." + group);

    /// <summary>内置 xaml 主题(文件名 Key 必须与 Themes 目录下 xaml 同名).
    /// 第二字段存翻译键(S.Theme.*)，在 <see cref="AllThemes"/> 中按当前语言解析为 Display.</summary>
    private static readonly List<ThemeInfo> Builtin = new()
    {
        // 经典:明亮 → 板岩
        new ThemeInfo("Light", "S.Theme.Light", "#FFFFFF", "#1F2329", Group: BuiltinThemes.Classic),
        new ThemeInfo("Dark",  "S.Theme.Dark",  "#26282C", "#E6E8EB", Group: BuiltinThemes.Classic),
        new ThemeInfo("Nord",  "S.Theme.Nord",  "#3B4252", "#ECEFF4", Group: BuiltinThemes.Classic),
        new ThemeInfo("Ocean", "S.Theme.Ocean", "#173540", "#E0F2F1", Group: BuiltinThemes.Classic),
        new ThemeInfo("Forest","S.Theme.Forest","#EAEFE0", "#26331F", Group: BuiltinThemes.Classic),
        new ThemeInfo("Rose",  "S.Theme.Rose",  "#FDEBF0", "#3D1F2A", Group: BuiltinThemes.Classic),
        new ThemeInfo("Oat",      "S.Theme.Oat",      "#F5F2EC", "#3A352D", Group: BuiltinThemes.Classic),
        new ThemeInfo("Haze",     "S.Theme.Haze",     "#F0F2F5", "#2F3640", Group: BuiltinThemes.Classic),
        new ThemeInfo("Sage",     "S.Theme.Sage",     "#EEF1EC", "#313A30", Group: BuiltinThemes.Classic),
        new ThemeInfo("Graphite", "S.Theme.Graphite", "#2A2C2E", "#E4E6E8", Group: BuiltinThemes.Classic),
        new ThemeInfo("Clay",     "S.Theme.Clay",     "#F3EEEA", "#3B332E", Group: BuiltinThemes.Classic),
        new ThemeInfo("Fog",      "S.Theme.Fog",      "#F1F3F4", "#313539", Group: BuiltinThemes.Classic),
        new ThemeInfo("Slate",    "S.Theme.Slate",    "#282D33", "#DDE3EA", Group: BuiltinThemes.Classic),
        // 莫兰迪 1-3(其余 4-12 在 BuiltinThemes 代码调色板)
        new ThemeInfo("Morandi1", "S.Theme.Morandi1", "#E9ECEF", "#2E353B", Group: BuiltinThemes.Morandi),
        new ThemeInfo("Morandi2", "S.Theme.Morandi2", "#EAEDE7", "#313630", Group: BuiltinThemes.Morandi),
        new ThemeInfo("Morandi3", "S.Theme.Morandi3", "#EEE9EA", "#382F32", Group: BuiltinThemes.Morandi),
        // 马卡龙 1-3
        new ThemeInfo("Macaron1", "S.Theme.Macaron1", "#E8F6F1", "#1E3B34", Group: BuiltinThemes.Macaron),
        new ThemeInfo("Macaron2", "S.Theme.Macaron2", "#FCEEF2", "#4A2A33", Group: BuiltinThemes.Macaron),
        new ThemeInfo("Macaron3", "S.Theme.Macaron3", "#FBF6E3", "#423D24", Group: BuiltinThemes.Macaron),
        // 敦煌 1-3
        new ThemeInfo("Dunhuang1", "S.Theme.Dunhuang1", "#F3EBDA", "#3A2E20", Group: BuiltinThemes.Dunhuang),
        new ThemeInfo("Dunhuang2", "S.Theme.Dunhuang2", "#F4E9DD", "#3D2A22", Group: BuiltinThemes.Dunhuang),
        new ThemeInfo("Dunhuang3", "S.Theme.Dunhuang3", "#211A14", "#EDE2CE", Group: BuiltinThemes.Dunhuang),
        // 蒙德里安 1-3
        new ThemeInfo("Mondrian1", "S.Theme.Mondrian1", "#FAFAF7", "#1A1A1A", Group: BuiltinThemes.Mondrian),
        new ThemeInfo("Mondrian2", "S.Theme.Mondrian2", "#F8FAFC", "#15202B", Group: BuiltinThemes.Mondrian),
        new ThemeInfo("Mondrian3", "S.Theme.Mondrian3", "#161616", "#F2F2F2", Group: BuiltinThemes.Mondrian),
        // 透明:透明 + 毛玻璃(其余磨砂在代码调色板)
        new ThemeInfo("Transparent", "S.Theme.Transparent", "#80FFFFFF", "#1F2329", Group: BuiltinThemes.Transparent),
        new ThemeInfo("Glass", "S.Theme.Glass", "#80222831", "#F5F7FA", Group: BuiltinThemes.Transparent),
    };

    /// <summary>代码调色板:Key → 定义.合并到内置主题中.</summary>
    private static readonly Dictionary<string, BuiltinThemes.PaletteDef> Palettes =
        BuiltinThemes.All.ToDictionary(p => p.Key, StringComparer.OrdinalIgnoreCase);

    private static readonly Dictionary<string, CustomTheme> Custom =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>当前已插入到资源树的主题字典(用于切换时移除).</summary>
    private static ResourceDictionary? _currentThemeDict;

    private static readonly HashSet<string> BuiltinKeys =
        new(Builtin.Select(t => t.Key), StringComparer.OrdinalIgnoreCase);

    public static string Current { get; private set; } = Light;

    /// <summary>主题应用完成后触发.供以代码快照画刷渲染、不走 DynamicResource 的视图(如日历)重渲染.</summary>
    public static event Action? ThemeChanged;

    /// <summary>主题即将切换(仅 <see cref="Apply"/>，编辑器逐色预览不触发).
    /// 供主窗口先截图旧主题做整窗交叉淡变.</summary>
    public static event Action? ThemeChanging;

    /// <summary>内置(xaml + 代码调色板) + 自定义的完整主题列表(供 UI 绑定).Display 按当前语言解析.</summary>
    public static List<ThemeInfo> AllThemes() =>
        Builtin.Select(t => t with { Display = Loc.T(t.Display) })
               .Concat(Palettes.Values.Select(p => new ThemeInfo(p.Key, Loc.T(p.DisplayKey), p.Preview, p.PreviewText, false, p.Group)))
               .Concat(Custom.Values.Select(ToInfo))
               .ToList();

    private static ThemeInfo ToInfo(CustomTheme c) =>
        new(c.Key, c.Display, c.Preview, c.PreviewText, IsCustom: true, Group: CustomGroup);

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

        if (Palettes.TryGetValue(key, out var pd))
        {
            foreach (var kv in pd.Colors) result[kv.Key] = kv.Value;
            return result;
        }

        try
        {
            var dict = new ResourceDictionary
            {
                Source = new Uri($"pack://application:,,,/MinimalTodoApp;component/Themes/{key}.xaml", UriKind.Absolute)
            };
            foreach (var k in AllColorKeys)
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

        ThemeChanging?.Invoke();

        ResourceDictionary newDict;

        if (Custom.TryGetValue(theme, out var ct))
        {
            newDict = BuildFromColors(ct.Colors);
        }
        else if (Palettes.TryGetValue(theme, out var pd))
        {
            newDict = BuildFromColors(pd.Colors);
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

        SwapThemeDict(newDict);
        ThemeChanged?.Invoke();
    }

    /// <summary>
    /// 实时预览一组颜色:仅替换资源树最前的主题字典并触发 <see cref="ThemeChanged"/>，
    /// 不写入自定义注册表、不改 <see cref="Current"/>、不持久化。
    /// 供主题编辑器编辑时即时换肤;取消时调用 <see cref="Apply"/>(原主题) 还原即可。
    /// </summary>
    public static void Preview(IDictionary<string, string> colors)
    {
        SwapThemeDict(BuildFromColors(colors));
        ThemeChanged?.Invoke();
    }

    /// <summary>把新主题字典换入资源树 index 0(移除上一个主题字典与任何内置 xaml 主题字典)。</summary>
    private static void SwapThemeDict(ResourceDictionary newDict)
    {
        var dicts = Application.Current.Resources.MergedDictionaries;

        // 移除上一个主题字典(自定义/调色板/预览无 Source，靠引用移除)
        if (_currentThemeDict != null)
            dicts.Remove(_currentThemeDict);

        // 兜底:移除任何内置 xaml 主题字典(保留 Controls.xaml)
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

    /// <summary>按比例 t(0..1) 把颜色 a 向 b 混合，返回 #AARRGGBB。供自定义主题派生辅助色。</summary>
    public static string Mix(string a, string b, double t)
    {
        Color Parse(string s) { try { return (Color)ColorConverter.ConvertFromString(s); } catch { return Colors.Gray; } }
        var ca = Parse(a);
        var cb = Parse(b);
        t = Math.Clamp(t, 0, 1);
        byte L(byte x, byte y) => (byte)Math.Round(x + (y - x) * t);
        return Color.FromArgb(L(ca.A, cb.A), L(ca.R, cb.R), L(ca.G, cb.G), L(ca.B, cb.B)).ToString();
    }

    /// <summary>由颜色字典构建 ResourceDictionary(含 PopupBg；缺失键用明亮主题兜底).</summary>
    private static ResourceDictionary BuildFromColors(IDictionary<string, string> colors)
    {
        var fallback = ReadColors(Light);
        var rd = new ResourceDictionary();
        foreach (var key in AllColorKeys)
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
