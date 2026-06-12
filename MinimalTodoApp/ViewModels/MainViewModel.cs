using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using GongSolutions.Wpf.DragDrop;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;
using MinimalTodoApp.Services;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 主视图模型:分组管理、任务增删改查、排序、拖拽排序(IDropTarget)、主题切换、
/// 侧边栏折叠、倒计时刷新、自动保存.
/// </summary>
public partial class MainViewModel : ObservableObject, IDropTarget
{
    private readonly DataService _dataService = new();
    private readonly AppData _data;

    /// <summary>所有任务的主列表(数据源).</summary>
    private readonly List<TodoItem> _allItems;

    /// <summary>避免初始化/批量刷新期间触发保存.</summary>
    private bool _suppressSave;

    /// <summary>整族完成期间(父勾选时自动完成所有子)抑制重复的父子联动 / 动画触发.</summary>
    private bool _completingFamily;

    /// <summary>整族取消完成期间(取消勾选时向上向下联动)抑制重复的父子联动.</summary>
    private bool _uncompletingFamily;

    /// <summary>拖拽进行中:为真时禁止重建 Items(避免拖拽 Adorner 失去宿主残留为桌面"鬼影").</summary>
    private bool _isDragging;

    /// <summary>拖拽期间被抑制的刷新请求,拖拽结束后补刷一次.</summary>
    private bool _pendingRefresh;

    /// <summary>由视图层在拖拽开始/结束时设置;结束时若有挂起刷新则立即补刷.</summary>
    public bool IsDragging
    {
        get => _isDragging;
        set
        {
            if (_isDragging == value) return;
            _isDragging = value;
            if (!value && _pendingRefresh)
            {
                _pendingRefresh = false;
                RefreshItems();
            }
        }
    }

    /// <summary>每分钟刷新一次倒计时文案(跨零点也能正确更新).</summary>
    private readonly DispatcherTimer _countdownTimer;

    // 分组颜色调色板，新建分组时循环取用
    private static readonly string[] Palette =
    {
        "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
        "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"
    };

    // ===== 产品默认外观(首次运行 / 点击“恢复默认设置”时套用) =====
    /// <summary>默认字体:微软雅黑 UI(界面专用度量更紧凑清晰，英文回退 Segoe UI；即“跟随系统”).</summary>
    public const string DefaultFontFamily = "Microsoft YaHei UI, Segoe UI";
    /// <summary>默认字号:14(较此前 13 略增，与现代系统正文字号一致、更易读).</summary>
    public const double DefaultFontSize = 14;
    /// <summary>默认行距倍率:1.1(较此前 1.0 略松，更透气).</summary>
    public const double DefaultLineSpacing = 1.1;
    /// <summary>默认勾选框直径:18(较此前 16 略增，更易点选).</summary>
    public const double DefaultCheckboxSize = 18;

    public MainViewModel()
    {
        FavDropHandler = new FavoritesDropHandler(this);
        QuadDropHandler = new QuadrantDropHandler(this);
        TagDropHandler = new TagBoardDropHandler(this);

        _data = _dataService.Load();
        SeedDefaultsIfEmpty();

        // 自定义主题先载入，才能在主题列表里出现并被应用
        ThemeManager.LoadCustomThemes(_data.CustomThemes);

        currentTheme = string.IsNullOrWhiteSpace(_data.Theme) ? ThemeManager.Light : _data.Theme;
        Themes = new ObservableCollection<ThemeInfo>(ThemeManager.AllThemes());
        selectedTheme = Themes.FirstOrDefault(t => t.Key == currentTheme) ?? Themes[0];
        RebuildThemeGroups();

        // 字体设置(字体/字号/行距):从持久化恢复，App 启动时会显式 FontManager.Apply 一次。
        // 首次运行(尚未做过开机自启动初始化)统一套用产品默认:微软雅黑 UI / 字号 14 / 行距 1.1 / 勾选框 18。
        if (!_data.StartupInitialized)
        {
            fontFamily = DefaultFontFamily;
            fontSize = DefaultFontSize;
            lineSpacing = DefaultLineSpacing;
            checkboxSize = DefaultCheckboxSize;
        }
        else
        {
            fontFamily = string.IsNullOrWhiteSpace(_data.FontFamily) ? FontManager.SystemDefault : _data.FontFamily;
            fontSize = _data.FontSize > 0 ? _data.FontSize : DefaultFontSize;
            lineSpacing = _data.LineSpacing > 0 ? _data.LineSpacing : DefaultLineSpacing;
            // 勾选框直径:未设置时默认≈字号+2(与文字等高)，之后可在设置里单独调整
            checkboxSize = _data.CheckboxSize > 0 ? _data.CheckboxSize : Math.Round(fontSize + 2);
        }
        Fonts = new ObservableCollection<FontInfo>(FontManager.AllFonts());
        selectedFont = Fonts.FirstOrDefault(f => f.Key == fontFamily) ?? Fonts[0];

        sidebarWidth = _data.SidebarWidth > 0 ? _data.SidebarWidth : 113;
        sidebarCollapsed = _data.SidebarCollapsed;
        inputBarHeight = _data.InputBarHeight > 0 ? _data.InputBarHeight : 40;
        scheduleWidth = _data.ScheduleWidth > 0 ? _data.ScheduleWidth : 300;
        // 首次启动(尚未初始化)默认隐藏日程；老用户沿用上次的展开偏好
        scheduleOpen = _data.StartupInitialized && _data.ScheduleOpen;
        alwaysOnTop = _data.AlwaysOnTop;
        effectsEnabled = _data.EffectsEnabled;
        soundEnabled = _data.SoundEnabled;
        reminderSoundEnabled = _data.ReminderSoundEnabled;
        autoUpdateEnabled = _data.AutoUpdateEnabled;
        showHolidays = _data.ShowHolidays;
        showPriorityBlock = _data.ShowPriorityBlock;
        quadrantImportantHighOnly = _data.QuadrantImportantHighOnly;
        quadrantUrgentIncludeSoon = _data.QuadrantUrgentIncludeSoon;
        dockEdge = _data.DockEdge;

        // 从缓存恢复节假日(近十年)，避免启动即联网;每天最多一次的联网刷新由 EnsureHolidaysAsync 异步完成
        RebuildHolidays();

        Groups = new ObservableCollection<TodoGroup>(_data.Groups.OrderBy(g => g.OrderIndex));
        // 分组增删时，刷新右键「移动到分组」子菜单的候选项
        Groups.CollectionChanged += (_, _) => OnPropertyChanged(nameof(MoveTargetGroups));

        // 侧栏分组区数据源:排除「已完成」(它在「新建分组」按钮之下单独成行).
        // 已完成恒为 Groups 末位,过滤后剩余项索引与 Groups 一一对齐,故拖拽重排逻辑无需改动.
        var sidebarView = new CollectionViewSource { Source = Groups };
        sidebarView.Filter += (_, e) => e.Accepted = e.Item is TodoGroup tg && tg.IsAllUncompletedGroup;
        SidebarGroups = sidebarView.View;
        _allItems = _data.Items.ToList();
        foreach (var item in _allItems)
            item.PropertyChanged += OnItemPropertyChanged;

        // 构造期间抑制保存:补建“已完成”分组、迁移旧数据时不应触发写盘，
        // 否则会在选中分组尚未恢复时把 SelectedGroupId 覆盖为 null.
        _suppressSave = true;
        EnsureAllUncompletedGroup();
        EnsureCompletedGroup();
        EnsureQuadrantGroup();
        EnsureTagBoardGroup();
        HealViewGroups();            // 自愈历史脏数据:去重视图分组 + 清理与视图分组同名的孤儿普通分组
        AssignDefaultGroupIcons();   // 旧数据(无图标)按类型/名称补默认图标
        InitDefaultGroupIconsOnce(); // 首次启动:强制标准分组用默认图标(修正旧的随手选)
        MigrateCompletedItems();
        MigrateNonePriority();
        _suppressSave = false;
        // 启动时按缩进重算父子关系一次,使旧数据/手动编辑的层级保持一致
        RecomputeParents();

        SortOptions = new List<SortOption>
        {
            new("S.Sort.Custom", SortMode.Custom),
            new("S.Sort.DueDate", SortMode.DueDate),
            new("S.Sort.Priority", SortMode.Priority),
            new("S.Sort.Completed", SortMode.Completed),
            new("S.Sort.Created", SortMode.Created),
            new("S.Sort.Title", SortMode.Title),
        };
        selectedSortOption = SortOptions.FirstOrDefault(o => o.Mode == _data.Sort) ?? SortOptions[0];

        // 语言:从持久化恢复,并订阅切换事件以刷新动态生成的文案(App 启动时会显式 Apply 一次)
        currentLanguage = string.IsNullOrWhiteSpace(_data.Language) ? LanguageManager.Chinese : _data.Language;
        Languages = LanguageManager.AllLanguages();
        selectedLanguage = Languages.FirstOrDefault(l => l.Key == currentLanguage) ?? Languages[0];
        LanguageManager.LanguageChanged += OnLanguageChanged;

        // 恢复上次选中的分组(null 表示“全部任务”)
        selectedGroup = _data.SelectedGroupId.HasValue
            ? Groups.FirstOrDefault(g => g.Id == _data.SelectedGroupId.Value)
            : null;

        Items = new ObservableCollection<TodoItem>();
        RefreshItems();
        RefreshGroupCounts();

        // 便签模块(v1.2.0):独立 VM，持有便签集合与正文编辑
        NotesVm = new NotesViewModel(this, _data);
        // 仅当确有选中便签时才恢复便签视图(选中便签可能已被删除)
        isNotesViewOpen = _data.NotesViewOpen && NotesVm.SelectedNote != null;
        RefreshSidebarSelection();   // 启动态的侧栏色块:统一入口一次算清(待办/便签两侧)

        // 首次启动:默认注册开机自启动(仅执行一次，之后尊重用户在设置里的手动开关)
        EnsureFirstRunStartup();

        // 选中分组已恢复，此时统一保存一次，持久化补建的“已完成”分组与迁移结果
        SaveData();

        // 倒计时定时器:每 30 秒刷新一次，让“剩 N 小时 M 分钟”随时间推进自动更新
        _countdownTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _countdownTimer.Tick += (_, _) =>
        {
            var now = DateTime.Now;
            // ToList 防止提醒回调中可能修改集合导致的枚举异常
            foreach (var item in _allItems.ToList())
            {
                item.RefreshDueState();
                CheckReminder(item, now);
            }
            // 紧急判定依赖“逾期/今天/临近”,跨日或临界时需重新装桶,使卡片自动换格
            if (IsQuadrantSelected) RefreshQuadrants();
        };
        _countdownTimer.Start();
    }

    #region 绑定属性

    public ObservableCollection<TodoGroup> Groups { get; }

    /// <summary>侧栏分组区视图(「所有待办」+ 普通分组,不含「已完成」——后者在侧栏单独成行).</summary>
    public ICollectionView SidebarGroups { get; }

    /// <summary>当前界面显示(已过滤+排序)的任务集合，绑定到任务列表并支持拖拽.</summary>
    public ObservableCollection<TodoItem> Items { get; }

    /// <summary>四象限·立即处理(重要&紧急).仅四象限视图使用.</summary>
    public ObservableCollection<TodoItem> QuadrantQ1 { get; } = new();
    /// <summary>四象限·计划安排(重要&不紧急).</summary>
    public ObservableCollection<TodoItem> QuadrantQ2 { get; } = new();
    /// <summary>四象限·委派他人(不重要&紧急).</summary>
    public ObservableCollection<TodoItem> QuadrantQ3 { get; } = new();
    /// <summary>四象限·可删除(不重要&不紧急).</summary>
    public ObservableCollection<TodoItem> QuadrantQ4 { get; } = new();

    /// <summary>四象限拖拽处理器(同象限内重排,绑定到四个象限 ListBox).</summary>
    public QuadrantDropHandler QuadDropHandler { get; }

    /// <summary>标签看板的列集合(每个标签一列 + 末尾「无标签」列).</summary>
    public ObservableCollection<TagColumnVm> TagColumns { get; } = new();

    /// <summary>标签看板拖拽处理器(同列重排 / 跨列改标签).</summary>
    public TagBoardDropHandler TagDropHandler { get; }

    public List<SortOption> SortOptions { get; }

    /// <summary>新任务优先级下拉选项(默认中;不再提供“无”).</summary>
    public List<PriorityOption> PriorityOptions { get; } = new()
    {
        new("S.PriorityOpt.Low", Priority.Low),
        new("S.PriorityOpt.Medium", Priority.Medium),
        new("S.PriorityOpt.High", Priority.High),
    };

    /// <summary>新任务的常用快捷时间(点击即设为“此刻 + 间隔”).</summary>
    public List<QuickTimeOption> QuickTimeOptions { get; } = new()
    {
        new("S.Quick.5m", 5),
        new("S.Quick.10m", 10),
        new("S.Quick.30m", 30),
        new("S.Quick.1h", 60),
        new("S.Quick.2h", 120),
        new("S.Quick.5h", 300),
        new("S.Quick.1d", 1440),
        new("S.Quick.2d", 2880),
        new("S.Quick.5d", 7200),
        new("S.Quick.1w", 10080),
    };

    /// <summary>自定义时间用:小时 0–23.</summary>
    public List<int> Hours { get; } = Enumerable.Range(0, 24).ToList();

    /// <summary>自定义时间用:分钟 0–59(精确到分钟).</summary>
    public List<int> Minutes { get; } = Enumerable.Range(0, 60).ToList();

    /// <summary>可选主题列表(内置 + 自定义，可运行时增减).</summary>
    public ObservableCollection<ThemeInfo> Themes { get; }

    /// <summary>主题选择窗口用的分组数据源(常用置顶 + 各风格分组).随语言/选择/新增刷新.</summary>
    public ObservableCollection<ThemeGroupVm> ThemeGroups { get; } = new();

    /// <summary>可选字体列表(供设置面板下拉，Display 随语言刷新).</summary>
    public ObservableCollection<FontInfo> Fonts { get; }

    [ObservableProperty]
    private TodoGroup? selectedGroup;

