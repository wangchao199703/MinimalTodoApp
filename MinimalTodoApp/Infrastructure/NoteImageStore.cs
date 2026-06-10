using System;
using System.IO;

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

    /// <summary>由文件名解析为仓库内完整路径(不校验存在性).</summary>
    public static string ResolvePath(string fileName) => Path.Combine(Dir, fileName);
}
