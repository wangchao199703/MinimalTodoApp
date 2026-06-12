using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Media;

namespace MinimalTodoApp.Infrastructure;

/// <summary>可选字体的描述.Key 为传给 WPF 的 FontFamily 字符串(空=跟随系统默认);Display 为翻译键.</summary>
public record FontInfo(string Key, string Display);

/// <summary>
/// 通过向 App.Resources.MergedDictionaries 注入一套动态资源(AppFontFamily / AppFontSize /
/// AppLineHeight / AppTaskItemMargin)，实现正文与任务文字的字体、字号、行距实时调整与持久化.
/// 仅作用于"正文/任务文字"——图标与固定尺寸界面元素自带显式字号，不受影响.
/// Controls.xaml 中相关样式以 DynamicResource 引用这些键，改即生效.
/// </summary>
public static class FontManager
{
    /// <summary>系统默认字体回退链(用户选择"跟随系统"或字段为空时使用).</summary>
    public const string SystemDefault = "Microsoft YaHei UI, Segoe UI";

    /// <summary>字号可调范围(默认中=12).</summary>
    public const double MinSize = 10;
    public const double MaxSize = 18;

    /// <summary>行距倍率可调范围(默认 1.1;下限与设置面板滑块一致，否则用户拖到 0.4 会被夹回).</summary>
    public const double MinSpacing = 0.4;
    public const double MaxSpacing = 1.8;

    /// <summary>勾选框圆环直径可调范围(默认≈字号+2).</summary>
    public const double MinCheckbox = 12;
    public const double MaxCheckbox = 26;

    /// <summary>可选字体列表(Key 为 FontFamily 字符串，空串=跟随系统).</summary>
    private static readonly List<FontInfo> Builtin = new()
    {
        new FontInfo("Microsoft YaHei UI, Segoe UI", "S.Font.System"),
        new FontInfo("Microsoft YaHei", "S.Font.YaHei"),
        new FontInfo("SimSun", "S.Font.SimSun"),
        new FontInfo("KaiTi", "S.Font.KaiTi"),
        new FontInfo("SimHei", "S.Font.SimHei"),
        new FontInfo("FangSong", "S.Font.FangSong"),
        new FontInfo("Segoe UI", "S.Font.SegoeUI"),
        new FontInfo("Consolas", "S.Font.Consolas"),
    };

    /// <summary>供 UI 绑定的字体列表，Display 按当前语言解析.</summary>
    public static List<FontInfo> AllFonts() =>
        Builtin.Select(f => f with { Display = Loc.T(f.Display) }).ToList();

    /// <summary>当前注入的字体资源字典(用于切换时移除).</summary>
    private static ResourceDictionary? _current;

    /// <summary>应用字体设置:family 为空则跟随系统;size/spacing/checkboxSize 自动夹取到合理范围.</summary>
    public static void Apply(string? family, double size, double spacing, double checkboxSize)
    {
        if (string.IsNullOrWhiteSpace(family)) family = SystemDefault;
        // 非法值(≤0)兜底为产品默认(字号 14 / 行距 1.1，与 MainViewModel.Default* 一致)
        size = Math.Clamp(size <= 0 ? 14 : size, MinSize, MaxSize);
        spacing = Math.Clamp(spacing <= 0 ? 1.1 : spacing, MinSpacing, MaxSpacing);
        // 勾选框直径:未设置(≤0)时默认≈字号+2(视觉与文字等高)，否则夹取到合理范围
        checkboxSize = Math.Clamp(checkboxSize <= 0 ? size + 2 : checkboxSize, MinCheckbox, MaxCheckbox);

        var rd = new ResourceDictionary
        {
            ["AppFontFamily"] = new FontFamily(family),
            ["AppFontSize"] = size,
            // 文字行高:字号 × 行距 × 1.35(1.35 为单倍行距下舒适的行高系数)
            ["AppLineHeight"] = size * spacing * 1.35,
            // 任务行间距:基准 3px 随行距放大(更紧凑，同屏可见更多待办)
            ["AppTaskItemMargin"] = new Thickness(0, Math.Round(3 * spacing), 0, Math.Round(3 * spacing)),
            // 勾选框圆环直径(任务行 TaskCheckBox 用 DynamicResource 引用)
            ["AppCheckBoxSize"] = checkboxSize,
        };

        var dicts = Application.Current.Resources.MergedDictionaries;
        if (_current != null) dicts.Remove(_current);
        dicts.Add(rd);            // 追加到末尾即可，DynamicResource 会就近解析这些键
        _current = rd;
    }
}
