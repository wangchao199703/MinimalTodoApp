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
/// 职责:便签集合与分组、当前便签、正文(Markdown)编辑的防抖保存、新建/删除便签与分组、拖拽归组/排序.
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

        NoteGroups = new ObservableCollection<NoteGroup>(data.NoteGroups.OrderBy(g => g.OrderIndex));
        inboxCollapsed = data.InboxCollapsed;
        DropHandler = new NotesDropHandler(this);
        RebuildGroupedView();

        // 便签专属排版(收集箱设置):未设置时继承当前全局字体/字号/行距,
        // 保证存量用户(无 NoteFont* 字段)便签外观与升级前一致,之后可在「收集箱」设置里独立调整.
        noteFontFamily = string.IsNullOrWhiteSpace(data.NoteFontFamily) ? _main.FontFamily : data.NoteFontFamily;
        noteFontSize = data.NoteFontSize > 0 ? data.NoteFontSize : (_main.FontSize > 0 ? _main.FontSize : 14);
        noteLineSpacing = data.NoteLineSpacing > 0 ? data.NoteLineSpacing : (_main.LineSpacing > 0 ? _main.LineSpacing : 1.1);
        selectedNoteFont = _main.Fonts.FirstOrDefault(f => f.Key == noteFontFamily) ?? _main.Fonts[0];

        _saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(800) };
        _saveTimer.Tick += (_, _) => { _saveTimer.Stop(); CommitSave(); };

        // 恢复上次选中的便签(无则保持 null:从分组视图启动时便签区无选中).
        // 色块(IsActive)不在此处赋值:主 VM 构造末尾统一调 RefreshSidebarSelection.
        var restoreId = data.SelectedNoteId;
        selectedNote = restoreId.HasValue ? Notes.FirstOrDefault(n => n.Id == restoreId.Value) : null;
    }

    /// <summary>全部便签(扁平主集合，持久化的真相来源).</summary>
    public ObservableCollection<Note> Notes { get; }

    /// <summary>收集箱中的便签分组(每个分组的 Notes 为运行时视图).</summary>
    public ObservableCollection<NoteGroup> NoteGroups { get; }

    /// <summary>未分组便签(直接挂在收集箱根下，GroupId==null).运行时视图.</summary>
    public ObservableCollection<Note> UngroupedNotes { get; } = new();

    /// <summary>便签/分组拖拽处理器(供侧栏各 ListBox 绑定 dd:DragDrop.DropHandler).</summary>
    public NotesDropHandler DropHandler { get; }

    /// <summary>收集箱根是否折叠(持久化).</summary>
    [ObservableProperty]
    private bool inboxCollapsed;

    [ObservableProperty]
    private Note? selectedNote;

    // ===== 便签专属排版(收集箱设置;与待办区字体独立,默认继承全局) =====

    /// <summary>便签正文字体(收集箱设置).由设置面板下拉变更.</summary>
    [ObservableProperty]
    private string noteFontFamily = "";

    /// <summary>设置面板「收集箱」里当前选中的便签字体项(变更后回写 <see cref="NoteFontFamily"/>).</summary>
    [ObservableProperty]
    private FontInfo selectedNoteFont = null!;

    /// <summary>便签正文基准字号(收集箱设置).</summary>
    [ObservableProperty]
    private double noteFontSize = 14;

    /// <summary>便签正文行距倍率(收集箱设置).</summary>
    [ObservableProperty]
    private double noteLineSpacing = 1.1;

    partial void OnSelectedNoteFontChanged(FontInfo value)
    {
        if (value == null) return;
        NoteFontFamily = value.Key;   // 级联回写并经下方持久化;编辑器经绑定/重排即时生效
    }

    partial void OnNoteFontFamilyChanged(string value) => _main.RequestSaveFromNotes();
    partial void OnNoteFontSizeChanged(double value) => _main.RequestSaveFromNotes();
    partial void OnNoteLineSpacingChanged(double value) => _main.RequestSaveFromNotes();

    partial void OnSelectedNoteChanged(Note? oldValue, Note? newValue)
    {
        FlushPendingSave();              // 切换前先把上一篇落盘
        // 色块(IsActive/HasActiveNote)不在此处维护:由 OnNoteSelected → RefreshSidebarSelection 统一计算
        _main.OnNoteSelected(newValue);  // 通知主 VM 切视图 + 刷新整侧栏色块 + 持久化选中 id
    }

    /// <summary>
    /// 刷新便签侧的选中色块(由 MainViewModel.RefreshSidebarSelection 统一调用,勿单独使用):
    /// 任务视图下全部熄灭;便签视图下仅当前选中便签 IsActive=true,
    /// 并同步各分组的 HasActiveNote(分组折叠时由分组头/文件夹图标兜底显示色块).
    /// </summary>
    public void RefreshSelection(bool notesViewOpen)
    {
        var active = notesViewOpen ? SelectedNote : null;
        foreach (var n in Notes) n.IsActive = ReferenceEquals(n, active);
        foreach (var g in NoteGroups) g.HasActiveNote = g.Notes.Any(n => n.IsActive);
    }

    /// <summary>按 GroupId/OrderIndex 把扁平 Notes 重新分发到「未分组」与各分组的运行时视图集合.</summary>
    private void RebuildGroupedView()
    {
        UngroupedNotes.Clear();
        foreach (var n in Notes.Where(n => n.GroupId == null).OrderBy(n => n.OrderIndex))
            UngroupedNotes.Add(n);

        foreach (var g in NoteGroups)
        {
            g.Notes.Clear();
            foreach (var n in Notes.Where(n => n.GroupId == g.Id).OrderBy(n => n.OrderIndex))
                g.Notes.Add(n);
            // 结构变化(拖拽归组/新建/删除)后同步分组的「含选中便签」标志,保证折叠分组的兜底色块跟手
            g.HasActiveNote = g.Notes.Any(n => n.IsActive);
        }
    }

    // ===== 便签管理 =====

    /// <summary>新建便签(收集箱根/未分组)并选中.</summary>
    [RelayCommand]
    private void NewNote() => CreateNote(null);

    /// <summary>在指定分组下新建便签并选中(分组右键/分组内「写点什么」).</summary>
    [RelayCommand]
    private void NewNoteInGroup(NoteGroup? group) => CreateNote(group?.Id);

    private void CreateNote(Guid? groupId)
    {
        FlushPendingSave();
        if (InboxCollapsed) InboxCollapsed = false;
        if (groupId.HasValue && NoteGroups.FirstOrDefault(g => g.Id == groupId) is { IsCollapsed: true } g)
            g.IsCollapsed = false;

        var note = new Note
        {
            GroupId = groupId,
            OrderIndex = Notes.Where(n => n.GroupId == groupId)
                              .Select(n => n.OrderIndex).DefaultIfEmpty(-1).Max() + 1,
        };
        Notes.Add(note);
        RebuildGroupedView();
        SelectedNote = note;
        CommitSave();
    }

    /// <summary>开始重命名便签(右键/悬停编辑):置内联编辑态.</summary>
    public void RenameNote(Note? note)
    {
        if (note != null) note.IsEditing = true;
    }

    /// <summary>结束便签标题内联编辑(回车/失焦):去空白后持久化.</summary>
    public void EndEditNote(Note? note)
    {
        if (note == null) return;
        note.IsEditing = false;
        note.CustomTitle = (note.CustomTitle ?? string.Empty).Trim();
        CommitSave();
    }

    /// <summary>删除指定便签(视图层先弹确认).</summary>
    public void DeleteNote(Note? note)
    {
        if (note == null) return;
        bool wasSelected = ReferenceEquals(note, SelectedNote);
        int idx = Notes.IndexOf(note);
        Notes.Remove(note);
        RebuildGroupedView();
        if (wasSelected)
            SelectedNote = Notes.Count > 0 ? Notes[Math.Clamp(idx, 0, Notes.Count - 1)] : null;
        CommitSave();
    }

    /// <summary>把便签移动到目标分组(null=收集箱根)并在目标内插到指定位置;拖拽落点调用.</summary>
    public void MoveNote(Note? note, Guid? targetGroupId, int insertIndex)
    {
        if (note == null) return;
        if (targetGroupId.HasValue && NoteGroups.All(g => g.Id != targetGroupId)) return;

        // 同组内移动需校正 gong 的 InsertIndex(移除原项后目标索引前移)
        var current = Notes.Where(n => n.GroupId == targetGroupId).OrderBy(n => n.OrderIndex).ToList();
        int oldIndex = current.IndexOf(note);
        if (oldIndex >= 0 && insertIndex > oldIndex) insertIndex--;

        var siblings = current.Where(n => n != note).ToList();
        if (insertIndex < 0) insertIndex = 0;
        if (insertIndex > siblings.Count) insertIndex = siblings.Count;

        note.GroupId = targetGroupId;
        siblings.Insert(insertIndex, note);
        for (int i = 0; i < siblings.Count; i++) siblings[i].OrderIndex = i;

        RebuildGroupedView();
        CommitSave();
    }

    // ===== 分组管理 =====

    /// <summary>新建便签分组并进入内联重命名.</summary>
    [RelayCommand]
    private void NewNoteGroup()
    {
        if (InboxCollapsed) InboxCollapsed = false;
        var g = new NoteGroup
        {
            Name = Loc.T("S.Note.NewGroupName"),
            OrderIndex = NoteGroups.Count,
            IsEditing = true,
        };
        NoteGroups.Add(g);
        CommitSave();
    }

    /// <summary>开始重命名便签分组(右键菜单).</summary>
    [RelayCommand]
    private void RenameNoteGroup(NoteGroup? group)
    {
        if (group != null) group.IsEditing = true;
    }

    /// <summary>结束分组内联编辑(回车/失焦):空名兜底为默认名并保存.</summary>
    public void EndEditNoteGroup(NoteGroup? group)
    {
        if (group == null) return;
        group.IsEditing = false;
        group.Name = string.IsNullOrWhiteSpace(group.Name) ? Loc.T("S.Note.NewGroupName") : group.Name.Trim();
        CommitSave();
    }

    /// <summary>删除便签分组:其下便签移回收集箱根(未分组)，不删便签.视图层先弹确认.</summary>
    public void DeleteNoteGroup(NoteGroup? group)
    {
        if (group == null) return;
        foreach (var n in Notes.Where(n => n.GroupId == group.Id).ToList())
            n.GroupId = null;
        NoteGroups.Remove(group);
        // 重排剩余分组 OrderIndex
        for (int i = 0; i < NoteGroups.Count; i++) NoteGroups[i].OrderIndex = i;
        RebuildGroupedView();
        CommitSave();
    }

    /// <summary>折叠/展开便签分组(右键菜单).</summary>
    [RelayCommand]
    private void ToggleNoteGroupCollapse(NoteGroup? group)
    {
        if (group == null) return;
        group.IsCollapsed = !group.IsCollapsed;
        CommitSave();
    }

    /// <summary>折叠/展开收集箱根(右键菜单).</summary>
    [RelayCommand]
    private void ToggleInboxCollapse()
    {
        InboxCollapsed = !InboxCollapsed;
        CommitSave();
    }

    /// <summary>打开收集箱视图(折叠侧栏时点击收集箱色块):选中一篇便签→主区切到便签视图.</summary>
    [RelayCommand]
    private void OpenInbox() => EnsureNoteSelected();

    /// <summary>选中指定便签(折叠侧栏窄条里点击便签图标直接打开该篇).</summary>
    [RelayCommand]
    private void SelectNote(Note? note)
    {
        if (note != null) SelectedNote = note;
    }

    /// <summary>拖动重排分组顺序(NotesDropHandler 调用).</summary>
    public void MoveNoteGroup(NoteGroup? group, int insertIndex)
    {
        if (group == null) return;
        int oldIndex = NoteGroups.IndexOf(group);
        if (oldIndex < 0) return;
        if (insertIndex > oldIndex) insertIndex--;
        if (insertIndex < 0) insertIndex = 0;
        if (insertIndex >= NoteGroups.Count) insertIndex = NoteGroups.Count - 1;
        if (insertIndex == oldIndex) return;
        NoteGroups.Move(oldIndex, insertIndex);
        for (int i = 0; i < NoteGroups.Count; i++) NoteGroups[i].OrderIndex = i;
        CommitSave();
    }

    /// <summary>确保至少有一篇便签且已选中(打开便签视图时兜底调用).</summary>
    public void EnsureNoteSelected()
    {
        if (SelectedNote != null) return;
        if (Notes.Count == 0) { Notes.Add(new Note()); RebuildGroupedView(); }
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
        data.NoteGroups = NoteGroups.ToList();
        data.InboxCollapsed = InboxCollapsed;
        data.SelectedNoteId = SelectedNote?.Id;
        data.NoteFontFamily = NoteFontFamily;
        data.NoteFontSize = NoteFontSize;
        data.NoteLineSpacing = NoteLineSpacing;
    }
}
