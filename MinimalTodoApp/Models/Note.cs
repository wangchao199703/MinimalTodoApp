using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Models;

/// <summary>便签块类型.序列化为 int，新增类型只能往后追加，保证旧数据兼容.</summary>
public enum NoteBlockType
{
    /// <summary>普通段落.</summary>
    Paragraph = 0,
    /// <summary>一级标题(# ).</summary>
    H1 = 1,
    /// <summary>二级标题(## ).</summary>
    H2 = 2,
    /// <summary>三级标题(### ).</summary>
    H3 = 3,
    /// <summary>无序列表项(- ).</summary>
    Bullet = 4,
    /// <summary>任务列表项(- [ ] )，可被提取为全局待办并双向同步勾选状态.</summary>
    Task = 5
}

/// <summary>
/// 便签中的一个块(一行).Text 不含块前缀标记(如 "# "/"- [ ] ")，但可含行内 ** 加粗标记.
/// Id 是稳定的 block_id：任务块被提取为待办后，经 LinkedTodoId 与 TodoItem 关联，
/// 勾选状态(IsChecked ↔ TodoItem.IsCompleted)双向同步；文本提取时单向拷贝，之后各自独立.
/// </summary>
public partial class NoteBlock : ObservableObject
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [ObservableProperty]
    private NoteBlockType type;

    /// <summary>块文本(不含块前缀标记，可含行内 ** 加粗标记).</summary>
    [ObservableProperty]
    private string text = string.Empty;

    /// <summary>任务块的勾选状态(仅 Type==Task 有意义).</summary>
    [ObservableProperty]
    private bool isChecked;

    /// <summary>提取为待办后关联的 TodoItem.Id；null=未提取.查不到对应待办时视为悬空(等同未链接).</summary>
    [ObservableProperty]
    private Guid? linkedTodoId;

    /// <summary>是否处于编辑态(运行时状态，不持久化).编辑器保证同一时刻最多一个块在编辑.</summary>
    [ObservableProperty]
    [property: JsonIgnore]
    private bool isEditing;
}

/// <summary>
/// 一篇便签.Title 是派生缓存(取首个非空块文本去标记截断)，保存时刷新，
/// 这样加载便签列表无需解析 Blocks.
/// </summary>
public partial class Note : ObservableObject
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>标题(派生缓存：首个非空块的纯文本，截 30 字).</summary>
    [ObservableProperty]
    private string title = string.Empty;

    public List<NoteBlock> Blocks { get; set; } = new();

    public DateTime CreatedAt { get; set; } = DateTime.Now;

    public DateTime UpdatedAt { get; set; } = DateTime.Now;

    /// <summary>列表展示名:空标题显示「无标题」(本地化).</summary>
    [JsonIgnore]
    public string DisplayTitle => string.IsNullOrWhiteSpace(Title) ? Loc.T("S.Note.Untitled") : Title;

    /// <summary>Title 变化时同步刷新 DisplayTitle(供下拉列表绑定).</summary>
    partial void OnTitleChanged(string value) => OnPropertyChanged(nameof(DisplayTitle));
}
