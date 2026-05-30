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

/// <summary>排序选项(用于下拉框显示).</summary>
public record SortOption(string Label, SortMode Mode);

/// <summary>新任务优先级下拉选项.</summary>
public record PriorityOption(string Label, Priority Value);

/// <summary>新任务快捷时间选项(Minutes 为相对当前时间的分钟数).</summary>
public record QuickTimeOption(string Label, int Minutes);
