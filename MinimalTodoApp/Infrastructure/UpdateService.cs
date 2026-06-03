using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace MinimalTodoApp.Infrastructure;

/// <summary>一次可用更新的描述:目标版本、tag、更新说明(Release body)、下载地址与资产名.</summary>
public record UpdateInfo(Version Version, string Tag, string Notes, string DownloadUrl, string AssetName);

/// <summary>
/// 自动更新服务:对比 GitHub 最新 Release 与当前版本，下载新版自包含 exe，
/// 通过临时脚本「等旧版退出 → 启动新版」实现重启，新版启动时回收旧版 exe.
/// 全程纯 HttpClient + P/Invoke，不引入第三方依赖，保持单文件发布体积.
/// </summary>
public static class UpdateService
{
    private const string RepoSlug = "wangchao199703/MinimalTodoApp";
    private const string LatestReleaseApi =
        "https://api.github.com/repos/" + RepoSlug + "/releases/latest";

    /// <summary>新版被脚本拉起时携带的参数:其后紧跟被替换的旧版 exe 路径(供回收).</summary>
    public const string UpdatedFromArg = "--updated-from";

    private static readonly HttpClient Http = CreateClient();

    private static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(100) };
        // GitHub API 强制要求 User-Agent，否则 403
        c.DefaultRequestHeaders.UserAgent.ParseAdd("MinimalTodoApp-Updater");
        c.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return c;
    }

    /// <summary>当前运行版本(取自程序集版本，如 1.1.3.0).</summary>
    public static Version CurrentVersion =>
        Assembly.GetEntryAssembly()?.GetName().Version
        ?? Assembly.GetExecutingAssembly().GetName().Version
        ?? new Version(0, 0, 0, 0);

    /// <summary>当前运行的 exe 完整路径(单文件发布时即 exe 自身).</summary>
    public static string CurrentExePath =>
        Environment.ProcessPath
        ?? Process.GetCurrentProcess().MainModule?.FileName
        ?? string.Empty;

    /// <summary>
    /// 查询 GitHub 最新发布.若存在比当前版本更新的可下载资产，返回 <see cref="UpdateInfo"/>；
    /// 否则(已是最新 / 无合适资产 / 网络异常)返回 null —— 静默失败，绝不抛出，便于后台静默检查.
    /// </summary>
    public static async Task<UpdateInfo?> CheckAsync(CancellationToken ct = default)
    {
        try
        {
            using var resp = await Http.GetAsync(LatestReleaseApi, ct);
            if (!resp.IsSuccessStatusCode) return null;

            await using var stream = await resp.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;

            string tag = root.TryGetProperty("tag_name", out var t) ? (t.GetString() ?? "") : "";
            var latest = ParseVersion(tag);
            if (latest == null) return null;

            // 仅按 主.次.修订 三段比较，忽略 build 段差异
            if (Normalize(latest) <= Normalize(CurrentVersion)) return null;

            string notes = root.TryGetProperty("body", out var b) ? (b.GetString() ?? "") : "";

            // 选 win-x64.exe 资产
            string url = "", assetName = "";
            if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
            {
                foreach (var a in assets.EnumerateArray())
                {
                    var name = a.TryGetProperty("name", out var n) ? (n.GetString() ?? "") : "";
                    if (name.EndsWith("win-x64.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        url = a.TryGetProperty("browser_download_url", out var u) ? (u.GetString() ?? "") : "";
                        assetName = name;
                        break;
                    }
                }
            }
            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(assetName)) return null;

            return new UpdateInfo(latest, tag, notes, url, assetName);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>把 "v1.2.3" / "1.2.3" 解析为 Version；失败返回 null.</summary>
    private static Version? ParseVersion(string tag)
    {
        if (string.IsNullOrWhiteSpace(tag)) return null;
        var s = tag.TrimStart('v', 'V').Trim();
        return Version.TryParse(s, out var v) ? v : null;
    }

    /// <summary>只保留 主.次.修订 三段(把缺省的 -1 build 归零)，避免 1.1.3 与 1.1.3.0 误判.</summary>
    private static Version Normalize(Version v)
        => new(v.Major, v.Minor, Math.Max(v.Build, 0));

    /// <summary>
    /// 流式下载新版资产到目标目录(优先当前 exe 同目录，不可写则退到 %LOCALAPPDATA%\MinimalTodoApp).
    /// 返回落地的完整路径；进度通过 <paramref name="progress"/> 上报(0~1).
    /// </summary>
    public static async Task<string> DownloadAsync(UpdateInfo info, IProgress<double>? progress, CancellationToken ct = default)
    {
        var dest = ResolveDownloadPath(info.AssetName);
        Directory.CreateDirectory(Path.GetDirectoryName(dest)!);

        using var resp = await Http.GetAsync(info.DownloadUrl, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();
        long? total = resp.Content.Headers.ContentLength;

        await using (var src = await resp.Content.ReadAsStreamAsync(ct))
        await using (var fs = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            var buffer = new byte[81920];
            long readTotal = 0;
            int read;
            while ((read = await src.ReadAsync(buffer, ct)) > 0)
            {
                await fs.WriteAsync(buffer.AsMemory(0, read), ct);
                readTotal += read;
                if (total is > 0)
                    progress?.Report((double)readTotal / total.Value);
            }
        }
        progress?.Report(1.0);
        return dest;
    }

    /// <summary>解析新版下载落地路径:同 exe 目录(可写)优先；否则用户本地目录；并避免与正在运行的 exe 同名.</summary>
    private static string ResolveDownloadPath(string assetName)
    {
        var exeDir = Path.GetDirectoryName(CurrentExePath);
        string dir = !string.IsNullOrEmpty(exeDir) && IsWritable(exeDir)
            ? exeDir
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MinimalTodoApp");

        var dest = Path.Combine(dir, assetName);
        // 极端情况:新资产名恰与正在运行的 exe 同名(同目录) → 改存到本地目录，避免写被占用的文件
        if (string.Equals(dest, CurrentExePath, StringComparison.OrdinalIgnoreCase))
            dest = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MinimalTodoApp", assetName);
        return dest;
    }

    private static bool IsWritable(string dir)
    {
        try
        {
            var probe = Path.Combine(dir, ".w_" + Guid.NewGuid().ToString("N") + ".tmp");
            File.WriteAllText(probe, "");
            File.Delete(probe);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// 生成并隐藏启动一个临时脚本:等待当前进程退出 → 以 <see cref="UpdatedFromArg"/> 参数启动新版 exe → 自删.
    /// 调用后应紧接着让当前应用干净退出(ForceExit)，脚本随即拉起新版.
    /// </summary>
    public static void LaunchUpdaterAndExit(string newExePath, string oldExePath)
    {
        int pid = Environment.ProcessId;
        var batPath = Path.Combine(Path.GetTempPath(),
            "MinimalTodoApp_update_" + Guid.NewGuid().ToString("N") + ".cmd");

        var sb = new StringBuilder();
        sb.AppendLine("@echo off");
        sb.AppendLine(":waitloop");
        // 旧版进程仍在 → 等约 1 秒重试；退出后跳出循环。
        // 用 ping 当 sleep:本脚本以无控制台方式运行(CreateNoWindow)，`timeout` 需要控制台输入会立即报错。
        sb.AppendLine($"tasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul");
        sb.AppendLine("if not errorlevel 1 (");
        sb.AppendLine("  ping -n 2 127.0.0.1 >nul");
        sb.AppendLine("  goto waitloop");
        sb.AppendLine(")");
        // 直接调用新版 exe(GUI 子系统程序，cmd 不等待、立即返回，新进程脱离 cmd 独立运行)。
        // 关键:不能用 `start` —— 无控制台时 `start` 会失败(errorlevel 1)，导致新版根本起不来(本轮修复的 bug)。
        sb.AppendLine($"\"{newExePath}\" {UpdatedFromArg} \"{oldExePath}\"");
        sb.AppendLine("del \"%~f0\"");

        // .cmd 用 ANSI/系统编码即可(纯英文+路径)，避免 BOM 影响首行 @echo off
        File.WriteAllText(batPath, sb.ToString(), new UTF8Encoding(false));

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/c \"{batPath}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        Process.Start(psi);
    }

    /// <summary>
    /// 新版启动时(收到 <see cref="UpdatedFromArg"/>)调用:把被替换的旧版 exe 移入回收站.
    /// 旧进程可能刚退出、文件句柄未释放，故带短重试.阻塞型，调用方应放到后台线程.
    /// </summary>
    public static void CleanupAfterUpdate(string oldExePath)
    {
        if (string.IsNullOrWhiteSpace(oldExePath)) return;
        // 绝不删自己
        if (string.Equals(oldExePath, CurrentExePath, StringComparison.OrdinalIgnoreCase)) return;

        for (int i = 0; i < 12; i++)
        {
            if (!File.Exists(oldExePath)) return;
            if (NativeMethods.MoveToRecycleBin(oldExePath)) return;
            Thread.Sleep(300);
        }
    }
}
