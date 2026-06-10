using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 便签模块的 ViewModel(由 MainViewModel 创建并持有).
/// 职责:便签集合与当前便签、正文(Markdown)编辑的防抖保存、新建/删除便签.
/// 正文由 NotesView 的 RichTextBox 编辑;本 VM 不再持有块结构(待办↔md 联动已移除).
/// </summary>
public partial class NotesViewModel : ObservableObject
{
    private readonly MainViewModel _main;

    /// <summary>编辑防抖保存(高频打字不写盘，停 0.8s 后落盘).</summary>
    private readonly DispatcherTimer _saveTimer;

    /// <summary>防抖期间被编辑的便签(切换便签后落盘时仍应刷新它而非新选中的便签).</summary>
    private Note? _dirtyNote;

    public NotesViewModel(MainViewModel main, AppData data)
    {
        _main = main;

        // 旧版块格式(v1.2.0 早期)一次性迁移为 Markdown 正文，之后不再写入 Blocks.
        foreach (var n in data.Notes)
        {
            if (string.IsNullOrEmpty(n.Content) && n.Blocks.Count > 0)
            {
                n.Content = MarkdownFlowDocument.BlocksToMarkdown(n.Blocks);
                n.Blocks.Clear();
            }
        }

        Notes = new ObservableCollection<Note>(data.Notes);
        foreach (var n in Notes) RefreshTitle(n);

        _saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(800) };
        _saveTimer.Tick += (_, _) => { _saveTimer.Stop(); CommitSave(); };

        // 恢复上次选中的便签(无则保持 null:从分组视图启动时便签区无选中)
        var restoreId = data.SelectedNoteId;
        selectedNote = restoreId.HasValue ? Notes.FirstOrDefault(n => n.Id == restoreId.Value) : null;
    }

    /// <summary>全部便签(侧栏「收集箱」列表绑定它).</summary>
    public ObservableCollection<Note> Notes { get; }

    [ObservableProperty]
    private Note? selectedNote;

    partial void OnSelectedNoteChanged(Note? oldValue, Note? newValue)
    {
        FlushPendingSave();              // 切换前先把上一篇落盘
        _main.OnNoteSelected(newValue);  // 通知主 VM 切视图 + 持久化选中 id
    }

    // ===== 便签管理 =====

    /// <summary>新建便签并选中(收集箱「+ 写点什么」/右键「新建便签」).</summary>
    [RelayCommand]
    private void NewNote()
    {
        FlushPendingSave();
        var note = new Note();
        Notes.Add(note);
        SelectedNote = note;
        CommitSave();
    }

    /// <summary>删除指定便签(视图层先弹确认).</summary>
    public void DeleteNote(Note? note)
    {
        if (note == null) return;
        bool wasSelected = ReferenceEquals(note, SelectedNote);
        int idx = Notes.IndexOf(note);
        Notes.Remove(note);
        if (wasSelected)
            SelectedNote = Notes.Count > 0 ? Notes[Math.Clamp(idx, 0, Notes.Count - 1)] : null;
        CommitSave();
    }

    /// <summary>确保至少有一篇便签且已选中(打开便签视图时兜底调用).</summary>
    public void EnsureNoteSelected()
    {
        if (SelectedNote != null) return;
        if (Notes.Count == 0) Notes.Add(new Note());
        SelectedNote = Notes[0];
    }

    // ===== 保存 =====

    /// <summary>正文变化后请求防抖保存(停止输入 0.8s 后落盘并刷新标题/更新时间).</summary>
    public void RequestSave()
    {
        _dirtyNote = SelectedNote;
        _saveTimer.Stop();
        _saveTimer.Start();
    }

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

    /// <summary>标题=正文首个非空行去标记，截 30 字(派生缓存，便签列表无需解析正文).</summary>
    private static void RefreshTitle(Note note) =>
        note.Title = MarkdownFlowDocument.FirstLineTitle(note.Content);

    /// <summary>持久化前由 MainViewModel.SaveData 调用，把集合回写到 AppData.</summary>
    public void WriteTo(AppData data)
    {
        data.Notes = Notes.ToList();
        data.SelectedNoteId = SelectedNote?.Id;
    }
}
