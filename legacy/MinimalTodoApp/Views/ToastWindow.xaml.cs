using System;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Views;

/// <summary>
/// 屏幕左下角自动出现 / 自动消失的轻提醒窗口(如周期提醒触发时使用).
/// 自带淡入 + 上滑动画 + 5 秒后自动淡出关闭，点击立即关闭.同时存在多条时纵向堆叠.
/// </summary>
public partial class ToastWindow : Window
{
    private static int _stackCount;
    private readonly DispatcherTimer _autoClose;
    private bool _closing;

    public ToastWindow(string title, string message)
    {
        InitializeComponent();
        TitleText.Text = title;
        MessageText.Text = message;

        Loaded += OnLoaded;

        _autoClose = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _autoClose.Tick += (_, _) => FadeOut();
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        var wa = NativeMethods.GetCursorScreenWorkArea();

        // 当前已有几个 toast 显示，本条堆叠在它们上方
        int slot = _stackCount;
        _stackCount++;

        Left = wa.Left + 16;
        Top  = wa.Bottom - (ActualHeight + 14) - slot * (ActualHeight + 8);

        // 淡入 + 从下向上轻微滑入
        Opacity = 0;
        var fade = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(220))
        { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
        BeginAnimation(OpacityProperty, fade);

        // 上滑用弹簧缓动(轻微过冲回弹)，与全局动画规范一致、更灵动
        var slide = new DoubleAnimation(Top + 20, Top, TimeSpan.FromMilliseconds(260))
        { EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.3 } };
        BeginAnimation(TopProperty, slide);

        _autoClose.Start();
    }

    private void Toast_Click(object sender, MouseButtonEventArgs e) => FadeOut();

    private void FadeOut()
    {
        if (_closing) return;
        _closing = true;
        _autoClose.Stop();

        var fade = new DoubleAnimation(Opacity, 0, TimeSpan.FromMilliseconds(180));
        fade.Completed += (_, _) =>
        {
            _stackCount = Math.Max(0, _stackCount - 1);
            Close();
        };
        BeginAnimation(OpacityProperty, fade);
    }
}
