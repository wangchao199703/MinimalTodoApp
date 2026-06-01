using System;
using System.Collections.Generic;
using System.Collections.Specialized;
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
/// 日程 / 日历面板:按截止时间(DueDate)展示待办，支持天 / 周 / 月三种视图(默认周).
/// 待办以"按优先级着色的矩形块"呈现(绿/黄/红，与列表一致);单击弹出任务编辑框(查看 + 编辑).
/// 内嵌于主窗口右侧，可由分隔条调整宽度.
/// </summary>
public partial class CalendarView : UserControl
{
    private enum ViewMode { Day, Week, Month }

    private MainViewModel? _vm;
    private ViewMode _mode = ViewMode.Week;      // 默认周视图
    private DateTime _anchor = DateTime.Today;   // 当前展示时段的参考日期(周视图=本周, 月视图=本月)

    // 小时轴每小时的像素高度(天/周视图按时间纵向定位任务)
    private const double HourHeight = 44.0;

    // 优先级配色(与列表一致):低=绿 中=黄 高=红
    private static readonly Brush LowBrush = Frozen("#10B981");
    private static readonly Brush MidBrush = Frozen("#F59E0B");
    private static readonly Brush HighBrush = Frozen("#EF4444");

    public CalendarView()
    {
        InitializeComponent();
    }

    /// <summary>绑定 ViewModel 并订阅主列表变化(新增/完成/删除时自动刷新).</summary>
    public void Init(MainViewModel vm)
    {
        if (_vm != null)
            _vm.Items.CollectionChanged -= OnItemsChanged;
        _vm = vm;
        _vm.Items.CollectionChanged += OnItemsChanged;
    }

