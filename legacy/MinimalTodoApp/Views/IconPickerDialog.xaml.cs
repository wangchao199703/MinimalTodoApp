using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.Models;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>分组图标选择器:内置多分类字形图标 + 自定义图片导入。点击即应用并关闭。</summary>
public partial class IconPickerDialog : Window
{
    private readonly MainViewModel? _vm;
    private readonly TodoGroup? _group;
    private bool _pickOnly;
    private readonly FontFamily _iconFont = new("Segoe Fluent Icons, Segoe MDL2 Assets");

    /// <summary>「仅选择」模式下的结果:选中的字形(优先)。</summary>
    public string? ResultGlyph { get; private set; }
    /// <summary>「仅选择」模式下的结果:选中/导入的自定义图片路径。</summary>
    public string? ResultImage { get; private set; }

    /// <summary>应用到具体分组:点击即写入该分组并关闭。</summary>
    public IconPickerDialog(MainViewModel vm, TodoGroup group) : this()
    {
        _vm = vm;
        _group = group;
        _pickOnly = false;
    }

    /// <summary>仅选择:不绑定分组，点击把结果写入 ResultGlyph/ResultImage 并 DialogResult=true(供新建分组用)。</summary>
    public IconPickerDialog()
    {
        InitializeComponent();
        _pickOnly = true;   // 由带参构造覆盖为 false

        BuildCategoryButtons();
        if (GroupIcons.Categories.Count > 0) ShowGlyphCategory(GroupIcons.Categories[0]);

        PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) Close(); };
    }

    private void BuildCategoryButtons()
    {
        foreach (var cat in GroupIcons.Categories)
            CatPanel.Children.Add(MakeCategoryButton(Loc.T(cat.NameKey), cat));
        // 自定义分类(导入图片)
        CatPanel.Children.Add(MakeCategoryButton(Loc.T("S.IconCat.Custom"), null));
    }

    private Button MakeCategoryButton(string text, IconCategory? cat)
    {
        var b = new Button
        {
            Content = text,
            Tag = cat,
            Style = (Style)FindResource("GhostButton"),
            Background = (Brush)FindResource("InputBg"),
            Margin = new Thickness(0, 0, 6, 6),
            Padding = new Thickness(11, 5, 11, 5),
        };
        b.Click += Category_Click;
        return b;
    }

    private void Category_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button b) return;
        if (b.Tag is IconCategory cat) ShowGlyphCategory(cat);
        else ShowCustom();
    }

    private void ShowGlyphCategory(IconCategory cat)
    {
        ImportButton.Visibility = Visibility.Collapsed;
        IconPanel.Children.Clear();
        foreach (var glyph in cat.Glyphs)
            IconPanel.Children.Add(MakeGlyphButton(glyph));
    }

    private Button MakeGlyphButton(string glyph)
    {
        var tb = new TextBlock
        {
            Text = glyph,
            FontFamily = _iconFont,
            FontSize = 18,
            Foreground = (Brush)FindResource("PrimaryText"),
        };
        var b = MakeCell();
        b.Content = tb;
        b.Tag = glyph;
        b.Click += Glyph_Click;
        return b;
    }

    private void Glyph_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button b || b.Tag is not string glyph) return;
        if (_pickOnly)
        {
            ResultGlyph = glyph;
            DialogResult = true;
        }
        else
        {
            _vm?.SetGroupIcon(_group, glyph);
        }
        Close();
    }

    private void ShowCustom()
    {
        ImportButton.Visibility = Visibility.Visible;
        IconPanel.Children.Clear();
        foreach (var path in GroupIcons.CustomImages())
        {
            var img = LoadBitmap(path);
            if (img == null) continue;
            var image = new Image { Source = img, Width = 24, Height = 24, Stretch = Stretch.UniformToFill };
            var b = MakeCell();
            b.Content = image;
            b.Tag = path;
            b.Click += Image_Click;
            IconPanel.Children.Add(b);
        }
    }

    private void Image_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button b || b.Tag is not string path) return;
        if (_pickOnly)
        {
            ResultImage = path;
            DialogResult = true;
        }
        else
        {
            _vm?.SetGroupIconImage(_group, path);
        }
        Close();
    }

    private void Import_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Filter = Loc.T("S.IconPicker.ImageFilter") + "|*.png;*.jpg;*.jpeg;*.ico;*.bmp;*.gif",
        };
        if (dlg.ShowDialog() != true) return;

        var dest = GroupIcons.ImportImage(dlg.FileName);
        if (dest == null) return;
        if (_pickOnly)
        {
            ResultImage = dest;
            DialogResult = true;
        }
        else
        {
            _vm?.SetGroupIconImage(_group, dest);
        }
        Close();
    }

    private Button MakeCell() => new()
    {
        Style = (Style)FindResource("IconButton"),
        Width = 34,
        Height = 34,
        Margin = new Thickness(2),
    };

    private static BitmapImage? LoadBitmap(string path)
    {
        try
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.DecodePixelWidth = 48;
            bmp.UriSource = new Uri(path);
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
        catch
        {
            return null;
        }
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
