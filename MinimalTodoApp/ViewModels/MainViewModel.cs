using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Windows;
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

    /// <summary>每分钟刷新一次倒计时文案(跨零点也能正确更新).</summary>
    private readonly DispatcherTimer _countdownTimer;

    // 分组颜色调色板，新建分组时循环取用
    private static readonly string[] Palette =
    {
        "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
        "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"
    };

    public MainViewModel()
    {
        _data = _dataService.Load();
        SeedDefaultsIfEmpty();

        // 自定义主题先载入，才能在主题列表里出现并被应用
        ThemeManager.LoadCustomThemes(_data.CustomThemes);

        currentTheme = string.IsNullOrWhiteSpace(_data.Theme) ? ThemeManager.Light : _data.Theme;
        Themes = new ObservableCollection<ThemeInfo>(ThemeManager.AllThemes());
        selectedTheme = Themes.FirstOrDefault(t => t.Key == currentTheme) ?? Themes[0];

        sidebarWidth = _data.SidebarWidth > 0 ? _data.SidebarWidth : 113;
        sidebarCollapsed = _data.SidebarCollapsed;
        inputBarHeight = _data.InputBarHeight > 0 ? _data.InputBarHeight : 40;
        alwaysOnTop = _data.AlwaysOnTop;
        effectsEnabled = _data.EffectsEnabled;
        soundEnabled = _data.SoundEnabled;
        reminderSoundEnabled = _data.ReminderSoundEnabled;
        dockEdge = _data.DockEdge;

        Groups = new ObservableCollection<TodoGroup>(_data.Groups.OrderBy(g => g.OrderIndex));
        // 分组增删时，刷新右键「移动到分组」子菜单的候选项
        Groups.CollectionChanged += (_, _) => OnPropertyChanged(nameof(MoveTargetGroups));
        _allItems = _data.Items.ToList();
        foreach (var item in _allItems)
            item.PropertyChanged += OnItemPropertyChanged;

        // 构造期间抑制保存:补建“已完成”分组、迁移旧数据时不应触发写盘，
        // 否则会在选中分组尚未恢复时把 SelectedGroupId 覆盖为 null.
        _suppressSave = true;
        EnsureAllUncompletedGroup();
        EnsureCompletedGroup();
        MigrateCompletedItems();
        MigrateNonePriority();
        _suppressSave = false;
        // 启动时按缩进重算父子关系一次,使旧数据/手动编辑的层级保持一致
        RecomputeParents();

        SortOptions = new List<SortOption>
        {
            new("自定义(拖拽)", SortMode.Custom),
            new("按截止日期", SortMode.DueDate),
            new("按优先级", SortMode.Priority),
            new("按完成状态", SortMode.Completed),
            new("按创建时间", SortMode.Created),
            new("按标题", SortMode.Title),
        };
        selectedSortOption = SortOptions.FirstOrDefault(o => o.Mode == _data.Sort) ?? SortOptions[0];

        // 恢复上次选中的分组(null 表示“全部任务”)
        selectedGroup = _data.SelectedGroupId.HasValue
            ? Groups.FirstOrDefault(g => g.Id == _data.SelectedGroupId.Value)
            : null;

        Items = new ObservableCollection<TodoItem>();
        RefreshItems();
        RefreshGroupCounts();

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
        };
        _countdownTimer.Start();
    }

    #region 绑定属性

    public ObservableCollection<TodoGroup> Groups { get; }

    /// <summary>当前界面显示(已过滤+排序)的任务集合，绑定到任务列表并支持拖拽.</summary>
    public ObservableCollection<TodoItem> Items { get; }

    public List<SortOption> SortOptions { get; }

    /// <summary>新任务优先级下拉选项(默认中;不再提供“无”).</summary>
    public List<PriorityOption> PriorityOptions { get; } = new()
    {
        new("低优先级", Priority.Low),
        new("中优先级", Priority.Medium),
        new("高优先级", Priority.High),
    };

    /// <summary>新任务的常用快捷时间(点击即设为“此刻 + 间隔”).</summary>
    public List<QuickTimeOption> QuickTimeOptions { get; } = new()
    {
        new("5 分钟后", 5),
        new("10 分钟后", 10),
        new("30 分钟后", 30),
        new("1 小时后", 60),
        new("2 小时后", 120),
        new("5 小时后", 300),
        new("1 天后", 1440),
        new("2 天后", 2880),
        new("5 天后", 7200),
        new("1 周后", 10080),
    };

    /// <summary>自定义时间用:小时 0–23.</summary>
    public List<int> Hours { get; } = Enumerable.Range(0, 24).ToList();

    /// <summary>自定义时间用:分钟 0–59(精确到分钟).</summary>
    public List<int> Minutes { get; } = Enumerable.Range(0, 60).ToList();

    /// <summary>可选主题列表(内置 + 自定义，可运行时增减).</summary>
    public ObservableCollection<ThemeInfo> Themes { get; }

    [ObservableProperty]
    private TodoGroup? selectedGroup;

    [ObservableProperty]
    private SortOption selectedSortOption = null!;

    [ObservableProperty]
    private string currentTheme = ThemeManager.Light;

    [ObservableProperty]
    private ThemeInfo selectedTheme = null!;

    /// <summary>左侧分组栏宽度(GridSplitter 拖动 + 持久化).</summary>
    [ObservableProperty]
    private double sidebarWidth = 113;

    /// <summary>底部输入栏高度(GridSplitter 拖动 + 持久化).</summary>
    [ObservableProperty]
    private double inputBarHeight = 40;

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

    /// <summary>周期提醒是否播放提示音(默认开启，持久化).</summary>
    [ObservableProperty]
    private bool reminderSoundEnabled = true;

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
        NewTaskDueDate.HasValue ? NewTaskDueDate.Value.ToString("MM-dd HH:mm") : "未设置时间";

    /// <summary>新任务“截止时间”按钮上的显示文案(未选时显示提示，已选则显示具体时间).</summary>
    public string NewTaskDueButtonText =>
        NewTaskDueDate.HasValue ? NewTaskDueDate.Value.ToString("MM-dd HH:mm") : "选择截止时间";

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

    /// <summary>自定义周期提醒的单位:分钟/小时/天/周.</summary>
    [ObservableProperty]
    private string newTaskReminderCustomUnit = "分钟";

    /// <summary>新任务“周期提醒”按钮上的显示文案(未启用时显示提示，已启用则显示间隔).</summary>
    public string NewTaskReminderButtonText
    {
        get
        {
            if (!NewTaskReminderEnabled) return "选择周期提醒";
            int m = Math.Max(1, NewTaskReminderInterval);
            if (m >= 10080 && m % 10080 == 0) return $"每 {m / 10080} 周";
            if (m >= 1440 && m % 1440 == 0) return $"每 {m / 1440} 天";
            if (m >= 60 && m % 60 == 0) return $"每 {m / 60} 小时";
            return $"每 {m} 分钟";
        }
    }

    /// <summary>周期提醒自定义单位下拉框可选项.</summary>
    public List<string> ReminderUnits { get; } = new() { "分钟", "小时", "天", "周" };

    /// <summary>新任务的父待办 Id(可选).选择后新任务将作为该待办的子待办创建.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasNewTaskParent))]
    private Guid? newTaskParentId;

    /// <summary>新任务是否已选择父待办.</summary>
    public bool HasNewTaskParent => NewTaskParentId.HasValue;

    /// <summary>可作为父待办的候选任务列表(排除已完成的任务).</summary>
    public IEnumerable<TodoItem> ParentCandidates => _allItems.Where(i => !i.IsCompleted);

    /// <summary>新建分组输入框是否展开(平时隐藏，点击“+ 新建分组”才弹出).</summary>
    [ObservableProperty]
    private bool isAddingGroup;

    /// <summary>新建分组输入框文本.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(ConfirmAddGroupCommand))]
    private string newGroupName = string.Empty;

    /// <summary>当前是否选中“全部任务”.</summary>
    public bool IsAllSelected => SelectedGroup == null;

    /// <summary>右侧标题:当前分组名 / “全部任务”.</summary>
    public string CurrentTitle => SelectedGroup?.Name ?? "全部任务";

    /// <summary>内置“已完成”分组.</summary>
    public TodoGroup? CompletedGroup => Groups.FirstOrDefault(g => g.IsCompletedGroup);

    /// <summary>内置“所有待办”分组(聚合视图，不存任务).</summary>
    public TodoGroup? AllUncompletedGroup => Groups.FirstOrDefault(g => g.IsAllUncompletedGroup);

    /// <summary>第一个可作为新任务归属的普通分组(排除“已完成”与“所有待办”).</summary>
    private TodoGroup? FirstNormalGroup =>
        Groups.FirstOrDefault(g => !g.IsCompletedGroup && !g.IsAllUncompletedGroup);

    /// <summary>右键「移动到分组」子菜单的候选分组(排除内置“已完成”/“所有待办”分组).</summary>
    public IEnumerable<TodoGroup> MoveTargetGroups =>
        Groups.Where(g => !g.IsCompletedGroup && !g.IsAllUncompletedGroup);

    public string DataFilePath => _dataService.FilePath;

    #endregion

    #region 属性变化联动

    partial void OnSelectedGroupChanged(TodoGroup? value)
    {
        OnPropertyChanged(nameof(IsAllSelected));
        OnPropertyChanged(nameof(CurrentTitle));
        RefreshItems();
        SaveData();
    }

    partial void OnSelectedSortOptionChanged(SortOption value)
    {
        RefreshItems();
        SaveData();
    }

    partial void OnSelectedThemeChanged(ThemeInfo value)
    {
        if (value == null) return;
        CurrentTheme = value.Key;
        ThemeManager.Apply(value.Key);
        SaveData();
    }

    partial void OnSidebarWidthChanged(double value) => SaveData();
    partial void OnInputBarHeightChanged(double value) => SaveData();
    partial void OnSidebarCollapsedChanged(bool value) => SaveData();
    partial void OnAlwaysOnTopChanged(bool value) => SaveData();
    partial void OnEffectsEnabledChanged(bool value) => SaveData();
    partial void OnSoundEnabledChanged(bool value) => SaveData();
    partial void OnReminderSoundEnabledChanged(bool value) => SaveData();
    partial void OnDockEdgeChanged(int value) => SaveData();

    #endregion

    #region 任务命令

    private bool CanAddTask() => !string.IsNullOrWhiteSpace(NewTaskTitle);

    [RelayCommand(CanExecute = nameof(CanAddTask))]
    private void AddTask()
    {
        // 选中全部任务/已完成/所有待办时，归入第一个普通分组(不直接建到已完成或聚合视图里)
        var target = SelectedGroup;
        if (target == null || target.IsCompletedGroup || target.IsAllUncompletedGroup)
            target = FirstNormalGroup;
        if (target == null)
            target = CreateGroupInternal("收件箱");

        int nextIndex = _allItems.Where(i => i.GroupId == target.Id)
                                 .Select(i => i.OrderIndex)
                                 .DefaultIfEmpty(-1).Max() + 1;

        // 如果选择了父待办，自动设置缩进层级为父待办的层级+1
        int indentLevel = 0;
        if (NewTaskParentId.HasValue)
        {
            var parent = _allItems.FirstOrDefault(i => i.Id == NewTaskParentId.Value);
            if (parent != null)
            {
                indentLevel = Math.Min(parent.IndentLevel + 1, 6);
                // 子待办应该在父待办所在的分组
                target = Groups.FirstOrDefault(g => g.Id == parent.GroupId) ?? target;
            }
        }

        var item = new TodoItem
        {
            Title = NewTaskTitle.Trim(),
            GroupId = target.Id,
            DueDate = NewTaskDueDate,
            Priority = NewTaskPriority,
            OrderIndex = nextIndex,
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

        RecomputeParents();
        RefreshItems();
        RefreshGroupCounts();
        OnPropertyChanged(nameof(ParentCandidates));
        SaveData();
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
        int mult = NewTaskReminderCustomUnit switch
        {
            "小时" => 60,
            "天"   => 1440,
            "周"   => 10080,
            _       => 1,           // 分钟
        };
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

    /// <summary>统一应用任务编辑(截止时间 + 优先级)，由右键编辑对话框回填.</summary>
    public void ApplyTaskEdits(TodoItem item, DateTime? due, Priority priority)
    {
        if (item == null) return;
        item.DueDate = due;        // 触发 OnDueDateChanged + 自动保存
        item.Priority = priority;  // 触发 OnPriorityChanged + 自动保存
        RefreshItems();
    }

    /// <summary>
    /// 把任务移动到指定分组(右键「移动到分组」).不支持移动到内置“已完成”分组；
    /// 若任务原本已完成(位于“已完成”分组)，移动到普通分组即视为取消完成.
    /// </summary>
    public void MoveTaskToGroup(TodoItem? item, TodoGroup? target)
    {
        if (item == null || target == null) return;
        // “已完成”与“所有待办”都是视图分组，不能作为真实归属
        if (target.IsCompletedGroup || target.IsAllUncompletedGroup) return;
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

    /// <summary>开始新建分组:若侧边栏处于折叠态先展开，再弹出输入框.</summary>
    [RelayCommand]
    private void BeginAddGroup()
    {
        if (SidebarCollapsed) SidebarCollapsed = false;
        IsAddingGroup = true;
    }

    /// <summary>取消新建分组:收起输入框.</summary>
    [RelayCommand]
    private void CancelAddGroup()
    {
        IsAddingGroup = false;
        NewGroupName = string.Empty;
    }

    private bool CanConfirmAddGroup() => !string.IsNullOrWhiteSpace(NewGroupName);

    [RelayCommand(CanExecute = nameof(CanConfirmAddGroup))]
    private void ConfirmAddGroup()
    {
        var g = CreateGroupInternal(NewGroupName.Trim());
        NewGroupName = string.Empty;
        IsAddingGroup = false;
        SelectedGroup = g;        // 自动切到新分组
        SaveData();
    }

    private TodoGroup CreateGroupInternal(string name)
    {
        var g = new TodoGroup
        {
            Name = name,
            OrderIndex = Groups.Count,
            Color = Palette[Groups.Count % Palette.Length]
        };
        Groups.Add(g);
        return g;
    }

    [RelayCommand]
    private void DeleteGroup(TodoGroup? group)
    {
        // “已完成”/“所有待办”都是内置视图分组，不可删除
        if (group == null || group.IsCompletedGroup || group.IsAllUncompletedGroup) return;

        // 连带删除该分组下的任务
        var toRemove = _allItems.Where(i => i.GroupId == group.Id).ToList();
        foreach (var i in toRemove)
        {
            i.PropertyChanged -= OnItemPropertyChanged;
            _allItems.Remove(i);
        }

        Groups.Remove(group);
        if (SelectedGroup == group)
            SelectedGroup = null;   // 触发刷新
        else
        {
            RefreshItems();
            RefreshGroupCounts();
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

    #endregion

    #region 拖拽排序 (IDropTarget)

    public void DragOver(IDropInfo dropInfo)
    {
        bool taskMove = dropInfo.Data is TodoItem && dropInfo.TargetItem is TodoItem;
        bool groupMove = dropInfo.Data is TodoGroup && dropInfo.TargetItem is TodoGroup;
        if (taskMove || groupMove)
        {
            dropInfo.DropTargetAdorner = DropTargetAdorners.Insert;
            dropInfo.Effects = DragDropEffects.Move;
        }
    }

    public void Drop(IDropInfo dropInfo)
    {
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
        if (newIndex == oldIndex) return;

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
            IsAllUncompletedGroup = true
        });

        string[] defaults = { "工作", "学习", "生活" };
        for (int i = 0; i < defaults.Length; i++)
        {
            _data.Groups.Add(new TodoGroup
            {
                Name = defaults[i],
                OrderIndex = i + 1,
                Color = Palette[i % Palette.Length]
            });
        }

        _data.Groups.Add(new TodoGroup
        {
            Name = "已完成",
            OrderIndex = defaults.Length + 1,
            Color = "#16A34A",
            IsCompletedGroup = true
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
            IsCompletedGroup = true
        };
        Groups.Add(g);
        // 注意:构造期间不在此保存，避免覆盖尚未恢复的选中分组；由构造末尾统一保存.
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

    private void RefreshItems()
    {
        // 每次刷新顺带更新 HasChildren,用于父待办左侧的折叠箭头显示控制
        var childIdSet = _allItems.Where(i => i.ParentId.HasValue)
                                  .Select(i => i.ParentId!.Value)
                                  .ToHashSet();
        foreach (var it in _allItems)
            it.HasChildren = childIdSet.Contains(it.Id);

        IEnumerable<TodoItem> query = _allItems;

        if (SelectedGroup != null)
        {
            // “所有待办”是聚合视图:显示所有未完成任务(无论原归属分组)
            if (SelectedGroup.IsAllUncompletedGroup)
                query = query.Where(i => !i.IsCompleted);
            else
                query = query.Where(i => i.GroupId == SelectedGroup.Id);
        }

        // 任一祖先被折叠则隐藏(用于父待办折叠时收起所有子孙)
        query = query.Where(i => !IsHiddenByCollapsedAncestor(i));

        query = (SelectedSortOption?.Mode ?? SortMode.Custom) switch
        {
            SortMode.DueDate   => query.OrderBy(i => i.DueDate ?? DateTime.MaxValue),
            SortMode.Priority  => query.OrderByDescending(i => (int)i.Priority).ThenBy(i => i.OrderIndex),
            SortMode.Completed => query.OrderBy(i => i.IsCompleted).ThenBy(i => i.OrderIndex),
            SortMode.Created   => query.OrderByDescending(i => i.CreatedAt),
            SortMode.Title     => query.OrderBy(i => i.Title, StringComparer.CurrentCulture),
            _                  => query.OrderBy(i => i.OrderIndex),
        };

        Items.Clear();
        foreach (var item in query)
            Items.Add(item);
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

    private void RefreshGroupCounts()
    {
        foreach (var g in Groups)
        {
            if (g.IsAllUncompletedGroup)
                g.ItemCount = _allItems.Count(i => !i.IsCompleted);             // 所有待办:全部未完成
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
            or nameof(TodoItem.IsEditing))
            return;

        if (e.PropertyName == nameof(TodoItem.IsCompleted))
        {
            // 整族完成期间(由父勾选连带触发的所有子)，只保存，不再分支重入
            if (_completingFamily)
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

            // 取消完成:立即移回原分组并刷新
            if (sender is TodoItem it)
                MoveForCompletion(it);
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
        _data.SelectedGroupId = SelectedGroup?.Id;
        _data.Sort = SelectedSortOption?.Mode ?? SortMode.Custom;
        _data.SidebarWidth = SidebarWidth;
        _data.InputBarHeight = InputBarHeight;
        _data.SidebarCollapsed = SidebarCollapsed;
        _data.AlwaysOnTop = AlwaysOnTop;
        _data.EffectsEnabled = EffectsEnabled;
        _data.SoundEnabled = SoundEnabled;
        _data.ReminderSoundEnabled = ReminderSoundEnabled;
        _data.DockEdge = DockEdge;
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



