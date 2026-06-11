using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Converters;

/// <summary>value 为 null -> true.参数 "Invert" 可反转.</summary>
public class NullToBoolConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool isNull = value == null;
        if (parameter is string s && s.Equals("Invert", StringComparison.OrdinalIgnoreCase))
            return !isNull;
        return isNull;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>布尔取反.</summary>
public class InverseBooleanConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b ? !b : Binding.DoNothing;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b ? !b : Binding.DoNothing;
}

/// <summary>空字符串 -> Visible(用于输入框 watermark 占位提示).参数 "Invert" 时改为非空 -> Visible.</summary>
public class EmptyStringToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool isEmpty = string.IsNullOrEmpty(value as string);
        if (parameter is string s && s.Equals("Invert", StringComparison.OrdinalIgnoreCase))
            isEmpty = !isEmpty;
        return isEmpty ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>bool -> Visibility.参数 "Invert" 可反转.</summary>
public class BoolToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool b = value is bool v && v;
        if (parameter is string s && s.Equals("Invert", StringComparison.OrdinalIgnoreCase))
            b = !b;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>截止日期 -> 友好文本:今天 / 明天 / 逾期 N 天 / MM月dd日.</summary>
public class DueDateDisplayConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is not DateTime due) return string.Empty;

        var days = (due.Date - DateTime.Today).Days;
        return days switch
        {
            0 => Loc.T("S.Today"),
            1 => Loc.T("S.Tomorrow"),
            -1 => Loc.T("S.Yesterday"),
            < 0 => Loc.F("S.Fmt.OverdueDaysShort", -days),
            < 7 => Loc.F("S.Fmt.DaysLater", days),
            _ => due.ToString(Loc.T("S.Fmt.MonthDay"), culture)
        };
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>十六进制颜色字符串 -> SolidColorBrush.</summary>
public class StringToBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is string hex && !string.IsNullOrWhiteSpace(hex))
        {
            try
            {
                return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
            }
            catch
            {
                /* ignore */
            }
        }
        return Brushes.Gray;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>十六进制颜色 -> 向白混合调浅的画刷(用于标签 chip 淡底).混合比例默认 0.82,可经参数覆盖.</summary>
public class HexToLightBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        Color baseColor;
        try { baseColor = (Color)ColorConverter.ConvertFromString(value as string ?? "#3B82F6"); }
        catch { baseColor = (Color)ColorConverter.ConvertFromString("#3B82F6"); }
        double t = 0.82;
        if (parameter is string s && double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var pt))
            t = Math.Clamp(pt, 0, 1);
        byte Mix(byte c) => (byte)Math.Round(c + (255 - c) * t);
        return new SolidColorBrush(Color.FromRgb(Mix(baseColor.R), Mix(baseColor.G), Mix(baseColor.B)));
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>容器宽度 -> 一行两列的列宽(value/2 再减去间距/滚动条余量).用于标签看板 WrapPanel.ItemWidth.</summary>
public class HalfWidthConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is double w && w > 0)
            return Math.Max(180, (w - 26) / 2.0);   // 26 ≈ 两列间距 + 滚动条余量
        return 280.0;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>DueState -> 倒计时文字颜色(引用当前主题的动态资源画刷).</summary>
public class DueStateToBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var state = value is Models.DueState s ? s : Models.DueState.None;
        var key = state switch
        {
            Models.DueState.Overdue => "OverdueText",
            Models.DueState.Today => "WarningText",
            Models.DueState.Soon => "WarningText",
            Models.DueState.Completed => "MutedText",
            Models.DueState.Normal => "SecondaryText",
            _ => "MutedText"
        };

        return Application.Current.TryFindResource(key) as Brush ?? Brushes.Gray;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>Priority -> 左侧色条画刷(高=红，中=橙，低=蓝绿;旧数据 None 视为中).</summary>