    [ObservableProperty]
    private SortOption selectedSortOption = null!;

    [ObservableProperty]
    private string currentTheme = ThemeManager.Light;

    [ObservableProperty]
    private ThemeInfo selectedTheme = null!;

    /// <summary>正文/任务文字字体(设置里下拉选择，持久化).</summary>
    [ObservableProperty]
    private string fontFamily = FontManager.SystemDefault;

    /// <summary>设置面板里当前选中的字体项(变更后回写 <see cref="FontFamily"/>).</summary>
    [ObservableProperty]
    private FontInfo selectedFont = null!;

    /// <summary>正文/任务文字基准字号(设置里滑块调整，持久化).</summary>
    [ObservableProperty]
    private double fontSize = 14;

    /// <summary>行距倍率(设置里滑块调整，同时影响文字行高与任务行间距，持久化).</summary>
    [ObservableProperty]
    private double lineSpacing = 1.0;

    /// <summary>勾选框圆环直径(设置里滑块调整，默认≈字号+2，持久化).</summary>
    [ObservableProperty]
    private double checkboxSize = 14;

    /// <summary>左侧分组栏宽度(GridSplitter 拖动 + 持久化).</summary>
    [ObservableProperty]
    private double sidebarWidth = 113;

    /// <summary>底部输入栏高度(GridSplitter 拖动 + 持久化).</summary>
    [ObservableProperty]
    private double inputBarHeight = 40;

    /// <summary>右侧日程面板宽度(GridSplitter 拖动 + 持久化).</summary>
    [ObservableProperty]
    private double scheduleWidth = 300;

    /// <summary>右侧日程面板是否展开(持久化).</summary>
    [ObservableProperty]
    private bool scheduleOpen;

    /// <summary>左侧分组栏是否折叠隐藏.</summary>
    [ObservableProperty]
    private bool sidebarCollapsed;

    /// <summary>窗口是否始终置于顶层(右键标题栏切换，持久化).</summary>
    [ObservableProperty]
    private bool alwaysOnTop;

    /// <summary>完成任务时是否播放烟花庆祝特效(默认开启，持久化).</summary>
    [ObservableProperty]
    private bool effectsEnabled = true;

    /// <summary>完成任务时是否播放音效(默认关闭，持久化).</summary>
    [ObservableProperty]
    private bool soundEnabled;

    /// <summary>窗口贴边自动隐藏的边(0=未贴边，1=上，2=左，3=右).视图层维护，持久化以便下次启动恢复.</summary>
    [ObservableProperty]
    private int dockEdge;

    /// <summary>
    /// 任务被勾选“完成”的瞬间触发(此时尚未移入“已完成”分组).
    /// 视图层据此播放“滑出 + 烟花”动画，动画结束再回调 <see cref="FinishCompletion"/> 真正移动.
    /// </summary>
    public event Action<TodoItem>? TaskCompleting;

    /// <summary>
    /// 周期提醒触发(达到下一次提醒时刻，且任务未完成).视图层据此弹出托盘气泡 / 播放提示音.
    /// </summary>
    public event Action<TodoItem>? ReminderTriggered;

    /// <summary>
    /// 新任务已添加并刷新到列表后触发.视图层据此对新任务卡片播放"淡入 + 上移"进场动画.
    /// </summary>
    public event Action<TodoItem>? TaskAdded;

    /// <summary>周期提醒是否播放提示音(默认开启，持久化).</summary>
    [ObservableProperty]
    private bool reminderSoundEnabled = true;

    /// <summary>是否启用自动检查更新(默认开启，持久化).关闭后启动与每小时定时都不再自动检查.</summary>
    [ObservableProperty]
    private bool autoUpdateEnabled = true;

    /// <summary>日历是否显示国内法定节假日(默认开启，持久化).联网获取并本地缓存.</summary>
    [ObservableProperty]
    private bool showHolidays = true;

    /// <summary>待办勾选圈是否不显示优先级颜色(改用任务前置色块).持久化.</summary>
    [ObservableProperty]
    private bool showPriorityBlock;

    partial void OnShowPriorityBlockChanged(bool value) => SaveData();

    /// <summary>四象限「重要」是否仅含「高」优先级(false=高+中均重要).持久化;变更后重算象限.</summary>
    [ObservableProperty]
    private bool quadrantImportantHighOnly;

    partial void OnQuadrantImportantHighOnlyChanged(bool value)
    {
        if (IsQuadrantSelected) RefreshQuadrants();
        SaveData();
    }

    /// <summary>四象限「紧急」是否纳入「3 天内到期」(false=仅逾期/今天).持久化;变更后重算象限.</summary>
    [ObservableProperty]
    private bool quadrantUrgentIncludeSoon;

    partial void OnQuadrantUrgentIncludeSoonChanged(bool value)
    {
        if (IsQuadrantSelected) RefreshQuadrants();
        SaveData();
    }

    /// <summary>显示节假日开关变化时:持久化 + 通知日历重渲染.</summary>
    public event Action? HolidaysVisibilityChanged;

    /// <summary>
    /// 请求中央区进场动画(true=便签视图,false=任务列表).视图层订阅后播放 IntroScaleFade,
    /// 覆盖 待办↔待办、便签↔便签、待办↔便签 全部切换(各路径仅触发一次,无重复动画).
    /// </summary>
    public event Action<bool>? CentralViewAnimate;

    /// <summary>便签模块 VM(构造尾段创建;此前 _allItems 的事件回调里须用 ?. 访问).</summary>
    public NotesViewModel? NotesVm { get; private set; }

    /// <summary>中央区域是否处于便签视图(任务列表 ↔ 便签互斥切换，持久化).</summary>
    [ObservableProperty]
    private bool isNotesViewOpen;

    partial void OnIsNotesViewOpenChanged(bool value) => SaveData();

    /// <summary>新任务输入框文本.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(AddTaskCommand))]
    private string newTaskTitle = string.Empty;

    /// <summary>新任务的截止日期(可选).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NewTaskDueDisplay))]
    [NotifyPropertyChangedFor(nameof(NewTaskDueButtonText))]
    [NotifyPropertyChangedFor(nameof(HasNewTaskDue))]
    private DateTime? newTaskDueDate;

    /// <summary>新任务已选截止时间的友好文案(未选则为提示).</summary>
    public string NewTaskDueDisplay =>
        NewTaskDueDate.HasValue ? NewTaskDueDate.Value.ToString("MM-dd HH:mm") : Loc.T("S.NoTimeSet");

    /// <summary>新任务“截止时间”按钮上的显示文案(未选时显示提示，已选则显示具体时间).</summary>
    public string NewTaskDueButtonText =>
        NewTaskDueDate.HasValue ? NewTaskDueDate.Value.ToString("MM-dd HH:mm") : Loc.T("S.ChooseDueTime");

    /// <summary>新任务是否已选截止时间.</summary>
    public bool HasNewTaskDue => NewTaskDueDate.HasValue;

    /// <summary>自定义时间:日期部分(默认今天).</summary>
    [ObservableProperty]
    private DateTime newTaskCustomDate = DateTime.Today;

    /// <summary>自定义时间:小时.</summary>
    [ObservableProperty]
    private int newTaskCustomHour = DateTime.Now.Hour;

    /// <summary>自定义时间:分钟.</summary>
    [ObservableProperty]
    private int newTaskCustomMinute;

    /// <summary>新任务的优先级(默认中).</summary>
    [ObservableProperty]
    private Priority newTaskPriority = Priority.Medium;

    /// <summary>新任务是否开启周期提醒.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NewTaskReminderButtonText))]
    private bool newTaskReminderEnabled;

    /// <summary>新任务的周期提醒间隔(分钟)，默认 30 分钟.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NewTaskReminderButtonText))]
    private int newTaskReminderInterval = 30;

    /// <summary>自定义周期提醒输入框中的数值.</summary>
    [ObservableProperty]
    private int newTaskReminderCustomValue = 30;

    /// <summary>自定义周期提醒的单位(以分钟倍率标识:分钟=1/小时=60/天=1440/周=10080).</summary>
    [ObservableProperty]
    private int newTaskReminderCustomUnitMinutes = 1;

    /// <summary>新任务“周期提醒”按钮上的显示文案(未启用时显示提示，已启用则显示间隔).</summary>
    public string NewTaskReminderButtonText
    {
        get
        {
            if (!NewTaskReminderEnabled) return Loc.T("S.ChooseReminder");
            int m = Math.Max(1, NewTaskReminderInterval);
            if (m >= 10080 && m % 10080 == 0) return Loc.F("S.Fmt.EveryWeeks", m / 10080);
            if (m >= 1440 && m % 1440 == 0) return Loc.F("S.Fmt.EveryDays", m / 1440);
            if (m >= 60 && m % 60 == 0) return Loc.F("S.Fmt.EveryHours", m / 60);
            return Loc.F("S.Fmt.EveryMinutes", m);
        }
    }

    /// <summary>周期提醒自定义单位下拉框可选项(分钟/小时/天/周).</summary>
    public List<ReminderUnitOption> ReminderUnits { get; } = new()
    {
        new("S.Unit.Minute", 1),
        new("S.Unit.Hour", 60),
        new("S.Unit.Day", 1440),
        new("S.Unit.Week", 10080),
    };

    /// <summary>新任务的父待办 Id(可选).选择后新任务将作为该待办的子待办创建.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNewTaskParent))]
    private Guid? newTaskParentId;

    /// <summary>新任务是否已选择父待办.</summary>
    public bool HasNewTaskParent => NewTaskParentId.HasValue;

    /// <summary>新任务选择的标签 Id(null=无标签).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(NewTaskTagDisplay))]
    private Guid? newTaskTagId;

    /// <summary>新任务标签选择按钮的显示文案(标签名 / 「无标签」).</summary>
    public string NewTaskTagDisplay =>
        (NewTaskTagId.HasValue ? Groups.FirstOrDefault(g => g.Id == NewTaskTagId.Value)?.Name : null)
        ?? Loc.T("S.Tag.Untagged");

    /// <summary>新建待办标签选择器的候选标签(全部普通标签).</summary>
    public IEnumerable<TodoGroup> TagOptions => NormalTagGroups;

    /// <summary>可作为父待办的候选任务列表(排除已完成的任务).</summary>
    public IEnumerable<TodoItem> ParentCandidates => _allItems.Where(i => !i.IsCompleted);

    /// <summary>当前是否选中“全部任务”.</summary>
    public bool IsAllSelected => SelectedGroup == null;

    /// <summary>当前是否选中“已完成”分组(侧栏「已完成」独立行高亮用).</summary>
    public bool IsCompletedSelected => SelectedGroup?.IsCompletedGroup == true;

    /// <summary>当前是否选中“四象限”视图(用于内容区在普通列表与 2×2 象限面板间切换).</summary>
    public bool IsQuadrantSelected => SelectedGroup?.IsQuadrantGroup == true;

    /// <summary>当前是否选中“标签看板”视图.</summary>
    public bool IsTagBoardSelected => SelectedGroup?.IsTagBoardGroup == true;

    /// <summary>当前是否为“看板类”视图(四象限 / 标签看板):普通任务列表与排序按钮隐藏.</summary>
    public bool IsBoardSelected => IsQuadrantSelected || IsTagBoardSelected;

    /// <summary>右侧标题:当前分组名 / “全部任务”(内置分组用本地化显示名).</summary>
    public string CurrentTitle => SelectedGroup?.DisplayName ?? Loc.T("S.AllTasks");

    /// <summary>排序按钮 ToolTip(“排序：xxx”).</summary>
    public string SortTooltip => Loc.F("S.Fmt.SortTooltip", SelectedSortOption?.Label ?? string.Empty);

    // ===== 语言切换 =====

    /// <summary>可选语言列表(中文 / English).</summary>
    public List<LanguageInfo> Languages { get; } = null!;

    /// <summary>当前语言 Key(zh-CN / en).</summary>
    [ObservableProperty]
    private string currentLanguage = LanguageManager.Chinese;

    /// <summary>当前选中的语言项(绑定到 ☰ 菜单).</summary>
    [ObservableProperty]
    private LanguageInfo selectedLanguage = null!;

    /// <summary>当前是否为中文(用于 ☰ 菜单打勾).</summary>
    public bool IsChineseSelected => CurrentLanguage == LanguageManager.Chinese;

    /// <summary>当前是否为英文(用于 ☰ 菜单打勾).</summary>
    public bool IsEnglishSelected => CurrentLanguage == LanguageManager.English;

    /// <summary>内置“已完成”分组.</summary>
    public TodoGroup? CompletedGroup => Groups.FirstOrDefault(g => g.IsCompletedGroup);

    /// <summary>内置“所有待办”分组(聚合视图，不存任务).</summary>
    public TodoGroup? AllUncompletedGroup => Groups.FirstOrDefault(g => g.IsAllUncompletedGroup);

    /// <summary>内置“四象限”视图分组(派生视图，不存任务).</summary>
    public TodoGroup? QuadrantGroup => Groups.FirstOrDefault(g => g.IsQuadrantGroup);

    /// <summary>内置“标签看板”视图分组(派生视图，不存任务).</summary>
    public TodoGroup? TagBoardGroup => Groups.FirstOrDefault(g => g.IsTagBoardGroup);

    /// <summary>所有“普通标签”(排除全部内置视图分组)，按 OrderIndex 顺序(看板列拖动只改 OrderIndex,故这里据此排序).</summary>
    public IEnumerable<TodoGroup> NormalTagGroups => Groups.Where(g => !g.IsSpecialGroup).OrderBy(g => g.OrderIndex);

    /// <summary>取某任务所属的标签(普通分组);找不到=无标签返回 null.</summary>
    public TodoGroup? TagOf(TodoItem item) =>
        Groups.FirstOrDefault(g => !g.IsSpecialGroup && g.Id == item.GroupId);

    /// <summary>第一个可作为新任务归属的普通标签.</summary>
    private TodoGroup? FirstNormalGroup => Groups.FirstOrDefault(g => !g.IsSpecialGroup);

