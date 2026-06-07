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

/// <summary>主题选择窗口里的一个分组:本地化标题 + 若干色板.</summary>
public class ThemeGroupVm
{
    public string Header { get; }
    public ObservableCollection<ThemeSwatchVm> Items { get; }

    public ThemeGroupVm(string header, IEnumerable<ThemeSwatchVm> items)
    {
        Header = header;
        Items = new ObservableCollection<ThemeSwatchVm>(items);
    }
}
