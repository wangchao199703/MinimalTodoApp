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
        }
        _initializing = false;

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
    private void GeneralNav_Checked(object sender, RoutedEventArgs e)
    {
        if (GeneralPanel == null || FontPanel == null) return;
        GeneralPanel.Visibility = Visibility.Visible;
        FontPanel.Visibility = Visibility.Collapsed;
    }

    /// <summary>左侧导航:切到“字体”分组.</summary>
    private void FontNav_Checked(object sender, RoutedEventArgs e)
    {
        if (GeneralPanel == null || FontPanel == null) return;
        GeneralPanel.Visibility = Visibility.Collapsed;
        FontPanel.Visibility = Visibility.Visible;
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
