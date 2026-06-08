using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows;
using MinimalTodoApp.Infrastructure;
using MinimalTodoApp.ViewModels;
using MinimalTodoApp.Views;

namespace MinimalTodoApp;

public partial class App : Application
{
    public MainViewModel? ViewModel { get; private set; }

    // ===== 单实例相关的命名内核对象 =====
    // 名字一律用「固定 GUID」，不含版本号也不含 exe 文件名 —— 因此不同版本之间
    // (如 v1.1.2 与 v1.1.3，发布后的 exe 文件名各带版本号)也能互相识别与接管。
    private const string MutexName = "MinimalTodoApp_SingleInstance_{8F3C2A91-5D47-4E6B-9B1A-0F2D6C7E84A1}";
    private const string ExitEventName = "MinimalTodoApp_ExitSignal_{C4B1E2D3-7A89-4F56-B0C1-2D3E4F5A6B7C}";

    /// <summary>已发布 exe 的进程名前缀。发布资产名形如 “MinimalTodoApp-v1.1.3-win-x64.exe”，
    /// 故所有版本的进程名都以此为前缀；按前缀匹配即可跨版本号结束旧进程。</summary>
    private const string ProcessNamePrefix = "MinimalTodoApp";

    /// <summary>单实例命名互斥体.静态持有,防被 GC 释放导致互斥失效.</summary>
    private static Mutex? _instanceMutex;

    /// <summary>“请退出”命名事件:新实例 Set 后,采用新机制的旧实例监听到即优雅退出.静态持有防 GC.</summary>
    private static EventWaitHandle? _exitSignal;

    /// <summary>本实例向线程池注册的等待句柄(用于监听退出事件).</summary>
    private static RegisteredWaitHandle? _exitWaitReg;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // 全局异常兜底:记录到 crash.log，并尽量不让"偶发异常"直接闪退应用.
        HookGlobalExceptionLogging();

        // 1. 创建并加载 ViewModel(内部完成 data.json 的读取)
        ViewModel = new MainViewModel();

        // 1.1 先应用语言:保证单实例确认框用上用户选定的语言
        LanguageManager.Apply(ViewModel.CurrentLanguage);

        // 1.2 单实例检测:若旧版本在运行,询问是否退出旧版本并以当前版本接管.
        //     若本次是被更新脚本拉起(带 --updated-from),则静默接管、不弹框,确保新版一定起来.
        var startupArgs = Environment.GetCommandLineArgs();
        bool fromUpdate = Array.Exists(startupArgs,
            a => string.Equals(a, UpdateService.UpdatedFromArg, StringComparison.OrdinalIgnoreCase));

        // 1.15 若本次由自动更新拉起:第一时间通知仍在等待的旧版「新版已启动」,
        //      让旧版确认成功后优雅退出(自存数据),而非被随后的单实例接管强杀.
        if (fromUpdate) UpdateService.SignalUpdatedStarted();

        if (!EnsureSingleInstance(fromUpdate))
        {
            Shutdown();
            return;
        }

        // 1.3 成为当前唯一实例:写入 PID 文件 + 监听“请退出”事件,
        //     供日后启动的新版本对本实例做「优雅接管」。
        BecomeActiveInstance();

        // 2. 应用持久化的主题与字体设置
        ThemeManager.Apply(ViewModel.CurrentTheme);
        FontManager.Apply(ViewModel.FontFamily, ViewModel.FontSize, ViewModel.LineSpacing, ViewModel.CheckboxSize);

        // 3. 创建主窗口并显示
        var window = new MainWindow { DataContext = ViewModel };
        MainWindow = window;
        window.Show();

