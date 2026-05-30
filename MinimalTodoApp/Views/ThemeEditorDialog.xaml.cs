using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using CommunityToolkit.Mvvm.ComponentModel;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Views;

/// <summary>
/// 自定义主题编辑器:以某个现有主题为基础，编辑若干主要颜色，其余颜色沿用基础主题.
/// 保存后通过 <see cref="ResultTheme"/> 暴露结果.
/// </summary>
public partial class ThemeEditorDialog : Window
{
    /// <summary>暴露给 UI 编辑的主要颜色字段.</summary>
    public partial class ColorField : ObservableObject
    {
        public string Key { get; init; } = string.Empty;
        public string Label { get; init; } = string.Empty;

        [ObservableProperty]
        private string value = "#FFFFFF";
    }

    // 在编辑器里直接编辑的颜色(其余颜色从基础主题复制)
    private static readonly (string Key, string Label)[] Editable =
    {
        ("WindowBg", "窗口背景"),
        ("TitleBarBg", "标题栏"),
        ("SidebarBg", "侧边栏"),
        ("CardBg", "卡片"),
        ("InputBg", "输入框"),
        ("PrimaryText", "主文字"),
        ("SecondaryText", "次文字"),
        ("Accent", "强调色"),
        ("AccentText", "强调文字"),
        ("Divider", "分隔线"),
    };

    private readonly ObservableCollection<ColorField> _fields = new();

    public CustomTheme? ResultTheme { get; private set; }

    public ThemeEditorDialog()
    {
        InitializeComponent();

        FieldList.ItemsSource = _fields;

        // 基础主题:仅内置主题
        var baseThemes = ThemeManager.AllThemes().Where(t => !t.IsCustom).ToList();
        BaseBox.ItemsSource = baseThemes;
        BaseBox.SelectedIndex = 0;   // 触发 SelectionChanged -> 填充字段

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) { DialogResult = false; Close(); }
        };
    }

    private void BaseBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (BaseBox.SelectedItem is not ThemeInfo info) return;
        var colors = ThemeManager.ReadColors(info.Key);

        _fields.Clear();
        foreach (var (key, label) in Editable)
        {
            colors.TryGetValue(key, out var hex);
            _fields.Add(new ColorField { Key = key, Label = label, Value = hex ?? "#FFFFFF" });
        }
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        if (BaseBox.SelectedItem is not ThemeInfo baseInfo) { DialogResult = false; Close(); return; }

        // 先复制基础主题全部颜色，再用编辑值覆盖
        var colors = ThemeManager.ReadColors(baseInfo.Key);
        foreach (var f in _fields)
            colors[f.Key] = string.IsNullOrWhiteSpace(f.Value) ? "#FFFFFF" : f.Value.Trim();

        // 确保 17 个键齐全
        foreach (var key in ThemeManager.ColorKeys)
            if (!colors.ContainsKey(key))
                colors[key] = "#FF808080";

        var name = string.IsNullOrWhiteSpace(NameBox.Text) ? "我的主题" : NameBox.Text.Trim();

        ResultTheme = new CustomTheme
        {
            Key = "Custom_" + Guid.NewGuid().ToString("N").Substring(0, 8),
            Display = name,
            Colors = new Dictionary<string, string>(colors)
        };

        DialogResult = true;
        Close();
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
