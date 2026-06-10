using System;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>
/// 便签视图:类 Typora/Notion 的单栏实时渲染块编辑器.
/// 每块由 显示层 TextBlock(渲染 **加粗**) 与 编辑层 TextBox(原始文本) 互斥构成，同一时刻最多一个块在编辑.
/// 输入触发器把行首 "# "/"## "/"### "/"- "/"- [ ] " 即时转换为对应块类型并吃掉标记;
/// IME 组合输入期间(中文等)挂起触发器，避免组合串被误转换.
/// </summary>
public partial class NotesView : UserControl
{
    private MainViewModel? _vm;
    private NotesViewModel? Vm => _vm?.NotesVm;

    /// <summary>IME 组合输入进行中(TextChanged 触发器必须挂起).</summary>
    private bool _imeComposing;

    /// <summary>程序化改 TextBox.Text 期间抑制 TextChanged 重入.</summary>
    private bool _converting;

    /// <summary>最后一个进入过编辑态的块(工具栏在无编辑块时作用于它).</summary>
    private NoteBlock? _lastActiveBlock;

    /// <summary>当前持有焦点的编辑框(供工具栏加粗等操作).</summary>
    private TextBox? _activeEditor;

    // ----- 进入编辑时的光标定位意图(BlockEditor_IsVisibleChanged 消费后清空) -----
    private NoteBlock? _editTarget;
    private int _caretIndex = -1;        // >=0:按字符索引
    private Point? _caretPoint;          // 点击显示层的位置
    private int _caretColumn = -1;       // 上下键跨块:目标列
    private bool _caretAtLastLine;       // true=定位到目标块末视觉行(向上移动时)

    public NotesView()
    {
        InitializeComponent();

        // IME 组合状态守卫:Preview* 事件自根隧道下行，挂在 UserControl 即可覆盖所有块编辑框.
        TextCompositionManager.AddPreviewTextInputStartHandler(this, (_, _) => _imeComposing = true);
        TextCompositionManager.AddPreviewTextInputUpdateHandler(this, (_, _) => _imeComposing = true);
        TextCompositionManager.AddPreviewTextInputHandler(this, (_, _) => _imeComposing = false);
    }

    /// <summary>首次打开便签视图时由 MainWindow 调用.</summary>
    public void Init(MainViewModel vm)
    {
        if (_vm == vm) return;
        _vm = vm;
        DataContext = vm.NotesVm;
        vm.NotesVm?.EnsureNoteSelected();
    }

    private static NoteBlock? BlockOf(object sender) =>
        (sender as FrameworkElement)?.DataContext as NoteBlock;

    // ===================== 编辑态切换与光标定位 =====================

    /// <summary>把指定块设为唯一编辑块，并记录期望的光标位置.</summary>
    private void BeginEdit(NoteBlock block, int caretIndex = -1, Point? clickPoint = null,
                           int column = -1, bool atLastLine = false)
    {
        if (Vm == null) return;
        _editTarget = block;
        _caretIndex = caretIndex;
        _caretPoint = clickPoint;
        _caretColumn = column;
        _caretAtLastLine = atLastLine;

        foreach (var b in Vm.CurrentBlocks)
            if (!ReferenceEquals(b, block) && b.IsEditing)
                b.IsEditing = false;
        block.IsEditing = true;
        _lastActiveBlock = block;
    }

    private void BlockDisplay_Click(object sender, MouseButtonEventArgs e)
    {
        var block = BlockOf(sender);
        if (block == null) return;
        // 记录点击点(显示层与编辑层 Padding 一致，坐标可直接复用换算光标)
        BeginEdit(block, clickPoint: e.GetPosition((IInputElement)sender));
    }

    private void BlockEditor_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (sender is not TextBox tb || e.NewValue is not true) return;
        if (!ReferenceEquals(tb.DataContext, _editTarget)) return;

