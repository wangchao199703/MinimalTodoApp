using System;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace MinimalTodoApp.Views;

/// <summary>
/// 纯 WPF 的 HSV 取色控件:饱和度/明度方块 + 色相滑条 + 十六进制框，无第三方依赖。
/// 选色变化通过 <see cref="ColorChanged"/> 抛出 #RRGGBB；外部用 <see cref="SetHex"/> 预置当前色(不回抛)。
/// </summary>
public partial class ColorPicker : UserControl
{
    private double _h;          // 0..360
    private double _s;          // 0..1
    private double _v = 1;      // 0..1
    private bool _suppress;     // 抑制外部赋值时的事件回抛

    /// <summary>选色变化(用户操作引起)，参数为 #RRGGBB。</summary>
    public event Action<string>? ColorChanged;

    public ColorPicker()
    {
        InitializeComponent();
        Loaded += (_, __) => UpdateUi();
    }

    /// <summary>外部预置颜色(打开取色时调用):解析 → 分解 HSV → 刷新 UI，不回抛事件。</summary>
    public void SetHex(string hex)
    {
        if (!TryParse(hex, out var c)) return;
        _suppress = true;
        RgbToHsv(c.R, c.G, c.B, out _h, out _s, out _v);
        UpdateUi();
        _suppress = false;
    }

    // ===== 饱和度/明度方块 =====
    private void SV_MouseDown(object sender, MouseButtonEventArgs e)
    {
        SVCanvas.CaptureMouse();
        SetSV(e.GetPosition(SVCanvas));
    }
    private void SV_MouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed && SVCanvas.IsMouseCaptured)
            SetSV(e.GetPosition(SVCanvas));
    }
    private void SV_MouseUp(object sender, MouseButtonEventArgs e) => SVCanvas.ReleaseMouseCapture();

    private void SetSV(Point p)
    {
        double w = SVCanvas.ActualWidth, h = SVCanvas.ActualHeight;
        if (w <= 0 || h <= 0) return;
        _s = Clamp01(p.X / w);
        _v = Clamp01(1 - p.Y / h);
        UpdateUi();
        Emit();
    }

    // ===== 色相滑条 =====
    private void Hue_MouseDown(object sender, MouseButtonEventArgs e)
    {
        HueCanvas.CaptureMouse();
        SetHue(e.GetPosition(HueCanvas));
    }
    private void Hue_MouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed && HueCanvas.IsMouseCaptured)
            SetHue(e.GetPosition(HueCanvas));
    }
    private void Hue_MouseUp(object sender, MouseButtonEventArgs e) => HueCanvas.ReleaseMouseCapture();

    private void SetHue(Point p)
    {
        double w = HueCanvas.ActualWidth;
        if (w <= 0) return;
        _h = Clamp01(p.X / w) * 360.0;
        UpdateUi();
        Emit();
    }

    // ===== 十六进制框 =====
    private void HexBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter) CommitHex();
    }
    private void HexBox_LostFocus(object sender, RoutedEventArgs e) => CommitHex();

    private void CommitHex()
    {
        if (!TryParse(HexBox.Text, out var c)) return;
        RgbToHsv(c.R, c.G, c.B, out _h, out _s, out _v);
        UpdateUi();
        Emit();
    }

    // ===== 渲染 =====
    private void UpdateUi()
    {
        var pure = HsvToRgb(_h, 1, 1);
        HueLayer.Background = new SolidColorBrush(pure);

        var c = HsvToRgb(_h, _s, _v);
        PreviewBrush.Color = c;
        string hex = $"#{c.R:X2}{c.G:X2}{c.B:X2}";
        if (HexBox.Text != hex) HexBox.Text = hex;

        double w = SVCanvas.ActualWidth, h = SVCanvas.ActualHeight, hw = HueCanvas.ActualWidth;
        if (w > 0 && h > 0)
        {
            Canvas.SetLeft(SVThumb, _s * w - SVThumb.Width / 2);
            Canvas.SetTop(SVThumb, (1 - _v) * h - SVThumb.Height / 2);
        }
        if (hw > 0)
            Canvas.SetLeft(HueThumb, _h / 360.0 * hw - HueThumb.Width / 2);
    }

    private void Emit()
    {
        if (_suppress) return;
        var c = HsvToRgb(_h, _s, _v);
        ColorChanged?.Invoke($"#{c.R:X2}{c.G:X2}{c.B:X2}");
    }

    // ===== 工具 =====
    private static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;

    private static bool TryParse(string? hex, out Color c)
    {
        c = Colors.Black;
        if (string.IsNullOrWhiteSpace(hex)) return false;
        try { c = (Color)ColorConverter.ConvertFromString(hex.Trim()); return true; }
        catch { return false; }
    }

    private static Color HsvToRgb(double h, double s, double v)
    {
        h = ((h % 360) + 360) % 360;
        double c = v * s;
        double x = c * (1 - Math.Abs((h / 60.0) % 2 - 1));
        double m = v - c;
        double r = 0, g = 0, b = 0;
        switch ((int)(h / 60))
        {
            case 0: r = c; g = x; break;
            case 1: r = x; g = c; break;
            case 2: g = c; b = x; break;
            case 3: g = x; b = c; break;
            case 4: r = x; b = c; break;
            default: r = c; b = x; break;
        }
        return Color.FromRgb(
            (byte)Math.Round((r + m) * 255),
            (byte)Math.Round((g + m) * 255),
            (byte)Math.Round((b + m) * 255));
    }

    private static void RgbToHsv(byte r, byte g, byte b, out double h, out double s, out double v)
    {
        double rd = r / 255.0, gd = g / 255.0, bd = b / 255.0;
        double max = Math.Max(rd, Math.Max(gd, bd)), min = Math.Min(rd, Math.Min(gd, bd));
        double delta = max - min;
        h = 0;
        if (delta > 1e-6)
        {
            if (max == rd) h = 60 * (((gd - bd) / delta) % 6);
            else if (max == gd) h = 60 * (((bd - rd) / delta) + 2);
            else h = 60 * (((rd - gd) / delta) + 4);
        }
        if (h < 0) h += 360;
        s = max <= 0 ? 0 : delta / max;
        v = max;
    }
}