    /// <summary>右键「移动到标签」子菜单的候选标签(排除全部内置视图分组)，按 OrderIndex 顺序.</summary>
    public IEnumerable<TodoGroup> MoveTargetGroups => Groups.Where(g => !g.IsSpecialGroup).OrderBy(g => g.OrderIndex);

    public string DataFilePath => _dataService.FilePath;

    #endregion

    #region 属性变化联动

    partial void OnSelectedGroupChanged(TodoGroup? value)
    {
        // 选择任意分组即退出便签视图:清空选中便签(经 OnNoteSelected 切回任务列表)
        if (NotesVm?.SelectedNote != null) NotesVm.SelectedNote = null;
        IsNotesViewOpen = false;

        OnPropertyChanged(nameof(IsAllSelected));
        OnPropertyChanged(nameof(IsCompletedSelected));
        OnPropertyChanged(nameof(IsQuadrantSelected));
        OnPropertyChanged(nameof(IsTagBoardSelected));
        OnPropertyChanged(nameof(IsBoardSelected));
        OnPropertyChanged(nameof(CurrentTitle));
        RefreshItems();
        RefreshSidebarSelection();
        SaveData();
        CentralViewAnimate?.Invoke(false);   // 待办↔待办、便签→待办 切换的进场动画
    }

    /// <summary>便签选中变化时由 NotesVm 调用:有便签→显示编辑器,无→切回任务列表;并持久化选中便签 id.</summary>
    public void OnNoteSelected(Note? note)
    {
        IsNotesViewOpen = note != null;   // OnIsNotesViewOpenChanged 会 SaveData
        RefreshSidebarSelection();
        SaveData();                       // 切换同为便签时 IsNotesViewOpen 不变,这里兜底持久化 SelectedNoteId
        if (note != null) CentralViewAnimate?.Invoke(true);   // 待办→便签、便签↔便签 切换的进场动画
    }

    /// <summary>
    /// 侧栏选中色块的唯一计算入口(单一数据源).整个侧栏(所有待办/普通分组/已完成/便签/便签分组)
    /// 同一时刻只点亮一个色块,展开与折叠(窄条)共用同一份标志:
    ///  - 便签视图:任务侧全部熄灭;仅选中便签 IsActive=true(其分组折叠时由分组头/文件夹兜底,见 XAML);
    ///  - 任务视图:仅当前分组 IsHighlighted=true;普通分组被「所有待办」折叠隐藏时,色块落到「所有待办」.
    /// 视图层一律绑定 IsHighlighted / IsActive / HasActiveNote,不依赖任何 ListBox 的 IsSelected.
    /// </summary>
    public void RefreshSidebarSelection()
    {
        // 侧栏只剩内置视图入口(所有待办/已完成/四象限/标签看板);各自独立行绑 IsHighlighted.
        TodoGroup? target = IsNotesViewOpen ? null : (SelectedGroup ?? AllUncompletedGroup);
        foreach (var g in Groups) g.IsHighlighted = ReferenceEquals(g, target);
        NotesVm?.RefreshSelection(IsNotesViewOpen);
    }

    partial void OnSelectedSortOptionChanged(SortOption value)
    {
        OnPropertyChanged(nameof(SortTooltip));
        RefreshItems();
        SaveData();
    }

    partial void OnSelectedThemeChanged(ThemeInfo value)
    {
        if (value == null) return;
        CurrentTheme = value.Key;
        ThemeManager.Apply(value.Key);
        TrackThemeUsage(value.Key);
        RebuildThemeGroups();   // 常用分组随当前主题/最近使用实时更新
        SaveData();
    }

    /// <summary>记录主题最近使用:置于队首并去重，限长 30.</summary>
    private void TrackThemeUsage(string key)
    {
        _data.ThemeUsageOrder.RemoveAll(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        _data.ThemeUsageOrder.Insert(0, key);
        if (_data.ThemeUsageOrder.Count > 30)
            _data.ThemeUsageOrder.RemoveRange(30, _data.ThemeUsageOrder.Count - 30);
    }

    /// <summary>常用分组无历史时的默认热门主题(跨风格各取一)。</summary>
    private static readonly string[] DefaultCommon =
        { "Light", "Dark", "Nord", "Slate", "Morandi1", "Macaron1", "Dunhuang1", "Mondrian1", "Memphis1" };

    /// <summary>重建主题分组数据源:常用置顶(当前主题 + 最近使用最多 9 个) + 各风格分组.</summary>
    public void RebuildThemeGroups()
    {
        var all = ThemeManager.AllThemes();
        var byKey = new Dictionary<string, ThemeInfo>(StringComparer.OrdinalIgnoreCase);
        foreach (var t in all) byKey[t.Key] = t;

        ThemeGroups.Clear();

        // —— 常用:当前主题置顶 + 最近使用(去重) + 默认热门兜底，共 10 个 ——
        var commonKeys = new List<string>();
        void AddCommon(string k)
        {
            if (string.IsNullOrEmpty(k) || !byKey.ContainsKey(k)) return;
            if (commonKeys.Any(x => string.Equals(x, k, StringComparison.OrdinalIgnoreCase))) return;
            commonKeys.Add(k);
        }
        AddCommon(CurrentTheme);
        foreach (var k in _data.ThemeUsageOrder) { if (commonKeys.Count >= 10) break; AddCommon(k); }
        foreach (var k in DefaultCommon) { if (commonKeys.Count >= 10) break; AddCommon(k); }

        // —— 收藏:置于最前(在"常用"之前)。始终显示;为空时由 UI 展示"右键收藏"提示文字。 ——
        var favItems = _data.FavoriteThemeKeys
            .Where(k => byKey.ContainsKey(k))
            .Select(k => new ThemeSwatchVm(byKey[k], IsCurrentTheme(k)))
            .ToList();
        ThemeGroups.Add(new ThemeGroupVm(ThemeManager.GroupDisplay(ThemeManager.FavoritesGroup), favItems, isFavorites: true));

        // —— 常用:当前主题置顶 + 最近使用(去重) ——
        if (commonKeys.Count > 0)
        {
            var items = commonKeys.Select(k => new ThemeSwatchVm(byKey[k], IsCurrentTheme(k)));
            ThemeGroups.Add(new ThemeGroupVm(ThemeManager.GroupDisplay(ThemeManager.CommonGroup), items));
        }

        // —— 各风格分组按既定顺序 ——
        foreach (var g in ThemeManager.GroupOrder)
        {
            var inGroup = all.Where(t => string.Equals(t.Group, g, StringComparison.OrdinalIgnoreCase)).ToList();
            if (inGroup.Count == 0) continue;
            var items = inGroup.Select(t => new ThemeSwatchVm(t, IsCurrentTheme(t.Key)));
            ThemeGroups.Add(new ThemeGroupVm(ThemeManager.GroupDisplay(g), items));
        }
    }

    private bool IsCurrentTheme(string key) => string.Equals(key, CurrentTheme, StringComparison.OrdinalIgnoreCase);

    partial void OnSelectedFontChanged(FontInfo value)
    {
        if (value == null) return;
        FontFamily = value.Key;   // 触发 OnFontFamilyChanged 实际应用并持久化
    }

    partial void OnFontFamilyChanged(string value)
    {
        FontManager.Apply(FontFamily, FontSize, LineSpacing, CheckboxSize);
        SaveData();
    }

    partial void OnFontSizeChanged(double value)
    {
        FontManager.Apply(FontFamily, FontSize, LineSpacing, CheckboxSize);
        SaveData();
    }

    partial void OnLineSpacingChanged(double value)
    {
        FontManager.Apply(FontFamily, FontSize, LineSpacing, CheckboxSize);
        SaveData();
    }

    partial void OnCheckboxSizeChanged(double value)
    {
        FontManager.Apply(FontFamily, FontSize, LineSpacing, CheckboxSize);
        SaveData();
    }

    /// <summary>
    /// 恢复默认设置:把「外观 + 行为开关 + 布局尺寸 + 待办/便签排版」一并还原为产品默认。
    /// 经各属性 setter 触发即时应用 + 持久化。**不动**语言,以及便签/分组/任务等用户数据
    /// (SelectedGroup / Sort / IsNotesViewOpen / DockEdge / 开机自启动 亦保持不变)。
    /// </summary>
    public void ResetDefaultSettings()
    {
        // —— 待办区字体:更新下拉选中项(级联回写 FontFamily 并应用) ——
        var font = Fonts.FirstOrDefault(f => f.Key == DefaultFontFamily) ?? Fonts[0];
        SelectedFont = font;
        FontFamily = font.Key;       // 兜底:即便选中项未变也确保字体被应用
        FontSize = DefaultFontSize;
        LineSpacing = DefaultLineSpacing;
        CheckboxSize = DefaultCheckboxSize;

        // —— 便签排版(收集箱设置) ——
        if (NotesVm != null)
        {
            NotesVm.SelectedNoteFont = font;        // 级联回写 NoteFontFamily
            NotesVm.NoteFontFamily = DefaultFontFamily;
            NotesVm.NoteFontSize = DefaultFontSize;
            NotesVm.NoteLineSpacing = DefaultLineSpacing;
        }

        // —— 外观 + 行为开关 ——
        var light = Themes.FirstOrDefault(t => t.Key == ThemeManager.Light);
        if (light != null) SelectedTheme = light;   // OnSelectedThemeChanged 应用主题 + 持久化
        EffectsEnabled = true;
        SoundEnabled = false;
        ReminderSoundEnabled = true;
        AutoUpdateEnabled = true;
        ShowHolidays = true;
        ShowPriorityBlock = false;
        QuadrantImportantHighOnly = false;
        QuadrantUrgentIncludeSoon = false;
        AlwaysOnTop = false;

        // —— 布局尺寸 ——
        SidebarWidth = 113;
        InputBarHeight = 40;
        ScheduleWidth = 300;
        ScheduleOpen = false;
        SidebarCollapsed = false;
    }

    /// <summary>
    /// 把便签里选中的文本加入为待办(便签右键「加入到待办」)。多行文本逐行各建一条;
    /// 目标分组取当前选中分组(特殊/空→未分组,归属“所有待办”),与正常新建路径一致刷新保存。
    /// </summary>
    public void AddTaskFromText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        var target = SelectedGroup;
        if (target != null && target.IsCompletedGroup) target = null;
        target ??= AllUncompletedGroup ?? FirstNormalGroup ?? CreateGroupInternal("收件箱");

        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n')
                        .Split('\n')
                        .Select(l => l.Trim())
                        .Where(l => l.Length > 0)
                        .ToList();
        if (lines.Count == 0) return;

        int order = _allItems.Where(i => i.GroupId == target.Id)
                             .Select(i => i.OrderIndex).DefaultIfEmpty(-1).Max() + 1;

        TodoItem? last = null;
        foreach (var line in lines)
        {
            var item = new TodoItem
            {
                Title = line.Length > 200 ? line[..200] : line,
                GroupId = target.Id,
                Priority = Priority.Medium,
                OrderIndex = order++,
                CreatedAt = DateTime.Now,
            };
            _allItems.Add(item);
            item.PropertyChanged += OnItemPropertyChanged;
            last = item;
        }

        RecomputeParents();
        RefreshItems();
        RefreshGroupCounts();
        OnPropertyChanged(nameof(ParentCandidates));
        SaveData();
        if (last != null) TaskAdded?.Invoke(last);
    }

    partial void OnSelectedLanguageChanged(LanguageInfo value)
    {
        if (value == null) return;
        CurrentLanguage = value.Key;
        LanguageManager.Apply(value.Key);   // 触发 LanguageChanged -> OnLanguageChanged 刷新动态文案
        SaveData();
    }

    partial void OnCurrentLanguageChanged(string value)
    {
        OnPropertyChanged(nameof(IsChineseSelected));
        OnPropertyChanged(nameof(IsEnglishSelected));
    }

    /// <summary>语言切换后:刷新所有由 C# 动态生成的文案(静态 XAML 由 DynamicResource 自动更新).</summary>
    private void OnLanguageChanged()
    {
        foreach (var o in SortOptions) o.RefreshLabel();
        foreach (var o in PriorityOptions) o.RefreshLabel();
        foreach (var o in QuickTimeOptions) o.RefreshLabel();
        foreach (var o in ReminderUnits) o.RefreshLabel();
        foreach (var g in Groups) g.RefreshDisplayName();
        OnPropertyChanged(nameof(NewTaskTagDisplay));   // 「无标签」按钮文案随语言刷新
        if (IsTagBoardSelected) RefreshTagBoard();      // 看板「无标签」列标题随语言刷新

        // 内置主题名随语言切换:重建列表并按 Key 复位选中项(ThemeInfo 为不可变 record)
        var selectedKey = SelectedTheme?.Key;
        Themes.Clear();
        foreach (var t in ThemeManager.AllThemes())
            Themes.Add(t);
        var reselected = Themes.FirstOrDefault(t => t.Key == selectedKey);
        if (reselected != null) SelectedTheme = reselected;
        RebuildThemeGroups();   // 分组标题/主题名随语言刷新

        // 字体显示名随语言切换:重建列表并按 Key 复位选中项(FontInfo 为不可变 record)
        var selectedFontKey = SelectedFont?.Key;
        Fonts.Clear();
        foreach (var f in FontManager.AllFonts())
            Fonts.Add(f);
        var reFont = Fonts.FirstOrDefault(f => f.Key == selectedFontKey);
        if (reFont != null) SelectedFont = reFont;

        OnPropertyChanged(nameof(CurrentTitle));
        OnPropertyChanged(nameof(SortTooltip));
        OnPropertyChanged(nameof(NewTaskDueDisplay));
        OnPropertyChanged(nameof(NewTaskDueButtonText));
        OnPropertyChanged(nameof(NewTaskReminderButtonText));

        // 任务行倒计时文案随语言变化重新生成
        foreach (var item in _allItems) item.RefreshDueState();
    }

