using System.Windows;
using System.Windows.Input;

namespace MinimalTodoApp.Views;

/// <summary>
/// 现代化的二次确认弹窗(替代系统 MessageBox):统一主题外观 + 进场动画。
/// 用法:<c>new ConfirmDialog(title, message) { Owner = this }.ShowDialog() == true</c>。
/// </summary>
public partial class ConfirmDialog : Window
{
    public ConfirmDialog(string title, string message,
        string? confirmText = null, string? cancelText = null)
    {
        InitializeComponent();
        TitleText.Text = title;
        MessageText.Text = message;
        if (!string.IsNullOrEmpty(confirmText)) ConfirmButton.Content = confirmText;
        if (!string.IsNullOrEmpty(cancelText)) CancelButton.Content = cancelText;
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    /// <summary>点击空白区域拖动整窗.</summary>
    private void Root_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState != MouseButtonState.Pressed) return;
        try { DragMove(); } catch { /* 双击等非拖拽场景忽略 */ }
    }
}
