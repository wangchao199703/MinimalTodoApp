using System;
using System.Collections;
using System.Linq;
using System.Windows;
using GongSolutions.Wpf.DragDrop;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.ViewModels;

/// <summary>
/// 日历"落点"拖放处理器:把待办列表里的任务拖到日历某处，即为其设置截止时间。
/// 天/周视图按落点纵向比例换算为对应小时(取整点)；月视图固定落到当天 18:00。
/// 与任务列表自身的重排拖放(MainViewModel)互不干扰 —— 每个日历落点元素各自挂一个本处理器实例。
/// </summary>
public sealed class CalendarDropHandler : IDropTarget
{
    private readonly MainViewModel _vm;
    private readonly DateTime _day;
    private readonly bool _fixedHour;   // true=月视图固定小时;false=按落点 Y 换算
    private readonly int _hour;         // 固定小时(月视图=18)
    private readonly Action _onDropped; // 落点完成后的重渲染回调

    /// <summary>天/周视图:按落点 Y 比例换算小时(取整点)。</summary>
    public static CalendarDropHandler ForTimed(MainViewModel vm, DateTime day, Action onDropped)
        => new(vm, day, fixedHour: false, hour: 0, onDropped);

    /// <summary>月视图:固定落到当天指定整点(默认 18:00)。</summary>
    public static CalendarDropHandler ForFixedHour(MainViewModel vm, DateTime day, int hour, Action onDropped)
        => new(vm, day, fixedHour: true, hour: hour, onDropped);

    private CalendarDropHandler(MainViewModel vm, DateTime day, bool fixedHour, int hour, Action onDropped)
    {
        _vm = vm;
        _day = day;
        _fixedHour = fixedHour;
        _hour = hour;
        _onDropped = onDropped;
    }

    public void DragOver(IDropInfo dropInfo)
    {
        if (ExtractItem(dropInfo.Data) == null) return;
        dropInfo.Effects = DragDropEffects.Move;
        dropInfo.DropTargetAdorner = DropTargetAdorners.Highlight;
    }

    public void Drop(IDropInfo dropInfo)
    {
        var item = ExtractItem(dropInfo.Data);
        if (item == null) return;

        DateTime due;
        if (_fixedHour)
        {
            due = _day.Date.AddHours(_hour);
        }
        else
        {
            double h = (dropInfo.VisualTarget as FrameworkElement)?.ActualHeight ?? 0;
            double y = dropInfo.DropPosition.Y;
            int hour = h > 0 ? (int)(y / h * 24.0) : 0;   // 落入哪个小时格就取该整点
            hour = Math.Clamp(hour, 0, 23);
            due = _day.Date.AddHours(hour);
        }

        // 复用统一编辑入口:仅改截止时间，保留原优先级与标题(内部自动持久化)
        _vm.ApplyTaskEdits(item, due, item.Priority, item.Title);
        _onDropped();
    }

    /// <summary>从拖拽数据中取出待办项:单选为 TodoItem，多选为可枚举集合时取第一个。</summary>
    private static TodoItem? ExtractItem(object? data) =>
        data as TodoItem
        ?? (data as IEnumerable)?.Cast<object>().OfType<TodoItem>().FirstOrDefault();
}
