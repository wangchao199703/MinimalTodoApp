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
using GongDD = GongSolutions.Wpf.DragDrop.DragDrop;   // gong 拖放附加属性(区别于 System.Windows.DragDrop)

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

    // 优先级配色(与列表一致):低=绿 中=黄 高=红
    private static readonly Brush LowBrush = Frozen("#10B981");
    private static readonly Brush MidBrush = Frozen("#F59E0B");
    private static readonly Brush HighBrush = Frozen("#EF4444");

    // 节假日(放假日)柔和高亮底色,与"今天"(SelectedItemBg)区分;暖橙色低透明,深浅主题均可读
    private static readonly Brush HolidayBg = Frozen("#22F59E0B");
    private static readonly Brush HolidayText = Frozen("#D9820B");

    public CalendarView()
    {
        InitializeComponent();

        // 日历以"代码快照画刷"渲染(非 DynamicResource)，切主题不会自动更新颜色，
        // 故订阅主题变更事件、可见时重渲染，避免沿用上一个主题的文字画刷导致暗对暗看不清。
        ThemeManager.ThemeChanged += OnThemeChanged;
        Unloaded += (_, __) => ThemeManager.ThemeChanged -= OnThemeChanged;
    }

    private void OnThemeChanged()
    {
        if (IsVisible) Render();
    }

    /// <summary>绑定 ViewModel 并订阅主列表变化(新增/完成/删除时自动刷新)与节假日数据就绪.</summary>
    public void Init(MainViewModel vm)
    {
        if (_vm != null)
        {
            _vm.Items.CollectionChanged -= OnItemsChanged;
            _vm.HolidaysVisibilityChanged -= OnHolidaysChanged;
        }
        _vm = vm;
        _vm.Items.CollectionChanged += OnItemsChanged;
        _vm.HolidaysVisibilityChanged += OnHolidaysChanged;
    }

    private void OnHolidaysChanged()
    {
        // 节假日数据联网就绪 / 开关切换:回到 UI 线程重渲染(异常不外抛,避免拖垮应用)
        if (IsVisible) Dispatcher.BeginInvoke(new Action(() => { try { Render(); } catch { } }));
    }

    private void OnItemsChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (IsVisible) Render();
    }

    /// <summary>对外刷新入口(面板展开时调用).首次展开时弹一次"拖拽设截止时间"功能提示.</summary>
    public void Refresh()
    {
        Render();
        ShowDragHintOnce();
    }

    /// <summary>首次打开日历时,提示用户可把任务拖到日历设置截止时间(仅提示一次).</summary>
    private void ShowDragHintOnce()
    {
        if (_vm == null || _vm.CalendarDragHintShown) return;
        _vm.CalendarDragHintShown = true;   // 置位并持久化,之后不再提示
        // 延后到面板布局完成后再弹,避免打断展开动画
        Dispatcher.BeginInvoke(new Action(() =>
        {
            MessageBox.Show(
                Loc.T("S.Schedule.DragHint.Body"),
                Loc.T("S.Schedule.DragHint.Title"),
                MessageBoxButton.OK,
                MessageBoxImage.Information);
        }), System.Windows.Threading.DispatcherPriority.Background);
    }

    // ===== 视图切换 / 导航 =====
    // 仅用户主动导航时播放过渡动画(自动重渲染如待办变化/节假日就绪不闪动画)
    private void ViewTab_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        if (sender is RadioButton rb && rb.Tag is string tag && Enum.TryParse<ViewMode>(tag, out var m))
        {
            _mode = m;
            Render();
            Anim.IntroScaleFade(CalendarHost);            // 切视图:与设置弹窗同款缩放+淡入
        }
    }

    private void Today_Click(object sender, RoutedEventArgs e)
    {
        _anchor = DateTime.Today;
        Render();
        Anim.IntroScaleFade(CalendarHost);
    }

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
        Anim.FadeSlideIn(CalendarHost, dx: 24 * dir);     // 翻页:内容沿翻页方向弹性滑入
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

    // ===== 天视图(左侧 0–24 小时刻度轴 + 任务按时间纵向定位；高度自适应,一屏展示 24 小时) =====
    private void BuildDay()
    {
        // 天视图标题:友好格式，不出现区间分隔符与 ISO 短横;放假日附节日名称
        string? dayHoliday = HolidayName(_anchor);
        PeriodTitle.Text = dayHoliday != null ? DayTitle(_anchor) + "  ·  " + dayHoliday : DayTitle(_anchor);

        var tasks = TasksOn(_anchor);
        // 注意:即使当天没有待办,也始终显示 0–24 小时时间轴 + 可拖放画布,
        // 以便从左侧把待办拖到对应时间设置截止时间(空状态此前直接返回、无法拖放).

        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });   // 全天/未定时
        root.RowDefinitions.Add(new RowDefinition());                              // 24 小时网格(填满可视高度)

        // 全天/未定时(DueDate 为当天 00:00 视为未指定具体时间)放到顶部带区,避免堆在 0 点
        var untimed = tasks.Where(IsUntimed).ToList();
        if (untimed.Count > 0)
        {
            var band = BuildAllDayBand(untimed, leftPad: 50, bigChips: true);
            Grid.SetRow(band, 0);
            root.Children.Add(band);
        }

        // 时间轴 + 当天任务:不滚动,网格填满剩余高度(每小时像素 = 高度/24)
        var inner = new Grid { Margin = new Thickness(0, 4, 0, 8), ClipToBounds = true };
        inner.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        inner.ColumnDefinitions.Add(new ColumnDefinition());
        var gutter = BuildHourGutter();
        Grid.SetColumn(gutter, 0);
        var dayCanvas = BuildDayCanvas(_anchor, bigChips: true);
        Grid.SetColumn(dayCanvas, 1);
        inner.Children.Add(gutter);
        inner.Children.Add(dayCanvas);

        // 空状态:在时间轴上叠一行淡提示(不挡拖放,IsHitTestVisible=false)
        if (tasks.Count == 0)
        {
            var hint = new TextBlock
            {
                Text = Loc.T("S.Schedule.DragToSetTime"),
                Foreground = Brush("MutedText"),
                FontSize = 12,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(8, 10, 8, 0),
                TextWrapping = TextWrapping.Wrap,
                TextAlignment = TextAlignment.Center,
                IsHitTestVisible = false
            };
            Grid.SetColumn(hint, 1);
            inner.Children.Add(hint);
        }

        Grid.SetRow(inner, 1);
        root.Children.Add(inner);

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
            string? holiday = HolidayName(day);
            var headStack = new StackPanel();
            headStack.Children.Add(new TextBlock
            {
                Text = heads[c], FontSize = 11, Foreground = Brush("SecondaryText"),
                HorizontalAlignment = HorizontalAlignment.Center
            });
            headStack.Children.Add(new TextBlock
            {
                Text = day.Day.ToString(), FontSize = 15, FontWeight = FontWeights.SemiBold,
                Foreground = Brush("PrimaryText"), HorizontalAlignment = HorizontalAlignment.Center
            });
            if (holiday != null)
                headStack.Children.Add(new TextBlock
                {
                    Text = holiday, FontSize = 9, Foreground = HolidayText,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 60
                });
            var hb = new Border
            {
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(1, 0, 0, 1),
                Padding = new Thickness(4, 6, 4, 6),
                Background = IsToday(day) ? Brush("SelectedItemBg")
                             : (IsRestDay(day) ? HolidayBg : Brushes.Transparent),
                Child = headStack
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

        // 小时网格:列 0 小时轴 + 列 1–7 每天一个定时画布;不滚动,填满剩余高度(一屏 24 小时)
        var grid = NewDayColsGrid();
        grid.ClipToBounds = true;
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
                Background = IsToday(day) ? Brush("SelectedItemBg")
                             : (IsRestDay(day) ? HolidayBg : Brushes.Transparent),
                Child = BuildDayCanvas(day, bigChips: false)
            };
            Grid.SetColumn(wrap, c + 1);
            grid.Children.Add(wrap);
        }
        Grid.SetRow(grid, 2);
        root.Children.Add(grid);

        CalendarHost.Children.Add(root);
    }

    /// <summary>左侧 0–24 小时刻度轴(高度自适应:标签按 小时/24 × 可视高度 定位,与日列对齐).</summary>
    private FrameworkElement BuildHourGutter()
    {
        var canvas = new Canvas { Width = 46 };
        var labels = new List<TextBlock>();
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
            Canvas.SetLeft(lbl, 0);
            canvas.Children.Add(lbl);
            labels.Add(lbl);
        }
        // 高度自适应:每小时像素 = ActualHeight/24,标签随之重新纵向定位
        canvas.SizeChanged += (_, _) =>
        {
            double h = canvas.ActualHeight;
            for (int i = 0; i < 24; i++)
                Canvas.SetTop(labels[i], i == 0 ? 0 : i * h / 24.0 - 7);
        };
        return canvas;
    }

    /// <summary>单日定时任务画布:24 条小时分隔线 + 任务按其时间定位.宽度与高度均随面板自适应(一屏 24 小时).</summary>
    private FrameworkElement BuildDayCanvas(DateTime day, bool bigChips)
    {
        var canvas = new Canvas { Background = Brushes.Transparent };

        // 小时分隔线(无 Child 的 Border,用于和任务块区分)
        var lines = new List<Border>();
        for (int h = 0; h < 24; h++)
        {
            var line = new Border
            {
                Height = 0,
                BorderBrush = Brush("Divider"),
                BorderThickness = new Thickness(0, 1, 0, 0),
                Opacity = 0.6
            };
            Canvas.SetLeft(line, 0);
            canvas.Children.Add(line);
            lines.Add(line);
        }

        // 任务块:记录其"小时比例"(0..1),布局时按比例 × 可视高度定位
        var chips = new List<(FrameworkElement chip, double frac)>();
        foreach (var t in TasksOn(day).Where(t => !IsUntimed(t)))
        {
            double frac = (t.DueDate!.Value.Hour + t.DueDate.Value.Minute / 60.0) / 24.0;
            var chip = MakeChip(t, showTime: true, big: bigChips);
            canvas.Children.Add(chip);
            chips.Add((chip, frac));
        }

        // 宽/高自适应:分隔线铺满列宽并按小时均分高度;同时段多任务并排分列,避免重叠
        double rowH = bigChips ? 28 : 22;   // 任务块估算行高(含上下内边距),作碰撞阈值
        canvas.SizeChanged += (_, _) =>
        {
            double w = canvas.ActualWidth, h = canvas.ActualHeight;
            for (int i = 0; i < 24; i++)
            {
                lines[i].Width = Math.Max(0, w);
                Canvas.SetTop(lines[i], i * h / 24.0);
            }
            LayoutColumns(chips, w, h, rowH);
        };

        // 拖拽落点:把任务拖到该列即按落点小时设置截止时间(取整点)
        if (_vm != null)
        {
            GongDD.SetIsDropTarget(canvas, true);
            GongDD.SetDropHandler(canvas, CalendarDropHandler.ForTimed(_vm, day, Render));
        }

        return canvas;
    }

    /// <summary>
    /// 同列内的"同时段任务并排"布局:按纵向像素位置将相互重叠(行高阈值内)的任务归为一簇，
    /// 簇内平分列宽并排显示,互不遮挡;不重叠的任务各自占满整列宽度.
    /// </summary>
    private static void LayoutColumns(List<(FrameworkElement chip, double frac)> chips, double w, double h, double rowH)
    {
        if (chips.Count == 0) return;
        double avail = Math.Max(0, w - 8);
        var ordered = chips.OrderBy(c => c.frac).ToList();
        var tops = ordered.Select(c => c.frac * h + 1).ToList();

        int i = 0;
        while (i < ordered.Count)
        {
            int j = i + 1;
            double clusterMaxTop = tops[i];
            while (j < ordered.Count && tops[j] - clusterMaxTop < rowH)   // 与簇内最低块仍重叠 → 并入同簇
            {
                clusterMaxTop = Math.Max(clusterMaxTop, tops[j]);
                j++;
            }
            int n = j - i;                       // 该簇任务数 = 列数
            double colW = avail / n;
            for (int k = i; k < j; k++)
            {
                var (chip, _) = ordered[k];
                chip.Width = Math.Max(0, colW - 2);
                Canvas.SetLeft(chip, 4 + (k - i) * colW);
                Canvas.SetTop(chip, tops[k]);
            }
            i = j;
        }
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

        // 只显示覆盖当月所需的周数(4~6 周)：首周可含上月尾、末周可含下月头，但不再固定 6 周、
        // 不出现"整周都是下月"的多余行。
        var first = new DateTime(_anchor.Year, _anchor.Month, 1);
        var gridStart = StartOfWeek(first);
        int offset = (first - gridStart).Days;                       // 当月 1 号距本周起点(周一)的天数
        int daysInMonth = DateTime.DaysInMonth(_anchor.Year, _anchor.Month);
        int weeks = (int)Math.Ceiling((offset + daysInMonth) / 7.0); // 覆盖当月所需周数

        for (int c = 0; c < 7; c++)
            CalendarHost.ColumnDefinitions.Add(new ColumnDefinition());
        CalendarHost.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });   // 星期表头
        for (int r = 0; r < weeks; r++)
            CalendarHost.RowDefinitions.Add(new RowDefinition());

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
                    Foreground = Brush("SecondaryText")
                }
            };
            Grid.SetRow(head, 0);
            Grid.SetColumn(head, c);
            CalendarHost.Children.Add(head);
        }

        for (int i = 0; i < weeks * 7; i++)
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
        string? holiday = HolidayName(day);

        var panel = new StackPanel();

        // 日期行:日号 + (有则)节日名称
        var header = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(2, 0, 0, 2) };
        header.Children.Add(new TextBlock
        {
            Text = day.Day.ToString(),
            FontSize = 12,
            FontWeight = IsToday(day) ? FontWeights.Bold : FontWeights.Normal,
            Foreground = IsToday(day) ? Brush("Accent")
                         : (inMonth ? Brush("PrimaryText") : Brush("MutedText")),
        });
        if (holiday != null)
            header.Children.Add(new TextBlock
            {
                Text = holiday,
                FontSize = 10,
                Foreground = HolidayText,
                Margin = new Thickness(4, 1, 0, 0),
                TextTrimming = TextTrimming.CharacterEllipsis,
                VerticalAlignment = VerticalAlignment.Center
            });
        panel.Children.Add(header);

        // 任务:横向并排紧凑方块,自动换行(避免此前纵向堆叠后相互"重叠"的观感)
        var tasks = TasksOn(day);
        const int maxShown = 6;
        var wrap = new WrapPanel { Margin = new Thickness(1, 0, 0, 0) };
        foreach (var t in tasks.Take(maxShown))
            wrap.Children.Add(MakeMiniChip(t));
        if (tasks.Count > maxShown)
            wrap.Children.Add(new TextBlock
            {
                Text = Loc.F("S.Fmt.MoreCount", tasks.Count - maxShown),
                FontSize = 10, Foreground = Brush("MutedText"),
                Margin = new Thickness(2, 1, 0, 0), VerticalAlignment = VerticalAlignment.Center
            });
        panel.Children.Add(wrap);

        // 底色:今天优先,其次休息日(周末/节假日)柔和高亮(含非本月日期,保持周末列连续)
        Brush bg = IsToday(day) ? Brush("SelectedItemBg")
                   : (IsRestDay(day) ? HolidayBg : Brushes.Transparent);

        var cell = new Border
        {
            BorderBrush = Brush("Divider"),
            BorderThickness = new Thickness(col == 0 ? 0 : 1, 0, 0, 1),
            Padding = new Thickness(3),
            Background = bg,
            Child = new ScrollViewer { VerticalScrollBarVisibility = ScrollBarVisibility.Hidden, Content = panel }
        };
        // 拖拽落点:月视图固定落到当天 18:00
        if (_vm != null)
        {
            GongDD.SetIsDropTarget(cell, true);
            GongDD.SetDropHandler(cell, CalendarDropHandler.ForFixedHour(_vm, day, 18, Render));
        }
        Grid.SetRow(cell, row);
        Grid.SetColumn(cell, col);
        return cell;
    }

    /// <summary>月视图紧凑任务块:小号色块 + 截断标题,WrapPanel 中横向并排、自动换行.</summary>
    private FrameworkElement MakeMiniChip(TodoItem item)
    {
        var label = new TextBlock
        {
            Text = item.Title,
            FontSize = 10,
            MaxWidth = 64,
            Foreground = Brushes.White,
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextDecorations = item.IsCompleted ? TextDecorations.Strikethrough : null
        };
        var chip = new Border
        {
            CornerRadius = new CornerRadius(3),
            Background = PriorityBrush(item.Priority),
            Padding = new Thickness(4, 1, 4, 1),
            Margin = new Thickness(0, 0, 2, 2),
            Cursor = Cursors.Hand,
            Opacity = item.IsCompleted ? 0.5 : 1.0,
            ToolTip = item.Title,
            Tag = item,
            Child = label
        };
        chip.MouseLeftButtonUp += Chip_Click;
        return chip;
    }

    /// <summary>当 ShowHolidays 开启且该日为法定放假日时,返回节日名称;否则 null.</summary>
    private string? HolidayName(DateTime d)
    {
        if (_vm == null || !_vm.ShowHolidays) return null;
        return _vm.Holidays.TryGetValue(d.Date, out var name) ? name : null;
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

    /// <summary>周六/周日.</summary>
    private static bool IsWeekend(DateTime d) =>
        d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday;

    /// <summary>休息日:周末或法定放假日(与节假日一样高亮).</summary>
    private bool IsRestDay(DateTime d) => IsWeekend(d) || HolidayName(d) != null;

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
