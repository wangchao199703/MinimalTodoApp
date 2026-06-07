using System;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>
/// 主题选择独立窗口:非模态、可拖动、定位在主窗口侧边(不遮挡主程序)。
/// 单击任一色板即 <see cref="MainViewModel.SelectedTheme"/> 赋值 → 实时换肤并持久化，窗口保持打开可继续切换。
/// </summary>
public partial class ThemePickerWindow : Window
{
    private readonly MainViewModel _vm;

    public ThemePickerWindow(MainViewModel vm, Window owner)
    {
        InitializeComponent();
        _vm = vm;
        DataContext = vm;
        Owner = owner;

        Loaded += (_, __) => PositionBesideOwner(owner);
        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
    }

    /// <summary>把窗口摆在主窗口右侧;右侧空间不足则放左侧。垂直与主窗口顶部对齐并夹在工作区内。</summary>
    private void PositionBesideOwner(Window owner)
    {
        const double gap = 8;
        var wa = SystemParameters.WorkArea;

        double left = owner.Left + owner.ActualWidth + gap;
        if (left + Width > wa.Right)                       // 右侧放不下 → 放左侧
            left = owner.Left - Width - gap;
        if (left < wa.Left) left = wa.Left + gap;          // 仍越界 → 贴工作区左
        if (left + Width > wa.Right) left = wa.Right - Width - gap;

        double top = owner.Top;
        if (top + Height > wa.Bottom) top = wa.Bottom - Height;
        if (top < wa.Top) top = wa.Top;

        Left = left;
        Top = top;
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            try { DragMove(); } catch { /* 拖动期间窗口状态突变,忽略 */ }
        }
    }

    /// <summary>单击色板:立即应用并持久化(实时预览)。</summary>
    private void ThemeSwatch_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.Tag is ThemeSwatchVm swatch)
        {
            var info = _vm.Themes.FirstOrDefault(t => t.Key == swatch.Key) ?? swatch.Info;
            _vm.SelectedTheme = info;
        }
    }

    /// <summary>新建自定义主题:非模态打开编辑器，保存后回调注册并应用。</summary>
    private void AddCustomTheme_Click(object sender, RoutedEventArgs e)
    {
        var editor = new ThemeEditorDialog(theme => _vm.AddCustomTheme(theme)) { Owner = this };
        editor.Show();
        editor.Activate();
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
