using System;
using System.Collections.ObjectModel;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Models;

/// <summary>
/// 收集箱中的一个便签分组(分类).便签通过 <see cref="Note.GroupId"/> 归属到分组;
/// GroupId 为 null 的便签直接挂在收集箱根下(未分组).与 TodoGroup 互不引用，扁平持久化.
/// </summary>
public partial class NoteGroup : ObservableObject
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [ObservableProperty]
    private string name = string.Empty;

    /// <summary>分组在收集箱中的排序位置.</summary>
    [ObservableProperty]
    private int orderIndex;

    /// <summary>是否折叠(持久化):折叠时隐藏该分组下的便签列表.</summary>
    [ObservableProperty]
    private bool isCollapsed;

    /// <summary>是否处于内联重命名编辑态(运行时状态，不持久化).</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool isEditing;

    /// <summary>该分组下的便签(运行时视图集合，由 NotesViewModel 重建;不参与序列化).</summary>
    [JsonIgnore]
    public ObservableCollection<Note> Notes { get; } = new();

    /// <summary>列表展示名:空名显示「未命名分组」(本地化).不参与序列化.</summary>
    [JsonIgnore]
    public string DisplayName => string.IsNullOrWhiteSpace(Name) ? Loc.T("S.Note.UntitledGroup") : Name;

    /// <summary>
    /// 该分组下是否含当前选中(激活)的便签(运行时状态,不持久化).
    /// 由 NotesViewModel.RefreshSelection 统一赋值;分组折叠把选中便签藏起来时,
    /// 分组头/文件夹图标据此显示选中色块,保证「选中态」在任何折叠组合下都可见.
    /// </summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool hasActiveNote;

    partial void OnNameChanged(string value) => OnPropertyChanged(nameof(DisplayName));
}