    partial void OnSidebarWidthChanged(double value) => SaveData();
    partial void OnInputBarHeightChanged(double value) => SaveData();
    partial void OnScheduleWidthChanged(double value) => SaveData();
    partial void OnScheduleOpenChanged(bool value) => SaveData();
    partial void OnSidebarCollapsedChanged(bool value) => SaveData();
    partial void OnAlwaysOnTopChanged(bool value) => SaveData();
    partial void OnEffectsEnabledChanged(bool value) => SaveData();
    partial void OnSoundEnabledChanged(bool value) => SaveData();
    partial void OnReminderSoundEnabledChanged(bool value) => SaveData();
    partial void OnAutoUpdateEnabledChanged(bool value) => SaveData();
    partial void OnDockEdgeChanged(int value) => SaveData();

    partial void OnShowHolidaysChanged(bool value)
    {
        SaveData();
        if (value) _ = EnsureHolidaysAsync();   // 开启时确保数据已联网就绪
        HolidaysVisibilityChanged?.Invoke();     // 通知日历重渲染
    }

    // ===== 节假日(联网获取 + 本地缓存近十年，每天最多刷新一次) =====
    private Dictionary<DateTime, string> _holidays = new();

    /// <summary>缓存覆盖的年数:当年 + 次年(共两年).更远年份官方尚未公布、数据集为空,拉了也没用;
    /// 次年数据(年底前通常为空)由"每天刷新一次"在官方公布后自动补上.</summary>
    private const int HolidayYearSpan = 2;

    /// <summary>法定放假日 → 节日名称(当年+次年合并，仅含 isOffDay=true 的放假日，不含调休补班).</summary>
    public IReadOnlyDictionary<DateTime, string> Holidays => _holidays;

    /// <summary>把缓存中各年 JSON 合并解析为放假日字典(供日历查询).</summary>
    private void RebuildHolidays()
    {
        var merged = new Dictionary<DateTime, string>();
        foreach (var kv in _data.HolidayCacheByYear)
            foreach (var d in HolidayService.ParseOffDays(kv.Value))
                merged[d.Key] = d.Value;
        _holidays = merged;
    }

    /// <summary>
    /// 联网刷新节假日:**每天最多一次**(按 HolidayLastRefreshDate 判定).刷新时拉取当年起十年的数据，
    /// 逐年更新缓存(成功才覆盖)、丢弃过期年份，并持久化 + 触发日历重渲染.
    /// 联网失败静默保留已有缓存，不影响使用;全部失败则不更新刷新日期，下次启动再试.
    /// </summary>
    private bool _holidayRefreshing;   // 防重入(启动触发 + 开关切换可能并发)

    public async Task EnsureHolidaysAsync()
    {
        if (_holidayRefreshing) return;
        string today = DateTime.Today.ToString("yyyy-MM-dd");
        if (_data.HolidayLastRefreshDate == today) return;   // 今天已刷新过

        _holidayRefreshing = true;
        try
        {
            int startYear = DateTime.Today.Year;
            bool any = false;
            for (int y = startYear; y < startYear + HolidayYearSpan; y++)
            {
                var raw = await HolidayService.FetchRawAsync(y);
                if (!string.IsNullOrEmpty(raw)) { _data.HolidayCacheByYear[y] = raw; any = true; }
            }
            if (!any) return;   // 全部联网失败:保留旧缓存、不记刷新日期(下次再试)

            // 丢弃范围外年份(过期的、或超出覆盖跨度的)，控制缓存体积
            foreach (var y in _data.HolidayCacheByYear.Keys
                         .Where(k => k < startYear || k >= startYear + HolidayYearSpan).ToList())
                _data.HolidayCacheByYear.Remove(y);

            _data.HolidayLastRefreshDate = today;
            RebuildHolidays();
            SaveData();
            HolidaysVisibilityChanged?.Invoke();
        }
        catch
        {
            // 联网/解析任何异常都不应影响应用:静默保留已有缓存
        }
        finally
        {
            _holidayRefreshing = false;
        }
    }

    /// <summary>"拖拽到日历设置截止时间"一次性功能提示是否已展示过(读写即持久化).</summary>
    public bool CalendarDragHintShown
    {
        get => _data.CalendarDragHintShown;
        set { _data.CalendarDragHintShown = value; SaveData(); }
    }

    /// <summary>用户选择“此版本不再提示”的版本号(持久化).自动检查命中该版本时静默跳过.</summary>
    public string IgnoredUpdateVersion
    {
        get => _data.IgnoredUpdateVersion;
        set
        {
            if (_data.IgnoredUpdateVersion == value) return;
            _data.IgnoredUpdateVersion = value ?? "";
            SaveData();
        }
    }

    #endregion

    #region 任务命令

    private bool CanAddTask() => !string.IsNullOrWhiteSpace(NewTaskTitle);

    [RelayCommand(CanExecute = nameof(CanAddTask))]
    private void AddTask()
    {
        // 目标标签判定(GroupId 现在存“标签 id”，Guid.Empty = 无标签):
        //  - 有父待办 → 跟随父的标签(子待办与父同标签);
        //  - 否则 → 新建时选择的标签 NewTaskTagId;未选则无标签(Guid.Empty)。
        int indentLevel = 0;
        TodoItem? parent = NewTaskParentId.HasValue
            ? _allItems.FirstOrDefault(i => i.Id == NewTaskParentId.Value)
            : null;

        Guid targetGroupId;
        if (parent != null)
        {
            indentLevel = Math.Min(parent.IndentLevel + 1, 6);
            targetGroupId = parent.GroupId;
        }
        else
        {
            var tag = NewTaskTagId.HasValue
                ? Groups.FirstOrDefault(g => !g.IsSpecialGroup && g.Id == NewTaskTagId.Value)
                : null;
            targetGroupId = tag?.Id ?? Guid.Empty;
        }

        // 计算插入位置:有父待办时插到“父及其全部子孙”之后(紧贴父待办下方)，否则追加到同标签末尾。
        int orderIndex;
        if (parent != null)
        {
            int insertAfter = parent.OrderIndex;
            foreach (var d in GetDescendants(parent))
                if (d.GroupId == targetGroupId && d.OrderIndex > insertAfter)
                    insertAfter = d.OrderIndex;

            _suppressSave = true;
            foreach (var sib in _allItems.Where(i => i.GroupId == targetGroupId && i.OrderIndex > insertAfter))
                sib.OrderIndex++;
            _suppressSave = false;

            orderIndex = insertAfter + 1;
        }
        else
        {
            orderIndex = _allItems.Where(i => i.GroupId == targetGroupId)
                                  .Select(i => i.OrderIndex)
                                  .DefaultIfEmpty(-1).Max() + 1;
        }

        var item = new TodoItem
        {
            Title = NewTaskTitle.Trim(),
            GroupId = targetGroupId,
            DueDate = NewTaskDueDate,
            Priority = NewTaskPriority,
            OrderIndex = orderIndex,
            CreatedAt = DateTime.Now,
            ReminderEnabled = NewTaskReminderEnabled,
            ReminderIntervalMinutes = NewTaskReminderInterval,
            LastRemindedAt = NewTaskReminderEnabled ? DateTime.Now : null,
            ParentId = NewTaskParentId,
            IndentLevel = indentLevel
        };

        _allItems.Add(item);
        item.PropertyChanged += OnItemPropertyChanged;

        NewTaskTitle = string.Empty;
        NewTaskDueDate = null;
        NewTaskPriority = Priority.Medium;
        NewTaskReminderEnabled = false;
        NewTaskReminderInterval = 30;
        NewTaskParentId = null;
        NewTaskTagId = null;

        // 添加子待办后展开父待办,确保新子项立即可见
        if (parent != null) parent.IsCollapsed = false;

        RecomputeParents();
        RefreshItems();
        RefreshGroupCounts();
        OnPropertyChanged(nameof(ParentCandidates));
        SaveData();
        TaskAdded?.Invoke(item);
    }

    /// <summary>标签看板容器内「+ 添加」:用指定标签(null=无标签)建一条默认待办.</summary>
    public void AddTaskToTag(TodoGroup? tag, string title)
    {
        if (string.IsNullOrWhiteSpace(title)) return;
        Guid gid = (tag != null && !tag.IsSpecialGroup) ? tag.Id : Guid.Empty;
        int orderIndex = _allItems.Where(i => i.GroupId == gid)
                                  .Select(i => i.OrderIndex).DefaultIfEmpty(-1).Max() + 1;
        var item = new TodoItem
        {
            Title = title.Trim(),
            GroupId = gid,
            Priority = Priority.Medium,
            OrderIndex = orderIndex,
            CreatedAt = DateTime.Now,
        };
        _allItems.Add(item);
        item.PropertyChanged += OnItemPropertyChanged;

        RecomputeParents();
        RefreshItems();
        RefreshGroupCounts();
        OnPropertyChanged(nameof(ParentCandidates));
        SaveData();
        TaskAdded?.Invoke(item);
    }

    /// <summary>用快捷选项设置新任务截止时间(相对当前时间，精确到分钟).</summary>
    [RelayCommand]
    private void SetNewTaskQuickTime(object? minutes)
    {
        if (minutes is QuickTimeOption qt)
        {
            NewTaskDueDate = DateTime.Now.AddMinutes(qt.Minutes);
        }
        else if (minutes is int m)
        {
            NewTaskDueDate = DateTime.Now.AddMinutes(m);
        }
        else if (minutes is string s && int.TryParse(s, out var mi))
        {
            NewTaskDueDate = DateTime.Now.AddMinutes(mi);
        }
    }

    /// <summary>用自定义日期 + 时分设置新任务截止时间(精确到分钟).</summary>
    [RelayCommand]
    private void ApplyCustomTime()
    {
        NewTaskDueDate = NewTaskCustomDate.Date
            .AddHours(NewTaskCustomHour)
            .AddMinutes(NewTaskCustomMinute);
    }

    /// <summary>清除新任务的截止时间.</summary>
    [RelayCommand]
    private void ClearNewTaskDue() => NewTaskDueDate = null;

    /// <summary>清除新任务的父待办.</summary>
    [RelayCommand]
    private void ClearNewTaskParent() => NewTaskParentId = null;

    /// <summary>按快捷分钟数为新任务设置周期提醒(分钟为单位的整数,通过 XAML CommandParameter 传入).</summary>
    [RelayCommand]
    private void SetNewTaskReminderQuick(object? minutes)
    {
        int m = ParseMinutes(minutes);
        if (m <= 0) return;
        NewTaskReminderEnabled = true;
        NewTaskReminderInterval = m;
    }

    /// <summary>按自定义数值 + 单位为新任务设置周期提醒.</summary>
    [RelayCommand]
    private void ApplyCustomReminder()
    {
        int mult = Math.Max(1, NewTaskReminderCustomUnitMinutes);   // 1/60/1440/10080
        int total = Math.Max(1, NewTaskReminderCustomValue) * mult;
        NewTaskReminderEnabled = true;
        NewTaskReminderInterval = total;
    }

    /// <summary>清除新任务的周期提醒.</summary>
    [RelayCommand]
    private void ClearNewTaskReminder()
    {
        NewTaskReminderEnabled = false;
        NewTaskReminderInterval = 30;
    }

    // ===== 选了即设定:自定义截止时间 / 周期提醒在用户调整选项时自动应用，无需再点"设定"按钮 =====
    // (字段初始化器不会触发 OnChanged，故启动/重置时不会误设；清除按钮不改这些字段，故不会被反弹回填)
    partial void OnNewTaskCustomDateChanged(DateTime value) => ApplyCustomTime();
    partial void OnNewTaskCustomHourChanged(int value) => ApplyCustomTime();
    partial void OnNewTaskCustomMinuteChanged(int value) => ApplyCustomTime();
    partial void OnNewTaskReminderCustomValueChanged(int value) => ApplyCustomReminder();
    partial void OnNewTaskReminderCustomUnitMinutesChanged(int value) => ApplyCustomReminder();

    private static int ParseMinutes(object? raw)
    {
        if (raw is int i) return i;
        if (raw is string s && int.TryParse(s, out var v)) return v;
        return 0;
    }

    [RelayCommand]
    private void DeleteTask(TodoItem? item)
    {
        if (item == null) return;
        item.PropertyChanged -= OnItemPropertyChanged;
        _allItems.Remove(item);
        Items.Remove(item);
        // 同步清除任何把它当父待办的子待办的 ParentId
        foreach (var child in _allItems.Where(i => i.ParentId == item.Id).ToList())
            child.ParentId = null;
        RefreshGroupCounts();
        OnPropertyChanged(nameof(ParentCandidates));
        SaveData();
    }

    [RelayCommand]
    private void ToggleComplete(TodoItem? item)
    {
        if (item == null) return;
        item.IsCompleted = !item.IsCompleted; // 触发 OnItemPropertyChanged -> 自动保存
    }

    /// <summary>统一应用任务编辑(任务内容 + 截止时间 + 优先级)，由右键编辑对话框回填.</summary>
    public void ApplyTaskEdits(TodoItem item, DateTime? due, Priority priority, string? title = null)
    {
        if (item == null) return;
        if (!string.IsNullOrWhiteSpace(title))
            item.Title = title.Trim();   // 触发 OnTitleChanged + 自动保存
        item.DueDate = due;        // 触发 OnDueDateChanged + 自动保存
        item.Priority = priority;  // 触发 OnPriorityChanged + 自动保存
        RefreshItems();
    }

    /// <summary>设置了截止日期的全部任务(供日程/日历视图按日期聚合展示).</summary>
    public IEnumerable<TodoItem> DatedTasks => _allItems.Where(i => i.DueDate.HasValue);

    /// <summary>
    /// 把任务移动到指定分组(右键「移动到分组」).不支持移动到内置“已完成”分组；
    /// 若任务原本已完成(位于“已完成”分组)，移动到普通分组即视为取消完成.
    /// </summary>
    public void MoveTaskToGroup(TodoItem? item, TodoGroup? target)
    {
        if (item == null || target == null) return;
        // “已完成”是视图分组，不能作为真实归属;
        // “所有待办”允许作为目标 —— 表示把任务移出普通分组、设为“未分组”(归属所有待办组本身)。
        if (target.IsCompletedGroup) return;
        if (item.GroupId == target.Id && !item.IsCompleted) return;

        _suppressSave = true;
        if (item.IsCompleted)
            item.IsCompleted = false;   // 离开“已完成”分组即视为未完成
        item.OriginalGroupId = null;
        item.GroupId = target.Id;
        // 追加到目标分组末尾，保持自定义排序稳定
        item.OrderIndex = _allItems.Where(i => i.GroupId == target.Id && i != item)
                                   .Select(i => i.OrderIndex)
                                   .DefaultIfEmpty(-1).Max() + 1;
        _suppressSave = false;

        RefreshItems();
        RefreshGroupCounts();
        SaveData();
    }

