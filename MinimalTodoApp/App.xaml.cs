using System;
using System.Diagnostics;
using System.Threading;
using System.Windows;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.ViewModels;
using MinimalTodoApp.Views;

namespace MinimalTodoApp;

public partial class App : Application
{
    public MainViewModel? ViewModel { get; private set; }

    /// <summary>单实例命名互斥体.静态持有,防被 GC 释放导致互斥失效.</summary>
    private static Mutex? _instanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // 1. 创建并加载 ViewModel(内部完成 data.json 的读取)
        ViewModel = new MainViewModel();

        // 1.1 先应用语言:保证单实例确认框用上用户选定的语言
        LanguageManager.Apply(ViewModel.CurrentLanguage);

        // 1.2 单实例检测:若旧版本在运行,询问是否退出旧版本并以当前版本接管
        if (!EnsureSingleInstance())
        {
            Shutdown();
            return;
        }

        // 2. 应用持久化的主题与字体设置
        ThemeManager.Apply(ViewModel.CurrentTheme);
        FontManager.Apply(ViewModel.FontFamily, ViewModel.FontSize, ViewModel.LineSpacing);

        // 3. 创建主窗口并显示
        var window = new MainWindow { DataContext = ViewModel };
        MainWindow = window;
        window.Show();
    }

    /// <summary>
    /// 确保单实例运行.若已有实例:弹窗征询用户是否退出旧实例并以当前版本接管.
    /// 用户同意则结束其它同名进程并接管互斥体;否则返回 false(当前实例退出).
    /// </summary>
    private bool EnsureSingleInstance()
    {
        _instanceMutex = new Mutex(initiallyOwned: true,
            name: "MinimalTodoApp_SingleInstance_{8F3C2A91-5D47-4E6B-9B1A-0F2D6C7E84A1}",
            createdNew: out bool createdNew);

        if (createdNew) return true;

        var result = MessageBox.Show(
            Loc.T("S.SingleInstance.Message"),
            Loc.T("S.SingleInstance.Title"),
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (result != MessageBoxResult.Yes) return false;

        KillOtherInstances();

        // 旧进程被结束后,其拥有的互斥体变为 abandoned;捕获即视为接管成功.
        try
        {
            if (_instanceMutex.WaitOne(TimeSpan.FromSeconds(5)))
                return true;
        }
        catch (AbandonedMutexException)
        {
            return true;
        }
        return false;
    }

    /// <summary>结束除当前进程外的所有同名进程(已发布的单文件进程名为 MinimalTodoApp).</summary>
    private static void KillOtherInstances()
    {
        try
        {
            var current = Process.GetCurrentProcess();
            foreach (var p in Process.GetProcessesByName(current.ProcessName))
            {
                if (p.Id == current.Id) continue;
                try
                {
                    p.Kill();
                    p.WaitForExit(3000);
                }
                catch { /* 进程已退出或无权限,忽略 */ }
            }
        }
        catch { /* 枚举失败时容错,不阻塞启动 */ }
    }
}
