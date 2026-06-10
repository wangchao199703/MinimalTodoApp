using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 便签模块的 ViewModel(由 MainViewModel 创建并持有，避免再撑大主 VM).
/// 职责:便签集合与当前便签的块集合、编辑防抖保存、新建/删除便签、
/// 「提取待办」以及 便签任务块 ↔ TodoItem 的 IsCompleted 双向同步.
/// </summary>
public partial class NotesViewModel : ObservableObject
{
    private readonly MainViewModel _main;

    /// <summary>编辑防抖保存(高频打字不写盘，停 0.8s 后落盘).</summary>
    private readonly DispatcherTimer _saveTimer;

    /// <summary>同步抑制:待办→便签写块 IsChecked 时不再回写待办(双保险，等值短路之外).</summary>
    private bool _syncing;

    /// <summary>防抖期间被编辑的便签(切换便签后落盘时仍应刷新它而非新选中的便签).</summary>
    private Note? _dirtyNote;

    public NotesViewModel(MainViewModel main, AppData data)
    {
        _main = main;

        Notes = new ObservableCollection<Note>(data.Notes);
        foreach (var n in Notes) EnsureAtLeastOneBlock(n);

        _saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(800) };
        _saveTimer.Tick += (_, _) => { _saveTimer.Stop(); CommitSave(); };

