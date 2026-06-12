using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 标签看板里的一列(一个标签容器)。<see cref="Tag"/> 为 null 表示「无标签」列。
/// 持有该标签下未完成顶层任务集合，并提供容器内「+ 添加」入口。
/// </summary>
public partial class TagColumnVm : ObservableObject
{
    private readonly MainViewModel _vm;

    /// <summary>对应的标签(普通分组);null = 无标签列。</summary>
    public TodoGroup? Tag { get; }

    /// <summary>是否为「无标签」列(不可重命名/改图标/删除)。</summary>
    public bool IsUntagged => Tag == null;

    /// <summary>该列展示的任务(未完成顶层任务，由 RefreshTagBoard 填充)。</summary>
    public ObservableCollection<TodoItem> Items { get; } = new();

    public TagColumnVm(MainViewModel vm, TodoGroup? tag)
    {
        _vm = vm;
        Tag = tag;
    }

    /// <summary>容器标题:标签名 / 「无标签」。</summary>
    public string DisplayName => Tag?.DisplayName ?? Loc.T("S.Tag.Untagged");

    /// <summary>容器图标字形:标签图标 / 无标签默认图标。</summary>
    public string Icon => !string.IsNullOrEmpty(Tag?.Icon) ? Tag!.Icon : GroupIcons.Folder;

    /// <summary>容器自定义图片图标路径(标签导入图片时)。</summary>
    public string IconImage => Tag?.IconImage ?? string.Empty;

    public bool HasIconImage => !string.IsNullOrEmpty(IconImage);

    /// <summary>容器强调色(标签色 / 无标签灰)。</summary>
    public string Color => Tag?.Color ?? "#9CA3AF";

    /// <summary>容器内「+ 添加」输入框文本。</summary>
    [ObservableProperty]
    private string newText = string.Empty;

    /// <summary>容器内新增任务:以本列标签建一条待办。</summary>
    [RelayCommand]
    private void Add()
    {
        if (string.IsNullOrWhiteSpace(NewText)) return;
        _vm.AddTaskToTag(Tag, NewText.Trim());
        NewText = string.Empty;
    }

    /// <summary>标签重命名/改图标后刷新表头绑定。</summary>
    public void RefreshHeader()
    {
        OnPropertyChanged(nameof(DisplayName));
        OnPropertyChanged(nameof(Icon));
        OnPropertyChanged(nameof(IconImage));
        OnPropertyChanged(nameof(HasIconImage));
        OnPropertyChanged(nameof(Color));
    }
}
