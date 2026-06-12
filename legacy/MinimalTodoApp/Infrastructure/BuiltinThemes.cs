using System;
using System.Collections.Generic;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 代码定义的内置调色板(避免为每套配色单独建 xaml 文件)。
/// 每个 <see cref="PaletteDef"/> 持有完整 18 个颜色键，运行时由 <see cref="ThemeManager"/>
/// 经 BuildFromColors 直接构建 ResourceDictionary。
///
/// 设计要点:为保证可读性，每套配色只需给出 4 个锚点色(底/卡片/正文/强调)，
/// 其余(次级文字/分割线/悬停/选中/弹窗等)由 <see cref="Build"/> 基于明暗模式插值派生，
/// 使 正文↔卡片 / 正文↔弹窗 的对比方向始终一致，深色主题的右键菜单与日历也清晰可读。
/// </summary>
public static class BuiltinThemes
{
    /// <summary>分组键(与 S.ThemeGroup.* 本地化键对应)。常用为动态分组，不在此列。</summary>
    public const string Classic = "Classic";
    public const string Morandi = "Morandi";
    public const string Macaron = "Macaron";
    public const string Dunhuang = "Dunhuang";
    public const string Mondrian = "Mondrian";
    public const string Memphis = "Memphis";
    public const string Rococo = "Rococo";
    public const string Matisse = "Matisse";
    public const string Transparent = "Transparent";

    /// <summary>一套代码调色板:Key 唯一，DisplayKey 为本地化键，Group 为分组键。</summary>
    public record PaletteDef(string Key, string DisplayKey, string Group, string Preview, string PreviewText, Dictionary<string, string> Colors);

    private static List<PaletteDef>? _cache;

    /// <summary>全部代码调色板(惰性构建一次)。</summary>
    public static IReadOnlyList<PaletteDef> All => _cache ??= BuildAll();

    // ============================ 颜色工具 ============================

    private static (int r, int g, int b) Rgb(string hex)
    {
        try
        {
            hex = hex.TrimStart('#');
            if (hex.Length == 8) hex = hex.Substring(2);   // 去掉 alpha
            return (Convert.ToInt32(hex.Substring(0, 2), 16),
                    Convert.ToInt32(hex.Substring(2, 2), 16),
                    Convert.ToInt32(hex.Substring(4, 2), 16));
        }
        catch { return (128, 128, 128); }
    }

    private static int Clamp(double v) => v < 0 ? 0 : v > 255 ? 255 : (int)Math.Round(v);

    private static string Hex(double r, double g, double b) => $"#{Clamp(r):X2}{Clamp(g):X2}{Clamp(b):X2}";

    /// <summary>在 sRGB 上线性混合 a、b，t=0 取 a，t=1 取 b。</summary>
    private static string Mix(string a, string b, double t)
    {
        var (ar, ag, ab) = Rgb(a);
        var (br, bg, bb) = Rgb(b);
        return Hex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
    }

    private static double Lum(string c)
    {
        var (r, g, b) = Rgb(c);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
    }

    private const string White = "#FFFFFF";
    private const string Black = "#000000";