        // 恢复上次选中的便签(无则取第一篇;一篇都没有则保持 null，首次打开视图时再建)
        var restoreId = data.SelectedNoteId;
        selectedNote = (restoreId.HasValue ? Notes.FirstOrDefault(n => n.Id == restoreId.Value) : null)
                       ?? Notes.FirstOrDefault();
        CurrentBlocks = new ObservableCollection<NoteBlock>();
        RebuildCurrentBlocks();
    }

    /// <summary>全部便签(供下拉绑定).</summary>
    public ObservableCollection<Note> Notes { get; }

    /// <summary>当前便签的块集合(切换便签时重建;编辑器 ItemsControl 绑定它).</summary>
    public ObservableCollection<NoteBlock> CurrentBlocks { get; }

    [ObservableProperty]
    private Note? selectedNote;

    partial void OnSelectedNoteChanged(Note? oldValue, Note? newValue)
    {
        FlushPendingSave();           // 切换前先把上一篇落盘
        RebuildCurrentBlocks();
        _main.RequestSaveFromNotes(); // 持久化选中便签 Id
    }

    /// <summary>把 SelectedNote 的块装入 CurrentBlocks 并订阅块变化.</summary>
    private void RebuildCurrentBlocks()
    {
        foreach (var b in CurrentBlocks) b.PropertyChanged -= OnBlockPropertyChanged;
        CurrentBlocks.Clear();
        if (SelectedNote == null) return;

        EnsureAtLeastOneBlock(SelectedNote);
        foreach (var b in SelectedNote.Blocks)
        {
            b.IsEditing = false;
            b.PropertyChanged += OnBlockPropertyChanged;
            CurrentBlocks.Add(b);
        }
    }

    private static void EnsureAtLeastOneBlock(Note note)
    {
        if (note.Blocks.Count == 0)
            note.Blocks.Add(new NoteBlock());
    }

    // ===== 块的增删(编辑器调用，保持 Note.Blocks 与 CurrentBlocks 同步) =====

    public void InsertBlock(int index, NoteBlock block)
    {
        if (SelectedNote == null) return;
        index = Math.Clamp(index, 0, CurrentBlocks.Count);
        block.PropertyChanged += OnBlockPropertyChanged;
        CurrentBlocks.Insert(index, block);
        SelectedNote.Blocks.Insert(index, block);
        RequestSave();
    }

    public void RemoveBlock(NoteBlock block)
    {
        if (SelectedNote == null) return;
        block.PropertyChanged -= OnBlockPropertyChanged;
        CurrentBlocks.Remove(block);
        SelectedNote.Blocks.Remove(block);
        EnsureAtLeastOneBlock(SelectedNote);
        if (CurrentBlocks.Count == 0 && SelectedNote.Blocks.Count > 0)
        {
            // 删空后兜底块也要进入展示集合
            var b = SelectedNote.Blocks[0];
            b.PropertyChanged += OnBlockPropertyChanged;
            CurrentBlocks.Add(b);
        }
        RequestSave();
    }

    private void OnBlockPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (sender is not NoteBlock block) return;

        switch (e.PropertyName)
        {
            case nameof(NoteBlock.IsEditing):
                return;                       // 运行时状态，不保存
            case nameof(NoteBlock.IsChecked):
                // 便签 → 待办:已链接则同步全局待办的完成状态(走完整完成业务流)
                if (!_syncing && block.LinkedTodoId.HasValue)
                {
                    var todo = _main.FindItem(block.LinkedTodoId.Value);
                    if (todo != null && todo.IsCompleted != block.IsChecked)
                        todo.IsCompleted = block.IsChecked;
                }
                CommitSave();                 // 勾选状态立即落盘
                return;
            case nameof(NoteBlock.LinkedTodoId):
                CommitSave();
                return;
            default:                          // Text / Type 等内容变化:防抖
                RequestSave();
                return;
        }
    }

    // ===== 待办 → 便签 同步(MainViewModel.OnItemPropertyChanged 调用) =====

    /// <summary>全局待办完成状态变化时，同步所有便签中链接到它的任务块.</summary>
    public void SyncTodoCompletionToBlocks(Guid todoId, bool completed)
    {
        bool changed = false;
        _syncing = true;
        try
        {
            foreach (var note in Notes)
                foreach (var b in note.Blocks)
                    if (b.LinkedTodoId == todoId && b.IsChecked != completed)
                    {
                        b.IsChecked = completed;
                        changed = true;
                    }
        }
        finally
        {
            _syncing = false;
        }
        if (changed) CommitSave();
    }

    // ===== 便签管理 =====

    [RelayCommand]
    private void NewNote()
    {
        FlushPendingSave();
        var note = new Note();
        EnsureAtLeastOneBlock(note);
        Notes.Add(note);
        SelectedNote = note;
    }

    /// <summary>删除当前便签(视图层先弹确认).链接的 TodoItem 保留不动.</summary>
    public void DeleteSelectedNote()
    {
        if (SelectedNote == null) return;
        var idx = Notes.IndexOf(SelectedNote);
        Notes.Remove(SelectedNote);
        SelectedNote = Notes.Count > 0 ? Notes[Math.Clamp(idx, 0, Notes.Count - 1)] : null;
        CommitSave();
    }

    /// <summary>确保至少有一篇便签且已选中(首次打开便签视图时调用).</summary>
    public void EnsureNoteSelected()
    {
        if (SelectedNote != null) return;
        if (Notes.Count == 0)
        {
            var note = new Note();
            EnsureAtLeastOneBlock(note);
            Notes.Add(note);
        }
        SelectedNote = Notes[0];
    }

    // ===== 待办 → 便签(切到 MD 视图时调用) =====

    /// <summary>
    /// 把当前可见的待办带入当前便签:尚未链接的任务追加为任务块(文本=标题、勾选=完成态、建立链接)，
    /// 已链接的跳过——便签里于是始终能看到待办的 MD 形态;已有的 MD 文本原样保留.
    /// </summary>
    public void SyncTodosIntoNote(IEnumerable<TodoItem> items)
    {
        EnsureNoteSelected();
        if (SelectedNote == null) return;

        // 全部便签中已链接的待办都不重复带入(同一任务只在一处呈现)
        var linked = new HashSet<Guid>(
            Notes.SelectMany(n => n.Blocks)
                 .Where(b => b.LinkedTodoId.HasValue)
                 .Select(b => b.LinkedTodoId!.Value));

        bool added = false;
        foreach (var item in items)
        {
            if (linked.Contains(item.Id)) continue;

            // 追加位置:末尾的空段落之前(保持"尾部空段落"在最后，点击留白手感不变)
            int insertAt = CurrentBlocks.Count;
            while (insertAt > 0)
            {
                var prev = CurrentBlocks[insertAt - 1];
                if (prev.Type == NoteBlockType.Paragraph && prev.Text.Length == 0) insertAt--;
                else break;
            }

            InsertBlock(insertAt, new NoteBlock
            {
                Type = NoteBlockType.Task,
                Text = item.Title,
                IsChecked = item.IsCompleted,
                LinkedTodoId = item.Id,
            });
            added = true;
        }

        if (added) CommitSave();
    }

    // ===== 提取待办 =====

    /// <summary>
    /// 遍历当前便签的任务块:未链接(或链接悬空)的创建 TodoItem 并回写 LinkedTodoId;
    /// 已链接且待办仍存在的跳过(只建链接不重复创建).返回新建数量.
    /// </summary>
    public int ExtractTodos()
    {
        if (SelectedNote == null) return 0;

        int created = 0;
        foreach (var b in SelectedNote.Blocks.Where(b => b.Type == NoteBlockType.Task))
        {
            if (b.LinkedTodoId.HasValue)
            {
                if (_main.FindItem(b.LinkedTodoId.Value) != null) continue;   // 已链接且存在
                b.LinkedTodoId = null;                                        // 悬空自愈
            }

            var title = InlineMarkdown.PlainText(b.Text).Trim();
            if (title.Length == 0) continue;                                  // 空文本不提取

            var item = _main.AddTaskFromNote(title, b.IsChecked);
            b.LinkedTodoId = item.Id;
            created++;
        }

        if (created > 0) _main.AfterTasksAddedFromNote();
        CommitSave();
        return created;
    }

    // ===== 保存 =====

    /// <summary>内容变化后请求防抖保存(刷新标题与更新时间，停止输入 0.8s 后落盘).</summary>
    public void RequestSave()
    {
        _dirtyNote = SelectedNote;
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    /// <summary>立即落盘(勾选/增删便签/切换/退出时).</summary>
    private void CommitSave()
    {
        _saveTimer.Stop();
        var note = _dirtyNote ?? SelectedNote;
        _dirtyNote = null;
        if (note != null)
        {
            note.UpdatedAt = DateTime.Now;
            RefreshTitle(note);
        }
        _main.RequestSaveFromNotes();
    }

    /// <summary>把可能挂起的防抖保存立即执行(应用退出/切换便签前调用).</summary>
    public void FlushPendingSave()
    {
        if (_saveTimer.IsEnabled) CommitSave();
    }

    /// <summary>标题=首个非空块的纯文本，截 30 字(派生缓存，便签列表无需解析 Blocks).</summary>
    private static void RefreshTitle(Note note)
    {
        var first = note.Blocks.FirstOrDefault(b => !string.IsNullOrWhiteSpace(b.Text));
        var title = first == null ? string.Empty : InlineMarkdown.PlainText(first.Text).Trim();
        if (title.Length > 30) title = title[..30];
        note.Title = title;
    }

    /// <summary>持久化前由 MainViewModel.SaveData 调用，把集合回写到 AppData.</summary>
    public void WriteTo(AppData data)
    {
        data.Notes = Notes.ToList();
        data.SelectedNoteId = SelectedNote?.Id;
    }
}
