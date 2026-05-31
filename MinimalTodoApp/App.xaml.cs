using System.Windows;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.ViewModels;
using MinimalTodoApp.Views;

namespace MinimalTodoApp;

public partial class App : Application
{
    public MainViewModel? ViewModel { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // 1. 创建并加载 ViewModel(内部完成 data.json 的读取)
        ViewModel = new MainViewModel();

        // 2. 应用持久化的主题
        ThemeManager.Apply(ViewModel.CurrentTheme);

        // 2.1 应用持久化的语言(在主题之后、显示窗口之前，避免界面闪烁)
        LanguageManager.Apply(ViewModel.CurrentLanguage);

        // 3. 创建主窗口并显示
        var window = new MainWindow { DataContext = ViewModel };
        MainWindow = window;
        window.Show();
    }
}
