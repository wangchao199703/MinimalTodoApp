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

    /// <summary>分组的颜色圆点(十六进制字符串).已不再用于侧栏显示(改为图标)，保留以兼容旧数据.</summary>
    [ObservableProperty]
    private string color = "#3B82F6";

    /// <summary>自定义图片图标的文件路径(导入的图片).非空时侧栏显示该图片而非字形图标.持久化.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasIconImage))]
    private string iconImage = "";

    /// <summary>是否使用了自定义图片图标.计算属性,不序列化.</summary>
    [JsonIgnore]
    public bool HasIconImage => !string.IsNullOrEmpty(IconImage);

    /// <summary>分组图标(Segoe Fluent Icons 字形码)，取代旧的颜色圆点;默认文件夹.持久化.</summary>
    [ObservableProperty]
    private string icon = "";

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
