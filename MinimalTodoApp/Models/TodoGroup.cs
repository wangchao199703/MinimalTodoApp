using System;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;

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
