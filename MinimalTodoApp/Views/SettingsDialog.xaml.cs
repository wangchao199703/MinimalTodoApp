using System.Windows;
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

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
}
