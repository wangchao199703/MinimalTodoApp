using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace MinimalTodoApp.Infrastructure;

/// <summary>一组(分类)分组图标.NameKey 为本地化键，Glyphs 为该类下的字形字符串.</summary>
public record IconCategory(string NameKey, IReadOnlyList<string> Glyphs);

/// <summary>
/// 分组图标(取代旧的颜色圆点)。内置多组(分类)Segoe Fluent Icons / Segoe MDL2 Assets 字形，
/// 供「更改图标」分类选择器使用；另有「自定义」分类可导入图片。
/// 字形码均为常见 MDL2 码位，缺字时回退 Segoe MDL2 Assets。
/// </summary>
public static class GroupIcons
{
    /// <summary>由码位构造字形字符串(避免源码里写转义字符)。</summary>
    public static string G(int code) => char.ConvertFromUtf32(code);

    public static readonly string Folder = G(0xE8B7);
    public static readonly string AllTodos = G(0xE8FD);
    public static readonly string Completed = G(0xE930);
    /// <summary>四象限视图图标(四宫格 ViewAll 字形)。</summary>
    public static readonly string Quadrant = G(0xE8A9);
    /// <summary>标签看板视图图标(标签 Tag 字形)。</summary>
    public static readonly string TagBoard = G(0xE8EC);

    private static IReadOnlyList<string> Glyphs(params int[] codes) => codes.Select(G).ToArray();

    /// <summary>内置图标分类(按组可选)。自定义分类由 UI 单独处理(导入图片)。</summary>
    public static readonly IReadOnlyList<IconCategory> Categories = new[]
    {
        new IconCategory("S.IconCat.Common", Glyphs(
            0xE8B7, 0xE734, 0xE735, 0xE7C1, 0xE8EC, 0xE718, 0xE787, 0xE8FD, 0xE930, 0xEB51, 0xE7AD, 0xE721)),
        new IconCategory("S.IconCat.Work", Glyphs(
            0xE821, 0xE715, 0xE717, 0xE716, 0xE77B, 0xE8A5, 0xE8F1, 0xE713, 0xE70F, 0xE8C8)),
        new IconCategory("S.IconCat.Study", Glyphs(
            0xE7BE, 0xE70F, 0xE774, 0xE8A5, 0xE8FD, 0xE73E, 0xE713, 0xE721)),
        new IconCategory("S.IconCat.Life", Glyphs(
            0xE80F, 0xE719, 0xE7FC, 0xE722, 0xEB51, 0xE787, 0xE7ED, 0xE74D)),
        new IconCategory("S.IconCat.Travel", Glyphs(
            0xE84C, 0xE804, 0xE707, 0xE909, 0xE918, 0xE722, 0xEC92, 0xE786)),
        new IconCategory("S.IconCat.Symbol", Glyphs(
            0xE734, 0xE735, 0xEB51, 0xE95E, 0xE7C1, 0xE8C9, 0xE946, 0xE945, 0xEA80, 0xE790)),
    };

    /// <summary>按分组名关键词预制图标:工作/学习/生活/购物/旅行，匹配不到返回文件夹。</summary>
    public static string IconForName(string? name)
    {
        var n = name ?? string.Empty;
        bool Has(string s) => n.Contains(s, StringComparison.OrdinalIgnoreCase);

        if (Has("工作") || Has("work") || Has("job")) return G(0xE821);
        if (Has("学习") || Has("学") || Has("study") || Has("learn")) return G(0xE7BE);
        if (Has("生活") || Has("life") || Has("home") || Has("家")) return G(0xE80F);
        if (Has("购物") || Has("买") || Has("shop")) return G(0xE719);
        if (Has("旅") || Has("travel") || Has("trip")) return G(0xE774);
        return Folder;
    }

    /// <summary>自定义图片图标的存放目录(%AppData%\MinimalTodoApp\group-icons)。</summary>
    public static string CustomIconDir
    {
        get
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "MinimalTodoApp", "group-icons");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    /// <summary>把导入的图片复制到自定义图标目录，返回新文件的完整路径(失败返回 null)。</summary>
    public static string? ImportImage(string sourcePath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath)) return null;
            var ext = Path.GetExtension(sourcePath);
            var dest = Path.Combine(CustomIconDir, Guid.NewGuid().ToString("N") + ext);
            File.Copy(sourcePath, dest, overwrite: true);
            return dest;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>列出已导入的自定义图片图标(完整路径)。</summary>
    public static IReadOnlyList<string> CustomImages()
    {
        try
        {
            return Directory.EnumerateFiles(CustomIconDir)
                .Where(f => f.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".ico", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".bmp", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(File.GetLastWriteTimeUtc)
                .ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }
}