    /// <summary>清除某个任务的截止日期(右键菜单).</summary>
    [RelayCommand]
    private void ClearDueDate(TodoItem? item)
    {
        if (item == null) return;
        item.DueDate = null;
        RefreshItems();
    }

    /// <summary>增加缩进:把任务降一级，成为上一条的子待办(最多 6 级).</summary>
    [RelayCommand]
    private void IndentTask(TodoItem? item) => ChangeIndent(item, +1);

    /// <summary>减少缩进:把子待办提升一级.</summary>
    [RelayCommand]
    private void OutdentTask(TodoItem? item) => ChangeIndent(item, -1);

    /// <summary>调整任务缩进层级(delta 为 +1/-1),同步重算父子关系并持久化.</summary>
    public void ChangeIndent(TodoItem? item, int delta)
    {
        if (item == null) return;
        int v = Math.Clamp(item.IndentLevel + delta, 0, 6);
        if (v == item.IndentLevel) return;
        item.IndentLevel = v;       // 触发 OnItemPropertyChanged -> SaveData
        RecomputeParents();         // 父子关系完全由缩进 + 顺序决定
        RefreshItems();
        SaveData();
    }

    /// <summary>
    /// 根据每项的 IndentLevel 与同分组内的 OrderIndex 顺序,
    /// 重算所有任务的 ParentId(父 = 自己之前最近一个 IndentLevel == 自己-1 的同分组任务).
    /// </summary>
    private void RecomputeParents()
    {
        _suppressSave = true;
        try
        {
            foreach (var grp in Groups)
            {
                // 已完成分组聚合了多个原分组的家庭，OrderIndex 互相碰撞;若在此按位置重派生
                // ParentId，会把子待办错误重挂到无关项。完成的家庭迁入时父子关系已正确，应冻结。
                if (grp.IsCompletedGroup || grp.IsAllUncompletedGroup || grp.IsQuadrantGroup) continue;

                var groupItems = _allItems.Where(i => i.GroupId == grp.Id)
                                           .OrderBy(i => i.OrderIndex)
                                           .ToList();
                var stack = new List<TodoItem>();
                foreach (var it in groupItems)
                {
                    while (stack.Count > 0 && stack[^1].IndentLevel >= it.IndentLevel)
                        stack.RemoveAt(stack.Count - 1);
                    Guid? newParent = (it.IndentLevel == 0 || stack.Count == 0)
                                      ? null : stack[^1].Id;
                    if (it.ParentId != newParent) it.ParentId = newParent;
                    stack.Add(it);
                }
            }
        }
        finally
        {
            _suppressSave = false;
        }
    }

    /// <summary>切换某个任务的周期提醒开关(右键菜单).</summary>
    [RelayCommand]
    private void ToggleReminder(TodoItem? item)
    {
        if (item == null) return;
        item.ReminderEnabled = !item.ReminderEnabled;
        item.LastRemindedAt = item.ReminderEnabled ? DateTime.Now : null;
    }

    #endregion

    #region 导入 / 导出 Markdown

    /// <summary>把当前全部分组与任务导出为 Markdown 文本.</summary>
    public string BuildMarkdown() => MarkdownService.Export(Groups, _allItems);

    /// <summary>从 Markdown 文本导入任务，按分组归类并追加.返回成功导入的任务条数.</summary>
    public int ImportMarkdown(string markdown)
    {
        var tasks = MarkdownService.Parse(markdown);
        if (tasks.Count == 0) return 0;

        _suppressSave = true;
        var completed = CompletedGroup;

        foreach (var t in tasks)
        {
            // 归类到分组:与“已完成”/“所有待办”同名的标题回落到普通分组；其余按名称找/建普通分组
            TodoGroup grp;
            bool isBuiltInName =
                (completed != null && string.Equals(t.Group, completed.Name, StringComparison.Ordinal))
                || string.Equals(t.Group, "所有待办", StringComparison.Ordinal);
            if (isBuiltInName)
                grp = FirstNormalGroup ?? CreateGroupInternal("收件箱");
            else
                grp = Groups.FirstOrDefault(g => !g.IsCompletedGroup && !g.IsAllUncompletedGroup && g.Name == t.Group)
                      ?? CreateGroupInternal(t.Group);

            int nextIndex = _allItems.Where(i => i.GroupId == grp.Id)
                                     .Select(i => i.OrderIndex)
                                     .DefaultIfEmpty(-1).Max() + 1;

            var item = new TodoItem
            {
                Title = t.Title,
                IndentLevel = t.Indent,
                OrderIndex = nextIndex,
                CreatedAt = DateTime.Now,
                IsCompleted = t.Completed,
                GroupId = grp.Id
            };

            // 已完成任务移入“已完成”分组，记录原分组以便取消完成时还原
            if (t.Completed && completed != null)
            {
                item.OriginalGroupId = grp.Id;
                item.GroupId = completed.Id;
            }

            _allItems.Add(item);
            item.PropertyChanged += OnItemPropertyChanged;
        }

        _suppressSave = false;
        RecomputeParents();
        RefreshItems();
        RefreshGroupCounts();
        SaveData();
        return tasks.Count;
    }

    #endregion

    #region 分组命令

    [RelayCommand]
    private void SelectAll() => SelectedGroup = null;

    /// <summary>折叠 / 展开左侧分组栏.</summary>
    [RelayCommand]
    private void ToggleSidebar() => SidebarCollapsed = !SidebarCollapsed;

    /// <summary>
    /// 新建分组(右键任意分组触发):建一个默认名分组并进入内联重命名态。
    /// 若侧边栏折叠先展开;若“所有待办”处于折叠态(普通分组被隐藏)先展开，确保新分组可见。
    /// </summary>
    [RelayCommand]
    private void AddGroup()
    {
        if (SidebarCollapsed) SidebarCollapsed = false;
        if (AllUncompletedGroup is { IsCollapsed: true } all) all.IsCollapsed = false;

        var g = CreateGroupInternal(Loc.T("S.Group.NewName"));
        SelectedGroup = g;        // 自动切到新分组
        g.IsEditing = true;       // 立即进入内联重命名
        RefreshGroupCounts();
        SaveData();
    }

    /// <summary>开始重命名分组(右键菜单):置内联编辑态。内置“所有待办/已完成”不可重命名。</summary>
    [RelayCommand]
    private void RenameGroup(TodoGroup? group)
    {
        if (group == null || group.IsSpecialGroup) return;   // 内置视图分组不可重命名
        group.IsEditing = true;
    }

    /// <summary>结束标签内联编辑(回车/失焦):空名兜底为默认名，刷新看板列头/列表 chip 并保存。</summary>
    public void EndEditGroup(TodoGroup? group)
    {
        if (group == null) return;
        group.IsEditing = false;
        if (string.IsNullOrWhiteSpace(group.Name))
            group.Name = Loc.T("S.Group.NewName");
        else
            group.Name = group.Name.Trim();
        group.RefreshDisplayName();
        OnPropertyChanged(nameof(TagOptions));
        OnPropertyChanged(nameof(NewTaskTagDisplay));
        RefreshItems();   // 刷新列表 chip 与标签看板列头
        SaveData();
    }

    /// <summary>折叠/展开分组(右键菜单):用于“所有待办”收起其下普通分组列表。</summary>
    [RelayCommand]
    private void ToggleGroupCollapse(TodoGroup? group)
    {
        if (group == null) return;
        group.IsCollapsed = !group.IsCollapsed;
        RefreshSidebarSelection();   // 折叠把选中分组藏起来时,色块落到「所有待办」;展开则归还
        SaveData();
    }

    private TodoGroup CreateGroupInternal(string name)
    {
        var g = new TodoGroup
        {
            Name = name,
            OrderIndex = Groups.Count,
            Color = Palette[Groups.Count % Palette.Length],
            Icon = GroupIcons.IconForName(name)
        };
        Groups.Add(g);
        return g;
    }

    /// <summary>新建一个标签(标签选择器的「+」):指定名称与可选图标字形，返回新标签并持久化。</summary>
    public TodoGroup CreateTag(string name, string? glyph = null)
    {
        string nm = string.IsNullOrWhiteSpace(name) ? Loc.T("S.Group.NewName") : name.Trim();
        // 同名标签直接复用,避免重复「新建」产生多个同名标签容器
        var existing = NormalTagGroups.FirstOrDefault(t => string.Equals(t.Name, nm, StringComparison.CurrentCultureIgnoreCase));
        if (existing != null) return existing;
        var g = new TodoGroup
        {
            Name = nm,
            OrderIndex = Groups.Count,
            Color = Palette[Groups.Count % Palette.Length],
            Icon = string.IsNullOrEmpty(glyph) ? GroupIcons.IconForName(nm) : glyph
        };
        Groups.Add(g);
        OnPropertyChanged(nameof(TagOptions));
        if (IsTagBoardSelected) RefreshTagBoard();
        SaveData();
        return g;
    }

    [RelayCommand]
    private void DeleteGroup(TodoGroup? group)
    {
        // 内置视图分组(所有待办/已完成/四象限/标签看板)不可删
        if (group == null || group.IsSpecialGroup) return;

        // 删标签:其下任务转为「无标签」(GroupId=Empty)，不删任务
        _suppressSave = true;
        foreach (var i in _allItems.Where(i => i.GroupId == group.Id).ToList())
            i.GroupId = Guid.Empty;
        _suppressSave = false;

        Groups.Remove(group);
        if (NewTaskTagId == group.Id) NewTaskTagId = null;
        OnPropertyChanged(nameof(TagOptions));

        if (SelectedGroup == group)
        {
            SelectedGroup = null;   // 触发刷新
        }
        else
        {
            RefreshItems();
            RefreshGroupCounts();
            if (IsTagBoardSelected) RefreshTagBoard();
        }
        SaveData();
    }

    /// <summary>清空分组:删除该分组下的所有任务，但保留分组本身(右键菜单).</summary>
    [RelayCommand]
    private void ClearGroup(TodoGroup? group)
    {
        if (group == null || group.IsAllUncompletedGroup) return;   // 聚合视图不含真实任务

        var toRemove = _allItems.Where(i => i.GroupId == group.Id).ToList();
        if (toRemove.Count == 0) return;

        foreach (var i in toRemove)
        {
            i.PropertyChanged -= OnItemPropertyChanged;
            _allItems.Remove(i);
        }

        RefreshItems();
        RefreshGroupCounts();
        SaveData();
    }

    /// <summary>修改分组颜色(右键菜单).</summary>
    public void SetGroupColor(TodoGroup? group, string hex)
    {
        if (group == null || string.IsNullOrWhiteSpace(hex)) return;
        group.Color = hex;
        SaveData();
    }

    /// <summary>修改分组图标为内置字形(同时清除自定义图片).</summary>
    public void SetGroupIcon(TodoGroup? group, string glyph)
    {
        if (group == null || string.IsNullOrEmpty(glyph)) return;
        group.Icon = glyph;
        group.IconImage = "";   // 切回字形图标
        RefreshItems();         // 刷新列表 chip 与标签看板列头
        SaveData();
    }

    /// <summary>修改分组图标为自定义导入的图片(路径已复制到 group-icons 目录).</summary>
    public void SetGroupIconImage(TodoGroup? group, string path)
    {
        if (group == null || string.IsNullOrEmpty(path)) return;
        group.IconImage = path;
        RefreshItems();
        SaveData();
    }

    /// <summary>为缺图标的分组分配默认图标:聚合=列表、已完成=完成、其余按名称关键词(工作/学习/生活…)。</summary>
    private void AssignDefaultGroupIcons()
    {
        foreach (var g in Groups)
        {
            if (!string.IsNullOrEmpty(g.Icon)) continue;   // 保留用户已选图标
            g.Icon = g.IsAllUncompletedGroup ? GroupIcons.AllTodos
                   : g.IsCompletedGroup ? GroupIcons.Completed
                   : GroupIcons.IconForName(g.Name);
        }
    }

    /// <summary>
    /// 一次性初始化标准分组(所有待办/已完成/工作/学习/生活)的默认图标:
    /// 旧版本里这些分组可能带着随手选的图标，本方法首次启动时强制改回默认图标，之后用户自选不再覆盖。
    /// </summary>
    private void InitDefaultGroupIconsOnce()
    {
        if (_data.GroupIconsInitialized) return;
        foreach (var g in Groups)
        {
            if (g.IsAllUncompletedGroup) g.Icon = GroupIcons.AllTodos;
            else if (g.IsCompletedGroup) g.Icon = GroupIcons.Completed;
            else if (g.Name is "工作" or "学习" or "生活") g.Icon = GroupIcons.IconForName(g.Name);
        }
        _data.GroupIconsInitialized = true;
    }

    #endregion

    #region 拖拽排序 (IDropTarget)

    public void DragOver(IDropInfo dropInfo)
    {
        bool taskMove = dropInfo.Data is TodoItem && dropInfo.TargetItem is TodoItem;
        bool groupMove = dropInfo.Data is TodoGroup && dropInfo.TargetItem is TodoGroup;

        // 把任务拖到左侧某个分组上 -> 移动归属(普通分组=归入;“所有待办”=移出分组设为未分组;“已完成”不可)
        if (dropInfo.Data is TodoItem && dropInfo.TargetItem is TodoGroup g
            && !g.IsCompletedGroup)
        {
            IsDragging = true;
            dropInfo.DropTargetAdorner = DropTargetAdorners.Highlight;   // 高亮目标分组
            dropInfo.Effects = DragDropEffects.Move;
            return;
        }

        if (taskMove || groupMove)
        {
            // DragOver 在拖拽过程中持续触发,作为兜底标记拖拽态(防止刷新重建 Items 残留鬼影)
            IsDragging = true;
            dropInfo.DropTargetAdorner = DropTargetAdorners.Insert;
            dropInfo.Effects = DragDropEffects.Move;
        }
    }

