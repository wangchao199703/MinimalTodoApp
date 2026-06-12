using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Reflection;
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

    /// <summary>新版被拉起时携带的参数:其后紧跟被替换的旧版 exe 路径(供回收).</summary>
    public const string UpdatedFromArg = "--updated-from";

    /// <summary>
    /// 「新版已启动」确认事件名(固定 GUID，与版本无关).旧版拉起新版后等待该事件被 Set;
    /// 新版启动时(见 <see cref="SignalUpdatedStarted"/>)Set 它，旧版据此确认新版真的起来了才退出，
    /// 否则保持存活并提示用户手动运行 —— 彻底规避「旧版已退出、新版没起来、用户看不到任何提示」.
    /// </summary>
    private const string StartedEventName =
        "MinimalTodoApp_UpdateStarted_{6E1F0A53-2C8B-4D74-9A1E-7B5C3D2F9E04}";

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

        var info = ParseRelease(root);
        if (info == null) return null;

        // 仅按 主.次.修订 三段比较，忽略 build 段差异
        if (Normalize(info.Version) <= Normalize(CurrentVersion)) return null;   // 已是最新
        return info;
    }

    /// <summary>
    /// 按 tag 拉取指定版本的 Release(用于「重新安装当前版本」：重新下载并安装同一版本，修复损坏/卡顿)。
    /// 不做版本比较;返回该 Release 的可下载 win-x64 资产，无资产/解析失败返回 null，网络/HTTP 错误抛异常。
    /// </summary>
    public static async Task<UpdateInfo?> FetchReleaseByTagAsync(string tag, CancellationToken ct = default)
    {
        var url = "https://api.github.com/repos/" + RepoSlug + "/releases/tags/" + Uri.EscapeDataString(tag);
        using var resp = await Http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        return ParseRelease(doc.RootElement);
    }

    /// <summary>从一个 Release JSON 解析出 <see cref="UpdateInfo"/>(tag/说明/win-x64 资产);tag 不可解析或无资产返回 null.</summary>
    private static UpdateInfo? ParseRelease(JsonElement root)
    {
        string tag = root.TryGetProperty("tag_name", out var t) ? (t.GetString() ?? "") : "";
        var ver = ParseVersion(tag);
        if (ver == null) return null;

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

        return new UpdateInfo(ver, tag, notes, url, assetName);
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
    /// 直接拉起新版 exe 并确认其确实启动 —— 不依赖 PowerShell/cmd 脚本.
    /// 用 <see cref="ProcessStartInfo.UseShellExecute"/>=true(底层 ShellExecuteEx):新进程完全脱离父进程、
    /// 不继承句柄、父进程退出后仍存活、无控制台窗口.随后等待 <see cref="StartedEventName"/> 被新版 Set 以确认其起来了.
    /// </summary>
    /// <returns>
    /// <c>true</c> = 已确认新版启动(调用方应随即干净退出,新版会接管)；
    /// <c>false</c> = 多次尝试仍未确认(调用方应**保持存活**并提示用户手动运行新版).
    /// </returns>
    /// <remarks>
    /// 弃用旧的「隐藏 PowerShell 临时脚本」方案:在受控/企业机器上(组策略把 ExecutionPolicy 设在 MachinePolicy
    /// 作用域使 -Bypass 失效、AppLocker/杀软拦截 %TEMP% 脚本、Constrained Language Mode)脚本会静默失败,
    /// 导致旧版已退出而新版没起来、用户毫无察觉.直接 Process.Start + 事件握手确认从根本上规避.
    /// 新版自身已具备「带 --updated-from 时静默接管旧实例」能力(见 App.EnsureSingleInstance),无需外部脚本等旧版退出.
    /// </remarks>
    public static bool TryStartNewVersion(string newExePath, string oldExePath)
    {
        // 旧版先建好「新版已启动」确认事件并复位,供新版起来后打开并 Set.
        EventWaitHandle? started = null;
        try
        {
            started = new EventWaitHandle(initialState: false, mode: EventResetMode.ManualReset,
                name: StartedEventName, createdNew: out _);
            started.Reset();
        }
        catch
        {
            started = null;   // 极受限系统无法创建命名事件:退化为「轮询新进程」二次确认(见下).
        }

        using (started)
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                bool launched = false;
                try
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = newExePath,
                        UseShellExecute = true,                                  // ShellExecuteEx:完全脱离、父退出后仍存活
                        WorkingDirectory = Path.GetDirectoryName(newExePath) ?? "",
                    };
                    psi.ArgumentList.Add(UpdatedFromArg);
                    psi.ArgumentList.Add(oldExePath);                            // 自动正确转义含空格路径
                    Process.Start(psi);
                    launched = true;
                }
                catch
                {
                    // 新 exe 刚落地可能被杀软/同步盘短暂占用:本次启动失败,退避后重试.
                    Thread.Sleep(800);
                }

                if (!launched) continue;

                if (started != null)
                {
                    // 首次给足时间(单文件首启需解包),后续重试缩短.
                    if (started.WaitOne(TimeSpan.FromSeconds(attempt == 0 ? 12 : 6)))
                        return true;
                }
                else
                {
                    // 无命名事件可用:退化为轮询是否出现了「除自己外的 MinimalTodoApp* 进程」.
                    if (WaitForNewInstance(TimeSpan.FromSeconds(attempt == 0 ? 12 : 6)))
                        return true;
                }
            }
        }
        return false;
    }

    /// <summary>退化确认:在超时内轮询是否出现了「除当前进程外」的同程序前缀进程(命名事件不可用时的兜底判据).</summary>
    private static bool WaitForNewInstance(TimeSpan timeout)
    {
        int selfId;
        try { selfId = Environment.ProcessId; }
        catch { return false; }

        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                foreach (var p in Process.GetProcessesByName("MinimalTodoApp"))
                {
                    using (p)
                        if (p.Id != selfId) return true;
                }
            }
            catch { /* 枚举受限:继续轮询 */ }
            Thread.Sleep(400);
        }
        return false;
    }

    /// <summary>
    /// 新版启动时(命令行带 <see cref="UpdatedFromArg"/>)尽早调用:Set「新版已启动」事件,
    /// 通知仍在等待确认的旧版「我已经起来了」.旧版不在新机制上(旧版本)时事件不存在,静默忽略即可.
    /// </summary>
    public static void SignalUpdatedStarted()
    {
        try
        {
            if (EventWaitHandle.TryOpenExisting(StartedEventName, out var handle))
                using (handle) handle.Set();
        }
        catch
        {
            // 旧版未建该事件 / 打开失败:忽略.旧版会经其自身的等待超时走兜底提示,不影响新版运行.
        }
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
