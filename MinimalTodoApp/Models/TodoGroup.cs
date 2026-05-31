using System;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Models;

/// <summary>
/// 任务分组(如:工作、生活、学习).
/// </summary>
public partial class TodoGroup : ObservableObject
{
    [ObservableProperty]
    private Guid id = Guid.NewGuid();

    [ObservableProperty]
    private string name = string.Empty;

    /// <summary>
    /// 用于界面显示的分组名:内置“所有待办/已完成”分组返回本地化文案，
    /// 普通分组返回用户自定义的 Name(用户数据不翻译).不参与序列化.
    /// </summary>
    [JsonIgnore]
    public string DisplayName =>
        IsAllUncompletedGroup ? Loc.T("S.Group.AllUncompleted")
        : IsCompletedGroup ? Loc.T("S.Group.Completed")
        : Name;

    /// <summary>语言切换时由 ViewModel 调用,刷新内置分组的本地化显示名.</summary>
    public void RefreshDisplayName() => OnPropertyChanged(nameof(DisplayName));

    partial void OnNameChanged(string value) => OnPropertyChanged(nameof(DisplayName));

    [ObservableProperty]
    private int orderIndex;

    /// <summary>分组的颜色圆点(十六进制字符串)，默认蓝色.</summary>
    [ObservableProperty]
    private string color = "#3B82F6";

    /// <summary>是否为内置“已完成”分组:完成的任务会自动归入，且不可删除/不计入新建目标.</summary>
    [ObservableProperty]
    private bool isCompletedGroup;

    /// <summary>是否为内置“所有待办”分组:聚合所有未完成任务的视图分组，不可删除/不存任务/不可作为新任务的目标.</summary>
    [ObservableProperty]
    private bool isAllUncompletedGroup;

    /// <summary>该分组下的任务数量.运行时计算，不参与序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private int itemCount;
}
