# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

MinimalTodoApp —— 一款 Windows 本地待办事项应用。C# + WPF，基于 **.NET 8**，采用 CommunityToolkit.Mvvm 源生成器实现 MVVM（零运行时反射）。单窗口桌面应用，具备本地 JSON 持久化、应用内主题/语言切换、系统托盘，以及基于 GitHub 的自动更新。仓库根目录存放构建/发布脚本，所有应用代码位于 `MinimalTodoApp/` 下。

## 命令

除非另有说明，均在仓库根目录执行。需要 .NET 8 SDK（`dotnet --list-sdks`）。

```powershell
dotnet run --project MinimalTodoApp        # 调试运行
dotnet build MinimalTodoApp -c Release     # Release 编译
.\build.ps1                                # 发布自包含单文件 exe（约 63 MB，目标机无需安装运行时）
.\release.ps1                              # 完整 GitHub Release：编译 → 打 tag → 推送 → 上传资产（从 csproj 读取 <Version>）
```

`build.ps1` 产物路径：`MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish\MinimalTodoApp.exe`。

**没有测试套件**，改动通过运行应用来验证。

`MinimalTodoApp/` 下的 `*_wpftmp.csproj` 是 WPF 构建临时文件（已 gitignore），可忽略；真正的项目文件是 `MinimalTodoApp/MinimalTodoApp.csproj`。

## 架构

**单一数据源：`MainViewModel`**（`ViewModels/MainViewModel.cs`，约 1800 行）。它持有全部任务/分组状态、排序、拖拽重排（`IDropTarget`）、倒计时定时器，并在数据变动时触发自动保存。多数功能开发都会改到这个文件。视图很薄；`MainWindow.xaml.cs` 负责窗口外壳（自绘标题栏、托盘、贴边停靠、亚克力），但逻辑委托给 VM。

**持久化**（`Services/DataService.cs`）：整个应用状态就是一个 `AppData` 对象（`Models/AppData.cs`）—— `TodoItem` 与 `TodoGroup` 的扁平列表，互不引用（因此 System.Text.Json 永远不会遇到循环引用）。通过**原子写入**（临时文件 + `File.Replace`）保存到 `%AppData%\MinimalTodoApp\data.json`。加载失败时返回空的 `AppData` 而非崩溃。新增需持久化的状态时，往 `AppData` 加属性即可自动序列化；没有迁移层，所以默认值要保持向后兼容。

**主题**（`Infrastructure/ThemeManager.cs` + `Themes/*.xaml`）：运行时主题切换的原理是替换 `App.Resources.MergedDictionaries` 中**索引 0** 处的 `ResourceDictionary`。`Themes/Controls.xaml` 中每个颜色都通过 `DynamicResource` 引用，因此所有控件会实时换色。每套主题都必须定义 `ThemeManager.ColorKeys` 里列出的全部键；自定义主题（用户自建，持久化在 `AppData.CustomThemes`）在内存中由颜色字典构建，缺失的键用 Light 主题兜底。**约定：主题字典必须保持在索引 0。**

**本地化**（`Infrastructure/LanguageManager.cs` + `Loc.cs` + `Lang/Strings.{zh,en}.xaml`）：与主题做法如出一辙 —— 替换字符串 `ResourceDictionary`（插在 `Controls.xaml` *之前*，绝不占用索引 0）。XAML 静态文本用 `{DynamicResource S.Xxx}`；C# 动态文案用 `Loc.T("S.Xxx")` / `Loc.F("S.Xxx", args)`（缺失时返回键本身，未翻译的键会醒目显示出来）。`Strings.zh.xaml` 和 `Strings.en.xaml` 都必须定义每一个 `S.*` 键。语言切换后会触发 `LanguageManager.LanguageChanged`，供 VM 重建动态生成的文案。

**启动与单实例**（`App.xaml.cs`）：`OnStartup` 先加载 VM（其中读取 data.json），依次应用 语言 → 主题 → 字体，再执行单实例逻辑。单实例使用**固定 GUID 的命名 Mutex**（名字不含版本号/文件名），因此新版本能识别并接管正在运行的旧版本。接管采用「先优雅后强制」：先用命名事件通知旧实例保存并退出，再强杀（先按 PID 文件 `instance.pid`，再按进程名前缀 `MinimalTodoApp*`，以覆盖形如 `MinimalTodoApp-v1.1.3-win-x64` 的已发布 exe）。改动实例协调逻辑时，务必保持内核对象名与版本无关。

**自动更新**（`Infrastructure/UpdateService.cs`）：轮询 GitHub 仓库（`wangchao199703/MinimalTodoApp`）的 `releases/latest`，与程序集版本比对，下载新版自包含 exe，并通过临时脚本重启（旧版退出 → 新版启动；新进程通过 `--updated-from` 参数回收旧 exe）。纯 HttpClient + P/Invoke，不引入第三方依赖，以保持单文件体积。启动时 + 每小时检查；用户可关闭（`AppData.AutoUpdateEnabled`）或跳过某个版本（`IgnoredUpdateVersion`）。

## 发布

在 `MinimalTodoApp.csproj` 中递增 `<Version>`、`<FileVersion>`、`<AssemblyVersion>`（三者都要改），更新 `release-notes.md`，提交，然后执行 `.\release.ps1`。脚本会在 tag 已存在时中止，并在上传前校验所构建 exe 的 FileVersion 与 `<Version>` 一致。认证使用 `$env:GH_TOKEN`，否则回退到 git 凭据管理器。token 步骤的兜底方案见 `memory/release-github-token.md`。

## 约定

- 源码注释与提交信息用**中文**；`build.ps1` / `build.bat` 脚本刻意不含中文（构建要求）。编辑时与上下文保持一致的语言。
- 仅三个 NuGet 依赖，均为保持单文件小体积而选：`CommunityToolkit.Mvvm`（MVVM 生成器）、`gong-wpf-dragdrop`（列表拖拽）、`H.NotifyIcon.Wpf`（托盘）。优先用 P/Invoke（`Infrastructure/NativeMethods.cs`）而非新增依赖。
- 新增 VM 状态/命令时，使用 CommunityToolkit 源生成器特性（`[ObservableProperty]`、`[RelayCommand]`），与现有写法保持一致。