public class PriorityToBrushConverter : IValueConverter
{
    public static SolidColorBrush BrushFor(Models.Priority p) => p switch
    {
        Models.Priority.High => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#EF4444")),
        Models.Priority.Low => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10B981")),
        _ => new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F59E0B"))   // Medium / None 兜底
    };

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => BrushFor(value is Models.Priority p ? p : Models.Priority.Medium);

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>
/// Priority -> 左脊色条画刷:在优先级色(红/橙/绿)基础上向白色混合调浅,与白卡更协调、不刺眼。
/// 混合比例 0~1(越大越浅),默认 0.45;可经 ConverterParameter 覆盖。
/// </summary>
public class PriorityToLightBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var baseColor = PriorityToBrushConverter.BrushFor(value is Models.Priority p ? p : Models.Priority.Medium).Color;
        double t = 0.45;
        if (parameter is string s && double.TryParse(s, NumberStyles.Any, CultureInfo.InvariantCulture, out var pt))
            t = Math.Clamp(pt, 0, 1);
        byte Mix(byte c) => (byte)Math.Round(c + (255 - c) * t);
        return new SolidColorBrush(Color.FromRgb(Mix(baseColor.R), Mix(baseColor.G), Mix(baseColor.B)));
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>
/// 任务勾选圈环色:(Priority, 是否“圆圈不显示颜色”) -> 画刷。
/// 开启“无色圆圈”时返回中性灰(优先取主题 MutedText)，颜色由前置色块体现;否则按优先级着色。
/// </summary>
public class PriorityRingBrushConverter : IMultiValueConverter
{
    public object Convert(object[] values, Type targetType, object? parameter, CultureInfo culture)
    {
        bool noColor = values.Length > 1 && values[1] is bool b && b;
        if (noColor)
        {
            if (Application.Current?.TryFindResource("MutedText") is Brush br) return br;
            return new SolidColorBrush((Color)ColorConverter.ConvertFromString("#9CA3AF"));
        }
        var p = values.Length > 0 && values[0] is Models.Priority pr ? pr : Models.Priority.Medium;
        return PriorityToBrushConverter.BrushFor(p);
    }

    public object[] ConvertBack(object? value, Type[] targetTypes, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>Priority -> 中文标签.</summary>
public class PriorityToTextConverter : IValueConverter
{
    public static string TextFor(Models.Priority p) => p switch
    {
        Models.Priority.High => Loc.T("S.Priority.High"),
        Models.Priority.Low => Loc.T("S.Priority.Low"),
        _ => Loc.T("S.Priority.Medium")
    };

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => TextFor(value is Models.Priority p ? p : Models.Priority.Medium);

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>缩进层级 int -> Thickness 左边距，每级 22px，用于子待办的层级视觉对齐.</summary>
public class IndentToMarginConverter : IValueConverter
{
    public const double Step = 22.0;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        int level = value is int i ? Math.Max(0, Math.Min(i, 8)) : 0;
        return new Thickness(level * Step, 0, 0, 0);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>
/// 缩进层级 -> 任务卡片 Margin:左缩进 = 层级×16(卡片整体右移变窄，卡内对勾到卡片左边框距离与父任务一致)，
/// 上下间距取 AppTaskItemMargin;子任务(缩进>0)上下间距减半，让展开后更紧凑。
/// </summary>
public class IndentToCardMarginConverter : IValueConverter
{
    public const double Step = 16.0;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        int level = value is int i ? Math.Max(0, Math.Min(i, 8)) : 0;

        double v = 4;   // 兜底竖直间距
        if (Application.Current?.TryFindResource("AppTaskItemMargin") is Thickness t)
            v = t.Top;
        if (level > 0) v = Math.Round(v / 2.0);   // 子任务之间间隔减半

        return new Thickness(level * Step, v, 0, v);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>
/// 根据缩进层级 + 基准字号计算任务标题字号:父待办(顶层 indent=0)用基准字号，
/// 子待办每深一级 ×0.75(约为父任务 3/4，最多缩 2 级)，地板 9。values[0]=IndentLevel, values[1]=基准字号(VM.FontSize)。
/// </summary>
public class IndentFontSizeConverter : IMultiValueConverter
{
    public object Convert(object?[] values, Type targetType, object? parameter, CultureInfo culture)
    {
        int indent = values.Length > 0 && values[0] is int i ? i : 0;
        double baseSize = values.Length > 1 && values[1] is double d && d > 0 ? d : 12;
        double size = baseSize * Math.Pow(0.75, Math.Min(Math.Max(indent, 0), 2));
        return Math.Max(size, 9.0);
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>图片文件路径 -> BitmapImage(用于分组自定义图片图标).加载失败返回 null.</summary>
public class PathToImageConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is not string path || string.IsNullOrWhiteSpace(path) || !System.IO.File.Exists(path))
            return null;
        try
        {
            var bmp = new System.Windows.Media.Imaging.BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
            bmp.UriSource = new Uri(path);
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
        catch
        {
            return null;
        }
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

/// <summary>判断值与参数是否相等 -> bool(用于当前主题高亮等).</summary>
public class EqualityToBoolConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => string.Equals(value?.ToString(), parameter?.ToString(), StringComparison.OrdinalIgnoreCase);

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
