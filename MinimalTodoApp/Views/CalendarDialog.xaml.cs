using System;
using System.Collections.Generic;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>
/// 日程 / 日历对话框:按截止时间(DueDate)展示待办，支持天 / 周 / 月三种视图.
/// 单击某条待办弹出任务编辑框(查看 + 编辑)，编辑后即时刷新.
/// </summary>
public partial class CalendarDialog : Window
{
    private enum ViewMode { Day, Week, Month }

    private readonly MainViewModel _vm;
    private ViewMode _mode = ViewMode.Month;
    private DateTime _anchor = DateTime.Today;   // 当前展示时段的参考日期

    public CalendarDialog(MainViewModel vm)
    {
        InitializeComponent();
        _vm = vm;
        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
        Loaded += (_, _) => Render();
    }

    // ===== 标题栏拖动 / 关闭 =====
    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    // ===== 视图切换 / 导航 =====
    private void ViewTab_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        if (sender is RadioButton rb && rb.Tag is string tag && Enum.TryParse<ViewMode>(tag, out var m))
        {
            _mode = m;
            Render();
        }
    }

    private void Today_Click(object sender, RoutedEventArgs e) { _anchor = DateTime.Today; Render(); }

    private void Prev_Click(object sender, RoutedEventArgs e) { Shift(-1); }

    private void Next_Click(object sender, RoutedEventArgs e) { Shift(+1); }

    private void Shift(int dir)
    {
        _anchor = _mode switch
        {
            ViewMode.Day => _anchor.AddDays(dir),
            ViewMode.Week => _anchor.AddDays(7 * dir),
            _ => _anchor.AddMonths(dir),
        };
        Render();
    }

    // ===== 渲染入口 =====
    private void Render()
    {
        CalendarHost.Children.Clear();
        CalendarHost.RowDefinitions.Clear();
        CalendarHost.ColumnDefinitions.Clear();

        switch (_mode)
        {
            case ViewMode.Day: BuildDay(); break;
            case ViewMode.Week: BuildWeek(); break;
            default: BuildMonth(); break;
        }
    }

    // ===== 天视图 =====
    private void BuildDay()
    {
        PeriodTitle.Text = _anchor.ToString("yyyy-MM-dd") + "  " + WeekdayName(_anchor);

        var list = new StackPanel { Margin = new Thickness(14) };
        var tasks = TasksOn(_anchor);
        if (tasks.Count == 0)
            list.Children.Add(EmptyHint());
        else
            foreach (var t in tasks)
                list.Children.Add(MakeChip(t, showTime: true, big: true));

        CalendarHost.Children.Add(new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Content = list
        });
    }

    // ===== 周视图 =====
    private void BuildWeek()
    {
        var start = StartOfWeek(_anchor);
        PeriodTitle.Text = start.ToString("yyyy-MM-dd") + "  ~  " + start.AddDays(6).ToString("yyyy-MM-dd");

        for (int c = 0; c < 7; c++)
            CalendarHost.ColumnDefinitions.Add(new ColumnDefinition());

        var heads = WeekdayHeaders();
        for (int c = 0; c < 7; c++)
        {
            var day = start.AddDays(c);
            var col = new DockPanel { LastChildFill = true };

            var header = new Border
            {
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(c == 0 ? 0 : 1, 0, 0, 1),
                Padding = new Thickness(6, 6, 6, 6),
                Background = IsToday(day) ? Brush("SelectedItemBg") : Brushes.Transparent
            };
            header.Child = new StackPanel
            {
                Children =
                {
                    new TextBlock { Text = heads[c], FontSize = 11, Foreground = Brush("MutedText") },
                    new TextBlock { Text = day.Day.ToString(), FontSize = 15, FontWeight = FontWeights.SemiBold,
                                    Foreground = Brush("PrimaryText") }
                }
            };
            DockPanel.SetDock(header, Dock.Top);

            var list = new StackPanel { Margin = new Thickness(4) };
            foreach (var t in TasksOn(day))
                list.Children.Add(MakeChip(t, showTime: true, big: false));

            var body = new Border
            {
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(c == 0 ? 0 : 1, 0, 0, 0),
                Child = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = list }
            };

            col.Children.Add(header);
            col.Children.Add(body);

            Grid.SetColumn(col, c);
            CalendarHost.Children.Add(col);
        }
    }

    // ===== 月视图 =====
    private void BuildMonth()
    {
        PeriodTitle.Text = Loc.F("S.Fmt.YearMonth", _anchor.Year, _anchor.Month);

        for (int c = 0; c < 7; c++)
            CalendarHost.ColumnDefinitions.Add(new ColumnDefinition());
        CalendarHost.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });   // 星期表头
        for (int r = 0; r < 6; r++)
            CalendarHost.RowDefinitions.Add(new RowDefinition());                          // 6 周

        // 星期表头
        var heads = WeekdayHeaders();
        for (int c = 0; c < 7; c++)
        {
            var head = new Border
            {
                Padding = new Thickness(0, 6, 0, 6),
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(0, 0, 0, 1),
                Child = new TextBlock
                {
                    Text = heads[c], FontSize = 12, HorizontalAlignment = HorizontalAlignment.Center,
                    Foreground = Brush("MutedText")
                }
            };
            Grid.SetRow(head, 0);
            Grid.SetColumn(head, c);
            CalendarHost.Children.Add(head);
        }

        var first = new DateTime(_anchor.Year, _anchor.Month, 1);
        var gridStart = StartOfWeek(first);
        for (int i = 0; i < 42; i++)
        {
            var day = gridStart.AddDays(i);
            int row = i / 7 + 1;
            int col = i % 7;
            CalendarHost.Children.Add(MakeMonthCell(day, row, col));
        }
    }

    private UIElement MakeMonthCell(DateTime day, int row, int col)
    {
        bool inMonth = day.Month == _anchor.Month;

        var panel = new StackPanel();
        panel.Children.Add(new TextBlock
        {
            Text = day.Day.ToString(),
            FontSize = 12,
            FontWeight = IsToday(day) ? FontWeights.Bold : FontWeights.Normal,
            Foreground = IsToday(day) ? Brush("Accent")
                         : (inMonth ? Brush("PrimaryText") : Brush("MutedText")),
            Margin = new Thickness(2, 0, 0, 2)
        });

        var tasks = TasksOn(day);
        const int maxShown = 3;
        foreach (var t in tasks.Take(maxShown))
            panel.Children.Add(MakeChip(t, showTime: false, big: false));
        if (tasks.Count > maxShown)
            panel.Children.Add(new TextBlock
            {
                Text = Loc.F("S.Fmt.MoreCount", tasks.Count - maxShown),
                FontSize = 10, Foreground = Brush("MutedText"), Margin = new Thickness(4, 1, 0, 0)
            });

        var cell = new Border
        {
            BorderBrush = Brush("Divider"),
            BorderThickness = new Thickness(col == 0 ? 0 : 1, 0, 0, 1),
            Padding = new Thickness(3),
            Background = IsToday(day) ? Brush("SelectedItemBg") : Brushes.Transparent,
            Child = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Hidden, Content = panel }
        };
        Grid.SetRow(cell, row);
        Grid.SetColumn(cell, col);
        return cell;
    }

    // ===== 待办"胶囊" =====
    private FrameworkElement MakeChip(TodoItem item, bool showTime, bool big)
    {
        string text = item.Title;
        if (showTime && item.DueDate.HasValue)
            text = item.DueDate.Value.ToString("HH:mm") + "  " + item.Title;

        var label = new TextBlock
        {
            Text = text,
            FontSize = big ? 13 : 11,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Foreground = DueBrush(item),
            TextDecorations = item.IsCompleted ? TextDecorations.Strikethrough : null
        };

        var chip = new Border
        {
            CornerRadius = new CornerRadius(4),
            Background = Brush("CardBg"),
            Padding = new Thickness(6, big ? 5 : 2, 6, big ? 5 : 2),
            Margin = new Thickness(0, 1, 0, 1),
            Cursor = Cursors.Hand,
            ToolTip = item.Title,
            Tag = item,
            Child = label
        };
        chip.MouseLeftButtonUp += Chip_Click;
        return chip;
    }

    private void Chip_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.Tag is TodoItem item)
            OpenEdit(item);
    }

    private void OpenEdit(TodoItem item)
    {
        var dlg = new TaskEditDialog(item) { Owner = this };
        if (dlg.ShowDialog() == true)
            _vm.ApplyTaskEdits(item, dlg.ResultDue, dlg.ResultPriority, dlg.ResultTitle);
        Render();   // 截止时间可能变化,刷新日历
    }

    // ===== 辅助 =====
    private List<TodoItem> TasksOn(DateTime date) =>
        _vm.DatedTasks
           .Where(t => t.DueDate!.Value.Date == date.Date)
           .OrderBy(t => t.DueDate!.Value)
           .ToList();

    private static DateTime StartOfWeek(DateTime date)
    {
        int diff = ((int)date.DayOfWeek + 6) % 7;   // 周一为一周起点
        return date.Date.AddDays(-diff);
    }

    private static bool IsToday(DateTime d) => d.Date == DateTime.Today;

    private static string[] WeekdayHeaders()
    {
        var raw = Loc.T("S.Schedule.WeekdayHeaders");
        var parts = raw.Split(',');
        return parts.Length == 7 ? parts : new[] { "1", "2", "3", "4", "5", "6", "7" };
    }

    private static string WeekdayName(DateTime d)
    {
        int idx = ((int)d.DayOfWeek + 6) % 7;
        return WeekdayHeaders()[idx];
    }

    private TextBlock EmptyHint() => new()
    {
        Text = Loc.T("S.Schedule.NoTasks"),
        Foreground = Brush("MutedText"),
        FontSize = 13,
        Margin = new Thickness(4, 8, 0, 0)
    };

    private Brush DueBrush(TodoItem item)
    {
        if (item.IsCompleted) return Brush("MutedText");
        return item.DueState switch
        {
            DueState.Overdue => Brush("OverdueText"),
            DueState.Today => Brush("WarningText"),
            DueState.Soon => Brush("Accent"),
            _ => Brush("PrimaryText"),
        };
    }

    private Brush Brush(string key) =>
        (TryFindResource(key) as Brush) ?? Brushes.Gray;
}
