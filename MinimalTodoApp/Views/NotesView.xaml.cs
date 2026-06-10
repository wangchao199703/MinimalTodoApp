using System;
using System.ComponentModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>
/// 便签视图:单一 RichTextBox 富文本编辑器(原生跨行选择/复制/撤销).
/// 正文以 Markdown 字符串持久化:打开便签时解析为 FlowDocument,编辑后再序列化回 Markdown.
/// 格式经工具栏 + Ctrl+B/I/U;支持 标题/无序列表/任务项(可勾选)。
/// </summary>
public partial class NotesView : UserControl
{
    private MainViewModel? _vm;
    private NotesViewModel? Vm => _vm?.NotesVm;

    /// <summary>程序化加载/重建文档期间抑制 TextChanged 回写.</summary>
    private bool _suppress;

    /// <summary>标题字号的基准(普通正文字号),来自主 VM.FontSize.</summary>
    private double _baseFontSize = 14;

    public NotesView()
    {
        InitializeComponent();
    }

    /// <summary>由 MainWindow 调用:绑定数据上下文并订阅便签切换.</summary>
    public void Init(MainViewModel vm)
    {
        if (_vm == vm || vm.NotesVm == null) return;
        _vm = vm;
        _baseFontSize = vm.FontSize > 0 ? vm.FontSize : 14;
        DataContext = vm.NotesVm;
        vm.NotesVm.PropertyChanged += OnNotesVmPropertyChanged;
        LoadDocument();
    }

    private void OnNotesVmPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(NotesViewModel.SelectedNote))
            LoadDocument();
    }

    /// <summary>把当前选中便签的 Markdown 正文解析进编辑器(无选中则清空).</summary>
    private void LoadDocument()
    {
        if (_vm != null && _vm.FontSize > 0) _baseFontSize = _vm.FontSize;

        _suppress = true;
        try
        {
            var note = Vm?.SelectedNote;
            Editor.IsReadOnly = note == null;
            Editor.Document = note == null
                ? new FlowDocument()
                : MarkdownFlowDocument.ToFlowDocument(note.Content, _baseFontSize, OnCheckToggled);
        }
        finally
        {
            _suppress = false;
        }
    }

    private void Editor_TextChanged(object sender, TextChangedEventArgs e) => SaveCurrent();

    /// <summary>任务复选框被勾选/取消:复选框切换不触发 TextChanged,需手动回写.</summary>
    private void OnCheckToggled() => SaveCurrent();

    /// <summary>把编辑器内容序列化回当前便签的 Markdown 正文并请求防抖保存.</summary>
    private void SaveCurrent()
    {
        if (_suppress) return;
        if (Vm?.SelectedNote is not { } note) return;
        note.Content = MarkdownFlowDocument.ToMarkdown(Editor.Document);
        Vm.RequestSave();
    }

    // ===================== 工具栏 =====================

    private void BoldButton_Click(object sender, RoutedEventArgs e)
    {
        EditingCommands.ToggleBold.Execute(null, Editor);
        Editor.Focus();
    }

    private void ItalicButton_Click(object sender, RoutedEventArgs e)
    {
        EditingCommands.ToggleItalic.Execute(null, Editor);
        Editor.Focus();
    }

    private void UnderlineButton_Click(object sender, RoutedEventArgs e)
    {
        EditingCommands.ToggleUnderline.Execute(null, Editor);
        Editor.Focus();
    }

    /// <summary>删除线:对选区套用/取消 Strikethrough(空选区无操作).</summary>
    private void StrikeButton_Click(object sender, RoutedEventArgs e)
    {
        var sel = Editor.Selection;
        if (sel.IsEmpty) { Editor.Focus(); return; }

        bool has = sel.GetPropertyValue(Inline.TextDecorationsProperty) is TextDecorationCollection td
                   && td.Any(d => d.Location == TextDecorationLocation.Strikethrough);
        sel.ApplyPropertyValue(Inline.TextDecorationsProperty,
            has ? null : TextDecorations.Strikethrough);
        Editor.Focus();
        SaveCurrent();
    }

    /// <summary>标题循环:普通 → H1 → H2 → H3 → 普通.作用于光标所在段落.</summary>
    private void HeadingButton_Click(object sender, RoutedEventArgs e)
    {
        if (Editor.CaretPosition.Paragraph is not { } p) return;
        string? next = (p.Tag as string) switch
        {
            "H1" => "H2",
            "H2" => "H3",
            "H3" => null,
            _ => "H1",
        };
        SetParagraphType(p, next);
    }

    private void BulletButton_Click(object sender, RoutedEventArgs e)
    {
        if (Editor.CaretPosition.Paragraph is not { } p) return;
        SetParagraphType(p, (p.Tag as string) == "Bullet" ? null : "Bullet");
    }

    private void TaskButton_Click(object sender, RoutedEventArgs e)
    {
        if (Editor.CaretPosition.Paragraph is not { } p) return;
        SetParagraphType(p, (p.Tag as string) == "Task" ? null : "Task");
    }

    /// <summary>把段落切换为指定块类型:维护行首标记(复选框/圆点)与标题字号字重。</summary>
    private void SetParagraphType(Paragraph p, string? type)
    {
        // 移除旧的行首标记(无序/任务)
        if (p.Inlines.FirstInline is InlineUIContainer oldMarker)
            p.Inlines.Remove(oldMarker);

        MarkdownFlowDocument.ApplyBlockStyle(p, type, _baseFontSize);
        p.Tag = type;

        InlineUIContainer? marker = type switch
        {
            "Task" => MarkdownFlowDocument.NewTaskMarker(false, OnCheckToggled),
            "Bullet" => MarkdownFlowDocument.NewBulletMarker(),
            _ => null,
        };
        if (marker != null)
        {
            if (p.Inlines.FirstInline != null) p.Inlines.InsertBefore(p.Inlines.FirstInline, marker);
            else p.Inlines.Add(marker);
        }

        Editor.Focus();
        SaveCurrent();
    }
}
