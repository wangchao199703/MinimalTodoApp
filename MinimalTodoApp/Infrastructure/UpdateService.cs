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
    /// 查询 GitHub 最新发布.
    /// 返回 <see cref="UpdateInfo"/>：存在比当前版本更新的可下载资产；
    /// 返回 <c>null</c>：**确实已是最新**（或最新版无合适资产 / tag 无法解析）。
    /// **抛出异常**：网络错误、HTTP 非 2xx（如 GitHub 匿名接口 403 限流）、解析失败等"检查未成功"的情况——
    /// 由调用方决定如何处理（后台检查吞掉静默；手动检查提示"检查失败，请稍后重试"，
    /// 避免把"没查成功"误报成"已是最新"）.
    /// </summary>
    public static async Task<UpdateInfo?> CheckAsync(CancellationToken ct = default)
    {
        using var resp = await Http.GetAsync(LatestReleaseApi, ct);
        resp.EnsureSuccessStatusCode();   // 非 2xx(含 403 限流)抛 HttpRequestException → 视为"检查失败"而非"已最新"

        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var root = doc.RootElement;

        string tag = root.TryGetProperty("tag_name", out var t) ? (t.GetString() ?? "") : "";
        var latest = ParseVersion(tag);
        if (latest == null) return null;

        // 仅按 主.次.修订 三段比较，忽略 build 段差异
        if (Normalize(latest) <= Normalize(CurrentVersion)) return null;   // 已是最新

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
    /// 生成并隐藏启动一个临时 PowerShell 脚本:轮询等待当前进程退出 → 以 <see cref="UpdatedFromArg"/>
    /// 参数启动新版 exe(脱离独立运行) → 自删.调用后应紧接着让当前应用干净退出(ForceExit)，脚本随即拉起新版.
    /// </summary>
    /// <remarks>
    /// 用隐藏 PowerShell + <c>Start-Process</c> 而非 cmd 的 <c>start</c>:
    /// 后者在无控制台(CreateNoWindow)下会失败(errorlevel 1)导致新版起不来；而 cmd 直接调用自包含单文件 exe
    /// 又会阻塞等待、脚本不自删.<c>Start-Process</c> 不带 -Wait 会立即返回并让新进程独立运行，稳定可靠.
    /// </remarks>
    public static void LaunchUpdaterAndExit(string newExePath, string oldExePath)
    {
        int pid = Environment.ProcessId;
        var ps1Path = Path.Combine(Path.GetTempPath(),
            "MinimalTodoApp_update_" + Guid.NewGuid().ToString("N") + ".ps1");

        // PowerShell 单引号字符串里转义单引号(成对)，安全嵌入任意路径
        string newQ = newExePath.Replace("'", "''");
        // 旧版路径作为 --updated-from 的实参:外面再包一层字面双引号，保证含空格的路径作为单个参数传入新版
        string oldArg = ("\"" + oldExePath + "\"").Replace("'", "''");

        var sb = new StringBuilder();
        sb.AppendLine("$ErrorActionPreference='SilentlyContinue'");
        // 轮询等待旧版退出(最多 ~60 秒兜底，避免极端情况下卡死)
        sb.AppendLine("$n=0");
        sb.AppendLine($"while ((Get-Process -Id {pid} -ErrorAction SilentlyContinue) -and ($n -lt 120)) {{ Start-Sleep -Milliseconds 500; $n++ }}");
        sb.AppendLine("Start-Sleep -Milliseconds 300");
        // 启动新版(脱离运行，不等待)；--updated-from 让新版回收旧 exe
        sb.AppendLine($"Start-Process -FilePath '{newQ}' -ArgumentList @('{UpdatedFromArg}','{oldArg}')");
        // 自删本脚本
        sb.AppendLine("Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue");

        File.WriteAllText(ps1Path, sb.ToString(), new UTF8Encoding(false));

        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{ps1Path}\"",
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
