using System;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using MinimalTodoApp.Infrastructure;

namespace MinimalTodoApp.Views;

/// <summary>用户对“发现新版本”提示的选择.</summary>
public enum UpdateChoice
{
    /// <summary>关闭/忽略本次:不更新，下次检查仍会提示.</summary>
    Ignored,
    /// <summary>此版本不再提示:记录被跳过的版本号，自动检查不再弹(手动检查仍弹).</summary>
    Skipped,
    /// <summary>已开始更新:正在下载并即将重启，调用方无需再处理.</summary>
    Updating,
}

/// <summary>
/// 自动更新提示对话框:展示新版本号与该 Release 的更新说明，提供
/// 「立即更新 / 忽略 / 此版本不再提示」。点击立即更新即下载并(成功后)退出当前版本、由脚本拉起新版.
/// </summary>
public partial class UpdateDialog : Window
{
    private readonly UpdateInfo _info;

    /// <summary>已下载落地的新版 exe 路径(供兜底面板的「打开文件夹/立即运行」使用).</summary>
    private string? _newExePath;

    /// <summary>用户最终选择，供调用方决定是否写入“忽略此版本”.</summary>
    public UpdateChoice Choice { get; private set; } = UpdateChoice.Ignored;

    public UpdateDialog(UpdateInfo info, bool reinstall = false)
    {
        InitializeComponent();
        _info = info;

        // 重新安装态:标题改为「重新安装当前版本 vX」，与「发现新版本」区分
        VersionText.Text = reinstall
            ? Loc.F("S.Update.Reinstall", info.Version.ToString(3))
            : Loc.F("S.Update.NewVersion", info.Version.ToString(3), UpdateService.CurrentVersion.ToString(3));

        // 发布说明:按当前界面语言只取对应语种分节，并把 Markdown 渲染为可读文本(去掉 # / ** / 列表记号等)
        bool chinese = LanguageManager.Current != LanguageManager.English;
        string readable = ExtractNotes(info.Notes, chinese);
        NotesText.Text = string.IsNullOrWhiteSpace(readable) ? info.Tag : readable;

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape && ButtonsPanel.Visibility == Visibility.Visible)
            {
                Choice = UpdateChoice.Ignored;
                Close();
            }
        };
    }

    /// <summary>
    /// 从 Release 说明里取当前语言对应的分节并转为可读文本.
    /// 本项目 release-notes.md 用「### English」「### 简体中文」分隔双语；非此格式则原样返回(再做 Markdown 渲染).
    /// </summary>
    private static string ExtractNotes(string? notes, bool chinese)
    {
        if (string.IsNullOrWhiteSpace(notes)) return "";

        int enIdx = notes.IndexOf("English", StringComparison.OrdinalIgnoreCase);
        int zhIdx = notes.IndexOf("简体中文", StringComparison.Ordinal);

        string section = notes;
        if (enIdx >= 0 && zhIdx >= 0)
        {
            int start, end;
            if (chinese) { start = zhIdx; end = zhIdx > enIdx ? notes.Length : enIdx; }
            else { start = enIdx; end = enIdx > zhIdx ? notes.Length : zhIdx; }

            // 跳过语言标题所在行本身(连同其上的 ### 记号)
            int nl = notes.IndexOf('\n', start);
            if (nl >= 0 && nl < end) start = nl + 1;
            if (end > start) section = notes.Substring(start, end - start);
        }

        return MarkdownToReadable(section);
    }

    /// <summary>把 Markdown 粗略转为可读纯文本:去掉标题 #、粗斜体 **/*、行内代码 `、列表记号→•、链接→文字、分隔线.</summary>
    private static string MarkdownToReadable(string md)
    {
        if (string.IsNullOrWhiteSpace(md)) return "";

        var sb = new StringBuilder();
        foreach (var raw in md.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n'))
        {
            var line = raw.TrimEnd();

            // 分隔线 --- / *** 整行去掉
            if (Regex.IsMatch(line, @"^\s*([-*_])\1{2,}\s*$")) continue;

            // 标题:去掉前导 #
            var h = Regex.Match(line, @"^\s{0,3}#{1,6}\s*(.*)$");
            if (h.Success) line = h.Groups[1].Value;

            // 列表记号 -, *, + → •
            line = Regex.Replace(line, @"^(\s*)[-*+]\s+", "$1• ");
            // 链接 [text](url) → text (url)
            line = Regex.Replace(line, @"\[([^\]]+)\]\(([^)]+)\)", "$1 ($2)");
            // 粗体/斜体记号、行内代码
            line = line.Replace("**", "").Replace("__", "");
            line = Regex.Replace(line, @"`([^`]*)`", "$1");

            sb.AppendLine(line);
        }

        // 折叠 3+ 连续空行为 1 个空行
        return Regex.Replace(sb.ToString(), @"\n{3,}", "\n\n").Trim();
    }

    /// <summary>无边框窗口:非交互区域按下左键即可拖动整个窗口.</summary>
    private void Root_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    private void Ignore_Click(object sender, RoutedEventArgs e)
    {
        Choice = UpdateChoice.Ignored;
        Close();
    }

    private void SkipThis_Click(object sender, RoutedEventArgs e)
    {
        Choice = UpdateChoice.Skipped;
        Close();
    }

    private async void UpdateNow_Click(object sender, RoutedEventArgs e)
    {
        Choice = UpdateChoice.Updating;

        // 切到下载进度态
        ButtonsPanel.Visibility = Visibility.Collapsed;
        ProgressPanel.Visibility = Visibility.Visible;
        ProgressText.Text = Loc.T("S.Update.Downloading");

        var progress = new Progress<double>(p => DownloadProgress.Value = p);

        try
        {
            string newExe = await UpdateService.DownloadAsync(_info, progress, CancellationToken.None);
            _newExePath = newExe;
            string oldExe = UpdateService.CurrentExePath;

            // 直接拉起新版并在后台等待其「启动确认」(不阻塞 UI 线程)
            ProgressText.Text = Loc.T("S.Update.Downloading");
            bool started = await Task.Run(() => UpdateService.TryStartNewVersion(newExe, oldExe));

            if (started)
            {
                // 已确认新版起来 → 干净退出当前版本,由新版接管
                if (Application.Current.MainWindow is MainWindow mw)
                    mw.ForceExit();
                else
                    Application.Current.Shutdown();
            }
            else
            {
                // 兜底:新版未能自动启动 → 当前版本保持存活,提示用户去具体路径手动运行
                ShowFallback(newExe);
            }
        }
        catch
        {
            // 下载失败:回到按钮态并提示，可重试
            ProgressPanel.Visibility = Visibility.Collapsed;
            ButtonsPanel.Visibility = Visibility.Visible;
            VersionText.Text = Loc.T("S.Update.DownloadFailed");
            Choice = UpdateChoice.Ignored;
        }
    }

    /// <summary>切到兜底态:展示新版完整路径与「打开文件夹 / 立即运行 / 关闭」.</summary>
    private void ShowFallback(string newExePath)
    {
        Choice = UpdateChoice.Ignored;   // 未成功更新:调用方不要写"忽略此版本"
        ProgressPanel.Visibility = Visibility.Collapsed;
        ButtonsPanel.Visibility = Visibility.Collapsed;
        FallbackPanel.Visibility = Visibility.Visible;
        VersionText.Text = Loc.T("S.Update.LaunchFailed.Title");
        NewExePathText.Text = newExePath;
    }

    /// <summary>打开新版所在文件夹并选中该 exe.</summary>
    private void OpenFolder_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_newExePath)) return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = "/select,\"" + _newExePath + "\"",
                UseShellExecute = true,
            });
        }
        catch { /* 资源管理器拉起失败:忽略,用户仍可照路径手动定位 */ }
    }

    /// <summary>再次尝试运行新版;成功则干净退出当前版本.</summary>
    private void RunNow_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrEmpty(_newExePath)) return;
        string oldExe = UpdateService.CurrentExePath;
        if (UpdateService.TryStartNewVersion(_newExePath, oldExe))
        {
            if (Application.Current.MainWindow is MainWindow mw)
                mw.ForceExit();
            else
                Application.Current.Shutdown();
        }
        // 仍未起来:留在兜底态,用户可改用「打开文件夹」手动运行
    }
}
