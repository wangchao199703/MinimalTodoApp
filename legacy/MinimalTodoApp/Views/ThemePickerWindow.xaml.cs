using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>
/// 主题选择独立窗口:非模态、可拖动、可调整大小、定位在主窗口侧边(不遮挡主程序)。
/// 单击任一色板即 <see cref="MainViewModel.SelectedTheme"/> 赋值 → 实时换肤并持久化，窗口保持打开可继续切换。
/// 自定义主题色板右键可编辑/删除;顶部分组快选栏点击直接滚动到分组。
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

    /// <summary>窗口尺寸变化时同步圆角裁剪矩形(否则缩放后裁剪框仍是初始尺寸)。</summary>
    private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (RootClip != null && RootBorder != null)
            RootClip.Rect = new Rect(0, 0, RootBorder.ActualWidth, RootBorder.ActualHeight);
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

    /// <summary>右键主题色板:任意主题可"收藏/取消收藏";自定义主题额外有"编辑/删除"。</summary>
    private void ThemeSwatch_RightClick(object sender, MouseButtonEventArgs e)
    {
        if (sender is not FrameworkElement fe || fe.Tag is not ThemeSwatchVm swatch)
            return;

        var menu = new ContextMenu { PlacementTarget = fe };

        var fav = new MenuItem
        {
            Header = Loc.T(_vm.IsFavorite(swatch.Key) ? "S.ThemeCtx.Unfavorite" : "S.ThemeCtx.Favorite")
        };
        fav.Click += (_, __) => _vm.ToggleFavorite(swatch.Key);
        menu.Items.Add(fav);

        if (swatch.IsCustom)
        {
            menu.Items.Add(new Separator());
            var edit = new MenuItem { Header = Loc.T("S.ThemeCtx.Edit") };
            edit.Click += (_, __) => EditCustom(swatch.Key);
            var del = new MenuItem { Header = Loc.T("S.ThemeCtx.Delete") };
            del.Click += (_, __) => _vm.DeleteCustomTheme(swatch.Key);
            menu.Items.Add(edit);
            menu.Items.Add(del);
        }

        menu.IsOpen = true;
        e.Handled = true;
    }

    /// <summary>打开编辑器(非模态、编辑模式),保存即更新并应用。</summary>
    private void EditCustom(string key)
    {
        var existing = _vm.GetCustomTheme(key);
        if (existing == null) return;
        var editor = new ThemeEditorDialog(existing, t => _vm.AddCustomTheme(t)) { Owner = this };
        editor.Show();
        editor.Activate();
    }

    /// <summary>分组快选栏:点击滚动到对应分组区块。</summary>
    private void GroupChip_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement fe || fe.Tag is not ThemeGroupVm group) return;
        int index = _vm.ThemeGroups.IndexOf(group);
        if (index < 0) return;

        if (GroupsItems.ItemContainerGenerator.ContainerFromIndex(index) is FrameworkElement container)
            container.BringIntoView();
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
