using System;
using System.Linq;
using System.Windows;
using GongSolutions.Wpf.DragDrop;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 收集箱便签/便签分组的拖拽处理器(独立于 MainViewModel 的任务/分组拖拽)。
/// 支持:便签↔便签重排(同组/跨组)、便签拖入分组(归组)、便签拖回根(未分组)、便签分组之间重排。
/// </summary>
public sealed class NotesDropHandler : IDropTarget
{
    private readonly NotesViewModel _vm;
    public NotesDropHandler(NotesViewModel vm) => _vm = vm;

    public void DragOver(IDropInfo dropInfo)
    {
        if (dropInfo.Data is Note)
        {
            // 拖到分组头上=归入该组(高亮)；拖到便签列表里=插入排序(插入线)
            dropInfo.DropTargetAdorner = dropInfo.TargetItem is NoteGroup
                ? DropTargetAdorners.Highlight
                : DropTargetAdorners.Insert;
            dropInfo.Effects = DragDropEffects.Move;
        }
        else if (dropInfo.Data is NoteGroup && dropInfo.TargetItem is NoteGroup)
        {
            dropInfo.DropTargetAdorner = DropTargetAdorners.Insert;
            dropInfo.Effects = DragDropEffects.Move;
        }
    }

    public void Drop(IDropInfo dropInfo)
    {
        if (dropInfo.Data is Note note)
        {
            Guid? targetGroupId;
            int insertIndex = dropInfo.InsertIndex;

            if (ReferenceEquals(dropInfo.TargetCollection, _vm.UngroupedNotes))
                targetGroupId = null;
            else if (_vm.NoteGroups.FirstOrDefault(g => ReferenceEquals(g.Notes, dropInfo.TargetCollection)) is { } grp)
                targetGroupId = grp.Id;
            else if (dropInfo.TargetItem is NoteGroup tg)   // 拖到分组头:进该组末尾
            {
                targetGroupId = tg.Id;
                insertIndex = tg.Notes.Count;
            }
            else return;

            _vm.MoveNote(note, targetGroupId, insertIndex);
            return;
        }

        if (dropInfo.Data is NoteGroup dragged)
            _vm.MoveNoteGroup(dragged, dropInfo.InsertIndex);
    }
}
