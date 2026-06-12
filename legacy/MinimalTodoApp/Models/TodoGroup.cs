using System;
using System.Text.Json.Serialization;
using System.Windows;
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
        : IsQuadrantGroup ? Loc.T("S.Group.Quadrant")
        : IsTagBoardGroup ? Loc.T("S.Group.TagBoard")
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
    [NotifyPropertyChangedFor(nameof(IndentMargin))]
    private bool isCompletedGroup;

    /// <summary>是否为内置“所有待办”分组:聚合所有未完成任务的视图分组，不可删除/不存任务/不可作为新任务的目标.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IndentMargin))]
    private bool isAllUncompletedGroup;

    /// <summary>是否为内置“四象限”视图分组:按重要/紧急把所有未完成任务装入四格的派生视图，不存任务/不可删除/不可作为新任务目标.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IndentMargin))]
    private bool isQuadrantGroup;

    /// <summary>是否为内置“标签看板”视图分组:把未完成任务按标签分容器展示的派生视图，不存任务/不可删除/不可作为新任务目标.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IndentMargin))]
    private bool isTagBoardGroup;

    /// <summary>是否为内置视图分组(所有待办/已完成/四象限/标签看板)，即非普通标签.不序列化.</summary>
    [JsonIgnore]
    public bool IsSpecialGroup => IsAllUncompletedGroup || IsCompletedGroup || IsQuadrantGroup || IsTagBoardGroup;

    /// <summary>
    /// 侧栏层级缩进:内置视图分组为顶层不缩进;普通标签(已不在侧栏列出)沿用 0.不参与序列化.
    /// </summary>
    [JsonIgnore]
    public Thickness IndentMargin =>
        IsSpecialGroup ? new Thickness(0) : new Thickness(16, 0, 0, 0);

    /// <summary>该分组下的任务数量.运行时计算，不参与序列化.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private int itemCount;

    /// <summary>
    /// 是否折叠.持久化.仅“所有待办”分组使用:折叠时在侧栏隐藏其下的普通分组列表
    /// (与收集箱根折叠对称)，普通分组本身不展开子项，故此标志对普通分组无视觉作用.
    /// </summary>
    [ObservableProperty]
    private bool isCollapsed;

    /// <summary>是否处于内联重命名编辑态(运行时状态，不持久化).</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool isEditing;

    /// <summary>
    /// 侧栏选中色块(运行时状态，不持久化).由 MainViewModel.RefreshSidebarSelection 统一计算,
    /// 整个侧栏同一时刻只有一个元素为 true;视图层只绑定本标志,不依赖 ListBox 的 IsSelected.
    /// </summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool isHighlighted;
}
