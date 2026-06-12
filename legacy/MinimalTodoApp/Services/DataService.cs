using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Unicode;
using System.Text.Encodings.Web;
using MinimalTodoApp.Models;

namespace MinimalTodoApp.Services;

/// <summary>
/// 负责 AppData 与本地 data.json 之间的读写.
/// 数据存放在 %AppData%\MinimalTodoApp\data.json，避免 Program Files 写权限问题.
/// </summary>
public class DataService
{
    private readonly string _dir;
    private readonly string _filePath;

    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        // 不忽略循环引用——模型本身就是扁平结构；但保留默认即可
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        // 保证中文不被转义为 \uXXXX，data.json 可读
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All)
    };

    public DataService()
    {
        _dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "MinimalTodoApp");
        _filePath = Path.Combine(_dir, "data.json");
    }

    /// <summary>data.json 的完整路径(用于在 UI 中展示).</summary>
    public string FilePath => _filePath;

    public AppData Load()
    {
        try
        {
            if (!File.Exists(_filePath))
                return new AppData();

            var json = File.ReadAllText(_filePath);
            if (string.IsNullOrWhiteSpace(json))
                return new AppData();

            return JsonSerializer.Deserialize<AppData>(json, Options) ?? new AppData();
        }
        catch
        {
            // 数据损坏时返回空数据，避免应用崩溃
            return new AppData();
        }
    }

    public void Save(AppData data)
    {
        try
        {
            Directory.CreateDirectory(_dir);

            var json = JsonSerializer.Serialize(data, Options);

            // 原子写入:先写临时文件再替换，避免写入中途崩溃导致数据丢失
            var tmp = _filePath + ".tmp";
            File.WriteAllText(tmp, json);

            if (File.Exists(_filePath))
                File.Replace(tmp, _filePath, null);
            else
                File.Move(tmp, _filePath);
        }
        catch
        {
            // 保存失败不应让应用崩溃(如磁盘满/被占用)
        }
    }
}
