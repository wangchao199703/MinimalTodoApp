using System.Windows;
using System.Windows.Media;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 附加属性:把元素裁剪为圆角矩形(随元素尺寸实时更新)。
/// 用于让"贴左边缘的满高优先级竖条"覆盖层随卡片圆角自然收口、不外露。
/// 比在 XAML 里把 Clip 绑定到 ActualWidth/ActualHeight 更可靠(后者在 Clip 上常不刷新)。
/// 用法:在容器上设 infra:RoundedClip.Radius="12"。
/// </summary>
public static class RoundedClip
{
    public static readonly DependencyProperty RadiusProperty =
        DependencyProperty.RegisterAttached(
            "Radius", typeof(double), typeof(RoundedClip),
            new PropertyMetadata(double.NaN, OnRadiusChanged));

    public static double GetRadius(DependencyObject o) => (double)o.GetValue(RadiusProperty);
    public static void SetRadius(DependencyObject o, double value) => o.SetValue(RadiusProperty, value);

    private static void OnRadiusChanged(DependencyObject o, DependencyPropertyChangedEventArgs e)
    {
        if (o is not FrameworkElement fe) return;
        fe.SizeChanged -= OnSizeChanged;
        if (double.IsNaN((double)e.NewValue))
        {
            fe.Clip = null;
            return;
        }
        fe.SizeChanged += OnSizeChanged;
        ApplyClip(fe);
    }

    private static void OnSizeChanged(object sender, SizeChangedEventArgs e) => ApplyClip((FrameworkElement)sender);

    private static void ApplyClip(FrameworkElement fe)
    {
        if (fe.ActualWidth <= 0 || fe.ActualHeight <= 0) return;
        double r = GetRadius(fe);
        var geo = new RectangleGeometry(new Rect(0, 0, fe.ActualWidth, fe.ActualHeight), r, r);
        geo.Freeze();
        fe.Clip = geo;
    }
}
