using System;
using System.IO;
using System.Windows.Media.Imaging;

namespace MinimalTodoApp.Infrastructure;

/// <summary>
/// 便签内嵌图片的本地仓库:图片复制到 %AppData%\MinimalTodoApp\note-images，
/// 便签正文(Markdown)只存文件名(&lt;img=文件名&gt;)，加载时由文件名解析回完整路径.
/// </summary>
public static class NoteImageStore
{
    /// <summary>图片存放目录(首次访问即创建).</summary>
    public static string Dir
    {
        get
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "MinimalTodoApp", "note-images");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    /// <summary>把外部图片复制进仓库，返回仓库内唯一文件名;失败返回 null.</summary>
    public static string? Import(string sourcePath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath)) return null;
            var ext = Path.GetExtension(sourcePath);
            var name = Guid.NewGuid().ToString("N") + ext;
            File.Copy(sourcePath, Path.Combine(Dir, name), overwrite: false);
            return name;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>把内存位图(粘贴/拖入的图片)编码为 PNG 存入仓库，返回文件名;失败返回 null.</summary>
    public static string? SaveBitmap(BitmapSource? bmp)
    {
        if (bmp == null) return null;
        try
        {
            var name = Guid.NewGuid().ToString("N") + ".png";
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(bmp));
            using var fs = File.Create(Path.Combine(Dir, name));
            enc.Save(fs);
            return name;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>判断文件是否为支持的图片扩展名.</summary>
    public static bool IsImageFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".png" or ".jpg" or ".jpeg" or ".gif" or ".bmp" or ".webp";
    }

    /// <summary>由文件名解析为仓库内完整路径(不校验存在性).</summary>
    public static string ResolvePath(string fileName) => Path.Combine(Dir, fileName);
}
