using System;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
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

    /// <summary>每小时自动检查更新的定时器.</summary>
    private DispatcherTimer? _updateTimer;
    /// <summary>防止多个检查同时进行(启动检查与定时检查重叠).</summary>
    private bool _updateChecking;

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

        // 换肤交叉淡变:切主题前截图旧主题,完成后淡出(仅主窗口,启动时首个 Apply 早于此处不受影响)
        ThemeManager.ThemeChanging -= OnThemeChanging;
        ThemeManager.ThemeChanging += OnThemeChanging;
        ThemeManager.ThemeChanged -= OnThemeChangedFadeOut;
        ThemeManager.ThemeChanged += OnThemeChangedFadeOut;
        ApplySidebarState();
        ApplyInputBarHeight();
        UpdateClip();
        UpdateRoundedForState();
        ApplyAcrylicForTheme();
        ApplyAlwaysOnTop();
        RestoreDockOnLoad();

        // 恢复上次的日程面板展开状态(上次展开则启动也展开，窗口随之加宽)
        if (Vm != null && Vm.ScheduleOpen) OpenSchedule();

        // 便签编辑器:初始化(DataContext=NotesVm),随后由侧栏「收集箱」选中便签驱动显示
        if (Vm != null) NotesPanel.Init(Vm);

        // 禁用 Windows Aero Snap 手势，避免拖到边缘触发系统的自动最大化/分屏
        var hwnd = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        NativeMethods.DisableAeroSnap(hwnd);

        // 自动更新:更新后清理旧版 exe + 按设置做启动检查与每小时定时检查
        InitAutoUpdate();
    }

    // ===== 自动更新 =====

    /// <summary>
    /// 初始化自动更新:① 若本次由更新脚本拉起(带 --updated-from)则回收旧版 exe；
    /// ② 每 12 小时定时检查；③ 启动后延迟几秒做一次检查(不打断启动).均尊重“自动检查更新”开关.
    /// </summary>
    private void InitAutoUpdate()
    {
        // ① 被更新脚本拉起:把被替换的旧版 exe 移入回收站(后台线程，带重试)
        var args = Environment.GetCommandLineArgs();
        int idx = Array.FindIndex(args, a =>
            string.Equals(a, UpdateService.UpdatedFromArg, StringComparison.OrdinalIgnoreCase));
        if (idx >= 0 && idx + 1 < args.Length)
        {
            var oldExe = args[idx + 1];
            Task.Run(() => UpdateService.CleanupAfterUpdate(oldExe));
        }

        // ② 每 12 小时定时检查(仅在开启时真正发起；降低 GitHub 匿名接口 60次/小时限流的撞限风险)
        _updateTimer = new DispatcherTimer { Interval = TimeSpan.FromHours(12) };
        _updateTimer.Tick += (_, _) => { if (Vm?.AutoUpdateEnabled == true) RunUpdateCheck(); };
        _updateTimer.Start();

        // ③ 启动检查:延迟几秒，让主界面先显示出来
        if (Vm?.AutoUpdateEnabled == true)
        {
            var startupCheck = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
            startupCheck.Tick += (s, _) =>
            {
                (s as DispatcherTimer)?.Stop();
                if (Vm?.AutoUpdateEnabled == true) RunUpdateCheck();
            };
            startupCheck.Start();
        }
    }

    /// <summary>以“即发即弃”方式触发一次后台更新检查(异常已在内部吞掉).</summary>
    private void RunUpdateCheck() => _ = CheckForUpdateSilentlyAsync();

    /// <summary>
    /// 后台静默检查更新:有新版且未被“此版本不再提示”跳过时弹出更新对话框.网络/解析失败静默忽略.
    /// </summary>
    private async Task CheckForUpdateSilentlyAsync()
    {
        if (_updateChecking) return;
        _updateChecking = true;
        try
        {
            var info = await UpdateService.CheckAsync();
            if (info == null || Vm == null || !Vm.AutoUpdateEnabled) return;

            // 用户已对该版本选择“不再提示” → 跳过
            if (string.Equals(Vm.IgnoredUpdateVersion, info.Version.ToString(3), StringComparison.OrdinalIgnoreCase))
                return;

            // 已经弹着更新窗就不重复弹
            if (OwnedWindows.OfType<UpdateDialog>().Any()) return;

            var dlg = new UpdateDialog(info) { Owner = this };
            dlg.ShowDialog();
            if (dlg.Choice == UpdateChoice.Skipped)
                Vm.IgnoredUpdateVersion = info.Version.ToString(3);
        }
        catch
        {
            // 静默:自动检查失败不打扰用户
        }
        finally
        {
            _updateChecking = false;
        }
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
        Vm.TaskAdded -= OnTaskAdded;
        Vm.TaskAdded += OnTaskAdded;
        Vm.CentralViewAnimate -= OnCentralViewAnimate;
        Vm.CentralViewAnimate += OnCentralViewAnimate;
    }

    /// <summary>
    /// 中央区切换的进场动画:待办↔待办、便签↔便签、待办↔便签 统一在此播放 IntroScaleFade。
    /// 进入便签视图时顺带清掉分组列表高亮(SelectedItem 为 OneWay,本地清空不回写 SelectedGroup),
    /// 避免分组/便签双高亮,且让之后再点同一分组能作为全新选择触发切回。
    /// </summary>
    private void OnCentralViewAnimate(bool isNotes)
    {
        if (Vm == null) return;
        if (isNotes) GroupList.SelectedItem = null;
        Anim.IntroScaleFade(isNotes ? (FrameworkElement)NotesPanel : TaskArea);
    }

    /// <summary>
    /// 新任务添加后:等容器生成完毕，对新卡片的模板根 Border 播放"淡入 + 上移"进场动画.
    /// 动画挂在模板内部元素而非 ListBoxItem 本体，避免与完成滑出动画(覆写 ListBoxItem
    /// 的 RenderTransform)互相干扰；容器未生成(虚拟化滚出屏)时静默跳过.
    /// </summary>
    private void OnTaskAdded(TodoItem item)
    {
        Dispatcher.BeginInvoke(new Action(() =>
        {
            if (TaskList.ItemContainerGenerator.ContainerFromItem(item) is not ListBoxItem c) return;
            if (VisualTreeHelper.GetChildrenCount(c) == 0) return;
            if (VisualTreeHelper.GetChild(c, 0) is FrameworkElement root)
                Anim.FadeSlideIn(root, dy: 10);
        }), DispatcherPriority.Loaded);
    }

    // ===== 换肤交叉淡变 =====

    /// <summary>
    /// 主题即将切换:先把旧主题的整窗画面截图盖在最上层(ThemeFadeOverlay)，
    /// 换肤完成后(<see cref="OnThemeChangedFadeOut"/>)再将其淡出——整窗丝滑过渡而非瞬间换色.
    /// </summary>
    private void OnThemeChanging()
    {
        if (!Anim.Enabled || !IsVisible || RootBorder.ActualWidth < 1) return;
        try
        {
            // 连续快速切换时先撤掉上一张正在淡出的旧图,避免截到"图中图"
            ThemeFadeOverlay.BeginAnimation(OpacityProperty, null);
            ThemeFadeOverlay.Visibility = Visibility.Collapsed;
            ThemeFadeOverlay.Source = null;
            UpdateLayout();

            var dpi = VisualTreeHelper.GetDpi(this);
            var rtb = new RenderTargetBitmap(
                (int)Math.Ceiling(RootBorder.ActualWidth * dpi.DpiScaleX),
                (int)Math.Ceiling(RootBorder.ActualHeight * dpi.DpiScaleY),
                dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
            rtb.Render(RootBorder);
            rtb.Freeze();

            ThemeFadeOverlay.Source = rtb;
            ThemeFadeOverlay.Opacity = 1;
            ThemeFadeOverlay.Visibility = Visibility.Visible;
        }
        catch
        {
            // 截图失败(极端尺寸/显存)就退回瞬时换肤
            ThemeFadeOverlay.Visibility = Visibility.Collapsed;
            ThemeFadeOverlay.Source = null;
        }
    }

    /// <summary>主题切换完成:把旧主题截图淡出并释放.</summary>
    private void OnThemeChangedFadeOut()
    {
        if (ThemeFadeOverlay.Visibility != Visibility.Visible) return;
        var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(260))
        { EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut } };
        fade.Completed += (_, _) =>
        {
            ThemeFadeOverlay.BeginAnimation(OpacityProperty, null);
            ThemeFadeOverlay.Visibility = Visibility.Collapsed;
            ThemeFadeOverlay.Source = null;
        };
        ThemeFadeOverlay.BeginAnimation(OpacityProperty, fade);
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
        if (willLeaveView)
        {
            // 四象限:四个象限列表;标签看板:看板内全部容器列表;常规视图:任务列表
            System.Collections.Generic.IEnumerable<ListBox?> lists =
                Vm.IsQuadrantSelected ? new[] { QuadList1, QuadList2, QuadList3, QuadList4 }
                : Vm.IsTagBoardSelected ? FindVisualChildren<ListBox>(TagBoardItems)
                : new[] { TaskList };
            foreach (var f in family)
            {
                foreach (var lb in lists)
                {
                    if (lb?.ItemContainerGenerator.ContainerFromItem(f) is ListBoxItem c)
                    {
                        containers.Add(c);
                        break;
                    }
                }
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
        // 中央区切换动画与清高亮统一由 CentralViewAnimate 事件处理(见 OnCentralViewAnimate),
        // 覆盖待办↔待办、便签↔便签;IsNotesViewOpen 仍用于 Visibility 绑定,无需在此处理.
    }

    /// <summary>“毛玻璃”主题时开启 Acrylic 模糊，其余主题关闭.</summary>
    private void ApplyAcrylicForTheme()
    {
        if (Vm == null) return;
        bool glass = string.Equals(Vm.CurrentTheme, ThemeManager.Glass, StringComparison.OrdinalIgnoreCase);
        if (glass)
            AcrylicHelper.Enable(this, 0x33222831);   // 半透明深色玻璃底
        else
            AcrylicHelper.Disable(this);
        // 毛玻璃下窗口方形 HWND 会让 Acrylic 填满直角,用 Win11 DWM 圆角修正;其余主题已由 WPF 圆角裁剪
        AcrylicHelper.SetRoundedCorners(this, glass);
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
        Vm?.NotesVm?.FlushPendingSave();   // 便签可能有挂起的防抖保存，关闭/隐藏前落盘

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

    /// <summary>
    /// 最小化:因应用不在任务栏显示(ShowInTaskbar=False),最小化无处可去,
    /// 故直接隐藏到通知栏托盘(与“关闭”一致),后续双击托盘图标即可重新唤出.
    /// </summary>
    private void Minimize_Click(object sender, RoutedEventArgs e)
    {
        SyncSidebarWidthBack();
        Hide();
    }

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
        bool wasHidden = !IsVisible;
        Show();
        WindowState = WindowState.Normal;

        // 若当前处于贴边隐藏/停靠态，先解除贴边，再把窗口居中到光标所在屏的工作区，
        // 避免“显示主界面”后窗口仍缩在屏幕边缘只露一条触发条。
        if (_dockEdge != 0)
        {
            Undock();
            var wa = NativeMethods.GetCursorScreenWorkAreaDip(this);
            Left = wa.Left + (wa.Width - Width) / 2;
            Top = wa.Top + (wa.Height - Height) / 2;
        }

        // 从托盘隐藏态恢复时整窗淡入(结束后释放动画，不影响贴边的 Top/Left 动画)
        if (wasHidden) Anim.WindowFadeIn(this);

        Activate();
        Topmost = true;   // 强制置顶以确保窗口跳到最前
        // 还原为用户实际选择的“置于顶层”状态(而非写死 false，否则会破坏置顶功能)
        Topmost = Vm?.AlwaysOnTop ?? false;
    }

    private void TrayIcon_DoubleClick(object sender, RoutedEventArgs e) => ShowMainWindow();

    private void ShowMenuItem_Click(object sender, RoutedEventArgs e) => ShowMainWindow();

    private void ExitMenuItem_Click(object sender, RoutedEventArgs e) => ForceExit();

    /// <summary>
    /// 真正退出应用:允许关闭(绕过“关闭=隐藏到托盘”) → 回写侧栏宽度 → 释放托盘图标 → 关闭应用.
    /// 托盘“退出”菜单与「被新版本优雅接管」(App.OnExitSignalReceived)共用此入口.
    /// </summary>
    public void ForceExit()
    {
        _allowClose = true;
        SyncSidebarWidthBack();
        try { TrayIcon.Dispose(); } catch { /* 托盘已释放,忽略 */ }   // 释放托盘图标，避免残留
        Application.Current.Shutdown();
    }

    // ===== 侧栏:分组选择 / 已完成 / 收集箱便签 =====

    /// <summary>分组列表选择变化:推到 VM.SelectedGroup。
    /// SelectedItem 是 OneWay,这里只在选中真实分组时回写;忽略 null(选「已完成」导致本列表清空时不要把 SelectedGroup 抹成 null)。</summary>
    private void GroupList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (Vm == null) return;
        if (sender is ListBox { SelectedItem: TodoGroup g })
            SelectGroup(g);
    }

    /// <summary>点击「已完成」独立行:切到已完成视图。</summary>
    private void Completed_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.CompletedGroup is { } completed) SelectGroup(completed);
    }

    /// <summary>点击「四象限」独立行:切到四象限视图。</summary>
    private void Quadrant_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.QuadrantGroup is { } quadrant) SelectGroup(quadrant);
    }

    /// <summary>点击「标签看板」独立行:切到标签看板视图。</summary>
    private void TagBoard_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.TagBoardGroup is { } board) SelectGroup(board);
    }

    /// <summary>标签看板容器右键「重命名」:置该标签内联编辑态。</summary>
    private void TagRename_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuItem { DataContext: TagColumnVm { Tag: { } g } }) Vm?.RenameGroupCommand.Execute(g);
    }

    /// <summary>标签看板容器右键「改图标」:复用图标选择器。</summary>
    private void TagChangeIcon_Click(object sender, RoutedEventArgs e)
    {
        if (Vm == null || sender is not MenuItem { DataContext: TagColumnVm { Tag: { } g } }) return;
        var dlg = new IconPickerDialog(Vm, g) { Owner = this };
        dlg.ShowDialog();
    }

    /// <summary>标签看板容器右键「删除」:删标签(其下任务转为无标签)。</summary>
    private void TagDelete_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuItem { DataContext: TagColumnVm { Tag: { } g } }) Vm?.DeleteGroupCommand.Execute(g);
    }

    // ===== 标签看板:容器整体拖动重排 =====
    // 按住容器表头/边缘空白拖动整列;任务卡片(内层 ListBox)/输入框/按钮处按下不触发,
    // 它们各自有拖拽/编辑行为。拖动中实时跟手(TagColumns.Move 不重建容器),松手才写盘。

    private TagColumnVm? _dragColumn;     // 按下时记录的候选列(越过阈值才真正进入拖动)
    private Point _dragColumnStart;
    private bool _columnDragging;

    private void TagColumn_MouseDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is not Border b || b.DataContext is not TagColumnVm col) return;
        // 从交互控件(卡片列表/输入框/按钮/勾选框/滚动条)按下的不当作容器拖动
        for (var d = e.OriginalSource as DependencyObject; d != null && !ReferenceEquals(d, b); d = ParentOf(d))
            if (d is ListBox or System.Windows.Controls.Primitives.TextBoxBase or Button or CheckBox
                or System.Windows.Controls.Primitives.ScrollBar) return;
        _dragColumn = col;
        _dragColumnStart = e.GetPosition(TagBoardItems);
        _columnDragging = false;
        // 不立即捕获鼠标:等越过系统拖动阈值再进入拖动,避免干扰单击/右键菜单
    }

    private void TagBoardItems_MouseMove(object sender, MouseEventArgs e)
    {
        if (_dragColumn == null) return;
        if (e.LeftButton != MouseButtonState.Pressed) { EndColumnDrag(); return; }

        var pos = e.GetPosition(TagBoardItems);
        if (!_columnDragging)
        {
            if (Math.Abs(pos.X - _dragColumnStart.X) < SystemParameters.MinimumHorizontalDragDistance
                && Math.Abs(pos.Y - _dragColumnStart.Y) < SystemParameters.MinimumVerticalDragDistance) return;
            _columnDragging = true;
            TagBoardItems.CaptureMouse();
            TagBoardItems.Cursor = Cursors.SizeAll;
            SetColumnOpacity(_dragColumn, 0.55);
        }

        int target = ColumnIndexAt(pos);
        if (target >= 0) Vm?.MoveTagColumn(_dragColumn, target);
    }

    private void TagBoardItems_MouseUp(object sender, MouseButtonEventArgs e) => EndColumnDrag();

    private void TagBoardItems_LostCapture(object sender, MouseEventArgs e) => EndColumnDrag();

    private void EndColumnDrag()
    {
        var col = _dragColumn;
        _dragColumn = null;
        if (col == null) return;
        if (_columnDragging)
        {
            _columnDragging = false;
            SetColumnOpacity(col, 1.0);
            TagBoardItems.Cursor = null;
            if (TagBoardItems.IsMouseCaptured) TagBoardItems.ReleaseMouseCapture();
            Vm?.CommitTagColumnOrder();
        }
    }

    /// <summary>鼠标(TagBoardItems 坐标系)当前落在第几列上;不在任何列上返回 -1。</summary>
    private int ColumnIndexAt(Point pos)
    {
        for (int i = 0; i < TagBoardItems.Items.Count; i++)
        {
            if (TagBoardItems.ItemContainerGenerator.ContainerFromIndex(i) is not FrameworkElement fe
                || !fe.IsVisible) continue;
            var topLeft = fe.TranslatePoint(new Point(0, 0), TagBoardItems);
            if (new Rect(topLeft, new Size(fe.ActualWidth, fe.ActualHeight)).Contains(pos)) return i;
        }
        return -1;
    }

    private void SetColumnOpacity(TagColumnVm col, double opacity)
    {
        if (TagBoardItems.ItemContainerGenerator.ContainerFromItem(col) is UIElement el)
            el.Opacity = opacity;
    }

    /// <summary>视觉树向上走一级;命中 ContentElement(如 Run)时退回逻辑树,避免 VisualTreeHelper 抛异常。</summary>
    private static DependencyObject? ParentOf(DependencyObject d) =>
        d is Visual or System.Windows.Media.Media3D.Visual3D
            ? VisualTreeHelper.GetParent(d)
            : LogicalTreeHelper.GetParent(d);

    // ===== 新建待办·标签选择器 =====

    private void OpenTagPicker_Click(object sender, RoutedEventArgs e) => NewTaskTagPopup.IsOpen = true;

    private void TagPick_Click(object sender, RoutedEventArgs e)
    {
        if (Vm != null && sender is FrameworkElement { Tag: TodoGroup g }) Vm.NewTaskTagId = g.Id;
        NewTaskTagPopup.IsOpen = false;
    }

    private void TagPickNone_Click(object sender, RoutedEventArgs e)
    {
        if (Vm != null) Vm.NewTaskTagId = null;
        NewTaskTagPopup.IsOpen = false;
    }

    private void TagDeleteFromPicker_Click(object sender, RoutedEventArgs e)
    {
        if (Vm != null && sender is FrameworkElement { Tag: TodoGroup g }) Vm.DeleteGroupCommand.Execute(g);
        // 不关闭浮层,便于连续操作
    }

    private void NewTagNameBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter) { TagCreate_Click(sender, e); e.Handled = true; }
    }

    // 新建标签时手动选定的图标(未选则按名称推断默认)。二者最多其一非空。
    private string? _newTagGlyph;
    private string? _newTagImage;

    /// <summary>新建标签行的「默认图标」按钮:打开图标选择器(仅选择模式),把结果暂存并更新预览。</summary>
    private void NewTagPickIcon_Click(object sender, RoutedEventArgs e)
    {
        // 选择器是模态窗口,会抢焦点导致 StaysOpen=False 的浮层关闭;临时置 StaysOpen 保住浮层。
        bool prev = NewTaskTagPopup.StaysOpen;
        NewTaskTagPopup.StaysOpen = true;
        try
        {
            var dlg = new IconPickerDialog { Owner = this };   // 默认构造 = 仅选择模式
            if (dlg.ShowDialog() == true) ApplyNewTagIcon(dlg.ResultGlyph, dlg.ResultImage);
        }
        finally
        {
            NewTaskTagPopup.StaysOpen = prev;
            NewTaskTagPopup.IsOpen = true;
        }
    }

    private void ApplyNewTagIcon(string? glyph, string? image)
    {
        if (!string.IsNullOrEmpty(image))
        {
            _newTagImage = image; _newTagGlyph = null;
            var bmp = LoadIconBitmap(image);
            NewTagIconButton.Content = bmp != null
                ? new Image { Source = bmp, Width = 16, Height = 16, Stretch = Stretch.UniformToFill }
                : MakeGlyphPreview(GroupIcons.Folder);
        }
        else if (!string.IsNullOrEmpty(glyph))
        {
            _newTagGlyph = glyph; _newTagImage = null;
            NewTagIconButton.Content = MakeGlyphPreview(glyph);
        }
    }

    /// <summary>用户未手动选图标时,预览随名称推断的默认字形(与 CreateTag 一致)。</summary>
    private void NewTagNameBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_newTagGlyph != null || _newTagImage != null) return;
        if (NewTagIconButton?.Content is TextBlock tb) tb.Text = GroupIcons.IconForName(NewTagNameBox.Text);
    }

    private TextBlock MakeGlyphPreview(string glyph) => new()
    {
        Text = glyph,
        FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets"),
        FontSize = 13,
        Foreground = (Brush)FindResource("PrimaryText"),
    };

    private void ResetNewTagIcon()
    {
        _newTagGlyph = null; _newTagImage = null;
        NewTagIconButton.Content = MakeGlyphPreview(GroupIcons.Folder);
    }

    private static BitmapImage? LoadIconBitmap(string path)
    {
        try
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.DecodePixelWidth = 32;
            bmp.UriSource = new Uri(path);
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
        catch { return null; }
    }

    private void TagCreate_Click(object sender, RoutedEventArgs e)
    {
        if (Vm == null) return;
        var name = NewTagNameBox.Text?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return;
        var g = Vm.CreateTag(name, _newTagGlyph);
        if (!string.IsNullOrEmpty(_newTagImage)) Vm.SetGroupIconImage(g, _newTagImage);
        NewTagNameBox.Text = string.Empty;
        ResetNewTagIcon();
        Vm.NewTaskTagId = g.Id;
        NewTaskTagPopup.IsOpen = false;
    }

    /// <summary>选中分组并退出便签视图。显式清便签:即使点的是当前已选分组(SelectedGroup 不变,
    /// OnSelectedGroupChanged 不触发),也要能从便签切回任务列表。</summary>
    private void SelectGroup(TodoGroup g)
    {
        if (Vm == null) return;
        if (Vm.NotesVm?.SelectedNote != null) Vm.NotesVm.SelectedNote = null;  // → IsNotesViewOpen=false
        // 清掉收集箱各 ListBox 的残留选中:便签是 OneWay+SelectionChanged 驱动,
        // 离开便签视图后这些 ListBox 仍记着上次选中那篇;不清的话再点「同一篇」便签
        // 不触发 SelectionChanged → 切不回便签视图(表现为点便签无反应、要点好几次别的便签才行)。
        foreach (var lb in FindVisualChildren<System.Windows.Controls.ListBox>(InboxTree))
            if (lb.SelectedItem != null) lb.SelectedItem = null;
        Vm.SelectedGroup = g;
        // GroupList 仅含「所有待办」一项;其它视图入口(已完成/四象限/标签看板)为独立按钮,置 null 由各自高亮.
        GroupList.SelectedItem = g.IsAllUncompletedGroup ? g : null;
    }

    /// <summary>收集箱便签右键「删除」:确认后删除该便签。</summary>
    private void InboxDeleteNote_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.NotesVm == null || sender is not MenuItem mi) return;
        // ContextMenu 不在可视树:其 DataContext 由 PlacementTarget 继承;两条路径都兜一下
        var note = mi.DataContext as Note
                   ?? ((mi.Parent as ContextMenu)?.PlacementTarget as FrameworkElement)?.DataContext as Note;
        if (note == null) return;

        var dlg = new ConfirmDialog(Loc.T("S.Note.Delete"), Loc.T("S.Note.DeleteConfirm")) { Owner = this };
        if (dlg.ShowDialog() != true) return;

        Vm.NotesVm.DeleteNote(note);
    }

    // ===== 主题选择独立窗口 =====

    private ThemePickerWindow? _themePicker;

    /// <summary>打开主题选择窗口(单例):已开则激活，未开则在主窗口侧边弹出.</summary>
    private void OpenThemePicker_Click(object sender, RoutedEventArgs e)
    {
        if (Vm == null) return;

        if (_themePicker != null)
        {
            _themePicker.Activate();
            return;
        }

        _themePicker = new ThemePickerWindow(Vm, this);
        _themePicker.Closed += (_, __) => _themePicker = null;
        _themePicker.Show();
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

        // 开日历后“弹性列”由 待办区 换成 日历列：
        //  · 拖窗口外边缘缩放 → 日历(星列)吸收变化，待办宽度保持不变；
        //  · 待办宽度只由中间的 ScheduleSplitter 调整。
        double taskW = TaskColumn.ActualWidth;

        SchedulePanel.Visibility = Visibility.Visible;
        ScheduleSplitter.Visibility = Visibility.Visible;
        ScheduleColumn.MinWidth = 220;

        if (WindowState == WindowState.Normal)
        {
            TaskColumn.Width = new GridLength(taskW);                  // 待办固定为当前宽度
            ScheduleColumn.Width = new GridLength(1, GridUnitType.Star); // 日历为弹性列
            Width += w + ScheduleSplitterWidth;                        // 向右扩出日历，待办不变
        }
        else
        {
            // 最大化无法扩窗：从待办区匀出日历宽度
            TaskColumn.Width = new GridLength(Math.Max(150, taskW - w - ScheduleSplitterWidth));
            ScheduleColumn.Width = new GridLength(1, GridUnitType.Star);
        }

        _scheduleShown = true;
        Vm.ScheduleOpen = true;
        ScheduleView.Refresh();

        // 日程面板内容从右侧弹性滑入(窗口宽度变化保持瞬时，避免与贴边/最大化/分隔条竞态)
        Anim.FadeSlideIn(SchedulePanel, dx: 24);
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
        TaskColumn.Width = new GridLength(1, GridUnitType.Star);   // 待办恢复为弹性列

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

    // ===== 分组内联重命名:可见即聚焦全选，回车/失焦提交 =====

    private void GroupNameEdit_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (sender is TextBox tb && tb.IsVisible)
        {
            tb.Focus();
            tb.SelectAll();
        }
    }

    private void GroupNameEdit_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter || e.Key == Key.Escape)
        {
            if (sender is TextBox tb && tb.DataContext is TodoGroup g) Vm?.EndEditGroup(g);
            e.Handled = true;
        }
    }

    private void GroupNameEdit_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb && tb.DataContext is TodoGroup g) Vm?.EndEditGroup(g);
    }

    // ===== 收集箱:便签选择(多列表共享 SelectedNote,用 OneWay+SelectionChanged 避免互相清空) =====

    private void InboxNotes_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // 仅当本列表新增了选中项时才回写(被动清空时 AddedItems 为空,不动 SelectedNote)
        if (Vm?.NotesVm == null || e.AddedItems.Count == 0 || e.AddedItems[0] is not Note note) return;
        Vm.NotesVm.SelectedNote = note;

        // 收集箱有多个便签 ListBox(未分组 + 各分组),清掉其它列表里的残留选中,
        // 否则它们各自保留 IsSelected,再点回那一篇时本列表「无变化」不触发 SelectionChanged → 选不动.
        foreach (var lb in FindVisualChildren<System.Windows.Controls.ListBox>(InboxTree))
        {
            if (!ReferenceEquals(lb, sender) && lb.SelectedItem != null)
                lb.SelectedItem = null;
        }
    }

    /// <summary>深度优先枚举可视树中指定类型的后代元素.</summary>
    private static System.Collections.Generic.IEnumerable<T> FindVisualChildren<T>(DependencyObject? root)
        where T : DependencyObject
    {
        if (root == null) yield break;
        int n = VisualTreeHelper.GetChildrenCount(root);
        for (int i = 0; i < n; i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is T t) yield return t;
            foreach (var d in FindVisualChildren<T>(child)) yield return d;
        }
    }

    // ===== 收集箱:便签标题重命名(右键 / 双击 → 内联编辑) =====

    /// <summary>右键「重命名」:把该便签置为标题编辑态。</summary>
    private void NoteRename_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement fe) return;
        var note = fe.DataContext as Note;   // 菜单项 DataContext 为该便签
        if (note == null && fe is MenuItem mi
            && (mi.Parent as ContextMenu)?.PlacementTarget is FrameworkElement pt)
            note = pt.DataContext as Note;
        if (note != null) Vm?.NotesVm?.RenameNote(note);
    }

    /// <summary>双击便签行:进入标题内联编辑(单击仍走选中→打开便签)。</summary>
    private void NoteItem_DoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is Note note)
        {
            Vm?.NotesVm?.RenameNote(note);
            e.Handled = true;
        }
    }

    private void NoteTitleEdit_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (sender is TextBox tb && tb.IsVisible)
        {
            tb.Focus();
            tb.SelectAll();
        }
    }

    private void NoteTitleEdit_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter || e.Key == Key.Escape)
        {
            if (sender is TextBox tb && tb.DataContext is Note note) Vm?.NotesVm?.EndEditNote(note);
            e.Handled = true;
        }
    }

    private void NoteTitleEdit_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb && tb.DataContext is Note note) Vm?.NotesVm?.EndEditNote(note);
    }

    // ===== 收集箱:便签分组内联重命名 =====

    private void NoteGroupNameEdit_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (sender is TextBox tb && tb.IsVisible)
        {
            tb.Focus();
            tb.SelectAll();
        }
    }

    private void NoteGroupNameEdit_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter || e.Key == Key.Escape)
        {
            if (sender is TextBox tb && tb.DataContext is NoteGroup g) Vm?.NotesVm?.EndEditNoteGroup(g);
            e.Handled = true;
        }
    }

    private void NoteGroupNameEdit_LostFocus(object sender, RoutedEventArgs e)
    {
        if (sender is TextBox tb && tb.DataContext is NoteGroup g) Vm?.NotesVm?.EndEditNoteGroup(g);
    }

    /// <summary>删除便签分组(其下便签移回收集箱根):现代化弹窗二次确认。</summary>
    private void NoteGroupDelete_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.NotesVm == null || sender is not MenuItem mi) return;
        var group = mi.DataContext as NoteGroup
                    ?? ((mi.Parent as ContextMenu)?.PlacementTarget as FrameworkElement)?.DataContext as NoteGroup;
        if (group == null) return;

        var dlg = new ConfirmDialog(Loc.T("S.Note.DeleteGroup"), Loc.T("S.Note.GroupDeleteConfirm")) { Owner = this };
        if (dlg.ShowDialog() != true) return;

        Vm.NotesVm.DeleteNoteGroup(group);
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