    /// <summary>由 4 个锚点色派生完整 18 键调色板。dark 决定派生方向(变亮/变暗)。</summary>
    private static Dictionary<string, string> Build(bool dark, string bg, string card, string text, string accent)
    {
        string accentText = Lum(accent) > 0.62 ? "#1F2329" : "#FFFFFF";
        return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["WindowBg"]       = bg,
            ["TitleBarBg"]     = dark ? Mix(bg, Black, 0.28) : Mix(bg, Black, 0.05),
            ["SidebarBg"]      = dark ? Mix(bg, Black, 0.20) : Mix(bg, Black, 0.03),
            ["ContentBg"]      = bg,
            ["CardBg"]         = card,
            ["CardHoverBg"]    = dark ? Mix(card, White, 0.07) : Mix(card, Black, 0.05),
            ["InputBg"]        = dark ? Mix(bg, White, 0.07) : Mix(bg, Black, 0.05),
            ["PrimaryText"]    = text,
            ["SecondaryText"]  = Mix(text, bg, 0.32),
            ["MutedText"]      = Mix(text, bg, 0.55),
            ["Accent"]         = accent,
            ["AccentText"]     = accentText,
            ["Divider"]        = dark ? Mix(bg, White, 0.12) : Mix(bg, Black, 0.10),
            ["SelectedItemBg"] = dark ? Mix(accent, bg, 0.68) : Mix(accent, bg, 0.80),
            ["OverdueText"]    = dark ? "#FF6B6B" : "#E5484D",
            ["WarningText"]    = dark ? "#F0A741" : "#D9820B",
            ["SuccessText"]    = dark ? "#4ADE80" : "#16A34A",
            ["PopupBg"]        = dark ? Mix(card, White, 0.03) : card,
        };
    }

    /// <summary>浅色主题工厂。</summary>
    private static PaletteDef L(string key, string disp, string grp, string bg, string card, string text, string accent)
        => new(key, disp, grp, bg, text, Build(false, bg, card, text, accent));

    /// <summary>深色主题工厂。</summary>
    private static PaletteDef D(string key, string disp, string grp, string bg, string card, string text, string accent)
        => new(key, disp, grp, bg, text, Build(true, bg, card, text, accent));

    // ============================ 调色板定义 ============================

    private static List<PaletteDef> BuildAll()
    {
        var list = new List<PaletteDef>();

        // —— 莫兰迪:低饱和灰调，已有 1-3(xaml)，此处补 4-12 ——
        list.Add(L("Morandi4",  "S.Theme.Morandi4",  Morandi, "#ECEAEF", "#F8F6FA", "#353039", "#8B7F97"));
        list.Add(D("Morandi5",  "S.Theme.Morandi5",  Morandi, "#2B2E31", "#34383B", "#DDE1E4", "#8FA0AE"));
        list.Add(L("Morandi6",  "S.Theme.Morandi6",  Morandi, "#EFE9E9", "#FAF5F5", "#3B3333", "#AC8A88"));
        list.Add(L("Morandi7",  "S.Theme.Morandi7",  Morandi, "#EBEBE3", "#F7F7EF", "#36362C", "#8C8A66"));
        list.Add(L("Morandi8",  "S.Theme.Morandi8",  Morandi, "#E6EBEB", "#F4F8F8", "#2D3636", "#6F9395"));
        list.Add(L("Morandi9",  "S.Theme.Morandi9",  Morandi, "#ECE7E1", "#F8F3ED", "#383027", "#A18A6E"));
        list.Add(D("Morandi10", "S.Theme.Morandi10", Morandi, "#2A2F30", "#333A3B", "#DCE3E2", "#7FA0A0"));
        list.Add(L("Morandi11", "S.Theme.Morandi11", Morandi, "#EDE8EA", "#F9F4F6", "#383036", "#A0879A"));
        list.Add(D("Morandi12", "S.Theme.Morandi12", Morandi, "#2C2E33", "#353842", "#DBDEE6", "#8E94B0"));

        // —— 马卡龙:清甜粉彩，已有 1-3，补 4-12 ——
        list.Add(L("Macaron4",  "S.Theme.Macaron4",  Macaron, "#EAF0FC", "#F6F9FE", "#27314A", "#5B8DEF"));
        list.Add(L("Macaron5",  "S.Theme.Macaron5",  Macaron, "#F1EAFB", "#FAF6FE", "#342A48", "#9B6FE0"));
        list.Add(L("Macaron6",  "S.Theme.Macaron6",  Macaron, "#FDEEE6", "#FEF8F4", "#46332A", "#F0915E"));
        list.Add(L("Macaron7",  "S.Theme.Macaron7",  Macaron, "#ECF6E6", "#F7FBF3", "#2E3A28", "#7FB857"));
        list.Add(L("Macaron8",  "S.Theme.Macaron8",  Macaron, "#FCEAF0", "#FEF6F9", "#452A33", "#E96A93"));
        list.Add(L("Macaron9",  "S.Theme.Macaron9",  Macaron, "#E7F4F4", "#F4FAFA", "#243838", "#4FB0B0"));
        list.Add(L("Macaron10", "S.Theme.Macaron10", Macaron, "#F8EFE0", "#FDF8EE", "#443827", "#D79A47"));
        list.Add(L("Macaron11", "S.Theme.Macaron11", Macaron, "#EEECFA", "#F8F7FD", "#322F47", "#8580E0"));
        list.Add(L("Macaron12", "S.Theme.Macaron12", Macaron, "#FCEBEA", "#FEF6F5", "#46292A", "#ED6A6A"));

        // —— 敦煌:壁画土色 + 石青/土红/描金，已有 1-3，补 4-12 ——
        list.Add(L("Dunhuang4",  "S.Theme.Dunhuang4",  Dunhuang, "#F1E6D6", "#FBF4E8", "#3E2E1E", "#B5763C"));
        list.Add(L("Dunhuang5",  "S.Theme.Dunhuang5",  Dunhuang, "#E4ECE2", "#F3F8F0", "#243528", "#5E8A66"));
        list.Add(L("Dunhuang6",  "S.Theme.Dunhuang6",  Dunhuang, "#F3E4DD", "#FCF3EE", "#45291F", "#C2553F"));
        list.Add(D("Dunhuang7",  "S.Theme.Dunhuang7",  Dunhuang, "#1C2530", "#26303C", "#DDE6EE", "#5C93B5"));
        list.Add(L("Dunhuang8",  "S.Theme.Dunhuang8",  Dunhuang, "#ECE3EC", "#F8F2F7", "#382B38", "#9A6E92"));
        list.Add(L("Dunhuang9",  "S.Theme.Dunhuang9",  Dunhuang, "#F4ECD8", "#FCF7EA", "#3E3218", "#C79A3E"));
        list.Add(D("Dunhuang10", "S.Theme.Dunhuang10", Dunhuang, "#251918", "#31211F", "#EFD9D2", "#C26A55"));
        list.Add(D("Dunhuang11", "S.Theme.Dunhuang11", Dunhuang, "#182420", "#22302B", "#D7E6DD", "#5FA37E"));
        list.Add(L("Dunhuang12", "S.Theme.Dunhuang12", Dunhuang, "#F5EFD9", "#FCF8EA", "#403821", "#C9A53F"));

        // —— 蒙德里安:三原色撞色 + 黑白格，已有 1-3，补 4-12 ——
        list.Add(L("Mondrian4",  "S.Theme.Mondrian4",  Mondrian, "#FAFAF7", "#FFFFFF", "#1A1A1A", "#D42E2E"));
        list.Add(L("Mondrian5",  "S.Theme.Mondrian5",  Mondrian, "#FAFAF7", "#FFFFFF", "#1A1A1A", "#E0A106"));
        list.Add(L("Mondrian6",  "S.Theme.Mondrian6",  Mondrian, "#F7F8FA", "#FFFFFF", "#15171A", "#1F4FD0"));
        list.Add(L("Mondrian7",  "S.Theme.Mondrian7",  Mondrian, "#F2F2EF", "#FBFBF9", "#1C1C1C", "#444444"));
        list.Add(D("Mondrian8",  "S.Theme.Mondrian8",  Mondrian, "#161616", "#202020", "#F2F2F2", "#E0463F"));
        list.Add(D("Mondrian9",  "S.Theme.Mondrian9",  Mondrian, "#141619", "#1E2127", "#EEF1F5", "#4A78E8"));
        list.Add(D("Mondrian10", "S.Theme.Mondrian10", Mondrian, "#17160F", "#211F16", "#F3F0E2", "#E6B53C"));
        list.Add(L("Mondrian11", "S.Theme.Mondrian11", Mondrian, "#F5F8F4", "#FFFFFF", "#16201A", "#1E8E4F"));
        list.Add(L("Mondrian12", "S.Theme.Mondrian12", Mondrian, "#FAF6F2", "#FFFFFF", "#211A14", "#E5631E"));

        // —— 孟菲斯:80 年代波普高能撞色，全新 12 ——
        list.Add(L("Memphis1",  "S.Theme.Memphis1",  Memphis, "#FFF4F7", "#FFFFFF", "#2A1F26", "#FF4D8D"));
        list.Add(L("Memphis2",  "S.Theme.Memphis2",  Memphis, "#ECFAFB", "#FFFFFF", "#1C3033", "#00ACC1"));
        list.Add(L("Memphis3",  "S.Theme.Memphis3",  Memphis, "#FFFAE6", "#FFFFFF", "#2E2A18", "#F5A300"));
        list.Add(L("Memphis4",  "S.Theme.Memphis4",  Memphis, "#F5EEFC", "#FFFFFF", "#2B2238", "#8E44E0"));
        list.Add(L("Memphis5",  "S.Theme.Memphis5",  Memphis, "#FFF0EC", "#FFFFFF", "#34221C", "#FF6B4A"));
        list.Add(L("Memphis6",  "S.Theme.Memphis6",  Memphis, "#E9F8F0", "#FFFFFF", "#1C3329", "#14B87E"));
        list.Add(L("Memphis7",  "S.Theme.Memphis7",  Memphis, "#EBF0FE", "#FFFFFF", "#1E2740", "#3D5AFE"));
        list.Add(L("Memphis8",  "S.Theme.Memphis8",  Memphis, "#FDECF4", "#FFFFFF", "#38222E", "#EC407A"));
        list.Add(D("Memphis9",  "S.Theme.Memphis9",  Memphis, "#1B1A1F", "#25242B", "#F0EEF4", "#FF7A33"));
        list.Add(D("Memphis10", "S.Theme.Memphis10", Memphis, "#15191B", "#1F2528", "#E6EEF0", "#1FC8C8"));
        list.Add(D("Memphis11", "S.Theme.Memphis11", Memphis, "#1C1620", "#271E2C", "#F0E6F2", "#E84D9A"));
        list.Add(D("Memphis12", "S.Theme.Memphis12", Memphis, "#14161D", "#1E212B", "#E8ECF5", "#5979FF"));

        // —— 洛可可:华丽柔粉 + 描金，优雅，全新 12 ——
        list.Add(L("Rococo1",  "S.Theme.Rococo1",  Rococo, "#FBEFEF", "#FEF8F7", "#3E2E30", "#C9A24B"));
        list.Add(L("Rococo2",  "S.Theme.Rococo2",  Rococo, "#FBF5E3", "#FEFAEF", "#3E3522", "#BFA050"));
        list.Add(L("Rococo3",  "S.Theme.Rococo3",  Rococo, "#EDF1F8", "#F8FAFD", "#2C333F", "#8FA9C9"));
        list.Add(L("Rococo4",  "S.Theme.Rococo4",  Rococo, "#EBF3EC", "#F6FAF5", "#2A352C", "#B79A52"));
        list.Add(L("Rococo5",  "S.Theme.Rococo5",  Rococo, "#F2ECF6", "#FAF6FB", "#332C3A", "#A98FC0"));
        list.Add(L("Rococo6",  "S.Theme.Rococo6",  Rococo, "#FBEDE6", "#FEF7F2", "#43302A", "#C98A5E"));
        list.Add(L("Rococo7",  "S.Theme.Rococo7",  Rococo, "#F7F2E9", "#FCF9F2", "#3A352A", "#C2A765"));
        list.Add(L("Rococo8",  "S.Theme.Rococo8",  Rococo, "#FAEAEC", "#FEF5F6", "#422A2E", "#C58A6E"));
        list.Add(L("Rococo9",  "S.Theme.Rococo9",  Rococo, "#E9F1F2", "#F5FAFA", "#273434", "#7FA8AB"));
        list.Add(L("Rococo10", "S.Theme.Rococo10", Rococo, "#F4ECF0", "#FCF6F9", "#382E34", "#B58AA0"));
        list.Add(D("Rococo11", "S.Theme.Rococo11", Rococo, "#25201A", "#302A22", "#EFE6D6", "#C9A24B"));
        list.Add(D("Rococo12", "S.Theme.Rococo12", Rococo, "#1A211C", "#242C26", "#E3ECE2", "#BB9A55"));

        // —— 马蒂斯:野兽派浓烈剪纸撞色，全新 12 ——
        list.Add(L("Matisse1",  "S.Theme.Matisse1",  Matisse, "#E9F1FA", "#F6FAFE", "#14283A", "#1E6FC4"));
        list.Add(L("Matisse2",  "S.Theme.Matisse2",  Matisse, "#FCEAE6", "#FEF6F3", "#401F18", "#D83A2A"));
        list.Add(L("Matisse3",  "S.Theme.Matisse3",  Matisse, "#E6F4EA", "#F4FBF6", "#15301F", "#1E9E5A"));
        list.Add(L("Matisse4",  "S.Theme.Matisse4",  Matisse, "#FCF6DF", "#FEFBEE", "#3A3212", "#E3A800"));
        list.Add(L("Matisse5",  "S.Theme.Matisse5",  Matisse, "#FCECEF", "#FEF6F8", "#3E2229", "#E64C72"));
        list.Add(D("Matisse6",  "S.Theme.Matisse6",  Matisse, "#122031", "#1C2D40", "#DCE8F2", "#2E86D0"));
        list.Add(L("Matisse7",  "S.Theme.Matisse7",  Matisse, "#F0EFD8", "#FAFAEB", "#343318", "#8E8420"));
        list.Add(D("Matisse8",  "S.Theme.Matisse8",  Matisse, "#251418", "#311E22", "#F2DCDF", "#E0506A"));
        list.Add(L("Matisse9",  "S.Theme.Matisse9",  Matisse, "#E4F2F0", "#F3FAF9", "#163331", "#138B82"));
        list.Add(L("Matisse10", "S.Theme.Matisse10", Matisse, "#F0EAFA", "#F9F6FE", "#2A2240", "#6E45C9"));
        list.Add(D("Matisse11", "S.Theme.Matisse11", Matisse, "#20180F", "#2B2116", "#F2E4D0", "#E0922E"));
        list.Add(D("Matisse12", "S.Theme.Matisse12", Matisse, "#0F2226", "#193034", "#DCECEE", "#18A0B0"));

        // —— 透明:在已有 透明/毛玻璃(xaml) 之外，补几套半透明磨砂/薄雾 ——
        list.Add(Frosted("FrostLight", "S.Theme.FrostLight", "#15181C",
            bg: "#B8FFFFFF", title: "#40FFFFFF", sidebar: "#2EFFFFFF", content: "#00FFFFFF",
            card: "#9CFFFFFF", hover: "#C0FFFFFF", input: "#7AFFFFFF",
            accent: "#3B82F6", divider: "#33000000", selected: "#553B82F6", popup: "#F0FFFFFF"));
        list.Add(Frosted("FrostDark", "S.Theme.FrostDark", "#F2F5F8",
            bg: "#B0202428", title: "#33000000", sidebar: "#2A000000", content: "#00000000",
            card: "#8C2B3036", hover: "#A8343A42", input: "#6622272C",
            accent: "#5B9DFF", divider: "#33FFFFFF", selected: "#66416A9E", popup: "#F0262B30"));
        list.Add(Frosted("Mist", "S.Theme.Mist", "#1A2030",
            bg: "#BEE8EEF6", title: "#3CFFFFFF", sidebar: "#2AFFFFFF", content: "#00FFFFFF",
            card: "#A6F2F6FB", hover: "#CCE3EBF5", input: "#80EDF1F7",
            accent: "#5C7CFA", divider: "#2A2A3A55", selected: "#555C7CFA", popup: "#F2F4F7FC"));

        return list;
    }

    /// <summary>半透明磨砂主题工厂:颜色含 alpha，直接指定不走插值派生。</summary>
    private static PaletteDef Frosted(string key, string disp, string text,
        string bg, string title, string sidebar, string content, string card,
        string hover, string input, string accent, string divider, string selected, string popup)
    {
        var colors = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["WindowBg"]       = bg,
            ["TitleBarBg"]     = title,
            ["SidebarBg"]      = sidebar,
            ["ContentBg"]      = content,
            ["CardBg"]         = card,
            ["CardHoverBg"]    = hover,
            ["InputBg"]        = input,
            ["PrimaryText"]    = text,
            ["SecondaryText"]  = Mix(text, "#808080", 0.30),
            ["MutedText"]      = Mix(text, "#808080", 0.55),
            ["Accent"]         = accent,
            ["AccentText"]     = Lum(accent) > 0.62 ? "#1F2329" : "#FFFFFF",
            ["Divider"]        = divider,
            ["SelectedItemBg"] = selected,
            ["OverdueText"]    = Lum(text) > 0.5 ? "#FF8A8A" : "#D32F2F",
            ["WarningText"]    = Lum(text) > 0.5 ? "#FFC04D" : "#B26A00",
            ["SuccessText"]    = Lum(text) > 0.5 ? "#6EE7A0" : "#15803D",
            ["PopupBg"]        = popup,
        };
        // 预览色用不透明 popup，避免色板过透看不清
        string preview = "#" + popup.TrimStart('#').Substring(Math.Max(0, popup.TrimStart('#').Length - 6));
        return new PaletteDef(key, disp, Transparent, preview, text, colors);
    }
}
