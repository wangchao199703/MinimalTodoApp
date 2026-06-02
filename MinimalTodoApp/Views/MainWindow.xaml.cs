using System;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using Microsoft.Win32;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

public partial class MainWindow : Window
{
    private bool _allowClose;
    private MainViewModel? Vm => DataContext as MainViewModel;

    private readonly Random _fxRng = new();

    /// <summary>庆祝动画总时长(毫秒):任务“滑出 + 收起”与烟花特效共用，保证两者节奏一致.</summary>
    private const double CelebrateMs = 1100;

    /// <summary>烟花粒子配色(明快喜庆).</summary>
    private static readonly Color[] FxColors =
    {
        Color.FromRgb(0xFF, 0x4D, 0x4D), // 红
        Color.FromRgb(0xFF, 0xC1, 0x07), // 金黄
        Color.FromRgb(0x4D, 0xA6, 0xFF), // 蓝
        Color.FromRgb(0x5C, 0xEB, 0x8A), // 绿
        Color.FromRgb(0xC9, 0x7B, 0xFF), // 紫
        Color.FromRgb(0xFF, 0x8A, 0x3D), // 橙
    };

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        SizeChanged += (_, _) => UpdateClip();
        StateChanged += (_, _) => { UpdateClip(); UpdateRoundedForState(); };
        DataContextChanged += (_, _) => HookViewModel();

        // 拖动分隔条结束后立即记录侧边栏宽度，下次展开沿用该宽度(handledEventsToo=true 以捕获已被 GridSplitter 处理的事件)
        SidebarSplitter.AddHandler(
            System.Windows.Controls.Primitives.Thumb.DragCompletedEvent,
            new System.Windows.Controls.Primitives.DragCompletedEventHandler((_, _) => SyncSidebarWidthBack()),
            true);

        // 输入栏分隔条:用户上下拖动调整输入栏高度，松开后记忆
        InputBarSplitter.AddHandler(
            System.Windows.Controls.Primitives.Thumb.DragCompletedEvent,
            new System.Windows.Controls.Primitives.DragCompletedEventHandler((_, _) => SyncInputBarHeightBack()),
            true);

        // 日程分隔条:拖动调整右侧日程面板宽度，松开后记忆
        ScheduleSplitter.AddHandler(
            System.Windows.Controls.Primitives.Thumb.DragCompletedEvent,
            new System.Windows.Controls.Primitives.DragCompletedEventHandler((_, _) => SyncScheduleWidthBack()),
            true);

        // 拖拽结束兜底:任何鼠标左键释放都清除拖拽态(无论拖拽是正常放下还是被取消)，
        // 配合 VM 在拖拽期间挂起的刷新一并补刷，避免桌面残留拖拽"鬼影"。
        AddHandler(PreviewMouseLeftButtonUpEvent,
            new MouseButtonEventHandler((_, _) => { if (Vm != null) Vm.IsDragging = false; }),
            true);
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        HookViewModel();
        ApplySidebarState();
        ApplyInputBarHeight();
        UpdateClip();
        UpdateRoundedForState();
        ApplyAcrylicForTheme();
        ApplyAlwaysOnTop();
        RestoreDockOnLoad();

        // 恢复上次的日程面板展开状态(上次展开则启动也展开，窗口随之加宽)
        if (Vm != null && Vm.ScheduleOpen) OpenSchedule();

