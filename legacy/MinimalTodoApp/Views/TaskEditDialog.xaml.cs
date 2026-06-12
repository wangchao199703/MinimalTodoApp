using System;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Views;

/// <summary>
/// 任务编辑对话框:修改优先级 + 截止日期(精确到时/分).
/// 确认后通过 ResultDue / ResultPriority 暴露结果，DialogResult=true.
/// </summary>
public partial class TaskEditDialog : Window
{
    public DateTime? ResultDue { get; private set; }
    public Priority ResultPriority { get; private set; }
    public string ResultTitle { get; private set; } = string.Empty;

    public TaskEditDialog(TodoItem item)
    {
        InitializeComponent();

        ResultTitle = item.Title;
        TitleEdit.Text = item.Title;

        // 小时 / 分钟下拉
        for (int h = 0; h < 24; h++) HourBox.Items.Add(h.ToString("D2"));
        for (int m = 0; m < 60; m += 5) MinBox.Items.Add(m.ToString("D2"));

        // 优先级回填(无优先级选项已废弃,旧数据 None 视为 Medium)
        switch (item.Priority)
        {
            case Priority.Low: PrioLow.IsChecked = true; break;
            case Priority.High: PrioHigh.IsChecked = true; break;
            default: PrioMid.IsChecked = true; break;
        }

        // 截止日期回填
        if (item.DueDate.HasValue)
        {
            var d = item.DueDate.Value;
            EnableDue.IsChecked = true;
            DatePick.SelectedDate = d.Date;
            HourBox.SelectedItem = d.Hour.ToString("D2");
            SelectNearestMinute(d.Minute);
        }
        else
        {
            EnableDue.IsChecked = false;
            DatePick.SelectedDate = DateTime.Today;
            HourBox.SelectedIndex = 0;
            MinBox.SelectedIndex = 0;
        }
        UpdateDuePanelState();

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) { DialogResult = false; Close(); }
        };
    }

    private void SelectNearestMinute(int minute)
    {
        // 下拉是 5 分钟步进，取最近的一档
        int nearest = (int)Math.Round(minute / 5.0) * 5;
        if (nearest >= 60) nearest = 55;
        MinBox.SelectedItem = nearest.ToString("D2");
    }

    private void EnableDue_Changed(object sender, RoutedEventArgs e) => UpdateDuePanelState();

    private void UpdateDuePanelState()
    {
        bool on = EnableDue.IsChecked == true;
        DuePanel.IsEnabled = on;
        DuePanel.Opacity = on ? 1.0 : 0.45;
    }

    private Priority ReadPriority()
    {
        if (PrioHigh.IsChecked == true) return Priority.High;
        if (PrioLow.IsChecked == true) return Priority.Low;
        return Priority.Medium;   // 默认中
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        // 任务内容:留空则保留原标题
        var title = TitleEdit.Text?.Trim();
        if (!string.IsNullOrEmpty(title)) ResultTitle = title;

        ResultPriority = ReadPriority();

        if (EnableDue.IsChecked == true && DatePick.SelectedDate.HasValue)
        {
            int hour = HourBox.SelectedItem is string hs ? int.Parse(hs) : 0;
            int min = MinBox.SelectedItem is string ms ? int.Parse(ms) : 0;
            ResultDue = DatePick.SelectedDate.Value.Date.AddHours(hour).AddMinutes(min);
        }
        else
        {
            ResultDue = null;   // 未启用 = 无截止日期
        }

        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }

    /// <summary>点击空白区域(非输入控件)拖动整窗.输入框会自行处理鼠标事件,不会触发拖动.</summary>
    private void Root_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState != MouseButtonState.Pressed) return;
        try { DragMove(); } catch { /* 非拖拽场景(如双击)调用 DragMove 会抛异常,忽略 */ }
    }
}
