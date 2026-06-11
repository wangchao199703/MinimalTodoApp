using System;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Models;

/// <summary>任务相对截止日期的状态，用于倒计时文案与颜色.</summary>
public enum DueState
{
    /// <summary>无截止日期.</summary>
    None,
    /// <summary>已完成.</summary>
    Completed,
    /// <summary>已逾期.</summary>
    Overdue,
    /// <summary>今天到期.</summary>
    Today,
    /// <summary>临近(3 天内).</summary>
    Soon,
    /// <summary>正常(较远).</summary>
    Normal
}

/// <summary>任务优先级.数值越大越紧急，用于排序与左侧色条.</summary>
public enum Priority
{
    /// <summary>无优先级(已废弃 UI 不再展示;旧数据加载时会自动迁移为 Medium).</summary>
    None = 0,
    /// <summary>低.</summary>
    Low = 1,
    /// <summary>中.</summary>
    Medium = 2,
    /// <summary>高.</summary>
    High = 3
}

/// <summary>
/// 单个待办任务.使用 CommunityToolkit 的 [ObservableProperty] 源生成器自动实现
/// INotifyPropertyChanged，所有公共属性均会被 System.Text.Json 序列化.
/// 注意:这里采用扁平结构(仅保存 GroupId 而非 Group 对象引用)，从根本上避免 JSON 循环引用.
/// </summary>
public partial class TodoItem : ObservableObject
{
    [ObservableProperty]
    private Guid id = Guid.NewGuid();

    [ObservableProperty]
    private string title = string.Empty;

    [ObservableProperty]
    private bool isCompleted;

    /// <summary>截止日期与时间(精确到分)，可为空.未选时间则为当天 00:00.</summary>
    [ObservableProperty]
    private DateTime? dueDate;

    /// <summary>所属分组 Id.</summary>
    [ObservableProperty]
    private Guid groupId;

    /// <summary>完成前所属的分组 Id.完成后任务被移入“已完成”分组，取消完成时据此还原.</summary>
    [ObservableProperty]
    private Guid? originalGroupId;

    /// <summary>优先级.默认中(无优先级选项已废弃).</summary>
    [ObservableProperty]
    private Priority priority = Priority.Medium;

    /// <summary>自定义排序索引，用于持久化拖拽排序结果.</summary>
    [ObservableProperty]
    private int orderIndex;

    /// <summary>缩进层级(0 为顶层)，用于以缩进表达”子待办”的父子层级关系.</summary>
    [ObservableProperty]
    private int indentLevel;

    /// <summary>父待办的 Id(可选).用于建立明确的父子关系，支持父完成子自动完成等逻辑.</summary>
    [ObservableProperty]
    private Guid? parentId;

    /// <summary>是否折叠该待办(仅父待办用,折叠后隐藏所有子孙待办).</summary>
    [ObservableProperty]
    private bool isCollapsed;

    /// <summary>是否置顶.置顶作用于顶层任务,其整族始终排在列表最上方(无论排序模式).参与序列化.</summary>
    [ObservableProperty]
    private bool isPinned;

    /// <summary>
    /// 四象限手动归属覆盖(1=立即处理,2=计划安排,3=委派他人,4=可删除;null=按优先级/截止自动派生).
    /// 用户在四象限里跨格拖动任务时设置,使卡片停在目标象限而不修改其优先级/截止日期;
    /// 之后手动改优先级或截止日期会清空该覆盖,回归自动归类.参与序列化(向后兼容默认 null).
    /// </summary>
    [ObservableProperty]
    private int? quadrantOverride;

    /// <summary>是否有子待办(由 ViewModel 维护,用于显示折叠箭头).不参与序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool hasChildren;

    /// <summary>直接子待办总数(由 ViewModel 维护,用于"子任务 (n/m)"摘要).不参与序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    [NotifyPropertyChangedFor(nameof(SubtaskText))]
    private int childCount;

    /// <summary>已完成的直接子待办数(由 ViewModel 维护).不参与序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    [NotifyPropertyChangedFor(nameof(SubtaskText))]
    private int completedChildCount;

    /// <summary>"子任务 (已完成/总数)"摘要文案,显示在父待办标题下方的折叠行.计算属性,不序列化.</summary>
    [JsonIgnore]
    public string SubtaskText => Loc.F("S.Task.SubtaskCount", CompletedChildCount, ChildCount);

    /// <summary>所属标签名(由 ViewModel 维护,用于列表里的标签 chip).不序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    [NotifyPropertyChangedFor(nameof(HasTag))]
    private string tagName = string.Empty;

    /// <summary>所属标签图标字形(由 ViewModel 维护).不序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private string tagIcon = string.Empty;

    /// <summary>所属标签颜色(十六进制,由 ViewModel 维护,用于 chip 淡底).不序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private string tagColor = "#3B82F6";

