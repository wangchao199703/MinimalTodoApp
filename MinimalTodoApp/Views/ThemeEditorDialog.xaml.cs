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

    // 在编辑器里直接编辑的颜色(其余颜色从基础主题复制).Label 用资源 key,构建字段时按当前语言解析.
    private static readonly (string Key, string LabelKey)[] Editable =
    {
        ("WindowBg", "S.ThemeField.WindowBg"),
        ("TitleBarBg", "S.ThemeField.TitleBar"),
        ("SidebarBg", "S.ThemeField.Sidebar"),
        ("CardBg", "S.ThemeField.Card"),
        ("InputBg", "S.ThemeField.Input"),
        ("PrimaryText", "S.ThemeField.PrimaryText"),
        ("SecondaryText", "S.ThemeField.SecondaryText"),
        ("Accent", "S.ThemeField.Accent"),
        ("AccentText", "S.ThemeField.AccentText"),
        ("Divider", "S.ThemeField.Divider"),
    };

    private readonly ObservableCollection<ColorField> _fields = new();

    /// <summary>非模态保存回调(设置后走非模态:保存时回调并直接 Close，不使用 DialogResult)。</summary>
    private readonly Action<CustomTheme>? _onSave;

    /// <summary>编辑模式下被编辑的既有自定义主题(null=新建)。编辑时保留其 Key 与未编辑的颜色键。</summary>
    private readonly CustomTheme? _editing;

    /// <summary>当前正在取色的字段(色块弹出取色器时设置)。</summary>
    private ColorField? _activeField;

    /// <summary>打开编辑器时主程序正应用的主题:取消(未保存关闭)时还原到它。</summary>
    private readonly string _originalTheme = ThemeManager.Current;

    /// <summary>构造完成后才允许实时预览,避免初始化填充字段时就抢先换肤。</summary>
    private bool _ready;

    /// <summary>是否已保存:已保存则关闭时不再还原旧主题。</summary>
    private bool _saved;

    public CustomTheme? ResultTheme { get; private set; }

    public ThemeEditorDialog()
    {
        InitializeComponent();

        FieldList.ItemsSource = _fields;

        // 基础主题:仅内置主题
        var baseThemes = ThemeManager.AllThemes().Where(t => !t.IsCustom).ToList();
        BaseBox.ItemsSource = baseThemes;
        BaseBox.SelectedIndex = 0;   // 触发 SelectionChanged -> 填充字段

        // 取色器选色实时写回当前字段(色块/小字预览随之刷新 → 触发整体实时预览)
        Picker.ColorChanged += hex =>
        {
            if (_activeField != null) _activeField.Value = hex;
        };

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) CloseCancelled();
        };

        // 关闭(任何途径:Esc/取消/点 X)且未保存 → 还原旧主题
        Closed += (_, __) => { if (!_saved) ThemeManager.Apply(_originalTheme); };

        _ready = true;
    }

    /// <summary>非模态新建用法:传入保存回调，调用 Show() 即可与主题窗口并存。</summary>
    public ThemeEditorDialog(Action<CustomTheme> onSave) : this()
    {
        _onSave = onSave;
    }

    /// <summary>非模态编辑用法:预填既有自定义主题，保存时保留其 Key 与未编辑键。</summary>
    public ThemeEditorDialog(CustomTheme editing, Action<CustomTheme> onSave) : this()
    {
        _onSave = onSave;
        _editing = editing;

        Title = Loc.T("S.ThemeEditor.EditTitle");
        TitleText.Text = Loc.T("S.ThemeEditor.EditTitle");
        NameBox.Text = editing.Display;

        // 用该主题自身颜色覆盖默认字段值
        _fields.Clear();
        foreach (var (key, labelKey) in Editable)
        {
            editing.Colors.TryGetValue(key, out var hex);
            AddField(new ColorField { Key = key, Label = Loc.T(labelKey), Value = hex ?? "#FFFFFF" });
        }
    }

    /// <summary>加入字段并订阅其颜色变化以驱动实时预览。</summary>
    private void AddField(ColorField f)
    {
        f.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(ColorField.Value)) ApplyPreview();
        };
        _fields.Add(f);
    }

    /// <summary>按当前字段值组装完整 17 色 + PopupBg，并对未直接编辑、但日历/弹窗依赖的辅助色
    /// 由已编辑色派生(而非沿用基础主题)，保证整体(含日历)风格协调。</summary>
    private Dictionary<string, string> BuildColors()
    {
        Dictionary<string, string> colors;
        if (_editing != null)
            colors = new Dictionary<string, string>(_editing.Colors);
        else if (BaseBox.SelectedItem is ThemeInfo baseInfo)
            colors = ThemeManager.ReadColors(baseInfo.Key);
        else
            colors = new Dictionary<string, string>();

        foreach (var f in _fields)
            colors[f.Key] = string.IsNullOrWhiteSpace(f.Value) ? "#FFFFFF" : f.Value.Trim();

        string Get(string k, string fb) => colors.TryGetValue(k, out var v) && !string.IsNullOrWhiteSpace(v) ? v : fb;
        string windowBg = Get("WindowBg", "#FFFFFFFF");
        string cardBg = Get("CardBg", windowBg);
        string primary = Get("PrimaryText", "#FF000000");
        string secondary = Get("SecondaryText", primary);
        string accent = Get("Accent", "#FF808080");

        // 派生辅助色:内容区跟随窗口底;悬停=卡片向文字微混;选中=卡片掺入强调色;次要弱化文字;弹窗=卡片底
        colors["ContentBg"] = windowBg;
        colors["CardHoverBg"] = ThemeManager.Mix(cardBg, primary, 0.08);
        colors["SelectedItemBg"] = ThemeManager.Mix(cardBg, accent, 0.18);
        colors["MutedText"] = ThemeManager.Mix(secondary, windowBg, 0.35);
        colors["PopupBg"] = cardBg;

        foreach (var k in ThemeManager.ColorKeys)
            if (!colors.ContainsKey(k)) colors[k] = "#FF808080";

        return colors;
    }

    /// <summary>实时预览当前配色(不持久化、不改 Current);构造期间不触发。</summary>
    private void ApplyPreview()
    {
        if (!_ready) return;
        ThemeManager.Preview(BuildColors());
    }

    /// <summary>点击色块:把取色器定位到该色块并预置其当前颜色。</summary>
    private void Swatch_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement fe || fe.Tag is not ColorField field) return;
        _activeField = field;
        Picker.SetHex(field.Value);
        ColorPopup.PlacementTarget = fe;
        ColorPopup.IsOpen = true;
    }

    /// <summary>取消关闭:模态用 DialogResult，非模态直接 Close(设 DialogResult 会抛异常)。</summary>
    private void CloseCancelled()
    {
        if (_onSave == null) DialogResult = false;
        Close();
    }

    private void BaseBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (BaseBox.SelectedItem is not ThemeInfo info) return;
        var colors = ThemeManager.ReadColors(info.Key);

        _fields.Clear();
        foreach (var (key, labelKey) in Editable)
        {
            colors.TryGetValue(key, out var hex);
            AddField(new ColorField { Key = key, Label = Loc.T(labelKey), Value = hex ?? "#FFFFFF" });
        }

        ApplyPreview();   // 切换基础主题即时预览
    }

    private void Ok_Click(object sender, RoutedEventArgs e)
    {
        // 新建模式校验基础主题存在;颜色统一由 BuildColors 组装(含派生辅助色 + 补齐 17 键)
        if (_editing == null && BaseBox.SelectedItem is not ThemeInfo) { CloseCancelled(); return; }

        string key = _editing?.Key ?? ("Custom_" + Guid.NewGuid().ToString("N").Substring(0, 8));
        var colors = BuildColors();
        var name = string.IsNullOrWhiteSpace(NameBox.Text) ? Loc.T("S.ThemeEditor.DefaultName") : NameBox.Text.Trim();

        ResultTheme = new CustomTheme
        {
            Key = key,
            Display = name,
            Colors = colors
        };

        _saved = true;   // 关闭时不再还原旧主题

        if (_onSave != null)
        {
            _onSave(ResultTheme);   // 非模态:回调注册并应用
            Close();
        }
        else
        {
            DialogResult = true;
            Close();
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e) => CloseCancelled();
}
