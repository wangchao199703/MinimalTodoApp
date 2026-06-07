using GongSolutions.Wpf.DragDrop;
using System.Windows;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 主题"收藏"分组内的拖拽重排处理器(独立于 MainViewModel 的任务/分组拖拽，避免相互干扰)。
/// 仅响应 <see cref="ThemeSwatchVm"/> 之间的拖动，落点后调用 <see cref="MainViewModel.MoveFavorite"/>
/// 调整收藏顺序并持久化。
/// </summary>
public sealed class FavoritesDropHandler : IDropTarget
{
    private readonly MainViewModel _vm;
    public FavoritesDropHandler(MainViewModel vm) => _vm = vm;

    public void DragOver(IDropInfo dropInfo)
    {
        if (dropInfo.Data is ThemeSwatchVm && dropInfo.TargetItem is ThemeSwatchVm)
        {
            dropInfo.DropTargetAdorner = DropTargetAdorners.Insert;
            dropInfo.Effects = DragDropEffects.Move;
        }
    }

    public void Drop(IDropInfo dropInfo)
    {
        if (dropInfo.Data is ThemeSwatchVm src)
            _vm.MoveFavorite(src.Key, dropInfo.InsertIndex);
    }
}
