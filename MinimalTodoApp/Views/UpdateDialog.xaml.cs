using System;
using System.Threading;
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

    /// <summary>用户最终选择，供调用方决定是否写入“忽略此版本”.</summary>
    public UpdateChoice Choice { get; private set; } = UpdateChoice.Ignored;

    public UpdateDialog(UpdateInfo info)
    {
        InitializeComponent();
        _info = info;

        VersionText.Text = Loc.F("S.Update.NewVersion",
            info.Version.ToString(3), UpdateService.CurrentVersion.ToString(3));
        NotesText.Text = string.IsNullOrWhiteSpace(info.Notes)
            ? info.Tag
            : info.Notes.Trim();

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape && ButtonsPanel.Visibility == Visibility.Visible)
            {
                Choice = UpdateChoice.Ignored;
                Close();
            }
        };
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
            string oldExe = UpdateService.CurrentExePath;

            // 生成更新脚本(等本进程退出 → 启动新版)，随即干净退出当前版本
            UpdateService.LaunchUpdaterAndExit(newExe, oldExe);

            if (Application.Current.MainWindow is MainWindow mw)
                mw.ForceExit();
            else
                Application.Current.Shutdown();
        }
        catch
        {
            // 下载/启动失败:回到按钮态并提示，可重试
            ProgressPanel.Visibility = Visibility.Collapsed;
            ButtonsPanel.Visibility = Visibility.Visible;
            VersionText.Text = Loc.T("S.Update.DownloadFailed");
            Choice = UpdateChoice.Ignored;
        }
    }
}