    private void OnItemsChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (IsVisible) Render();
    }

    /// <summary>对外刷新入口(面板展开时调用).</summary>
    public void Refresh() => Render();

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

    private void Prev_Click(object sender, RoutedEventArgs e) => Shift(-1);

    private void Next_Click(object sender, RoutedEventArgs e) => Shift(+1);

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
        if (_vm == null) return;
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

    // ===== 天视图(左侧 0–24 小时刻度轴 + 任务按时间纵向定位) =====
    private void BuildDay()
    {
        // 天视图标题:友好格式，不出现区间分隔符与 ISO 短横
        PeriodTitle.Text = DayTitle(_anchor);

        var tasks = TasksOn(_anchor);
        if (tasks.Count == 0)
        {
            CalendarHost.Children.Add(new ScrollViewer
            {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                Content = new StackPanel { Margin = new Thickness(14), Children = { EmptyHint() } }
            });
            return;
        }

        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });           // 全天/未定时
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

        // 全天/未定时(DueDate 为当天 00:00 视为未指定具体时间)放到顶部带区,避免堆在 0 点
        var untimed = tasks.Where(IsUntimed).ToList();
        if (untimed.Count > 0)
        {
            var band = BuildAllDayBand(untimed, leftPad: 50, bigChips: true);
            Grid.SetRow(band, 0);
            root.Children.Add(band);
        }

        // 时间轴 + 当天任务
        var inner = new Grid { Margin = new Thickness(0, 4, 0, 8) };
        inner.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        inner.ColumnDefinitions.Add(new ColumnDefinition());
        var gutter = BuildHourGutter();
        Grid.SetColumn(gutter, 0);
        var dayCanvas = BuildDayCanvas(_anchor, bigChips: true);
        Grid.SetColumn(dayCanvas, 1);
        inner.Children.Add(gutter);
        inner.Children.Add(dayCanvas);

        var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = inner };
        Grid.SetRow(scroll, 1);
        root.Children.Add(scroll);

        CalendarHost.Children.Add(root);
    }

    // ===== 周视图(共享左侧小时轴 + 7 列按时间纵向定位) =====
    private void BuildWeek()
    {
        var start = StartOfWeek(_anchor);
        PeriodTitle.Text = start.ToString("yyyy-MM-dd") + "  ~  " + start.AddDays(6).ToString("yyyy-MM-dd");

        var heads = WeekdayHeaders();

        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });   // 星期表头
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });   // 全天/未定时
        root.RowDefinitions.Add(new RowDefinition());                              // 小时网格(滚动)

        // 头部:列 0 为小时轴留白,列 1–7 为 7 天
        var header = NewDayColsGrid();
        for (int c = 0; c < 7; c++)
        {
            var day = start.AddDays(c);
            var hb = new Border
            {
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(1, 0, 0, 1),
                Padding = new Thickness(4, 6, 4, 6),
                Background = IsToday(day) ? Brush("SelectedItemBg") : Brushes.Transparent,
                Child = new StackPanel
                {
                    Children =
                    {
                        new TextBlock { Text = heads[c], FontSize = 11, Foreground = Brush("MutedText"),
                                        HorizontalAlignment = HorizontalAlignment.Center },
                        new TextBlock { Text = day.Day.ToString(), FontSize = 15, FontWeight = FontWeights.SemiBold,
                                        Foreground = Brush("PrimaryText"), HorizontalAlignment = HorizontalAlignment.Center }
                    }
                }
            };
            Grid.SetColumn(hb, c + 1);
            header.Children.Add(hb);
        }
        Grid.SetRow(header, 0);
        root.Children.Add(header);

        // 全天/未定时:每列一格,仅当本周存在未定时任务时显示该行
        var allDay = NewDayColsGrid();
        bool anyUntimed = false;
        for (int c = 0; c < 7; c++)
        {
            var day = start.AddDays(c);
            var u = TasksOn(day).Where(IsUntimed).ToList();
            if (u.Count > 0) anyUntimed = true;
            var sp = new StackPanel { Margin = new Thickness(2) };
            foreach (var t in u) sp.Children.Add(MakeChip(t, showTime: false, big: false));
            var b = new Border
            {
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(1, 0, 0, 1),
                Child = sp
            };
            Grid.SetColumn(b, c + 1);
            allDay.Children.Add(b);
        }
        if (anyUntimed) { Grid.SetRow(allDay, 1); root.Children.Add(allDay); }

        // 小时网格:列 0 小时轴 + 列 1–7 每天一个定时画布
        var grid = NewDayColsGrid();
        var gutter = BuildHourGutter();
        Grid.SetColumn(gutter, 0);
        grid.Children.Add(gutter);
        for (int c = 0; c < 7; c++)
        {
            var day = start.AddDays(c);
            var wrap = new Border
            {
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(1, 0, 0, 0),
                Background = IsToday(day) ? Brush("SelectedItemBg") : Brushes.Transparent,
                Child = BuildDayCanvas(day, bigChips: false)
            };
            Grid.SetColumn(wrap, c + 1);
            grid.Children.Add(wrap);
        }
        var scroll = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Content = grid };
        Grid.SetRow(scroll, 2);
        root.Children.Add(scroll);

        CalendarHost.Children.Add(root);
    }

    /// <summary>左侧 0–24 小时刻度轴(固定高度 = 24*HourHeight,与日列对齐).</summary>
    private FrameworkElement BuildHourGutter()
    {
        var canvas = new Canvas { Width = 46, Height = 24 * HourHeight };
        for (int h = 0; h < 24; h++)
        {
            var lbl = new TextBlock
            {
                Text = h.ToString("00") + ":00",
                FontSize = 10,
                Width = 40,
                TextAlignment = TextAlignment.Right,
                Foreground = Brush("MutedText")
            };
            Canvas.SetTop(lbl, h == 0 ? 0 : h * HourHeight - 7);
            Canvas.SetLeft(lbl, 0);
            canvas.Children.Add(lbl);
        }
        return canvas;
    }

    /// <summary>单日定时任务画布:24 条小时分隔线 + 任务按其时间 Canvas.Top 定位.宽度随面板自适应.</summary>
    private FrameworkElement BuildDayCanvas(DateTime day, bool bigChips)
    {
        var canvas = new Canvas { Height = 24 * HourHeight, Background = Brushes.Transparent };

        // 小时分隔线(无 Child 的 Border,用于和任务块区分)
        for (int h = 0; h < 24; h++)
        {
            var line = new Border
            {
                Height = 0,
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Opacity = 0.6
            };
            Canvas.SetTop(line, h * HourHeight);
            Canvas.SetLeft(line, 0);
            canvas.Children.Add(line);
        }

        var chips = new List<FrameworkElement>();
        foreach (var t in TasksOn(day).Where(t => !IsUntimed(t)))
        {
            double top = (t.DueDate!.Value.Hour + t.DueDate.Value.Minute / 60.0) * HourHeight;
            var chip = MakeChip(t, showTime: true, big: bigChips);
            Canvas.SetTop(chip, top + 1);
            Canvas.SetLeft(chip, 4);
            canvas.Children.Add(chip);
            chips.Add(chip);
        }

        // 宽度自适应:分隔线铺满列宽,任务块留左右内边距
        canvas.SizeChanged += (_, _) =>
        {
            double w = canvas.ActualWidth;
            foreach (var child in canvas.Children)
                if (child is Border b && b.Child == null)
                    b.Width = Math.Max(0, w);
            foreach (var chip in chips)
                chip.Width = Math.Max(0, w - 8);
        };

        return canvas;
    }

    /// <summary>全天/未定时任务带区(显示在小时轴上方).</summary>
    private FrameworkElement BuildAllDayBand(IEnumerable<TodoItem> tasks, double leftPad, bool bigChips)
    {
        var panel = new StackPanel { Margin = new Thickness(leftPad, 6, 8, 6) };
        panel.Children.Add(new TextBlock
        {
            Text = Loc.T("S.Schedule.AllDay"),
            FontSize = 10,
            Foreground = Brush("MutedText"),
            Margin = new Thickness(0, 0, 0, 2)
        });
        foreach (var t in tasks)
            panel.Children.Add(MakeChip(t, showTime: false, big: bigChips));
        return new Border
        {
            BorderBrush = Brush("Divider"),
            BorderThickness = new Thickness(0, 0, 0, 1),
            Child = panel
        };
    }

    /// <summary>构造"小时轴列(固定 46px) + 7 个等宽日列"的网格骨架(周视图头部/全天/网格共用,保证对齐).</summary>
    private static Grid NewDayColsGrid()
    {
        var g = new Grid();
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(46) });
        for (int c = 0; c < 7; c++)
            g.ColumnDefinitions.Add(new ColumnDefinition());
        return g;
    }

    /// <summary>DueDate 为当天 00:00 视为"未指定具体时间"(归入全天带区).</summary>
    private static bool IsUntimed(TodoItem t) =>
        t.DueDate.HasValue && t.DueDate.Value.TimeOfDay == TimeSpan.Zero;

    // ===== 月视图 =====
    private void BuildMonth()
    {
        PeriodTitle.Text = Loc.F("S.Fmt.YearMonth", _anchor.Year, _anchor.Month);

        for (int c = 0; c < 7; c++)
            CalendarHost.ColumnDefinitions.Add(new ColumnDefinition());
        CalendarHost.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });   // 星期表头
        for (int r = 0; r < 6; r++)
            CalendarHost.RowDefinitions.Add(new RowDefinition());                          // 6 周

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
            panel.Children.Add(MakeChip(t, showTime: true, big: false));
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

    // ===== 待办"优先级矩形色块" =====
    private FrameworkElement MakeChip(TodoItem item, bool showTime, bool big)
    {
        string text = item.Title;
        // 仅对"有具体时间"的任务显示 HH:mm 前缀;未指定时间(00:00)不显示,避免误导
        if (showTime && item.DueDate.HasValue && item.DueDate.Value.TimeOfDay != TimeSpan.Zero)
            text = item.DueDate.Value.ToString("HH:mm") + "  " + item.Title;

        var label = new TextBlock
        {
            Text = text,
            FontSize = big ? 13 : 11,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Foreground = Brushes.White,
            TextDecorations = item.IsCompleted ? TextDecorations.Strikethrough : null
        };

        var chip = new Border
        {
            CornerRadius = new CornerRadius(4),
            Background = PriorityBrush(item.Priority),
            Padding = new Thickness(6, big ? 5 : 2, 6, big ? 5 : 2),
            Margin = new Thickness(0, 1, 0, 1),
            Cursor = Cursors.Hand,
            Opacity = item.IsCompleted ? 0.5 : 1.0,   // 已完成弱化
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
        if (_vm == null) return;
        var dlg = new TaskEditDialog(item) { Owner = Window.GetWindow(this) };
        if (dlg.ShowDialog() == true)
            _vm.ApplyTaskEdits(item, dlg.ResultDue, dlg.ResultPriority, dlg.ResultTitle);
        Render();   // 截止时间可能变化,刷新日历
    }

    // ===== 辅助 =====
    private List<TodoItem> TasksOn(DateTime date) =>
        _vm == null ? new List<TodoItem>()
        : _vm.DatedTasks
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

    /// <summary>天视图标题:中文"x年x月x日 周X"、英文"MMM d, yyyy (ddd)"，均无区间短横.</summary>
    private static string DayTitle(DateTime d)
    {
        if (LanguageManager.Current == LanguageManager.English)
            return d.ToString("MMM d, yyyy") + "  (" + WeekdayName(d) + ")";
        return Loc.F("S.Fmt.DayTitle", d.Year, d.Month, d.Day, WeekdayName(d));
    }

    private TextBlock EmptyHint() => new()
    {
        Text = Loc.T("S.Schedule.NoTasks"),
        Foreground = Brush("MutedText"),
        FontSize = 13,
        Margin = new Thickness(4, 8, 0, 0)
    };

    private static Brush PriorityBrush(Priority p) => p switch
    {
        Priority.High => HighBrush,
        Priority.Low => LowBrush,
        _ => MidBrush,   // Medium / None 兜底
    };

    private static Brush Frozen(string hex)
    {
        var b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        b.Freeze();
        return b;
    }

    private Brush Brush(string key) =>
        (TryFindResource(key) as Brush) ?? Brushes.Gray;
}
