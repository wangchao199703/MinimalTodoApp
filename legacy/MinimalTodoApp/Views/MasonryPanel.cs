using System;
using System.Windows;
using System.Windows.Controls;

namespace MinimalTodoApp.Views;

/// <summary>
/// 瀑布流面板:固定列宽,子元素依次放入「当前最矮」的一列(同高取最左)，
/// 各容器纵向贴齐。标签看板用——WrapPanel 按行布局,行高取决于行内最高容器,
/// 高低不一时下一行只能从整行底部开始,中间会留大空隙;瀑布流没有这个问题。
/// </summary>
public class MasonryPanel : Panel
{
    public static readonly DependencyProperty ColumnWidthProperty = DependencyProperty.Register(
        nameof(ColumnWidth), typeof(double), typeof(MasonryPanel),
        new FrameworkPropertyMetadata(220.0,
            FrameworkPropertyMetadataOptions.AffectsMeasure | FrameworkPropertyMetadataOptions.AffectsArrange));

    /// <summary>列宽(含子元素自身 Margin)。</summary>
    public double ColumnWidth
    {
        get => (double)GetValue(ColumnWidthProperty);
        set => SetValue(ColumnWidthProperty, value);
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        var heights = NewColumns(availableSize.Width);
        foreach (UIElement child in InternalChildren)
        {
            child.Measure(new Size(ColumnWidth, double.PositiveInfinity));
            int c = Shortest(heights);
            heights[c] += child.DesiredSize.Height;
        }
        double maxH = 0;
        foreach (var h in heights) maxH = Math.Max(maxH, h);
        return new Size(heights.Length * ColumnWidth, maxH);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        var heights = NewColumns(finalSize.Width);
        foreach (UIElement child in InternalChildren)
        {
            int c = Shortest(heights);
            child.Arrange(new Rect(c * ColumnWidth, heights[c], ColumnWidth, child.DesiredSize.Height));
            heights[c] += child.DesiredSize.Height;
        }
        return finalSize;
    }

    /// <summary>按可用宽度求列数(至少 1 列)并返回各列累计高度数组。</summary>
    private double[] NewColumns(double width)
    {
        int cols = double.IsInfinity(width) || width < ColumnWidth
            ? 1
            : Math.Max(1, (int)(width / ColumnWidth));
        return new double[cols];
    }

    /// <summary>当前最矮的列(差距在亚像素内视为同高,取最左,保证摆放顺序稳定)。</summary>
    private static int Shortest(double[] heights)
    {
        int idx = 0;
        for (int i = 1; i < heights.Length; i++)
            if (heights[i] < heights[idx] - 0.5) idx = i;
        return idx;
    }
}