        // 禁用 Windows Aero Snap 手势，避免拖到边缘触发系统的自动最大化/分屏
        var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        NativeMethods.DisableAeroSnap(hwnd);
    }

    /// <summary>启动时若上次处于贴边状态，恢复为对应边缘的隐藏态.</summary>
    private void RestoreDockOnLoad()
    {
        if (Vm == null || Vm.DockEdge == 0) return;
        // 让窗口初始就吸到对应边并隐藏，下次鼠标到边再滑出
        Dispatcher.BeginInvoke(new Action(() =>
        {
            _dockEdge = Vm.DockEdge;
            _dockedWa = NativeMethods.GetCursorScreenWorkAreaDip(this);
            // 对齐到屏幕工作区内(避免首启窗口处于屏幕外)
            switch (_dockEdge)
            {
                case 1: Top = _dockedWa.Top; break;
                case 2: Left = _dockedWa.Left; break;
                case 3: Left = _dockedWa.Right - Width; break;
            }
            HideToEdge(animate: false);
            EnsureProbe();
        }), DispatcherPriority.Loaded);
    }

    /// <summary>把 ViewModel 的“置于顶层”状态同步到窗口 Topmost(用代码管理，避免被 ShowMainWindow 的置顶技巧破坏绑定).</summary>
    private void ApplyAlwaysOnTop()
    {
        if (Vm != null) Topmost = Vm.AlwaysOnTop;
    }

    private void HookViewModel()
    {
        if (Vm == null) return;
        Vm.PropertyChanged -= Vm_PropertyChanged;
        Vm.PropertyChanged += Vm_PropertyChanged;
        Vm.TaskCompleting -= OnTaskCompleting;
        Vm.TaskCompleting += OnTaskCompleting;
        Vm.ReminderTriggered -= OnReminderTriggered;
        Vm.ReminderTriggered += OnReminderTriggered;
    }

    /// <summary>周期提醒触发:左下角浮出 Toast 并按设置播放提示音.</summary>
    private void OnReminderTriggered(TodoItem item)
    {
        if (Vm == null) return;
        try
        {
            if (Vm.ReminderSoundEnabled) ReminderSound.Play();

            string interval = item.ReminderIntervalMinutes >= 60
                ? Loc.F("S.Fmt.IntervalHours", (item.ReminderIntervalMinutes / 60.0).ToString("0.#"))
                : Loc.F("S.Fmt.IntervalMinutes", item.ReminderIntervalMinutes);
            var msg = item.DueDate.HasValue
                ? Loc.F("S.Fmt.ReminderMsgWithDue", item.DueDetailText, interval)
                : Loc.F("S.Fmt.ReminderMsg", interval);

            new ToastWindow(Loc.F("S.Fmt.ReminderToastTitle", item.Title), msg).Show();
        }
        catch
        {
            // Toast 失败不影响主流程
        }
    }

    /// <summary>
    /// 父待办(或独立待办)被勾选完成:播放音效 + 烟花,
    /// 然后对”整族”(父 + 所有递归子待办)同时播放”向左滑出 + 淡出 + 行收起”动画;
    /// 全部动画结束后回调 VM 把整族移入”已完成”分组(下方任务随之上移).
    /// </summary>
    private void OnTaskCompleting(TodoItem item)
    {
        if (Vm == null) return;

        if (Vm.SoundEnabled) CelebrationSound.Play();
        if (Vm.EffectsEnabled) PlayFireworks();

        var family = Vm.CollectFamily(item);

        // 仅当”完成后该任务会离开当前视图”(普通分组视图)时才播放滑出动画;
        // 在“全部任务 / 已完成”视图下任务完成后仍可见,直接完成移动即可.
        bool willLeaveView = Vm.SelectedGroup != null && !Vm.SelectedGroup.IsCompletedGroup;

        var containers = new System.Collections.Generic.List<ListBoxItem>();
        if (willLeaveView && TaskList != null)
        {
            foreach (var f in family)
            {
                if (TaskList.ItemContainerGenerator.ContainerFromItem(f) is ListBoxItem c)
                    containers.Add(c);
            }
        }

        if (containers.Count == 0)
        {
            Vm.FinishFamilyCompletion(item);
            return;
        }

        int remaining = containers.Count;
        void OnOneDone()
        {
            remaining--;
            if (remaining == 0) Vm?.FinishFamilyCompletion(item);
        }
        foreach (var c in containers)
            AnimateTaskAway(c, OnOneDone);
    }

    /// <summary>
    /// 完成动画:先“向左滑出 + 淡出”，随后把该行高度收起到 0(使下方任务平滑上移).
    /// 全程总时长 <see cref="CelebrateMs"/> 与烟花保持一致；结束后复位容器并回调 onDone.
    /// </summary>
    private void AnimateTaskAway(ListBoxItem container, Action onDone)
    {
        double h = container.ActualHeight;
        double w = container.ActualWidth;
        if (h <= 0)
        {
            onDone();
            return;
        }

        container.ClipToBounds = true;
        var tt = new TranslateTransform();
        container.RenderTransform = tt;

        var ease = new CubicEase { EasingMode = EasingMode.EaseIn };

        // 阶段一:向左滑出 + 淡出(占总时长约 60%)
        double slidePart = CelebrateMs * 0.6;
        var slide = new DoubleAnimation(0, -Math.Max(w, 200), TimeSpan.FromMilliseconds(slidePart))
        {
            EasingFunction = ease,
        };
        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(slidePart))
        {
            EasingFunction = ease,
        };

        // 阶段二:行高收起(从约 50% 处开始，与滑出略重叠，到总时长结束)
        double collapseBegin = CelebrateMs * 0.5;
        double collapsePart = CelebrateMs - collapseBegin;
        var collapse = new DoubleAnimation(h, 0, TimeSpan.FromMilliseconds(collapsePart))
        {
            BeginTime = TimeSpan.FromMilliseconds(collapseBegin),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut },
        };

        collapse.Completed += (_, _) =>
        {
            // 1) 真正移除任务(容器被释放/回收，下方任务上移)
            onDone();
            // 2) 复位容器，避免被回收后影响其它任务的显示
            container.BeginAnimation(HeightProperty, null);
            container.Height = double.NaN;          // 还原为 Auto
            container.BeginAnimation(OpacityProperty, null);
            container.Opacity = 1;
            tt.BeginAnimation(TranslateTransform.XProperty, null);
            container.RenderTransform = Transform.Identity;
            container.ClipToBounds = false;
        };

        tt.BeginAnimation(TranslateTransform.XProperty, slide);
        container.BeginAnimation(OpacityProperty, fade);
        container.BeginAnimation(HeightProperty, collapse);
    }

    private void Vm_PropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(MainViewModel.SidebarCollapsed))
            ApplySidebarState();
        else if (e.PropertyName == nameof(MainViewModel.CurrentTheme))
            ApplyAcrylicForTheme();
        else if (e.PropertyName == nameof(MainViewModel.AlwaysOnTop))
            ApplyAlwaysOnTop();
    }

    /// <summary>“毛玻璃”主题时开启 Acrylic 模糊，其余主题关闭.</summary>
    private void ApplyAcrylicForTheme()
    {
        if (Vm == null) return;
        if (string.Equals(Vm.CurrentTheme, ThemeManager.Glass, StringComparison.OrdinalIgnoreCase))
            AcrylicHelper.Enable(this, 0x33222831);   // 半透明深色玻璃底
        else
            AcrylicHelper.Disable(this);
    }

    /// <summary>同步圆角裁剪区域到当前尺寸(AllowsTransparency 圆角必须手动裁剪).</summary>
    private void UpdateClip()
    {
        if (RootClip == null) return;
        RootClip.Rect = new Rect(0, 0, RootBorder.ActualWidth, RootBorder.ActualHeight);
    }

    /// <summary>最大化时取消圆角(贴满屏幕)，还原时恢复圆角.</summary>
    private void UpdateRoundedForState()
    {
        if (RootBorder == null) return;
        if (WindowState == WindowState.Maximized)
        {
            // 限制最大化尺寸为工作区，避免 AllowsTransparency+WindowChrome 下盖住任务栏
            var wa = SystemParameters.WorkArea;
            MaxHeight = wa.Height + 8;   // +8 抵消 WindowChrome 在最大化时的内缩
            MaxWidth = wa.Width + 8;

            RootBorder.CornerRadius = new CornerRadius(0);
            RootBorder.BorderThickness = new Thickness(0);
            RootClip.RadiusX = RootClip.RadiusY = 0;
        }
        else
        {
            MaxHeight = double.PositiveInfinity;
            MaxWidth = double.PositiveInfinity;

            RootBorder.CornerRadius = new CornerRadius(10);
            RootBorder.BorderThickness = new Thickness(1);
            RootClip.RadiusX = RootClip.RadiusY = 10;
        }
    }

    /// <summary>单列侧边栏:折叠=仅留窄条(保留主题/三横按钮)，展开=持久化宽度.</summary>
    private const double CollapsedRailWidth = 39;

    /// <summary>展开侧边栏的默认宽度:恰好容纳“图标 + 五个字 + 少量留白”，不浪费空间.</summary>
    private const double DefaultExpandedWidth = 113;

    private void ApplySidebarState()
    {
        if (Vm == null) return;

        if (Vm.SidebarCollapsed)
        {
            SidebarColumn.MinWidth = CollapsedRailWidth;
            SidebarColumn.Width = new GridLength(CollapsedRailWidth);
        }
        else
        {
            double w = Vm.SidebarWidth > 0 ? Vm.SidebarWidth : DefaultExpandedWidth;
            SidebarColumn.MinWidth = 82;
            SidebarColumn.Width = new GridLength(w);
        }
    }

    /// <summary>把 VM 中保存的输入栏高度应用到对应行，并在拖动调整后同步回写持久化.</summary>
    private void ApplyInputBarHeight()
    {
        if (Vm == null || InputBarRow == null) return;
        double h = Vm.InputBarHeight > 0 ? Vm.InputBarHeight : 40;
        InputBarRow.Height = new GridLength(h);
    }

    private void SyncInputBarHeightBack()
    {
        if (Vm == null || InputBarRow == null) return;
        double h = InputBarRow.ActualHeight;
        if (h > 0) Vm.InputBarHeight = h;
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        SyncSidebarWidthBack();

        // 点击“关闭”按钮(或系统调用关闭)时不退出，而是隐藏到托盘，程序常驻
        if (!_allowClose)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnClosing(e);
    }

    private void SyncSidebarWidthBack()
    {
        if (Vm == null || Vm.SidebarCollapsed) return;
        double w = SidebarColumn.ActualWidth;
        if (w > 0) Vm.SidebarWidth = w;
    }

    // ===== 标题栏拖动 / 双击最大化(整条标题栏可命中，故自行处理) =====

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
        {
            MaxRestore_Click(sender, e);
            return;
        }
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            // 若当前正贴边(无论显示与否)，先解除贴边再允许拖动
            if (_dockEdge != 0) Undock();
            try { DragMove(); } catch { /* 偶发 InvalidOperationException:拖动期间窗口状态突变 */ }
            // 拖动结束后判断是否贴近屏幕边缘，若是则自动贴边并播放隐藏动画
            TryDockAfterDrag();
        }
    }

    // ===== QQ 式贴边自动隐藏 =====

    private int _dockEdge;                    // 0 未贴边 / 1 上 / 2 左 / 3 右
    private bool _isHidden;                   // 是否处于隐藏态(只露出窄触发条)
    private Rect _dockedWa;                   // 贴附时所在屏幕的工作区(多屏场景固定参照)
    private DispatcherTimer? _edgeProbe;      // 隐藏时轮询光标位置，到边即弹出
    private bool _isDockAnimating;            // 滑入/滑出动画进行中:probe 不响应,避免动画期间反复触发
    private int _outsideTicks;                // 鼠标离开窗口的连续 tick 数(达到阈值才隐藏,防抖)
    private const int VisibleStripPx = 4;     // 隐藏后留出的可见触发条宽度(像素)
    private const int SnapThresholdPx = 14;   // 拖动到距屏幕边缘 N 像素内即视为贴边
    private const int HideBufferPx = 40;      // 显示态下"鼠标在窗口外"的判定缓冲(避免边缘抖动误触发隐藏)
    private const int OutsideTickThreshold = 5;  // 鼠标连续离开 N 个 tick(约 450ms)才执行隐藏

    private void TryDockAfterDrag()
    {
        if (Vm == null) return;
        if (WindowState != WindowState.Normal) return;

        // 工作区与窗口 Left/Top 必须同坐标系(DIP)，否则高 DPI 下右边判定会失败
        var wa = NativeMethods.GetCursorScreenWorkAreaDip(this);
        int edge = 0;
        if (Top <= wa.Top + SnapThresholdPx) edge = 1;
        else if (Left <= wa.Left + SnapThresholdPx) edge = 2;
        else if (Left + Width >= wa.Right - SnapThresholdPx) edge = 3;

        if (edge == 0) return;
        DockTo(edge);
    }

    /// <summary>把窗口贴附到指定边并播放向外隐藏动画；后续由探针定时器响应鼠标到边再弹回.</summary>
    private void DockTo(int edge)
    {
        var wa = NativeMethods.GetCursorScreenWorkAreaDip(this);
        _dockEdge = edge;
        _dockedWa = wa;

        // 贴边前先把窗口对齐到边的“完整可见”位置，避免负 Top/Left 起始动画飞跃
        switch (edge)
        {
            case 1:
                Top = wa.Top;
                if (Left < wa.Left) Left = wa.Left;
                if (Left + Width > wa.Right) Left = wa.Right - Width;
                break;
            case 2:
                Left = wa.Left;
                if (Top < wa.Top) Top = wa.Top;
                if (Top + Height > wa.Bottom) Top = wa.Bottom - Height;
                break;
            case 3:
                Left = wa.Right - Width;
                if (Top < wa.Top) Top = wa.Top;
                if (Top + Height > wa.Bottom) Top = wa.Bottom - Height;
                break;
        }
        if (Vm != null) Vm.DockEdge = edge;

        HideToEdge(animate: true);
        EnsureProbe();
    }

    /// <summary>向贴附边滑出隐藏(仅保留触发条).</summary>
    private void HideToEdge(bool animate)
    {
        var wa = _dockedWa;
        double from, to;
        DependencyProperty prop;

        switch (_dockEdge)
        {
            case 1:
                prop = TopProperty;
                from = Top;
                to = wa.Top - Height + VisibleStripPx;
                break;
            case 2:
                prop = LeftProperty;
                from = Left;
                to = wa.Left - Width + VisibleStripPx;
                break;
            case 3:
                prop = LeftProperty;
                from = Left;
                to = wa.Right - VisibleStripPx;
                break;
            default:
                return;
        }

        _isHidden = true;
        _outsideTicks = 0;
        if (!animate)
        {
            BeginAnimation(prop, null);
            if (prop == TopProperty) Top = to; else Left = to;
            return;
        }

        _isDockAnimating = true;
        var anim = new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(220))
        { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut } };
        // 动画结束后冻结到目标值，避免 Top/Left 自动 reset
        anim.Completed += (_, _) =>
        {
            BeginAnimation(prop, null);
            if (prop == TopProperty) Top = to; else Left = to;
            _isDockAnimating = false;
        };
        BeginAnimation(prop, anim);
    }

    /// <summary>从贴附边滑回完整可见.</summary>
    private void ShowFromEdge()
    {
        var wa = _dockedWa;
        double from, to;
        DependencyProperty prop;

        switch (_dockEdge)
        {
            case 1: prop = TopProperty;  from = Top;  to = wa.Top;          break;
            case 2: prop = LeftProperty; from = Left; to = wa.Left;         break;
            case 3: prop = LeftProperty; from = Left; to = wa.Right - Width; break;
            default: return;
        }

        _isHidden = false;
        _outsideTicks = 0;
        // 隐藏态被覆盖时，强制顶层一次，确保滑出后可见
        Topmost = true;
        _isDockAnimating = true;
        var anim = new DoubleAnimation(from, to, TimeSpan.FromMilliseconds(220))
        { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
        anim.Completed += (_, _) =>
        {
            BeginAnimation(prop, null);
            if (prop == TopProperty) Top = to; else Left = to;
            ApplyAlwaysOnTop();
            _isDockAnimating = false;
        };
        BeginAnimation(prop, anim);
    }

    /// <summary>解除贴边状态，让窗口回到自由位置.</summary>
    private void Undock()
    {
        if (_dockEdge == 0) return;

        BeginAnimation(TopProperty, null);
        BeginAnimation(LeftProperty, null);
        if (_isHidden)
        {
            // 解除时若处于隐藏态，先把窗口位置纠正到工作区内，避免抓不住标题栏
            var wa = _dockedWa;
            switch (_dockEdge)
            {
                case 1: Top = wa.Top; break;
                case 2: Left = wa.Left; break;
                case 3: Left = wa.Right - Width; break;
            }
        }
        _dockEdge = 0;
        _isHidden = false;
        if (Vm != null) Vm.DockEdge = 0;
        StopProbe();
        ApplyAlwaysOnTop();
    }

    private void EnsureProbe()
    {
        if (_edgeProbe != null) return;
        _edgeProbe = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(90) };
        _edgeProbe.Tick += (_, _) => EdgeProbeTick();
        _edgeProbe.Start();
    }

    private void StopProbe()
    {
        _edgeProbe?.Stop();
        _edgeProbe = null;
    }

    /// <summary>
    /// 每 ~90ms 一次的轮询:
    /// - 滑入/滑出动画期间不响应,避免动画过程中又被反向触发导致闪屏;
    /// - 隐藏态下检测”鼠标到达贴附边的触发区域”——是即滑出;
    /// - 显示态下使用”窗口命中测试 + 屏幕坐标缓冲区”双重判断鼠标是否在窗口上,
    ///   且鼠标连续离开 N 个 tick(约 450ms) 才隐藏,防止鼠标在边缘抖动来回触发.
    /// </summary>
    private void EdgeProbeTick()
    {
        if (_dockEdge == 0) { StopProbe(); return; }
        // 动画进行中:暂停判断,避免动画过程中被反向触发
        if (_isDockAnimating) return;
        // 用户活动期间(菜单/对话框/拖动)暂停探针逻辑，避免误隐藏
        if (Mouse.LeftButton == MouseButtonState.Pressed) return;

        // 必须用 DIP 坐标，跟 _dockedWa 与 Window.Left/Top 保持同一坐标系
        var pos = NativeMethods.GetCursorPointDip(this);
        var wa = _dockedWa;

        if (_isHidden)
        {
            bool trigger = false;
            switch (_dockEdge)
            {
                case 1:
                    // 上边:鼠标到达屏幕上边缘,且横向落在窗口所在区段内才触发
                    trigger = pos.Y >= wa.Top - 1 && pos.Y <= wa.Top + VisibleStripPx + 2
                              && pos.X >= Left - 2 && pos.X <= Left + Width + 2;
                    break;
                case 2:
                    // 左边:鼠标到达屏幕左边缘,且纵向落在窗口所在区段内才触发
                    trigger = pos.X >= wa.Left - 1 && pos.X <= wa.Left + VisibleStripPx + 2
                              && pos.Y >= Top - 2 && pos.Y <= Top + Height + 2;
                    break;
                case 3:
                    // 右边:鼠标到达屏幕右边缘,且纵向落在窗口所在区段内才触发
                    trigger = pos.X >= wa.Right - VisibleStripPx - 2 && pos.X <= wa.Right + 1
                              && pos.Y >= Top - 2 && pos.Y <= Top + Height + 2;
                    break;
            }
            if (trigger) ShowFromEdge();
        }
        else
        {
            // 显示态:综合 WPF 命中测试 IsMouseOver 与屏幕坐标缓冲区判断鼠标是否在窗口上.
            // 只要其中之一为真,就视为"鼠标仍在 app 上",清零防抖计数,不触发隐藏.
            bool insideByCoord = pos.X >= Left - HideBufferPx
                              && pos.X <= Left + Width + HideBufferPx
                              && pos.Y >= Top - HideBufferPx
                              && pos.Y <= Top + Height + HideBufferPx;
            bool onWindow = IsMouseOver || insideByCoord;

            if (onWindow)
            {
                _outsideTicks = 0;
                return;
            }

            // 鼠标离开:累积防抖,达到阈值才隐藏(450ms)
            _outsideTicks++;
            if (_outsideTicks >= OutsideTickThreshold)
                HideToEdge(animate: true);
        }
    }

    // ===== 标题栏按钮(Mac 交通灯) =====

    private void Minimize_Click(object sender, RoutedEventArgs e)
        => WindowState = WindowState.Minimized;

    private void MaxRestore_Click(object sender, RoutedEventArgs e)
        => WindowState = WindowState == WindowState.Maximized
            ? WindowState.Normal
            : WindowState.Maximized;

    /// <summary>“关闭”按钮:隐藏到托盘(不退出).</summary>
    private void HideToTray_Click(object sender, RoutedEventArgs e)
    {
        SyncSidebarWidthBack();
        Hide();
    }

    // ===== 托盘 =====

    private void ShowMainWindow()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
        Topmost = true;   // 强制置顶以确保窗口跳到最前
        // 还原为用户实际选择的“置于顶层”状态(而非写死 false，否则会破坏置顶功能)
        Topmost = Vm?.AlwaysOnTop ?? false;
    }

    private void TrayIcon_DoubleClick(object sender, RoutedEventArgs e) => ShowMainWindow();

    private void ShowMenuItem_Click(object sender, RoutedEventArgs e) => ShowMainWindow();

    private void ExitMenuItem_Click(object sender, RoutedEventArgs e)
    {
        _allowClose = true;
        SyncSidebarWidthBack();
        TrayIcon.Dispose();          // 释放托盘图标，避免残留
        Application.Current.Shutdown();
    }

    // ===== 主题弹出选择 =====

    private void ThemeOption_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.Tag is ThemeInfo info && Vm != null)
        {
            Vm.SelectedTheme = info;   // 触发主题应用 + 持久化
            ThemeToggle.IsChecked = false;  // 收起弹层
        }
    }

    /// <summary>新建自定义主题:打开编辑器，保存后注册并应用.</summary>
    private void AddCustomTheme_Click(object sender, RoutedEventArgs e)
    {
        ThemeToggle.IsChecked = false;
        if (Vm == null) return;

        var dlg = new ThemeEditorDialog { Owner = this };
        if (dlg.ShowDialog() == true && dlg.ResultTheme != null)
            Vm.AddCustomTheme(dlg.ResultTheme);
    }

    // ===== 设置 =====

    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        SettingsToggle.IsChecked = false;
        var dlg = new SettingsDialog(Vm) { Owner = this };
        dlg.ShowDialog();
    }

    // ===== 使用说明 =====

    private void Help_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new HelpDialog { Owner = this };
        dlg.ShowDialog();
    }

    // ===== 导入 / 导出 Markdown =====

    private void ExportMarkdown_Click(object sender, RoutedEventArgs e)
    {
        IoToggle.IsChecked = false;
        if (Vm == null) return;

        var dlg = new SaveFileDialog
        {
            Title = Loc.T("S.Dialog.ExportTitle"),
            Filter = Loc.T("S.Md.Filter"),
            FileName = Loc.F("S.Fmt.ExportFileName", DateTime.Now.ToString("yyyyMMdd-HHmm")),
            DefaultExt = ".md",
            AddExtension = true,
        };
        if (dlg.ShowDialog(this) != true) return;

        try
        {
            File.WriteAllText(dlg.FileName, Vm.BuildMarkdown(), new UTF8Encoding(false));
            new ToastWindow(Loc.T("S.Toast.ExportTitle"), Loc.F("S.Fmt.ExportSaved", dlg.FileName)).Show();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, Loc.F("S.Fmt.ExportFailed", ex.Message), Loc.T("S.AppName"),
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void ImportMarkdown_Click(object sender, RoutedEventArgs e)
    {
        IoToggle.IsChecked = false;
        if (Vm == null) return;

        var dlg = new OpenFileDialog
        {
            Title = Loc.T("S.Dialog.ImportTitle"),
            Filter = Loc.T("S.Md.ImportFilter"),
            Multiselect = false,
        };
        if (dlg.ShowDialog(this) != true) return;

        try
        {
            var text = File.ReadAllText(dlg.FileName);
            int count = Vm.ImportMarkdown(text);
            new ToastWindow(Loc.T("S.Toast.ImportTitle"), count > 0
                ? Loc.F("S.Fmt.ImportDone", count)
                : Loc.T("S.Import.NoTasks")).Show();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, Loc.F("S.Fmt.ImportFailed", ex.Message), Loc.T("S.AppName"),
                MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ===== 任务列表:Tab / Shift+Tab 调整缩进，表达子待办 =====

    private void TaskList_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (Vm == null) return;
        if (e.Key != Key.Tab) return;
        if (TaskList?.SelectedItem is not TodoItem item) return;

        int delta = (Keyboard.Modifiers & ModifierKeys.Shift) != 0 ? -1 : +1;
        Vm.ChangeIndent(item, delta);
        e.Handled = true;
    }

    // ===== 新任务优先级 Chip:点击切换 NewTaskPriority =====

    private void PriorityChip_Click(object sender, RoutedEventArgs e)
    {
        if (Vm == null) return;
        if (sender is not FrameworkElement fe || fe.Tag is not string tag) return;
        if (Enum.TryParse<Priority>(tag, ignoreCase: true, out var p))
            Vm.NewTaskPriority = p;
    }

    // ===== 语音输入：调用 Windows 系统语音输入(Win+H) =====

    /// <summary>
    /// 先聚焦任务输入框，再模拟 Win+H 唤起系统语音输入浮窗；识别的文字会落入输入框。
    /// 调用失败(如系统不支持/无 user32)时弹出指引，告知如何开启与手动调用。
    /// </summary>
    private void VoiceInput_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            NewTaskBox.Focus();
            Keyboard.Focus(NewTaskBox);
            NewTaskBox.CaretIndex = NewTaskBox.Text?.Length ?? 0;
            NativeMethods.SendWinH();
        }
        catch (Exception ex)
        {
            ShowVoiceInputHelp(ex);
        }
    }

    /// <summary>语音输入调用失败时的指引：如何开启系统语音输入、如何手动唤起.</summary>
    private void ShowVoiceInputHelp(Exception? ex = null)
    {
        var body = Loc.T("S.Voice.HelpBody");
        if (ex != null)
            body += Environment.NewLine + Environment.NewLine + Loc.F("S.Fmt.VoiceErrorDetail", ex.Message);
        MessageBox.Show(this, body, Loc.T("S.Voice.HelpTitle"),
            MessageBoxButton.OK, MessageBoxImage.Information);
    }

    // ===== 语言切换(☰ 菜单) =====

    /// <summary>从 ☰ 菜单点击语言项:按 Tag(zh-CN / en) 切换并收起菜单.</summary>
    private void Language_Click(object sender, RoutedEventArgs e)
    {
        SettingsToggle.IsChecked = false;
        if (Vm == null || sender is not FrameworkElement fe || fe.Tag is not string key) return;
        var target = Vm.Languages.FirstOrDefault(l => l.Key == key);
        if (target != null) Vm.SelectedLanguage = target;
    }

    // ===== 排序弹出选择 =====

    private void SortOption_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.Tag is SortOption opt && Vm != null)
        {
            Vm.SelectedSortOption = opt;
            SortToggle.IsChecked = false;
        }
    }

    // ===== 日程 / 日历:嵌入主窗口右侧的可调面板(展开/收起 + 加宽/还原) =====

    private const double ScheduleSplitterWidth = 5;

    /// <summary>面板当前是否真正展开(UI 状态);与持久化的 Vm.ScheduleOpen 区分，避免启动恢复时被门槛挡住.</summary>
    private bool _scheduleShown;

    private void Schedule_Click(object sender, RoutedEventArgs e) => ToggleSchedule();

    private void ToggleSchedule()
    {
        if (_scheduleShown) CloseSchedule();
        else OpenSchedule();
    }

    private void OpenSchedule()
    {
        if (Vm == null || _scheduleShown) return;

        ScheduleView.Init(Vm);

        double w = Vm.ScheduleWidth > 0 ? Vm.ScheduleWidth : 300;
        ScheduleColumn.MinWidth = 220;
        ScheduleColumn.Width = new GridLength(w);
        SchedulePanel.Visibility = Visibility.Visible;
        ScheduleSplitter.Visibility = Visibility.Visible;

        // 正常态下向右扩展出面板宽度(侧边栏与中间任务区尺寸不变;红绿灯/☰ 随标题栏自动右移)
        if (WindowState == WindowState.Normal)
            Width += w + ScheduleSplitterWidth;

        _scheduleShown = true;
        Vm.ScheduleOpen = true;
        ScheduleView.Refresh();
    }

    private void CloseSchedule()
    {
        if (Vm == null || !_scheduleShown) return;

        SyncScheduleWidthBack();
        double space = ScheduleColumn.ActualWidth + ScheduleSplitterWidth;

        SchedulePanel.Visibility = Visibility.Collapsed;
        ScheduleSplitter.Visibility = Visibility.Collapsed;
        ScheduleColumn.MinWidth = 0;
        ScheduleColumn.Width = new GridLength(0);

        // 收回面板占用的宽度，侧边栏 + 中间任务区精确还原为展开前的尺寸
        if (WindowState == WindowState.Normal)
            Width = Math.Max(MinWidth, Width - space);

        _scheduleShown = false;
        Vm.ScheduleOpen = false;
    }

    private void SyncScheduleWidthBack()
    {
        if (Vm == null || ScheduleColumn == null) return;
        double w = ScheduleColumn.ActualWidth;
        if (w > 0) Vm.ScheduleWidth = w;
    }

    // ===== 分组右键:修改颜色 =====

    private void GroupColor_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuItem mi && mi.Tag is string hex && mi.DataContext is TodoGroup g)
            Vm?.SetGroupColor(g, hex);
    }

    // ===== 分组右键:更改图标(分类选择 + 自定义图片) =====

    private void GroupChangeIcon_Click(object sender, RoutedEventArgs e)
    {
        if (Vm == null || sender is not MenuItem mi || mi.DataContext is not TodoGroup g) return;
        var dlg = new IconPickerDialog(Vm, g) { Owner = this };
        dlg.ShowDialog();
    }

    // ===== 任务标题:单击进入编辑，回车/失焦退出 =====

    private void TaskTitle_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is TodoItem item)
            item.IsEditing = true;
    }

    private void TitleEdit_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (sender is TextBox tb && tb.IsVisible)
        {
            tb.Focus();
            tb.SelectAll();
        }
    }

    private void TitleEdit_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter || e.Key == Key.Escape)
        {
            if (sender is TextBox tb && tb.DataContext is TodoItem item)
                item.IsEditing = false;
            e.Handled = true;
        }
    }

    private void TitleEdit_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb && tb.DataContext is TodoItem item)
            item.IsEditing = false;
    }

    // ===== 右键:编辑任务(优先级 + 截止时间) =====

    private void EditTask_Click(object sender, RoutedEventArgs e)
    {
        var item = ResolveTask(sender);
        if (item == null || Vm == null) return;

        var dlg = new TaskEditDialog(item) { Owner = this };
        if (dlg.ShowDialog() == true)
            Vm.ApplyTaskEdits(item, dlg.ResultDue, dlg.ResultPriority, dlg.ResultTitle);
    }

    // ===== 右键:移动到分组 =====

    private void MoveToGroup_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not MenuItem mi || mi.DataContext is not TodoGroup target || Vm == null) return;
        var item = ResolveTaskFromMenu(mi);
        if (item != null) Vm.MoveTaskToGroup(item, target);
    }

    /// <summary>
    /// 从(可能位于子菜单的)菜单项向上找到 ContextMenu，再取其 PlacementTarget 对应的任务.
    /// 经 ItemsSource 生成的子菜单项，其逻辑父级可能为 null，故依次尝试
    /// 逻辑父级 → ItemsControlFromItemContainer → FrameworkElement.Parent/TemplatedParent.
    /// </summary>
    private static TodoItem? ResolveTaskFromMenu(DependencyObject? start)
    {
        DependencyObject? cur = start;
        while (cur != null)
        {
            if (cur is System.Windows.Controls.ContextMenu cm)
                return (cm.PlacementTarget as FrameworkElement)?.DataContext as TodoItem;

            DependencyObject? parent = LogicalTreeHelper.GetParent(cur);
            if (parent == null && cur is MenuItem mi)
                parent = ItemsControl.ItemsControlFromItemContainer(mi);
            if (parent == null && cur is FrameworkElement fe)
                parent = fe.Parent ?? fe.TemplatedParent;
            cur = parent;
        }
        return null;
    }

    // ===== 完成庆祝:烟花特效 =====

    /// <summary>在内容区随机位置放出若干束烟花(错峰绽放).</summary>
    private void PlayFireworks()
    {
        if (FxOverlay == null) return;
        double w = FxOverlay.ActualWidth, h = FxOverlay.ActualHeight;
        if (w <= 1 || h <= 1) return;

        int bursts = 3;
        for (int b = 0; b < bursts; b++)
        {
            double cx = w * (0.2 + _fxRng.NextDouble() * 0.6);
            double cy = h * (0.18 + _fxRng.NextDouble() * 0.45);
            var color = FxColors[_fxRng.Next(FxColors.Length)];
            // 各束错峰绽放，最后一束在总时长结束前落幕，与任务滑出动画节奏一致
            int delayMs = (int)(b * CelebrateMs * 0.16);
            SpawnBurst(cx, cy, color, delayMs);
        }
    }

    /// <summary>在 (cx,cy) 处绽放一束由多颗粒子组成的烟花，delayMs 控制错峰.</summary>
    private void SpawnBurst(double cx, double cy, Color color, int delayMs)
    {
        const int count = 28;
        double maxR = 80 + _fxRng.NextDouble() * 55;
        var begin = TimeSpan.FromMilliseconds(delayMs);
        // 粒子存活时长:使最后一束在总时长 CelebrateMs 附近落幕
        double lifeMs = CelebrateMs - delayMs;

        for (int i = 0; i < count; i++)
        {
            double angle = Math.PI * 2 * i / count + _fxRng.NextDouble() * 0.25;
            double radius = maxR * (0.55 + _fxRng.NextDouble() * 0.45);
            double dx = Math.Cos(angle) * radius;
            double dy = Math.Sin(angle) * radius;

            var dot = new Ellipse
            {
                Width = 7,
                Height = 7,
                Fill = new SolidColorBrush(color),
                Opacity = 0,
            };
            Canvas.SetLeft(dot, cx);
            Canvas.SetTop(dot, cy);

            var tt = new TranslateTransform();
            dot.RenderTransform = tt;
            FxOverlay.Children.Add(dot);

            var dur = TimeSpan.FromMilliseconds(Math.Max(500, lifeMs * (0.85 + _fxRng.NextDouble() * 0.15)));
            var ease = new CubicEase { EasingMode = EasingMode.EaseOut };

            var ax = new DoubleAnimation(0, dx, dur) { EasingFunction = ease, BeginTime = begin };
            // 末尾叠加少量重力下坠，更像真实烟花
            var ay = new DoubleAnimation(0, dy + 26, dur) { EasingFunction = ease, BeginTime = begin };
            var fade = new DoubleAnimation(1, 0, dur)
            {
                BeginTime = begin,
                EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn },
            };

            // 动画结束移除粒子，避免覆盖层无限堆积
            fade.Completed += (_, _) => FxOverlay.Children.Remove(dot);

            tt.BeginAnimation(TranslateTransform.XProperty, ax);
            tt.BeginAnimation(TranslateTransform.YProperty, ay);
            dot.BeginAnimation(OpacityProperty, fade);
        }
    }

    /// <summary>从右键菜单项可靠地解析出对应的任务对象.</summary>
    private static TodoItem? ResolveTask(object sender)
    {
        // MenuItem.DataContext 即所在数据项(ContextMenu 继承 PlacementTarget 的 DataContext)
        if (sender is MenuItem mi)
        {
            if (mi.DataContext is TodoItem t1) return t1;

            // 兜底:经 ContextMenu.PlacementTarget 取
            if (mi.Parent is System.Windows.Controls.ContextMenu cm
                && cm.PlacementTarget is FrameworkElement fe
                && fe.DataContext is TodoItem t2)
                return t2;
        }
        return null;
    }
}
