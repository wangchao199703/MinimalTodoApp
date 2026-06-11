using System.Collections.ObjectModel;
using System.Windows;
using GongSolutions.Wpf.DragDrop;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 四象限拖拽处理器:既支持「同一象限内」重排,也支持「跨象限」拖动.
/// 跨象限拖动只给任务设置「手动象限覆盖」(QuadrantOverride),使卡片停在目标象限,
/// 绝不修改任务的优先级/截止日期(具体落点与覆盖逻辑由 <see cref="MainViewModel.DropToQuadrant"/> 处理).
/// </summary>
public sealed class QuadrantDropHandler : IDropTarget
{
    private readonly MainViewModel _vm;
    public QuadrantDropHandler(MainViewModel vm) => _vm = vm;

    public void DragOver(IDropInfo dropInfo)
    {
        // 拖动的是任务、且落到某个象限集合上即接受(同格/跨格都允许)
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
            _vm.DropToQuadrant(src, target, dropInfo.InsertIndex);
        }
    }
}