    /// <summary>是否有标签(即 TagName 非空).计算属性,不序列化.</summary>
    [JsonIgnore]
    public bool HasTag => !string.IsNullOrEmpty(TagName);

    /// <summary>是否启用周期提醒(到点后每隔固定时间反复提醒，直到任务完成).</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasReminder))]
    private bool reminderEnabled;

    /// <summary>周期提醒的间隔分钟数(默认 30 分钟).</summary>
    [ObservableProperty]
    private int reminderIntervalMinutes = 30;

    /// <summary>上次提醒的时间(运行时记录，用于计算下次提醒；不参与界面绑定).</summary>
    [ObservableProperty]
    private DateTime? lastRemindedAt;

    [ObservableProperty]
    private DateTime createdAt = DateTime.Now;

    /// <summary>是否处于内联编辑状态(单击标题进入).运行时状态，不序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool isEditing;

    /// <summary>是否设置了截止日期(计算属性，不序列化).</summary>
    [JsonIgnore]
    public bool HasDueDate => DueDate.HasValue;

    /// <summary>是否设置了优先级(计算属性，不序列化).</summary>
    [JsonIgnore]
    public bool HasPriority => Priority != Priority.None;

    /// <summary>是否开启了周期提醒(计算属性，用于在标题旁显示小铃铛，不序列化).</summary>
    [JsonIgnore]
    public bool HasReminder => ReminderEnabled;

    /// <summary>是否已逾期(未完成且截止时间已过).计算属性，不序列化.</summary>
    [JsonIgnore]
    public bool IsOverdue =>
        !IsCompleted && DueDate.HasValue && DueDate.Value < DateTime.Now;

    /// <summary>相对截止时间的状态.计算属性，不序列化.</summary>
    [JsonIgnore]
    public DueState DueState
    {
        get
        {
            if (!DueDate.HasValue) return DueState.None;
            if (IsCompleted) return DueState.Completed;

            var now = DateTime.Now;
            if (DueDate.Value < now) return DueState.Overdue;

            int dayDiff = (DueDate.Value.Date - now.Date).Days;
            if (dayDiff == 0) return DueState.Today;
            if (dayDiff <= 3) return DueState.Soon;
            return DueState.Normal;
        }
    }

    /// <summary>距离截止时间的倒计时文案(精确到时/分).计算属性，不序列化.</summary>
    [JsonIgnore]
    public string DueCountdownText
    {
        get
        {
            if (!DueDate.HasValue) return string.Empty;

            var now = DateTime.Now;
            var span = DueDate.Value - now;

            if (IsCompleted)
                return span.TotalMinutes < 0 ? Loc.T("S.DoneWasOverdue") : Loc.T("S.Done");

            if (span.TotalMinutes < 0)
            {
                var od = now - DueDate.Value;
                if (od.TotalDays >= 1) return Loc.F("S.Fmt.OverdueDays", (int)od.TotalDays);
                if (od.TotalHours >= 1) return Loc.F("S.Fmt.OverdueHours", (int)od.TotalHours);
                return Loc.F("S.Fmt.OverdueMinutes", Math.Max(1, (int)od.TotalMinutes));
            }

            // 未来:按粒度展示
            if (span.TotalDays >= 1)
            {
                int days = (int)span.TotalDays;
                int hours = span.Hours;
                return hours > 0 ? Loc.F("S.Fmt.RemainDaysHours", days, hours) : Loc.F("S.Fmt.RemainDays", days);
            }
            if (span.TotalHours >= 1)
            {
                int hours = (int)span.TotalHours;
                int mins = span.Minutes;
                return mins > 0 ? Loc.F("S.Fmt.RemainHoursMinutes", hours, mins) : Loc.F("S.Fmt.RemainHours", hours);
            }
            int m = Math.Max(1, (int)span.TotalMinutes);
            return Loc.F("S.Fmt.RemainMinutes", m);
        }
    }

    /// <summary>截止时间的明细展示(用于 ToolTip).计算属性，不序列化.</summary>
    [JsonIgnore]
    public string DueDetailText =>
        DueDate.HasValue ? DueDate.Value.ToString("yyyy-MM-dd HH:mm") : string.Empty;

    /// <summary>由外部定时器调用，随时间推进刷新倒计时显示.</summary>
    public void RefreshDueState()
    {
        OnPropertyChanged(nameof(DueState));
        OnPropertyChanged(nameof(DueCountdownText));
        OnPropertyChanged(nameof(IsOverdue));
    }

    // 当 IsCompleted / DueDate / Priority 改变时，通知派生属性重新计算
    partial void OnIsCompletedChanged(bool value) => RefreshDueState();
    partial void OnDueDateChanged(DateTime? value)
    {
        OnPropertyChanged(nameof(HasDueDate));
        OnPropertyChanged(nameof(DueDetailText));
        RefreshDueState();
    }
    partial void OnPriorityChanged(Priority value) => OnPropertyChanged(nameof(HasPriority));
}
