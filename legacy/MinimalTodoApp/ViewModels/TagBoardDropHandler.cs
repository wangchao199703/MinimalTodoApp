using System.Collections.ObjectModel;
using System.Windows;
using GongSolutions.Wpf.DragDrop;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 标签看板拖拽处理器:同一标签容器内拖动=重排;跨容器拖动=把任务改到目标标签
/// (目标为「无标签」列则清空标签)。绝不影响任务的优先级/截止/完成状态。
/// </summary>
public sealed class TagBoardDropHandler : IDropTarget
{
    private readonly MainViewModel _vm;
    public TagBoardDropHandler(MainViewModel vm) => _vm = vm;

    public void DragOver(IDropInfo dropInfo)
    {
        if (dropInfo.Data is TodoItem && dropInfo.TargetCollection is ObservableCollection<TodoItem>)
        {
            dropInfo.DropTargetAdorner = DropTargetAdorners.Insert;
            dropInfo.Effects = DragDropEffects.Move;
        }
    }

    public void Drop(IDropInfo dropInfo)
    {
        if (dropInfo.Data is TodoItem src
            && dropInfo.TargetCollection is ObservableCollection<TodoItem> target)
        {
            _vm.DropToTag(src, target, dropInfo.InsertIndex);
        }
    }
}