        // 等布局完成再聚焦与定位光标(模板刚切换可见性，行信息尚未生成)
        tb.Dispatcher.BeginInvoke(new Action(() =>
        {
            tb.UpdateLayout();
            tb.Focus();
            _activeEditor = tb;

            int caret = tb.Text.Length;   // 默认末尾
            if (_caretIndex >= 0)
            {
                caret = Math.Min(_caretIndex, tb.Text.Length);
            }
            else if (_caretPoint.HasValue)
            {
                int i = tb.GetCharacterIndexFromPoint(_caretPoint.Value, true);
                if (i >= 0) caret = i;
            }
            else if (_caretColumn >= 0 && tb.LineCount > 0)
            {
                int line = _caretAtLastLine ? tb.LineCount - 1 : 0;
                int start = tb.GetCharacterIndexFromLineIndex(line);
                int len = tb.GetLineLength(line);
                // 行尾若是换行符不计入列
                caret = start + Math.Min(_caretColumn, Math.Max(0, len));
                caret = Math.Min(caret, tb.Text.Length);
            }
            tb.CaretIndex = caret;
            tb.BringIntoView();

            _editTarget = null;
            _caretIndex = -1;
            _caretPoint = null;
            _caretColumn = -1;
        }), DispatcherPriority.Loaded);
    }

    private void BlockEditor_LostFocus(object sender, KeyboardFocusChangedEventArgs e)
    {
        if (BlockOf(sender) is { } block) block.IsEditing = false;
        if (ReferenceEquals(_activeEditor, sender)) _activeEditor = null;
    }

    // ===================== 输入触发器(Markdown 前缀实时转换) =====================

    /// <summary>段落块可用的前缀(长前缀优先).</summary>
    private static readonly (string Prefix, NoteBlockType Type, bool Checked)[] ParagraphPrefixes =
    {
        ("- [x] ", NoteBlockType.Task, true),
        ("- [X] ", NoteBlockType.Task, true),
        ("- [ ] ", NoteBlockType.Task, false),
        ("### ",   NoteBlockType.H3,   false),
        ("## ",    NoteBlockType.H2,   false),
        ("# ",     NoteBlockType.H1,   false),
        ("- ",     NoteBlockType.Bullet, false),
    };

    /// <summary>无序列表块内升级为任务块的前缀(渐进输入路径:先 "- " 后 "[ ] ").</summary>
    private static readonly (string Prefix, bool Checked)[] BulletUpgradePrefixes =
    {
        ("[x] ", true),
        ("[X] ", true),
        ("[ ] ", false),
    };

    private void BlockEditor_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_imeComposing || _converting) return;
        if (sender is not TextBox tb || BlockOf(tb) is not { } block) return;

        string t = tb.Text;

        if (block.Type == NoteBlockType.Paragraph)
        {
            foreach (var (prefix, type, isChecked) in ParagraphPrefixes)
            {
                if (!t.StartsWith(prefix, StringComparison.Ordinal)) continue;
                ConvertBlock(tb, block, type, isChecked, prefix.Length);
                return;
            }
        }
        else if (block.Type == NoteBlockType.Bullet)
        {
            foreach (var (prefix, isChecked) in BulletUpgradePrefixes)
            {
                if (!t.StartsWith(prefix, StringComparison.Ordinal)) continue;
                ConvertBlock(tb, block, NoteBlockType.Task, isChecked, prefix.Length);
                return;
            }
        }
    }

    /// <summary>执行块类型转换:改类型、吃掉前缀、光标回退.</summary>
    private void ConvertBlock(TextBox tb, NoteBlock block, NoteBlockType type, bool isChecked, int cut)
    {
        int caret = tb.CaretIndex;
        block.Type = type;
        if (type == NoteBlockType.Task) block.IsChecked = isChecked;

        _converting = true;
        tb.Text = tb.Text[cut..];   // 经 TwoWay 绑定写回 block.Text
        _converting = false;
        tb.CaretIndex = Math.Max(0, caret - cut);
    }

    // ===================== 键盘:拆分/合并/跨块移动/加粗 =====================

    private void BlockEditor_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (sender is not TextBox tb || BlockOf(tb) is not { } block || Vm == null) return;

        switch (e.Key)
        {
            case Key.Enter:
                HandleEnter(tb, block);
                e.Handled = true;
                return;

            case Key.Back when tb.CaretIndex == 0 && tb.SelectionLength == 0:
                e.Handled = HandleBackspaceAtStart(tb, block);
                return;

            case Key.Delete when tb.CaretIndex == tb.Text.Length && tb.SelectionLength == 0:
                e.Handled = HandleDeleteAtEnd(tb, block);
                return;

            case Key.Up:
                e.Handled = TryMoveAcrossBlocks(tb, block, up: true);
                return;

            case Key.Down:
                e.Handled = TryMoveAcrossBlocks(tb, block, up: false);
                return;

            case Key.B when Keyboard.Modifiers == ModifierKeys.Control:
                ToggleBold(tb);
                e.Handled = true;
                return;
        }
    }

    private void HandleEnter(TextBox tb, NoteBlock block)
    {
        if (Vm == null) return;

        // 空列表/任务块按 Enter:原地退化为段落(跳出列表)，不新建块
        if (block.Type is NoteBlockType.Bullet or NoteBlockType.Task && tb.Text.Length == 0)
        {
            block.Type = NoteBlockType.Paragraph;
            return;
        }

        int caret = tb.CaretIndex;
        string left = tb.Text[..caret];
        string right = tb.Text[caret..];

        // 列表/任务延续同类型(新任务块未勾选、未链接)，标题后接普通段落
        var newType = block.Type is NoteBlockType.Bullet or NoteBlockType.Task
            ? block.Type
            : NoteBlockType.Paragraph;

        _converting = true;
        block.Text = left;
        _converting = false;

        var newBlock = new NoteBlock { Type = newType, Text = right };
        int idx = Vm.CurrentBlocks.IndexOf(block);
        Vm.InsertBlock(idx + 1, newBlock);
        BeginEdit(newBlock, caretIndex: 0);
    }

    private bool HandleBackspaceAtStart(TextBox tb, NoteBlock block)
    {
        if (Vm == null) return false;

        // 非段落:先退化为段落(保留文本与链接信息)
        if (block.Type != NoteBlockType.Paragraph)
        {
            block.Type = NoteBlockType.Paragraph;
            return true;
        }

        // 段落:并入上一块
        int idx = Vm.CurrentBlocks.IndexOf(block);
        if (idx <= 0) return false;   // 首块 no-op

        var prev = Vm.CurrentBlocks[idx - 1];
        int pos = prev.Text.Length;
        prev.Text += tb.Text;
        Vm.RemoveBlock(block);
        BeginEdit(prev, caretIndex: pos);
        return true;
    }

    private bool HandleDeleteAtEnd(TextBox tb, NoteBlock block)
    {
        if (Vm == null) return false;
        int idx = Vm.CurrentBlocks.IndexOf(block);
        if (idx < 0 || idx >= Vm.CurrentBlocks.Count - 1) return false;

        var next = Vm.CurrentBlocks[idx + 1];
        int pos = tb.Text.Length;
        block.Text += next.Text;     // 合并丢弃 next 的块类型/链接(可接受)
        Vm.RemoveBlock(next);
        tb.CaretIndex = pos;
        return true;
    }

    /// <summary>上/下键在首/末视觉行时跨块移动光标(简化列保持).</summary>
    private bool TryMoveAcrossBlocks(TextBox tb, NoteBlock block, bool up)
    {
        if (Vm == null || tb.LineCount <= 0) return false;

        int line = tb.GetLineIndexFromCharacterIndex(tb.CaretIndex);
        if (up && line > 0) return false;                      // 不在首行:交给 TextBox 默认行为
        if (!up && line < tb.LineCount - 1) return false;      // 不在末行

        int idx = Vm.CurrentBlocks.IndexOf(block);
        int target = up ? idx - 1 : idx + 1;
        if (target < 0 || target >= Vm.CurrentBlocks.Count) return false;

        int col = tb.CaretIndex - tb.GetCharacterIndexFromLineIndex(line);
        BeginEdit(Vm.CurrentBlocks[target], column: col, atLastLine: up);
        return true;
    }

    // ===================== 工具栏 =====================

    /// <summary>工具栏作用目标:正在编辑的块，否则最后活动块.</summary>
    private NoteBlock? ToolbarTarget() =>
        Vm?.CurrentBlocks.FirstOrDefault(b => b.IsEditing)
        ?? (_lastActiveBlock != null && Vm?.CurrentBlocks.Contains(_lastActiveBlock) == true ? _lastActiveBlock : null);

    private void BoldButton_Click(object sender, RoutedEventArgs e)
    {
        if (_activeEditor != null) ToggleBold(_activeEditor);
    }

    /// <summary>加粗:选区包裹/解包 **;无选区插入 **** 光标居中.</summary>
    private void ToggleBold(TextBox tb)
    {
        int s = tb.SelectionStart, len = tb.SelectionLength;
        string t = tb.Text;

        _converting = true;
        try
        {
            if (len > 0)
            {
                string sel = t.Substring(s, len);
                // 选区两侧已是 ** → 解包
                if (s >= 2 && s + len + 2 <= t.Length
                    && t.Substring(s - 2, 2) == "**" && t.Substring(s + len, 2) == "**")
                {
                    tb.Text = t.Remove(s + len, 2).Remove(s - 2, 2);
                    tb.Select(s - 2, len);
                }
                // 选区自身带 ** → 去掉
                else if (len >= 4 && sel.StartsWith("**", StringComparison.Ordinal)
                         && sel.EndsWith("**", StringComparison.Ordinal))
                {
                    tb.Text = t.Remove(s + len - 2, 2).Remove(s, 2);
                    tb.Select(s, len - 4);
                }
                else
                {
                    tb.Text = t.Insert(s + len, "**").Insert(s, "**");
                    tb.Select(s + 2, len);
                }
            }
            else
            {
                tb.Text = t.Insert(s, "****");
                tb.CaretIndex = s + 2;
            }
        }
        finally
        {
            _converting = false;
        }
    }

    private void HeadingButton_Click(object sender, RoutedEventArgs e)
    {
        if (ToolbarTarget() is not { } block) return;
        block.Type = block.Type switch
        {
            NoteBlockType.Paragraph => NoteBlockType.H1,
            NoteBlockType.H1 => NoteBlockType.H2,
            NoteBlockType.H2 => NoteBlockType.H3,
            _ => NoteBlockType.Paragraph,
        };
    }

    private void BulletButton_Click(object sender, RoutedEventArgs e)
    {
        if (ToolbarTarget() is not { } block) return;
        block.Type = block.Type == NoteBlockType.Bullet ? NoteBlockType.Paragraph : NoteBlockType.Bullet;
    }

    private void TaskButton_Click(object sender, RoutedEventArgs e)
    {
        // Task ↔ Paragraph 切换(保留 Checked 与 LinkedTodoId，便于切回)
        if (ToolbarTarget() is not { } block) return;
        block.Type = block.Type == NoteBlockType.Task ? NoteBlockType.Paragraph : NoteBlockType.Task;
    }

    // ===================== 便签管理 / 提取待办 =====================

    private void DeleteNote_Click(object sender, RoutedEventArgs e)
    {
        if (Vm?.SelectedNote == null) return;
        var result = MessageBox.Show(
            Loc.T("S.Note.DeleteConfirm"), Loc.T("S.Note.Delete"),
            MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result != MessageBoxResult.Yes) return;

        Vm.DeleteSelectedNote();
        Vm.EnsureNoteSelected();   // 删到一篇不剩则自动新建空便签
    }

    /// <summary>切回待办列表的请求(MainWindow 订阅:自动提取任务块为待办、切换视图).</summary>
    public event Action? ExitRequested;

    private void BackToTasks_Click(object sender, RoutedEventArgs e) => ExitRequested?.Invoke();

    /// <summary>点击尾部留白:聚焦末块(空段落)或在末尾追加新段落.</summary>
    private void TailClicker_Click(object sender, MouseButtonEventArgs e)
    {
        if (Vm == null) return;
        Vm.EnsureNoteSelected();

        var last = Vm.CurrentBlocks.LastOrDefault();
        if (last != null && last.Type == NoteBlockType.Paragraph && last.Text.Length == 0)
        {
            BeginEdit(last);
            return;
        }
        var block = new NoteBlock();
        Vm.InsertBlock(Vm.CurrentBlocks.Count, block);
        BeginEdit(block);
    }
}
