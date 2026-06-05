using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.ViewModels;

namespace MinimalTodoApp.Views;

/// <summary>设置窗口:开机自启动、完成特效、完成音效开关.</summary>
public partial class SettingsDialog : Window
{
    private bool _initializing;
    private readonly MainViewModel? _vm;

    public SettingsDialog() : this(null) { }

    public SettingsDialog(MainViewModel? vm)
    {
        InitializeComponent();
        _vm = vm;
        DataContext = vm;   // 字体下拉/字号/行距滑块通过绑定读写 ViewModel

        _initializing = true;
        AutoStartCheck.IsChecked = StartupManager.IsEnabled();
        if (_vm != null)
        {
            EffectsCheck.IsChecked = _vm.EffectsEnabled;
            SoundCheck.IsChecked = _vm.SoundEnabled;
            ReminderSoundCheck.IsChecked = _vm.ReminderSoundEnabled;
            AutoUpdateCheck.IsChecked = _vm.AutoUpdateEnabled;
        }
        _initializing = false;

        // 关于：显示当前版本号(取程序集版本，三段式 v主.次.修)
        var v = UpdateService.CurrentVersion;
        VersionText.Text = $"v{v.Major}.{v.Minor}.{v.Build}";

        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Escape) Close();
        };
    }

    /// <summary>无边框窗口:在非交互区域按下左键即可拖动整个设置窗口.</summary>
    private void Root_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    /// <summary>左侧导航:切到“常规”分组.</summary>
    private void GeneralNav_Checked(object sender, RoutedEventArgs e) => ShowPanel(GeneralPanel);

    /// <summary>左侧导航:切到“字体”分组.</summary>
    private void FontNav_Checked(object sender, RoutedEventArgs e) => ShowPanel(FontPanel);

    /// <summary>左侧导航:切到“关于”分组.</summary>
    private void AboutNav_Checked(object sender, RoutedEventArgs e) => ShowPanel(AboutPanel);

    /// <summary>仅显示指定面板，其余隐藏(控件可能尚未初始化完成,需判空).</summary>
    private void ShowPanel(UIElement? target)
    {
        if (GeneralPanel == null || FontPanel == null || AboutPanel == null) return;
        GeneralPanel.Visibility = ReferenceEquals(target, GeneralPanel) ? Visibility.Visible : Visibility.Collapsed;
        FontPanel.Visibility = ReferenceEquals(target, FontPanel) ? Visibility.Visible : Visibility.Collapsed;
        AboutPanel.Visibility = ReferenceEquals(target, AboutPanel) ? Visibility.Visible : Visibility.Collapsed;
    }

    /// <summary>打开 GitHub 项目主页(默认浏览器).</summary>
    private void RepoLink_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "https://github.com/wangchao199703/MinimalTodoApp",
                UseShellExecute = true
            });
        }
        catch { StatusText.Text = Loc.T("S.Settings.OpFailed"); }
    }

    /// <summary>恢复默认设置:字体微软雅黑、字号 12、行距 1.3、勾选框 16(经 VM 实时应用并持久化).</summary>
    private void RestoreDefaults_Click(object sender, RoutedEventArgs e)
    {
        if (_vm == null) return;
        _vm.ResetDefaultSettings();
        StatusText.Text = Loc.T("S.Settings.RestoreDone");
    }

    private void Effects_Changed(object sender, RoutedEventArgs e)
    {
        if (_initializing || _vm == null) return;
        _vm.EffectsEnabled = EffectsCheck.IsChecked == true;   // 触发持久化
    }

    private void Sound_Changed(object sender, RoutedEventArgs e)
    {
        if (_initializing || _vm == null) return;
        _vm.SoundEnabled = SoundCheck.IsChecked == true;       // 触发持久化
    }

    private void ReminderSound_Changed(object sender, RoutedEventArgs e)
    {
        if (_initializing || _vm == null) return;
        _vm.ReminderSoundEnabled = ReminderSoundCheck.IsChecked == true;   // 触发持久化
    }

    private void AutoUpdate_Changed(object sender, RoutedEventArgs e)
    {
        if (_initializing || _vm == null) return;
        _vm.AutoUpdateEnabled = AutoUpdateCheck.IsChecked == true;   // 触发持久化
    }

    /// <summary>手动检查更新:无视“此版本不再提示”，有新版即弹更新对话框，否则提示已是最新.</summary>
    private async void CheckUpdate_Click(object sender, RoutedEventArgs e)
    {
        CheckUpdateButton.IsEnabled = false;
        StatusText.Text = Loc.T("S.Update.Checking");
        try
        {
            var info = await UpdateService.CheckAsync();
            if (info == null)
            {
                StatusText.Text = Loc.T("S.Update.UpToDate");
                return;
            }

            StatusText.Text = "";
            var dlg = new UpdateDialog(info) { Owner = Owner ?? this };
            dlg.ShowDialog();
            // 手动检查时也尊重“此版本不再提示”
            if (dlg.Choice == UpdateChoice.Skipped && _vm != null)
                _vm.IgnoredUpdateVersion = info.Version.ToString(3);
        }
        catch
        {
            StatusText.Text = Loc.T("S.Update.CheckFailed");
        }
        finally
        {
            CheckUpdateButton.IsEnabled = true;
        }
    }

    /// <summary>
    /// 手动下载更新:在默认浏览器打开 GitHub 最新发布页面(releases/latest)，
    /// 并提示用户手动下载最新的 exe 安装.适合自动更新被网络/限流/权限阻断时的兜底手段.
    /// </summary>
    private void ManualDownload_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = "https://github.com/wangchao199703/MinimalTodoApp/releases/latest",
                UseShellExecute = true
            });
            StatusText.Text = Loc.T("S.Settings.ManualDownloadHint");
        }
        catch { StatusText.Text = Loc.T("S.Settings.OpFailed"); }
    }

    private void AutoStart_Changed(object sender, RoutedEventArgs e)
    {
        if (_initializing) return;

        bool want = AutoStartCheck.IsChecked == true;
        bool ok = StartupManager.SetEnabled(want);

        if (!ok)
        {
            StatusText.Text = Loc.T("S.Settings.OpFailed");
            _initializing = true;
            AutoStartCheck.IsChecked = StartupManager.IsEnabled();
            _initializing = false;
        }
        else
        {
            StatusText.Text = want ? Loc.T("S.Settings.AutoStartOn") : Loc.T("S.Settings.AutoStartOff");
        }
    }

    /// <summary>字号快捷档位:按按钮 Tag(12/14/16)设置字号，经 VM 触发 FontManager 应用并持久化.</summary>
    private void FontPreset_Click(object sender, RoutedEventArgs e)
    {
        if (_vm == null) return;
        if (sender is FrameworkElement fe && fe.Tag is string tag && double.TryParse(tag, out var size))
            _vm.FontSize = size;
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
