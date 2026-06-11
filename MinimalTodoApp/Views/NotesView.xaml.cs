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
        // 拦截粘贴:剪贴板含图片时存盘并内嵌(而非粘贴不持久化的位图)
        DataObject.AddPastingHandler(Editor, Editor_Pasting);
    }

    /// <summary>由 MainWindow 调用:绑定数据上下文并订阅便签切换.</summary>
    public void Init(MainViewModel vm)
    {
        if (_vm == vm || vm.NotesVm == null) return;
        _vm = vm;
        _baseFontSize = vm.NotesVm.NoteFontSize > 0 ? vm.NotesVm.NoteFontSize : 14;
        DataContext = vm.NotesVm;
        vm.NotesVm.PropertyChanged += OnNotesVmPropertyChanged;
        LoadDocument();
    }

    private void OnNotesVmPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        // 切换便签、或在「收集箱」设置里改便签字体/字号/行距时都重建文档(字号变化需重算标题等)
        if (e.PropertyName == nameof(NotesViewModel.SelectedNote)
            || e.PropertyName == nameof(NotesViewModel.NoteFontSize)
            || e.PropertyName == nameof(NotesViewModel.NoteFontFamily)
            || e.PropertyName == nameof(NotesViewModel.NoteLineSpacing))
            LoadDocument();
    }

    /// <summary>把当前选中便签的 Markdown 正文解析进编辑器(无选中则清空).</summary>
    private void LoadDocument()
    {
        // 便签使用「收集箱」设置里的便签专属字体/字号/行距(与任务区独立,默认继承全局).
        if (Vm != null && Vm.NoteFontSize > 0) _baseFontSize = Vm.NoteFontSize;

        _suppress = true;
        try
        {
            var note = Vm?.SelectedNote;
            Editor.IsReadOnly = note == null;
            // 字体/字号跟随 XAML 上对便签设置的绑定(NoteFontFamily / NoteFontSize)，此处不覆盖.

            Editor.Document = note == null
                ? new FlowDocument()
                : MarkdownFlowDocument.ToFlowDocument(note.Content, _baseFontSize, OnCheckToggled);

            // 行距(整篇默认):便签基准字号 × 便签行距倍率
            double spacing = Vm?.NoteLineSpacing ?? 1.1;
            if (spacing > 0) Editor.Document.LineHeight = _baseFontSize * spacing;
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

    // ===================== 字体颜色 / 字号 =====================

    private static readonly string[] SwatchColors =
    {
        "#E11D48", "#EA580C", "#F59E0B", "#16A34A", "#0891B2",
        "#2563EB", "#7C3AED", "#DB2777", "#111827", "#6B7280",
    };
    private bool _palettesBuilt;

    private void BuildPalettes()
    {
        if (_palettesBuilt) return;
        _palettesBuilt = true;

        foreach (var hex in SwatchColors)
        {
            var btn = new Button
            {
                Width = 24,
                Height = 24,
                Margin = new Thickness(3),
                Cursor = Cursors.Hand,
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)!),
                BorderThickness = new Thickness(0),
                Tag = hex,
            };
            btn.Template = BuildSwatchTemplate();
            btn.Click += (_, _) => { ColorPopup.IsOpen = false; ApplyColor(hex); };
            ColorSwatches.Children.Add(btn);
        }
    }

    private ControlTemplate BuildSwatchTemplate()
    {
        var border = new FrameworkElementFactory(typeof(Border));
        border.SetValue(Border.CornerRadiusProperty, new CornerRadius(5));
        border.SetBinding(Border.BackgroundProperty,
            new System.Windows.Data.Binding("Background") { RelativeSource = System.Windows.Data.RelativeSource.TemplatedParent });
        border.SetValue(Border.BorderBrushProperty, (Brush)FindResource("Divider"));
        border.SetValue(Border.BorderThicknessProperty, new Thickness(1));
        var tpl = new ControlTemplate(typeof(Button)) { VisualTree = border };
        return tpl;
    }

    private void ColorButton_Click(object sender, RoutedEventArgs e)
    {
        BuildPalettes();
        ColorPopup.IsOpen = true;
    }

    // ===================== 插入图片 =====================

    private void InsertImage_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.SelectedNote == null) return;
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Filter = "图片 Images|*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp|所有文件 All files|*.*",
        };
        if (dlg.ShowDialog() != true) return;

        var fileName = NoteImageStore.Import(dlg.FileName);
        if (fileName != null) InsertImageByFileName(fileName);
    }

    /// <summary>把仓库内图片文件名作为独占一行的图片插入到光标段落之后并保存.</summary>
    private void InsertImageByFileName(string fileName)
    {
        var image = MarkdownFlowDocument.NewImageInline(fileName);
        var para = new Paragraph(image) { Margin = new Thickness(0) };
        var caretPara = Editor.CaretPosition?.Paragraph;
        if (caretPara != null) Editor.Document.Blocks.InsertAfter(caretPara, para);
        else Editor.Document.Blocks.Add(para);

        Editor.Focus();
        SaveCurrent();
    }

    /// <summary>粘贴:剪贴板含图片(且非纯文本)时存盘内嵌，取消默认粘贴.</summary>
    private void Editor_Pasting(object sender, DataObjectPastingEventArgs e)
    {
        if (Vm?.SelectedNote == null) return;
        var d = e.DataObject;
        bool hasImage = d.GetDataPresent(DataFormats.Bitmap);
        bool hasText = d.GetDataPresent(DataFormats.UnicodeText) || d.GetDataPresent(DataFormats.Text);
        if (!hasImage || hasText) return;   // 文本粘贴走默认逻辑

        var fileName = NoteImageStore.SaveBitmap(System.Windows.Clipboard.GetImage());
        if (fileName != null)
        {
            InsertImageByFileName(fileName);
            e.CancelCommand();   // 阻止默认(不持久化的)位图粘贴
        }
    }

    /// <summary>拖拽悬停:拖入图片文件/位图时允许放置.</summary>
    private void Editor_PreviewDragOver(object sender, DragEventArgs e)
    {
        if (DragHasImage(e.Data))
        {
            e.Effects = DragDropEffects.Copy;
            e.Handled = true;
        }
    }

    /// <summary>拖拽放置:把拖入的图片文件/位图存盘并内嵌.</summary>
    private void Editor_PreviewDrop(object sender, DragEventArgs e)
    {
        if (Vm?.SelectedNote == null || !DragHasImage(e.Data)) return;

        bool inserted = false;
        if (e.Data.GetDataPresent(DataFormats.FileDrop) &&
            e.Data.GetData(DataFormats.FileDrop) is string[] files)
        {
            foreach (var f in files)
            {
                if (!NoteImageStore.IsImageFile(f)) continue;
                var fn = NoteImageStore.Import(f);
                if (fn != null) { InsertImageByFileName(fn); inserted = true; }
            }
        }
        else if (e.Data.GetDataPresent(DataFormats.Bitmap))
        {
            var fn = NoteImageStore.SaveBitmap(e.Data.GetData(DataFormats.Bitmap) as System.Windows.Media.Imaging.BitmapSource);
            if (fn != null) { InsertImageByFileName(fn); inserted = true; }
        }

        if (inserted) e.Handled = true;
    }

    /// <summary>拖拽数据是否含可内嵌的图片(图片文件 或 位图).</summary>
    private static bool DragHasImage(IDataObject data)
    {
        if (data.GetDataPresent(DataFormats.Bitmap)) return true;
        if (data.GetDataPresent(DataFormats.FileDrop) &&
            data.GetData(DataFormats.FileDrop) is string[] files)
            return files.Any(NoteImageStore.IsImageFile);
        return false;
    }

    private void ApplyColor(string hex)
    {
        var sel = Editor.Selection;
        if (sel.IsEmpty) { Editor.Focus(); return; }
        try
        {
            var color = (Color)ColorConverter.ConvertFromString(hex)!;
            sel.ApplyPropertyValue(TextElement.ForegroundProperty, new SolidColorBrush(color));
        }
        catch { /* 非法颜色忽略 */ }
        Editor.Focus();
        SaveCurrent();
    }

    private void ClearColor_Click(object sender, RoutedEventArgs e)
    {
        ColorPopup.IsOpen = false;
        ClearSelectionProperty(TextElement.ForegroundProperty);
    }

    /// <summary>清除选区内各 Inline 的某个本地属性(着色/字号「默认」)。</summary>
    private void ClearSelectionProperty(DependencyProperty prop)
    {
        var sel = Editor.Selection;
        if (sel.IsEmpty) { Editor.Focus(); return; }
        var p = sel.Start;
        while (p != null && p.CompareTo(sel.End) < 0)
        {
            if (p.Parent is Inline inl) inl.ClearValue(prop);
            var next = p.GetNextContextPosition(LogicalDirection.Forward);
            if (next == null) break;
            p = next;
        }
        Editor.Focus();
        SaveCurrent();
    }

    // ===================== 右键:加入到待办 =====================

    private void EditorMenu_Opened(object sender, RoutedEventArgs e)
    {
        // 仅当有选中文本时可「加入到待办」
        AddToTodoMenuItem.IsEnabled = !Editor.Selection.IsEmpty
                                      && !string.IsNullOrWhiteSpace(Editor.Selection.Text);
    }

    private void AddSelectionToTodo_Click(object sender, RoutedEventArgs e)
    {
        var text = Editor.Selection.Text;
        if (_vm != null && !string.IsNullOrWhiteSpace(text))
            _vm.AddTaskFromText(text);
    }
}