    public void Drop(IDropInfo dropInfo)
    {
        // 任务拖到左侧分组 -> 移动归属(复用右键“移动到分组”的逻辑,已处理刷新/保存/取消完成)
        if (dropInfo.Data is TodoItem dragged && dropInfo.TargetItem is TodoGroup targetGroup)
        {
            IsDragging = false;
            MoveTaskToGroup(dragged, targetGroup);
            return;
        }
        if (dropInfo.Data is TodoItem item) { DropTask(item, dropInfo); return; }
        if (dropInfo.Data is TodoGroup group) { DropGroup(group, dropInfo); return; }
    }

    private void DropTask(TodoItem source, IDropInfo dropInfo)
    {
        int oldIndex = Items.IndexOf(source);
        int newIndex = dropInfo.InsertIndex;
        if (oldIndex < 0) return;
        if (newIndex > oldIndex) newIndex--;   // 移除原项后目标索引前移
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= Items.Count) newIndex = Items.Count - 1;

        // 水平为主的拖拽 -> 修改层级:右拖降级(+1)、左拖升级(-1)，不做纵向重排.
        // 横向位移换算到列表坐标系，与缩进步长(IndentToMarginConverter.Step=22)对齐.
        if (newIndex == oldIndex)
        {
            const double indentStep = 22.0;
            double dx = HorizontalDragDelta(dropInfo);
            if (Math.Abs(dx) >= indentStep)
            {
                int delta = (int)(dx / indentStep);
                if (delta == 0) delta = dx > 0 ? 1 : -1;
                ChangeIndent(source, delta);
            }
            return;   // 原地拖拽(无纵向移动)不重排
        }

        Items.Move(oldIndex, newIndex);

        // 把当前可见顺序写回 OrderIndex 持久化(先抑制逐项保存)
        _suppressSave = true;
        for (int i = 0; i < Items.Count; i++)
            Items[i].OrderIndex = i;
        _suppressSave = false;

        // 顺序变化可能影响父子关系(同分组内前后位置变了 -> ParentId 可能变)
        RecomputeParents();

        // 切换为自定义排序:若 SortMode 发生变化会触发 RefreshItems(按 OrderIndex)+SaveData，
        // 顺序与当前一致；若本就是自定义排序则不触发，下方再显式保存一次兜底.
        SelectedSortOption = SortOptions.First(o => o.Mode == SortMode.Custom);

        // 显式补刷:父子关系变化后需重算 HasChildren，使父待办折叠箭头立即出现
        // (本就是自定义排序时上面赋值不触发刷新)。拖拽进行中会经 _pendingRefresh 在拖拽结束时补刷.
        RefreshItems();