        // 4. 国内节假日数据:**等窗口首帧渲染完成后**再异步联网刷新，绝不影响启动/首屏.
        //    联网部分本身是异步(await HttpClient)、不阻塞 UI;失败静默回退缓存.
        if (ViewModel.ShowHolidays)
        {
            EventHandler? onRendered = null;
            onRendered = (_, _) =>
            {
                window.ContentRendered -= onRendered;   // 一次性
                _ = ViewModel!.EnsureHolidaysAsync();
            };
            window.ContentRendered += onRendered;
        }
    }

    /// <summary>崩溃日志路径:%AppData%\MinimalTodoApp\crash.log.</summary>
    private static string CrashLogPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MinimalTodoApp", "crash.log");

    /// <summary>
    /// 挂接全局异常日志:
    /// - UI 线程未处理异常(DispatcherUnhandledException):记录并标记已处理，避免"偶发异常直接闪退";
    /// - 后台线程 / 未观察的 Task 异常:仅记录(无法阻止其后果，但能留下现场).
    /// </summary>
    private void HookGlobalExceptionLogging()
    {
        DispatcherUnhandledException += (_, args) =>
        {
            LogCrash("DispatcherUnhandledException", args.Exception);
            args.Handled = true;   // 尽量让应用存活,而不是直接闪退
        };
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            LogCrash("AppDomain.UnhandledException", args.ExceptionObject as Exception);
        System.Threading.Tasks.TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            LogCrash("UnobservedTaskException", args.Exception);
            args.SetObserved();
        };
    }

    private static void LogCrash(string source, Exception? ex)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(CrashLogPath)!);
            File.AppendAllText(CrashLogPath,
                $"==== {DateTime.Now:yyyy-MM-dd HH:mm:ss} [{source}] ====\n{ex}\n\n");
        }
        catch { /* 日志失败不影响运行 */ }
    }

    /// <summary>
    /// 确保单实例运行.若已有实例:弹窗征询用户是否退出旧实例并以当前版本接管.
    /// 用户同意则按「优雅信号 → 兜底强杀」结束其它实例并接管互斥体;否则返回 false(当前实例退出).
    /// </summary>
    /// <param name="fromUpdate">是否由更新脚本拉起(带 --updated-from).为 true 时:不弹框、静默接管，
    /// 且即便互斥体接管超时也继续运行——避免更新重启时新旧实例短暂重叠导致新版被挡下/不启动.</param>
    private bool EnsureSingleInstance(bool fromUpdate = false)
    {
        _instanceMutex = new Mutex(initiallyOwned: true, name: MutexName, createdNew: out bool createdNew);

        if (createdNew) return true;

        // 非更新场景才征询用户;更新重启直接静默接管(旧版可能尚未完全退出)
        if (!fromUpdate)
        {
            var result = MessageBox.Show(
                Loc.T("S.SingleInstance.Message"),
                Loc.T("S.SingleInstance.Title"),
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return false;
        }

        // ① 优雅信号:采用新机制(本版本及以后)的旧实例会监听该事件并自行保存数据后退出。
        SignalOtherInstancesToExit();
        if (TryTakeOverMutex(TimeSpan.FromSeconds(fromUpdate ? 8 : 5))) return true;

        // ② 兜底强杀:对不监听信号的旧版本,按 PID 文件 + 进程名前缀结束。
        //    进程名前缀匹配可覆盖 “MinimalTodoApp-v1.1.2-win-x64” 这类把版本号写进文件名的已发布旧版本,
        //    这正是此前「点退出旧版本却没退出」的根因(旧逻辑按完整进程名精确匹配,版本号不同即匹配失败)。
        KillOtherInstances();
        if (TryTakeOverMutex(TimeSpan.FromSeconds(3))) return true;

        // 更新重启场景:即便没拿到互斥体也继续运行,确保新版一定起来(旧版此时应已被强杀清掉)
        return fromUpdate;
    }

    /// <summary>等待并接管互斥体;旧实例被结束后互斥体变 abandoned,捕获该异常即视为接管成功.</summary>
    private static bool TryTakeOverMutex(TimeSpan timeout)
    {
        try
        {
            return _instanceMutex!.WaitOne(timeout);
        }
        catch (AbandonedMutexException)
        {
            return true;
        }
    }

    /// <summary>向「请退出」命名事件发信号,通知采用新机制的旧实例优雅退出.</summary>
    private static void SignalOtherInstancesToExit()
    {
        try
        {
            if (EventWaitHandle.TryOpenExisting(ExitEventName, out var handle))
            {
                using (handle) handle.Set();
            }
        }
        catch
        {
            // 旧版本没有该事件(或打开失败):忽略,后续走兜底强杀.
        }
    }

    /// <summary>
    /// 结束其它实例(与本进程文件名/版本号无关):
    /// (a) 先按 PID 文件精确定位(新机制写入);
    /// (b) 再按进程名前缀 “MinimalTodoApp*” 兜底,覆盖所有已发布版本的 exe(含带版本号的文件名).
    /// </summary>
    private static void KillOtherInstances()
    {
        int currentId;
        try { currentId = Process.GetCurrentProcess().Id; }
        catch { return; }

        // (a) PID 文件:与 exe 文件名完全无关的精确定位
        try
        {
            var pidPath = PidFilePath;
            if (File.Exists(pidPath)
                && int.TryParse(File.ReadAllText(pidPath).Trim(), out int pid)
                && pid != currentId)
            {
                try
                {
                    var victim = Process.GetProcessById(pid);
                    // 防 PID 复用误杀:仅当该进程名仍是本程序前缀时才结束.
                    if (victim.ProcessName.StartsWith(ProcessNamePrefix, StringComparison.OrdinalIgnoreCase))
                        KillAndWait(victim);
                }
                catch { /* 该 PID 已不存在或无权限 */ }
            }
        }
        catch { /* 读取 PID 文件失败:忽略,走前缀兜底 */ }

        // (b) 进程名前缀匹配:覆盖 “MinimalTodoApp” / “MinimalTodoApp-vX.Y.Z-win-x64” 等所有版本
        try
        {
            foreach (var p in Process.GetProcesses())
            {
                if (p.Id == currentId) continue;
                string name;
                try { name = p.ProcessName; }
                catch { continue; }   // 部分系统进程无权访问,跳过
                if (name.StartsWith(ProcessNamePrefix, StringComparison.OrdinalIgnoreCase))
                {
                    try { KillAndWait(p); }
                    catch { /* 进程已退出或无权限,忽略 */ }
                }
            }
        }
        catch { /* 枚举失败时容错,不阻塞启动 */ }
    }

    private static void KillAndWait(Process p)
    {
        p.Kill();
        p.WaitForExit(3000);
    }

    /// <summary>
    /// 注册为当前活动实例:监听「请退出」事件(供新版本优雅接管)并写入 PID 文件(供强杀精确定位).
    /// </summary>
    private void BecomeActiveInstance()
    {
        try
        {
            _exitSignal = new EventWaitHandle(initialState: false, mode: EventResetMode.AutoReset,
                name: ExitEventName, createdNew: out _);
            // 清掉接管过程中可能残留的信号,避免刚成为活动实例就把自己关掉.
            _exitSignal.Reset();
            _exitWaitReg = ThreadPool.RegisterWaitForSingleObject(
                _exitSignal,
                (_, _) => Dispatcher.BeginInvoke(new Action(OnExitSignalReceived)),
                state: null,
                millisecondsTimeOutInterval: Timeout.Infinite,
                executeOnlyOnce: false);
        }
        catch
        {
            // 事件注册失败不影响应用正常运行,仅是后续无法被「优雅」接管(仍可被强杀接管).
        }

        WritePidFile();
    }

    /// <summary>收到新版本的「请退出」信号:保存数据、移除托盘、干净退出,让新版本接管.</summary>
    private void OnExitSignalReceived()
    {
        if (MainWindow is MainWindow mw)
            mw.ForceExit();
        else
            Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try { _exitWaitReg?.Unregister(null); } catch { }
        base.OnExit(e);
    }

    /// <summary>PID 文件路径:与 data.json 同目录(%AppData%\MinimalTodoApp\instance.pid).</summary>
    private static string PidFilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MinimalTodoApp", "instance.pid");

    private static void WritePidFile()
    {
        try
        {
            var path = PidFilePath;
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, Process.GetCurrentProcess().Id.ToString());
        }
        catch
        {
            // 写 PID 失败不影响运行,仅退化为「按进程名前缀」强杀.
        }
    }
}
