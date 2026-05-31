using CommunityToolkit.Mvvm.ComponentModel;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Models;

/// <summary>任务排序方式.</summary>
public enum SortMode
{
    /// <summary>自定义(拖拽)排序，按 OrderIndex.</summary>
    Custom,
    /// <summary>按截止日期升序.</summary>
    DueDate,
    /// <summary>按优先级(高在前).</summary>
    Priority,
    /// <summary>按完成状态(未完成在前).</summary>
    Completed,
    /// <summary>按创建时间(最新在前).</summary>
    Created,
    /// <summary>按标题字母/拼音.</summary>
    Title
}

/// <summary>
/// 排序选项(用于下拉框显示).Label 由资源 key 实时解析，语言切换时调用 RefreshLabel 即可就地更新文字,
/// 不需要重建集合,因而 SelectedSortOption 引用不变、选中态不丢.
/// </summary>
public partial class SortOption : ObservableObject
{
    public string LabelKey { get; }
    public SortMode Mode { get; }
    public SortOption(string labelKey, SortMode mode) { LabelKey = labelKey; Mode = mode; }
    public string Label => Loc.T(LabelKey);
    public void RefreshLabel() => OnPropertyChanged(nameof(Label));
}

/// <summary>新任务优先级下拉选项.</summary>
public partial class PriorityOption : ObservableObject
{
    public string LabelKey { get; }
    public Priority Value { get; }
    public PriorityOption(string labelKey, Priority value) { LabelKey = labelKey; Value = value; }
    public string Label => Loc.T(LabelKey);
    public void RefreshLabel() => OnPropertyChanged(nameof(Label));
}

/// <summary>新任务快捷时间选项(Minutes 为相对当前时间的分钟数).</summary>
public partial class QuickTimeOption : ObservableObject
{
    public string LabelKey { get; }
    public int Minutes { get; }
    public QuickTimeOption(string labelKey, int minutes) { LabelKey = labelKey; Minutes = minutes; }
    public string Label => Loc.T(LabelKey);
    public void RefreshLabel() => OnPropertyChanged(nameof(Label));
}

/// <summary>
/// 周期提醒自定义单位选项.Minutes 为该单位对应的分钟倍率(分钟=1/小时=60/天=1440/周=10080)，
/// 作为稳定标识用于换算,避免按显示文本 switch 在切换语言后失效.
/// </summary>
public partial class ReminderUnitOption : ObservableObject
{
    public string LabelKey { get; }
    public int Minutes { get; }
    public ReminderUnitOption(string labelKey, int minutes) { LabelKey = labelKey; Minutes = minutes; }
    public string Label => Loc.T(LabelKey);
    public void RefreshLabel() => OnPropertyChanged(nameof(Label));
}