        SaveData();
    }

    /// <summary>拖动重排左侧分组顺序，并写回 OrderIndex 持久化.</summary>
    private void DropGroup(TodoGroup source, IDropInfo dropInfo)
    {
        int oldIndex = Groups.IndexOf(source);
        int newIndex = dropInfo.InsertIndex;
        if (oldIndex < 0) return;
        if (newIndex > oldIndex) newIndex--;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= Groups.Count) newIndex = Groups.Count - 1;
        if (newIndex == oldIndex) return;

        Groups.Move(oldIndex, newIndex);
        for (int i = 0; i < Groups.Count; i++)
            Groups[i].OrderIndex = i;

        SaveData();
    }

    /// <summary>拖拽过程中相对起点的横向位移(换算到放置目标列表坐标系);用于判定左右拖动改层级.</summary>
    private static double HorizontalDragDelta(IDropInfo dropInfo)
    {
        try
        {
            if (dropInfo.DragInfo?.VisualSource is Visual src && dropInfo.VisualTarget is Visual tgt)
            {
                var startInTarget = src.TransformToVisual(tgt).Transform(dropInfo.DragInfo.DragStartPosition);
                return dropInfo.DropPosition.X - startInTarget.X;
            }
        }
        catch { /* 坐标变换异常时按无横向位移处理 */ }
        return 0;
    }

    #endregion

    #region 内部辅助

    private void SeedDefaultsIfEmpty()
    {
        if (_data.Groups.Count > 0) return;

        // 顺序:所有待办 → 工作 → 学习 → 生活 → 已完成
        _data.Groups.Add(new TodoGroup
        {
            Name = "所有待办",
            OrderIndex = 0,
            Color = "#6366F1",
            Icon = GroupIcons.AllTodos,
            IsAllUncompletedGroup = true
        });

        string[] defaults = { "工作", "学习", "生活" };
        for (int i = 0; i < defaults.Length; i++)
        {
            _data.Groups.Add(new TodoGroup
            {
                Name = defaults[i],
                OrderIndex = i + 1,
                Color = Palette[i % Palette.Length],
                Icon = GroupIcons.IconForName(defaults[i])
            });
        }

        _data.Groups.Add(new TodoGroup
        {
            Name = "已完成",
            OrderIndex = defaults.Length + 1,
            Color = "#16A34A",
            Icon = GroupIcons.Completed,
            IsCompletedGroup = true
        });

        _data.Groups.Add(new TodoGroup
        {
            Name = "四象限",
            OrderIndex = defaults.Length + 2,
            Color = "#7C72F6",
            Icon = GroupIcons.Quadrant,
            IsQuadrantGroup = true
        });

        _data.Groups.Add(new TodoGroup
        {
            Name = "标签",
            OrderIndex = defaults.Length + 3,
            Color = "#0EA5E9",
            Icon = GroupIcons.TagBoard,
            IsTagBoardGroup = true
        });
    }

    /// <summary>确保始终存在唯一的“所有待办”分组(旧数据升级时补建)，并置于最前.</summary>
    private void EnsureAllUncompletedGroup()
    {
        if (Groups.Any(g => g.IsAllUncompletedGroup)) return;

        var g = new TodoGroup
        {
            Name = "所有待办",
            OrderIndex = -1,        // 置顶
            Color = "#6366F1",
            Icon = GroupIcons.AllTodos,
            IsAllUncompletedGroup = true
        };
        Groups.Insert(0, g);
        // 重排其它分组的 OrderIndex，保持稳定顺序
        for (int i = 0; i < Groups.Count; i++) Groups[i].OrderIndex = i;
    }

    /// <summary>确保始终存在唯一的“已完成”分组(旧数据升级时补建)，并置于末尾.</summary>
    private void EnsureCompletedGroup()
    {
        if (Groups.Any(g => g.IsCompletedGroup)) return;

        var g = new TodoGroup
        {
            Name = "已完成",
            OrderIndex = Groups.Count,
            Color = "#16A34A",
            Icon = GroupIcons.Completed,
            IsCompletedGroup = true
        };
        Groups.Add(g);
        // 注意:构造期间不在此保存，避免覆盖尚未恢复的选中分组；由构造末尾统一保存.
    }

    /// <summary>确保始终存在唯一的“四象限”视图分组(旧数据升级时补建)，并置于“已完成”之后(末尾).</summary>
    private void EnsureQuadrantGroup()
    {
        if (Groups.Any(g => g.IsQuadrantGroup)) return;

        var g = new TodoGroup
        {
            Name = "四象限",
            OrderIndex = Groups.Count,
            Color = "#7C72F6",
            Icon = GroupIcons.Quadrant,
            IsQuadrantGroup = true
        };
        Groups.Add(g);
        // 构造期间不在此保存(同 EnsureCompletedGroup),由构造末尾统一保存.
    }

    /// <summary>确保始终存在唯一的“标签看板”视图分组(旧数据升级时补建)，置于末尾.</summary>
    private void EnsureTagBoardGroup()
    {
        if (Groups.Any(g => g.IsTagBoardGroup)) return;

        var g = new TodoGroup
        {
            Name = "标签",
            OrderIndex = Groups.Count,
            Color = "#0EA5E9",
            Icon = GroupIcons.TagBoard,
            IsTagBoardGroup = true
        };
        Groups.Add(g);
    }

    /// <summary>
    /// 自愈历史脏数据(避免标签看板冒出"标签看板/四象限"这类伪标签容器、侧栏多出分组):
    /// ① 每种内置视图分组(所有待办/已完成/四象限/标签)只保留一个,多余的视图分组(不存任务)删除;
    /// ② 清理"孤儿"——不是视图分组、但名字撞上视图分组保留名的普通分组(历史迁移遗留),
    ///    其下任务先转为「无标签」(GroupId=Empty)再删,任务不丢。
    /// </summary>
    private void HealViewGroups()
    {
        void DedupeFlag(Func<TodoGroup, bool> hasFlag)
        {
            var flagged = Groups.Where(hasFlag).ToList();
            for (int i = 1; i < flagged.Count; i++) Groups.Remove(flagged[i]);
        }
        DedupeFlag(g => g.IsAllUncompletedGroup);
        DedupeFlag(g => g.IsCompletedGroup);
        DedupeFlag(g => g.IsQuadrantGroup);
        DedupeFlag(g => g.IsTagBoardGroup);

        // 这些是内置视图分组用过的默认名,普通标签不会(也不应)叫这些 —— 同名且非视图分组的即历史孤儿。
        // 不含"标签"(它是标签看板视图分组的当前默认名,避免误删用户真叫「标签」的标签)。
        var reserved = new HashSet<string> { "所有待办", "已完成", "四象限", "标签看板" };
        foreach (var orphan in Groups.Where(g => !g.IsSpecialGroup && reserved.Contains(g.Name)).ToList())
        {
            foreach (var it in _allItems.Where(i => i.GroupId == orphan.Id).ToList())
                it.GroupId = Guid.Empty;
            Groups.Remove(orphan);
        }
    }

    /// <summary>旧数据迁移:把优先级为 None 的任务统一升级为 Medium(不再保留“无优先级”选项).</summary>
    private void MigrateNonePriority()
    {
        foreach (var item in _allItems)
            if (item.Priority == Priority.None) item.Priority = Priority.Medium;
    }

    /// <summary>旧数据迁移:把已完成但仍留在普通分组的任务移入“已完成”分组.</summary>
    private void MigrateCompletedItems()
    {
        var completed = CompletedGroup;
        if (completed == null) return;

        foreach (var item in _allItems.Where(i => i.IsCompleted && i.GroupId != completed.Id))
        {
            item.OriginalGroupId = item.GroupId;
            item.GroupId = completed.Id;
        }
        // 同样延后到构造末尾统一保存.
    }

    // ===== 便签模块协作入口(NotesViewModel 调用) =====

    /// <summary>按 Id 查找任务(便签任务块经 LinkedTodoId 反查;查不到=链接悬空).</summary>
    public TodoItem? FindItem(Guid id) => _allItems.FirstOrDefault(i => i.Id == id);

    /// <summary>便签内容变化时的保存入口(NotesVm 防抖后调用;SaveData 会经 WriteTo 回写便签数据).</summary>
    public void RequestSaveFromNotes() => SaveData();

    /// <summary>完成状态变化时，在“已完成”分组与原分组之间移动任务.</summary>
    private void MoveForCompletion(TodoItem item)
    {
        var completed = CompletedGroup;
        if (completed == null) return;

        if (item.IsCompleted)
        {
            if (item.GroupId != completed.Id)
            {
                item.OriginalGroupId = item.GroupId;
                item.GroupId = completed.Id;
            }
        }
        else if (item.GroupId == completed.Id)
        {
            var restore = item.OriginalGroupId;
            item.GroupId = (restore.HasValue && Groups.Any(g => g.Id == restore.Value))
                ? restore.Value
                : (FirstNormalGroup?.Id ?? item.GroupId);
            item.OriginalGroupId = null;
        }
    }

    /// <summary>新增自定义主题:注册、持久化、刷新列表并立即应用.</summary>
    public void AddCustomTheme(CustomTheme theme)
    {
        var info = ThemeManager.AddOrUpdateCustom(theme);

        var existing = _data.CustomThemes.FirstOrDefault(t => t.Key == theme.Key);
        if (existing != null) _data.CustomThemes.Remove(existing);
        _data.CustomThemes.Add(theme);

        // 刷新主题列表(保留内置在前)
        Themes.Clear();
        foreach (var t in ThemeManager.AllThemes())
            Themes.Add(t);

        SelectedTheme = Themes.FirstOrDefault(t => t.Key == info.Key) ?? SelectedTheme;
        SaveData();
    }

    /// <summary>取某自定义主题(供编辑器预填)。</summary>
    public CustomTheme? GetCustomTheme(string key) =>
        _data.CustomThemes.FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));

    // ===== 主题收藏(收藏分组 + 拖动排序) =====

    /// <summary>"收藏"分组拖拽重排处理器(供 XAML 绑定，仅收藏分组启用)。</summary>
    public FavoritesDropHandler FavDropHandler { get; }

    /// <summary>该主题是否已收藏。</summary>
    public bool IsFavorite(string key) =>
        _data.FavoriteThemeKeys.Any(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));

    /// <summary>切换收藏:已收藏则移出，否则追加到末尾。刷新分组并持久化。</summary>
    public void ToggleFavorite(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        int idx = _data.FavoriteThemeKeys.FindIndex(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        if (idx >= 0) _data.FavoriteThemeKeys.RemoveAt(idx);
        else _data.FavoriteThemeKeys.Add(key);
        RebuildThemeGroups();
        SaveData();
    }

    /// <summary>把收藏项移动到收藏列表的 insertIndex 处(gong 拖拽落点语义)。</summary>
    public void MoveFavorite(string key, int insertIndex)
    {
        int oldIndex = _data.FavoriteThemeKeys.FindIndex(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));
        if (oldIndex < 0) return;
        if (insertIndex > oldIndex) insertIndex--;     // 移除原项后目标索引前移
        if (insertIndex < 0) insertIndex = 0;
        if (insertIndex >= _data.FavoriteThemeKeys.Count) insertIndex = _data.FavoriteThemeKeys.Count - 1;
        if (insertIndex == oldIndex) return;

        var k = _data.FavoriteThemeKeys[oldIndex];
        _data.FavoriteThemeKeys.RemoveAt(oldIndex);
        _data.FavoriteThemeKeys.Insert(insertIndex, k);
        RebuildThemeGroups();
        SaveData();
    }

    /// <summary>删除一个自定义主题:注销、移除持久化、刷新列表;若删的是当前主题则回退到明亮。</summary>
    public void DeleteCustomTheme(string key)
    {
        if (string.IsNullOrWhiteSpace(key)) return;

        ThemeManager.RemoveCustom(key);
        _data.CustomThemes.RemoveAll(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
        _data.FavoriteThemeKeys.RemoveAll(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));

        bool deletingCurrent = string.Equals(CurrentTheme, key, StringComparison.OrdinalIgnoreCase);

        Themes.Clear();
        foreach (var t in ThemeManager.AllThemes())
            Themes.Add(t);

        if (deletingCurrent)
            SelectedTheme = Themes.FirstOrDefault(t => t.Key == ThemeManager.Light) ?? Themes[0];
        else
            RebuildThemeGroups();   // 非当前主题:仅刷新分组(改当前主题会自动重建)

        SaveData();
    }

    private void RefreshItems()
    {
        // 拖拽进行中切勿重建 Items(Clear/Add 会让拖拽 Adorner 失去宿主容器，
        // 残留为桌面上不可点击的"鬼影")。挂起请求,拖拽结束后补刷.
        if (_isDragging)
        {
            _pendingRefresh = true;
            return;
        }

        // 每次刷新顺带更新 HasChildren / 子任务计数,用于父待办的折叠行"子任务 (n/m)"
        var childrenByParent = _allItems.Where(i => i.ParentId.HasValue)
                                        .GroupBy(i => i.ParentId!.Value)
                                        .ToDictionary(g => g.Key, g => g.ToList());
        foreach (var it in _allItems)
        {
            if (childrenByParent.TryGetValue(it.Id, out var kids))
            {
                it.HasChildren = true;
                it.ChildCount = kids.Count;
                it.CompletedChildCount = kids.Count(k => k.IsCompleted);
            }
            else
            {
                it.HasChildren = false;
                it.ChildCount = 0;
                it.CompletedChildCount = 0;
            }
        }

        // 顺带刷新每条任务的标签 chip(列表里显示标签名/图标/淡色底)
        var tagById = NormalTagGroups.ToDictionary(g => g.Id);
        foreach (var it in _allItems)
        {
            if (tagById.TryGetValue(it.GroupId, out var tg))
            {
                it.TagName = tg.Name;
                it.TagIcon = tg.Icon;
                it.TagColor = tg.Color;
            }
            else
            {
                it.TagName = string.Empty;
                it.TagIcon = string.Empty;
            }
        }

        IEnumerable<TodoItem> query = _allItems;

        if (SelectedGroup != null)
        {
            // “所有待办”是聚合视图:显示“根未完成”的所有家族(含其下已完成子待办)，
            // 与普通分组表现一致——根完成的家族整族已迁入“已完成”分组,自然不出现在此.
            if (SelectedGroup.IsAllUncompletedGroup)
                query = query.Where(i => !RootOf(i).IsCompleted);
            else
                query = query.Where(i => i.GroupId == SelectedGroup.Id);
        }

        // 任一祖先被折叠则隐藏(用于父待办折叠时收起所有子孙)
        query = query.Where(i => !IsHiddenByCollapsedAncestor(i));

        var mode = SelectedSortOption?.Mode ?? SortMode.Custom;

        // 所有分组、所有排序模式都层级化输出:把"根任务"按所选排序键排序，再把每个根的子孙
        // 紧随其后(DFS)。这样无论何种排序，子待办都紧贴父待办、整族连续(新增子任务也立即在父下方)。
        Func<IEnumerable<TodoItem>, IEnumerable<TodoItem>> rootSort = mode switch
        {
            SortMode.DueDate   => r => r.OrderBy(i => i.DueDate ?? DateTime.MaxValue),
            SortMode.Priority  => r => r.OrderByDescending(i => (int)i.Priority).ThenBy(i => i.OrderIndex),
            SortMode.Completed => r => r.OrderBy(i => i.IsCompleted).ThenBy(i => i.OrderIndex),
            SortMode.Created   => r => r.OrderByDescending(i => i.CreatedAt),
            SortMode.Title     => r => r.OrderBy(i => i.Title, StringComparer.CurrentCulture),
            _                  => r => r.OrderBy(i => i.OrderIndex),
        };
        query = OrderHierarchically(query, rootSort);

        // 置顶前移:在上面排序结果之上做一次稳定排序,把"根被置顶"的家族整体浮到最前.
        // OrderByDescending 稳定,保留各分区内已有顺序与整族连续性;无论何种排序模式都生效.
        var ordered = query.ToList();
        ordered = ordered.OrderByDescending(RootIsPinned).ToList();

        Items.Clear();
        foreach (var item in ordered)
            Items.Add(item);

        // 四象限视图:同步重算四格(完成/取消完成/迁移后都会经此刷新,卡片自动进出象限)
        if (IsQuadrantSelected) RefreshQuadrants();
        // 标签看板视图:同步重建各标签列
        if (IsTagBoardSelected) RefreshTagBoard();
    }

    /// <summary>
    /// 重建标签看板:每个普通标签一列 + 末尾固定「无标签」列;每列填该标签下未完成顶层任务(按 OrderIndex).
    /// 标签集合变化(增删/改名/改图标)或任务增删/拖动/完成后调用.
    /// </summary>
    private void RefreshTagBoard()
    {
        TagColumns.Clear();

        var pending = _allItems.Where(i => !i.IsCompleted && i.ParentId == null)
                               .OrderBy(i => i.OrderIndex)
                               .ToList();

        foreach (var tag in NormalTagGroups.OrderBy(g => g.OrderIndex).ToList())
        {
            var col = new TagColumnVm(this, tag);
            foreach (var it in pending.Where(i => i.GroupId == tag.Id))
                col.Items.Add(it);
            TagColumns.Add(col);
        }

        // 「无标签」列:GroupId 不指向任何普通标签的未完成顶层任务。
        // 仅当确有无标签任务时才显示(为空不占一个空容器);位置按持久化的 UntaggedColumnIndex 还原(-1 或越界=末位)。
        var tagIds = NormalTagGroups.Select(g => g.Id).ToHashSet();
        var untagged = pending.Where(i => !tagIds.Contains(i.GroupId)).ToList();
        if (untagged.Count > 0)
        {
            var untaggedCol = new TagColumnVm(this, null);
            foreach (var it in untagged) untaggedCol.Items.Add(it);
            int idx = _data.UntaggedColumnIndex;
            if (idx >= 0 && idx <= TagColumns.Count) TagColumns.Insert(idx, untaggedCol);
            else TagColumns.Add(untaggedCol);
        }
    }

    /// <summary>
    /// 标签看板落点统一入口:同列内→重排;跨列→把任务标签改为目标列标签(「无标签」列=Guid.Empty),重建看板.
    /// </summary>
    public void DropToTag(TodoItem item, ObservableCollection<TodoItem> target, int insertIndex)
    {
        var col = TagColumns.FirstOrDefault(c => ReferenceEquals(c.Items, target));
        if (col == null) return;

        // 同列:仅重排顺序(复用四象限重排算法)
        if (target.Contains(item))
        {
            ReorderQuadrant(target, item, insertIndex);
            return;
        }

        // 跨列:改标签(不动优先级/截止/完成)
        item.GroupId = col.Tag?.Id ?? Guid.Empty;
        RefreshTagBoard();
        SaveData();
    }

    /// <summary>
    /// 看板列拖动中实时跟手:把列(含「无标签」列)移到 newIndex。只动 TagColumns
    /// (ObservableCollection.Move 不重建容器),不写盘;拖动结束由 CommitTagColumnOrder 持久化。
    /// </summary>
    public void MoveTagColumn(TagColumnVm col, int newIndex)
    {
        int old = TagColumns.IndexOf(col);
        newIndex = Math.Clamp(newIndex, 0, Math.Max(0, TagColumns.Count - 1));
        if (old < 0 || newIndex == old) return;
        TagColumns.Move(old, newIndex);
    }

    /// <summary>
    /// 看板列拖动结束:按列的新视觉顺序持久化标签顺序。
    /// **只改各标签的 OrderIndex,绝不改动 Groups 集合的结构**——用 `Groups[i]=x` 这种替换会让
    /// 侧栏那个带过滤的 CollectionView 错乱、把标签泄漏到「所有待办」下面。看板/标签选择器/「移动到标签」
    /// 都改用 OrderIndex 排序(见 NormalTagGroups),故无需重排集合本身。「无标签」列位置记入 UntaggedColumnIndex。
    /// </summary>
    public void CommitTagColumnOrder()
    {
        bool changed = false;

        // 「无标签」列位置
        int untaggedIdx = -1;
        for (int i = 0; i < TagColumns.Count; i++)
            if (TagColumns[i].Tag == null) { untaggedIdx = i; break; }
        if (_data.UntaggedColumnIndex != untaggedIdx)
        {
            _data.UntaggedColumnIndex = untaggedIdx;
            changed = true;
        }

        // 期望的完整顺序:沿用 Groups 现有结构,把"普通标签槽位"依次填入看板列的新顺序,特殊分组保持原位;
        // 仅据此重发 OrderIndex(不动集合,不触发 Replace)。
        var newTagOrder = TagColumns.Where(c => c.Tag != null).Select(c => c.Tag!).ToList();
        if (newTagOrder.Count == Groups.Count(g => !g.IsSpecialGroup))
        {
            int t = 0, order = 0;
            foreach (var g in Groups)
            {
                var target = g.IsSpecialGroup ? g : newTagOrder[t++];
                if (target.OrderIndex != order) { target.OrderIndex = order; changed = true; }
                order++;
            }
            if (changed) OnPropertyChanged(nameof(TagOptions));
        }

        if (changed) SaveData();
    }

    /// <summary>四象限「重要」判定:默认高+中为重要;设置为「仅高」时只有高优先级算重要.</summary>
    private bool IsImportant(TodoItem item) =>
        QuadrantImportantHighOnly ? item.Priority == Priority.High : item.Priority >= Priority.Medium;

    /// <summary>四象限「紧急」判定:已逾期或今天到期为紧急;设置开启「含3天内」时临近(Soon)也算.无截止=不紧急.</summary>
    private bool IsUrgent(TodoItem item)
    {
        var s = item.DueState;
        if (s == DueState.Overdue || s == DueState.Today) return true;
        return QuadrantUrgentIncludeSoon && s == DueState.Soon;
    }

    /// <summary>
    /// 重新把所有未完成任务按(重要/紧急)装入四格.每格内按 OrderIndex 排序,
    /// 拖拽重排通过在格内置换 OrderIndex 持久化.四象限平铺所有未完成项(含子待办,各自独立判定).
    /// </summary>
    private void RefreshQuadrants()
    {
        QuadrantQ1.Clear();
        QuadrantQ2.Clear();
        QuadrantQ3.Clear();
        QuadrantQ4.Clear();

        // 仅顶层(父/根)待办进入四象限:子待办不单独装桶(归在其父任务名下)
        var pending = _allItems.Where(i => !i.IsCompleted && i.ParentId == null)
                               .OrderBy(i => i.OrderIndex)
                               .ToList();
        foreach (var item in pending)
            QuadrantCollectionFor(QuadrantIndexFor(item)).Add(item);
    }

    /// <summary>计算某任务应归入的象限序号(1..4):有手动覆盖用覆盖,否则按重要/紧急派生.</summary>
    private int QuadrantIndexFor(TodoItem item)
    {
        if (item.QuadrantOverride is >= 1 and <= 4) return item.QuadrantOverride.Value;
        bool important = IsImportant(item);
        bool urgent = IsUrgent(item);
        return important ? (urgent ? 1 : 2) : (urgent ? 3 : 4);
    }

    /// <summary>象限序号(1..4) → 对应集合.</summary>
    private ObservableCollection<TodoItem> QuadrantCollectionFor(int index) => index switch
    {
        1 => QuadrantQ1,
        2 => QuadrantQ2,
        3 => QuadrantQ3,
        _ => QuadrantQ4,
    };

    /// <summary>某象限集合 → 序号(1..4);非象限集合返回 0.</summary>
    private int QuadrantIndexOf(ObservableCollection<TodoItem> col)
    {
        if (ReferenceEquals(col, QuadrantQ1)) return 1;
        if (ReferenceEquals(col, QuadrantQ2)) return 2;
        if (ReferenceEquals(col, QuadrantQ3)) return 3;
        if (ReferenceEquals(col, QuadrantQ4)) return 4;
        return 0;
    }

    /// <summary>
    /// 四象限落点统一入口:同格内→重排;跨格→给任务设置手动象限覆盖(不改优先级/截止日期)后重算装桶.
    /// </summary>
    public void DropToQuadrant(TodoItem item, ObservableCollection<TodoItem> target, int insertIndex)
    {
        int targetIndex = QuadrantIndexOf(target);
        if (targetIndex == 0) return;

        // 同格:仅重排顺序
        if (target.Contains(item))
        {
            ReorderQuadrant(target, item, insertIndex);
            return;
        }

        // 跨格:写入手动覆盖(若与自动派生结果相同则清空覆盖,保持"自动"语义),重算装桶
        bool important = IsImportant(item);
        bool urgent = IsUrgent(item);
        int derived = important ? (urgent ? 1 : 2) : (urgent ? 3 : 4);
        item.QuadrantOverride = targetIndex == derived ? (int?)null : targetIndex;
        RefreshQuadrants();
        SaveData();
    }

    /// <summary>
    /// 四象限同格内重排:把 item 移到 insertIndex,并仅在该格成员之间置换它们各自的 OrderIndex
    /// 来持久化新顺序(不改优先级/截止日期,也不扰动其它任务的全局顺序).
    /// </summary>
    public void ReorderQuadrant(ObservableCollection<TodoItem> col, TodoItem item, int insertIndex)
    {
        int oldIndex = col.IndexOf(item);
        if (oldIndex < 0) return;
        if (insertIndex > oldIndex) insertIndex--;          // 移除原项后目标索引前移(gong 落点语义)
        if (insertIndex < 0) insertIndex = 0;
        if (insertIndex >= col.Count) insertIndex = col.Count - 1;
        if (insertIndex == oldIndex) return;

        col.Move(oldIndex, insertIndex);

        // 持久化:取该格现有的 OrderIndex 值集合,按新可视顺序回填(仅子集内置换,不影响其它任务)
        var slots = col.Select(i => i.OrderIndex).OrderBy(x => x).ToList();
        for (int i = 0; i < col.Count; i++) col[i].OrderIndex = slots[i];
        SaveData();
    }

    /// <summary>
    /// 层级排序:把集合按"根(ParentId 为空或父不在集合内)→深度优先输出子孙"排列，
    /// 根与同级子均按 OrderIndex 排序，保证子待办紧贴父待办、整族连续.
    /// </summary>
    private static IEnumerable<TodoItem> OrderHierarchically(
        IEnumerable<TodoItem> items,
        Func<IEnumerable<TodoItem>, IEnumerable<TodoItem>> rootSort)
    {
        var list = items.ToList();
        var idSet = list.Select(i => i.Id).ToHashSet();
        var childrenByParent = list
            .Where(i => i.ParentId.HasValue && idSet.Contains(i.ParentId.Value))
            .GroupBy(i => i.ParentId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(x => x.OrderIndex).ToList());

        // 根任务(无父或父不在当前集合)按调用方提供的排序键排序;子任务始终紧随父并按 OrderIndex
        var roots = rootSort(list
            .Where(i => !i.ParentId.HasValue || !idSet.Contains(i.ParentId.Value)));

        var result = new List<TodoItem>(list.Count);
        var visited = new HashSet<Guid>();
        void Emit(TodoItem node)
        {
            if (!visited.Add(node.Id)) return;   // 防环
            result.Add(node);
            if (childrenByParent.TryGetValue(node.Id, out var kids))
                foreach (var k in kids) Emit(k);
        }
        foreach (var r in roots) Emit(r);
        // 兜底:任何未被纳入(异常数据)的项追加到末尾
        foreach (var it in list) if (!visited.Contains(it.Id)) result.Add(it);
        return result;
    }

    /// <summary>是否任一祖先处于折叠状态(用于在折叠父时隐藏其所有递归子待办).</summary>
    private bool IsHiddenByCollapsedAncestor(TodoItem item)
    {
        var cur = item;
        int safety = 8;   // 防止异常环
        while (cur.ParentId.HasValue && safety-- > 0)
        {
            var parent = _allItems.FirstOrDefault(i => i.Id == cur.ParentId.Value);
            if (parent == null) return false;
            if (parent.IsCollapsed) return true;
            cur = parent;
        }
        return false;
    }

    /// <summary>切换某个父待办的折叠状态(右键菜单 / 折叠箭头按钮).</summary>
    [RelayCommand]
    private void ToggleCollapse(TodoItem? item)
    {
        if (item == null) return;
        item.IsCollapsed = !item.IsCollapsed;
        RefreshItems();
    }

    /// <summary>切换任务置顶.置顶作用于其根祖先,整族随之浮到列表最上方(右键菜单).</summary>
    [RelayCommand]
    private void TogglePin(TodoItem? item)
    {
        if (item == null) return;
        var root = RootOf(item);
        root.IsPinned = !root.IsPinned;
        RefreshItems();
        SaveData();
    }

    /// <summary>沿 ParentId 上溯到根任务(含安全计数防环).</summary>
    private TodoItem RootOf(TodoItem item)
    {
        var cur = item;
        int safety = 8;
        while (cur.ParentId.HasValue && safety-- > 0)
        {
            var parent = _allItems.FirstOrDefault(i => i.Id == cur.ParentId.Value);
            if (parent == null) break;
            cur = parent;
        }
        return cur;
    }

    /// <summary>该项所属家族的根任务是否置顶(用于整族置顶前移).</summary>
    private bool RootIsPinned(TodoItem item) => RootOf(item).IsPinned;

    private void RefreshGroupCounts()
    {
        foreach (var g in Groups)
        {
            if (g.IsAllUncompletedGroup)
                g.ItemCount = _allItems.Count(i => !i.IsCompleted);             // 所有待办:全部未完成
            else if (g.IsQuadrantGroup || g.IsTagBoardGroup)
                g.ItemCount = _allItems.Count(i => !i.IsCompleted && i.ParentId == null);   // 四象限/标签看板:仅顶层未完成
            else if (g.IsCompletedGroup)
                g.ItemCount = _allItems.Count(i => i.GroupId == g.Id);          // 已完成:统计全部
            else
                g.ItemCount = _allItems.Count(i => i.GroupId == g.Id && !i.IsCompleted);
        }
    }

    private void OnItemPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        // 计算属性变化无需保存
        if (e.PropertyName is nameof(TodoItem.DueState)
            or nameof(TodoItem.DueCountdownText)
            or nameof(TodoItem.DueDetailText)
            or nameof(TodoItem.IsOverdue)
            or nameof(TodoItem.HasDueDate)
            or nameof(TodoItem.HasPriority)
            or nameof(TodoItem.HasChildren)
            or nameof(TodoItem.IsEditing)
            // 标签 chip 运行时字段([JsonIgnore],由 RefreshItems 维护):不持久化,变化无需保存
            or nameof(TodoItem.TagName)
            or nameof(TodoItem.TagIcon)
            or nameof(TodoItem.TagColor)
            or nameof(TodoItem.HasTag))
            return;

        // 手动改优先级/截止日期:清空四象限手动覆盖,回归自动归类;并刷新象限视图
        if (e.PropertyName is nameof(TodoItem.Priority) or nameof(TodoItem.DueDate))
        {
            if (sender is TodoItem ti && ti.QuadrantOverride.HasValue) ti.QuadrantOverride = null;
            if (IsQuadrantSelected) RefreshQuadrants();
            SaveData();
            return;
        }

        if (e.PropertyName == nameof(TodoItem.IsCompleted))
        {
            // 整族完成/取消完成期间(连带触发的祖先与子孙)，只保存，不再分支重入
            if (_completingFamily || _uncompletingFamily)
            {
                SaveData();
                return;
            }

            if (sender is TodoItem item && item.IsCompleted)
            {
                // “活子待办”:父存在、未完成 -> 只打钩、不移走;并检查父是否所有子都完成
                bool isLiveChild = item.ParentId.HasValue
                    && _allItems.Any(p => p.Id == item.ParentId.Value && !p.IsCompleted);

                if (isLiveChild)
                {
                    RefreshGroupCounts();
                    RefreshItems();   // 立即重算父待办“n/m”计数并刷新视图(否则 0/2 不会即时变 1/2)
                    SaveData();
                    OnPropertyChanged(nameof(ParentCandidates));
                    CheckParentCompletion(item);
                    return;
                }

                // 父或独立待办勾选:先静默把所有子标记完成，然后让视图播放整族”消失动画 + 烟花”
                MarkDescendantsCompletedSilently(item);
                SaveData();
                OnPropertyChanged(nameof(ParentCandidates));
                TaskCompleting?.Invoke(item);
                return;
            }

            // 取消完成:整族(向上所有祖先 + 向下所有子孙)一并取消完成并移回原分组
            if (sender is TodoItem it)
                UncompleteFamily(it);
            RefreshGroupCounts();
            RefreshItems();
            OnPropertyChanged(nameof(ParentCandidates));
        }

        SaveData();
    }

    /// <summary>静默把某个父的所有后代标记为完成(不触发整族动画;仅用于父手动勾选时联动).</summary>
    private void MarkDescendantsCompletedSilently(TodoItem parent)
    {
        _completingFamily = true;
        try
        {
            foreach (var d in GetDescendants(parent).ToList())
                if (!d.IsCompleted) d.IsCompleted = true;
        }
        finally
        {
            _completingFamily = false;
        }
    }

    /// <summary>
    /// 取消完成某项时的整族联动:把它自身、向上所有祖先、向下所有子孙都置为未完成并移回原分组.
    /// (兄弟及其子树不受影响——父虽取消完成,其它已完成的子仍可作为"活子待办"保留.)
    /// </summary>
    private void UncompleteFamily(TodoItem item)
    {
        _uncompletingFamily = true;
        try
        {
            var family = new List<TodoItem> { item };

            // 向上:沿 ParentId 链收集所有祖先
            var cur = item;
            int safety = 16;
            while (cur.ParentId.HasValue && safety-- > 0)
            {
                var p = _allItems.FirstOrDefault(i => i.Id == cur.ParentId.Value);
                if (p == null) break;
                family.Add(p);
                cur = p;
            }

            // 向下:收集所有递归子孙
            family.AddRange(GetDescendants(item));

            foreach (var f in family.Distinct())
            {
                if (f.IsCompleted) f.IsCompleted = false;   // 守卫下不会重入分支
                MoveForCompletion(f);                       // 移回各自原分组
            }
        }
        finally
        {
            _uncompletingFamily = false;
        }
    }

    /// <summary>列举某个父的所有后代待办(递归子待办).</summary>
    public IEnumerable<TodoItem> GetDescendants(TodoItem parent)
    {
        if (parent == null) yield break;
        foreach (var c in _allItems.Where(i => i.ParentId == parent.Id).ToList())
        {
            yield return c;
            foreach (var dd in GetDescendants(c))
                yield return dd;
        }
    }

    /// <summary>整族(父 + 所有递归子)集合,用于视图层一起播放消失动画.</summary>
    public List<TodoItem> CollectFamily(TodoItem root)
    {
        var list = new List<TodoItem>();
        if (root == null) return list;
        list.Add(root);
        list.AddRange(GetDescendants(root));
        return list;
    }

    /// <summary>检查父待办的所有直接子待办是否都已完成,是则自动完成父待办(从而触发父的完成流程).</summary>
    public void CheckParentCompletion(TodoItem child)
    {
        if (child == null || !child.ParentId.HasValue) return;
        var parent = _allItems.FirstOrDefault(i => i.Id == child.ParentId.Value);
        if (parent == null || parent.IsCompleted) return;

        var siblings = _allItems.Where(i => i.ParentId == parent.Id).ToList();
        if (siblings.Count > 0 && siblings.All(s => s.IsCompleted))
        {
            // 所有子待办都完成 -> 父也勾上(走父分支:整族消失动画 + 烟花)
            parent.IsCompleted = true;
        }
    }

    /// <summary>
    /// 周期提醒检查:每次倒计时定时器 tick 调用.若任务开启了周期提醒、未完成，
    /// 且距上次提醒已达到设定间隔(首次启用以创建时间为基准)，则触发一次提醒事件.
    /// </summary>
    private void CheckReminder(TodoItem item, DateTime now)
    {
        if (!item.ReminderEnabled || item.IsCompleted) return;
        int interval = Math.Max(1, item.ReminderIntervalMinutes);
        var last = item.LastRemindedAt ?? item.CreatedAt;
        if ((now - last).TotalMinutes < interval) return;

        item.LastRemindedAt = now;
        // 自动保存(LastRemindedAt 是普通属性变化，会触发持久化)
        ReminderTriggered?.Invoke(item);
    }

    /// <summary>
    /// 完成动画播放结束后由视图回调:把”整族”(父 + 所有递归子)真正移入“已完成”分组并刷新列表
    /// (从而触发下方任务上移).期间若用户又取消了完成则不再移动该项.
    /// </summary>
    public void FinishFamilyCompletion(TodoItem root)
    {
        if (root == null) return;
        foreach (var f in CollectFamily(root))
        {
            if (f.IsCompleted) MoveForCompletion(f);
        }
        RefreshGroupCounts();
        RefreshItems();
        OnPropertyChanged(nameof(ParentCandidates));
        SaveData();
    }

    private void SaveData()
    {
        if (_suppressSave) return;

        _data.Groups = Groups.ToList();
        _data.Items = _allItems;
        _data.Theme = CurrentTheme;
        _data.Language = CurrentLanguage;
        _data.FontFamily = FontFamily;
        _data.FontSize = FontSize;
        _data.LineSpacing = LineSpacing;
        _data.CheckboxSize = CheckboxSize;
        _data.SelectedGroupId = SelectedGroup?.Id;
        _data.Sort = SelectedSortOption?.Mode ?? SortMode.Custom;
        _data.SidebarWidth = SidebarWidth;
        _data.InputBarHeight = InputBarHeight;
        _data.ScheduleWidth = ScheduleWidth;
        _data.ScheduleOpen = ScheduleOpen;
        _data.SidebarCollapsed = SidebarCollapsed;
        _data.AlwaysOnTop = AlwaysOnTop;
        _data.EffectsEnabled = EffectsEnabled;
        _data.SoundEnabled = SoundEnabled;
        _data.ReminderSoundEnabled = ReminderSoundEnabled;
        _data.ShowHolidays = ShowHolidays;
        _data.ShowPriorityBlock = ShowPriorityBlock;
        _data.QuadrantImportantHighOnly = QuadrantImportantHighOnly;
        _data.QuadrantUrgentIncludeSoon = QuadrantUrgentIncludeSoon;
        _data.DockEdge = DockEdge;
        _data.NotesViewOpen = IsNotesViewOpen;
        NotesVm?.WriteTo(_data);   // 回写便签集合与选中便签 Id
        // CustomThemes 已在 AddCustomTheme 中维护到 _data，无需在此覆盖

        _dataService.Save(_data);
    }

    /// <summary>
    /// 首次启动时默认开启“开机自启动”;之后每次启动都把注册表里的路径同步到当前 exe 位置.
    /// 这样即便用户把 exe 挪走，下次开机时启动的也是新位置的 exe(旧位置的失效项会被自动清掉).
    /// </summary>
    private void EnsureFirstRunStartup()
    {
        if (!_data.StartupInitialized)
        {
            // 首启:默认勾选“是”，注册当前用户的开机自启动
            StartupManager.SetEnabled(true);
            _data.StartupInitialized = true;
        }
        else
        {
            // 已初始化过:仅当用户保留了开机自启动时，确保 Run 项指向当前 exe 路径
            StartupManager.SyncRegisteredPath();
        }
    }

    #endregion
}



