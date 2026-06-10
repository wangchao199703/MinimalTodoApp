using System;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 统一动画工具(iOS/macOS 风格的灵动过渡).设计规范:
///  - Fast 120ms / Base 200ms:CubicEase.EaseOut,用于 hover、淡入淡出;
///  - Emphasis 280ms:BackEase.EaseOut(轻微过冲,模拟弹簧),用于进场缩放/位移;
///  - 位移/缩放允许 BackEase 过冲,Opacity 一律 CubicEase(过冲会产生非法值).
/// 动画结束后统一 BeginAnimation(prop, null) 释放,避免锁住属性(与贴边动画做法一致).
/// 全部动画尊重系统"动画效果"无障碍开关(Enabled=false 时直达终态,不引入额外设置项).
/// </summary>
public static class Anim
{
    /// <summary>是否播放动画:跟随 Windows 系统"显示动画"无障碍设置.</summary>
    public static bool Enabled => SystemParameters.ClientAreaAnimation;

    public static readonly TimeSpan Fast = TimeSpan.FromMilliseconds(120);
    public static readonly TimeSpan Base = TimeSpan.FromMilliseconds(200);
    public static readonly TimeSpan Emphasis = TimeSpan.FromMilliseconds(280);

    /// <summary>标准淡入淡出缓动(EaseOut,前快后缓).</summary>
    public static IEasingFunction EaseOut() => new CubicEase { EasingMode = EasingMode.EaseOut };

    /// <summary>弹簧缓动(轻微过冲后回弹,用于位移/缩放,不可用于 Opacity).</summary>
    public static IEasingFunction Spring(double amplitude = 0.35) =>
        new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = amplitude };

    /// <summary>Dialog/弹窗进场:缩放 0.96→1 + 淡入,作用于窗口内容根元素.</summary>
    public static void IntroScaleFade(FrameworkElement root, bool scale = true)
    {
        if (!Enabled) { root.Opacity = 1; return; }

        var fade = new DoubleAnimation(0, 1, Base) { EasingFunction = EaseOut() };
        root.BeginAnimation(UIElement.OpacityProperty, fade);

        if (!scale) return;
        root.RenderTransformOrigin = new Point(0.5, 0.5);
        var st = new ScaleTransform(0.96, 0.96);
        root.RenderTransform = st;
        var grow = new DoubleAnimation(0.96, 1, Emphasis) { EasingFunction = Spring() };
        grow.Completed += (_, _) =>
        {
            st.BeginAnimation(ScaleTransform.ScaleXProperty, null);
            st.BeginAnimation(ScaleTransform.ScaleYProperty, null);
            root.RenderTransform = null;
        };
        st.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
        st.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
    }

    /// <summary>元素淡入 + 从偏移位置弹性滑回原位(新任务出现、面板内容进场).</summary>
    public static void FadeSlideIn(FrameworkElement el, double dx = 0, double dy = 0)
    {
        if (!Enabled) { el.Opacity = 1; return; }

        var fade = new DoubleAnimation(0, 1, Base) { EasingFunction = EaseOut() };
        el.BeginAnimation(UIElement.OpacityProperty, fade);

        if (dx == 0 && dy == 0) return;
        var tt = new TranslateTransform(dx, dy);
        el.RenderTransform = tt;
        var done = 0;
        void Release(object? s, EventArgs e)
        {
            if (++done < ((dx != 0 ? 1 : 0) + (dy != 0 ? 1 : 0))) return;
            tt.BeginAnimation(TranslateTransform.XProperty, null);
            tt.BeginAnimation(TranslateTransform.YProperty, null);
            el.RenderTransform = null;
        }
        if (dx != 0)
        {
            var ax = new DoubleAnimation(dx, 0, Emphasis) { EasingFunction = Spring() };
            ax.Completed += Release;
            tt.BeginAnimation(TranslateTransform.XProperty, ax);
        }
        if (dy != 0)
        {
            var ay = new DoubleAnimation(dy, 0, Emphasis) { EasingFunction = Spring() };
            ay.Completed += Release;
            tt.BeginAnimation(TranslateTransform.YProperty, ay);
        }
    }

    /// <summary>窗口整体淡入(托盘恢复主窗口).结束后释放动画并固定 Opacity=1,不影响后续贴边动画.</summary>
    public static void WindowFadeIn(Window w)
    {
        if (!Enabled) { w.Opacity = 1; return; }
        var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(180)) { EasingFunction = EaseOut() };
        fade.Completed += (_, _) =>
        {
            w.BeginAnimation(UIElement.OpacityProperty, null);
            w.Opacity = 1;
        };
        w.BeginAnimation(UIElement.OpacityProperty, fade);
    }

    // ---------- 附加属性 Anim.Intro:窗口加 inf:Anim.Intro="True" 即获得进场动画 ----------

    public static readonly DependencyProperty IntroProperty = DependencyProperty.RegisterAttached(
        "Intro", typeof(bool), typeof(Anim), new PropertyMetadata(false, OnIntroChanged));

    public static bool GetIntro(DependencyObject obj) => (bool)obj.GetValue(IntroProperty);
    public static void SetIntro(DependencyObject obj, bool value) => obj.SetValue(IntroProperty, value);

    private static void OnIntroChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not Window w || e.NewValue is not true) return;
        w.Loaded += (_, _) =>
        {
            if (w.Content is FrameworkElement root) IntroScaleFade(root);
        };
    }
}
