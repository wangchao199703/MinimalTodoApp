using System.Collections.Generic;
using System.Collections.ObjectModel;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.ViewModels;

/// <summary>主题色板的展示项:包裹 ThemeInfo，附带"是否当前主题"用于高亮描边.</summary>
public class ThemeSwatchVm
{
    public ThemeInfo Info { get; }
    public bool IsCurrent { get; }

    public ThemeSwatchVm(ThemeInfo info, bool isCurrent)
    {
        Info = info;
        IsCurrent = isCurrent;
    }

    public string Key => Info.Key;
    public string Display => Info.Display;
    public string Preview => Info.Preview;
    public string PreviewText => Info.PreviewText;
    public bool IsCustom => Info.IsCustom;
}

/// <summary>主题选择窗口里的一个分组:本地化标题 + 若干色板.IsFavorites 标识"收藏"分组(仅它支持拖动排序).</summary>
public class ThemeGroupVm
{
    public string Header { get; }
    public ObservableCollection<ThemeSwatchVm> Items { get; }

    /// <summary>是否为"收藏"分组:仅该分组启用拖拽重排。</summary>
    public bool IsFavorites { get; }

    public ThemeGroupVm(string header, IEnumerable<ThemeSwatchVm> items, bool isFavorites = false)
    {
        Header = header;
        Items = new ObservableCollection<ThemeSwatchVm>(items);
        IsFavorites = isFavorites;
    }
}
