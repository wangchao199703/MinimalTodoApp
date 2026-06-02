# MinimalTodoApp

**English | [简体中文](#简体中文)**

A lightweight, fast-starting **local to-do app for Windows**.

- **Tech stack**: C# + WPF (.NET 8) + standard MVVM (CommunityToolkit.Mvvm source generators, zero runtime reflection)
- **Highlights**: local storage, save-on-change, publishable as a self-contained single-file exe (no .NET runtime required on the target machine)
- **In-app language switch**: 简体中文 / English, switchable at runtime with no restart (title-bar ☰ menu → Language)

---

## ✨ Features

- ✅ Add / delete / edit tasks and mark them done; click the title to edit text, right-click for the action menu
- ☑️ Built-in "Done" group: checked tasks are auto-collected, unchecking restores the original group
- 📅 Due date + countdown to the deadline (Today / Tomorrow / N days left / Overdue)
- ⏱️ After typing a task, a priority dropdown + quick time presets pop up above (5 minutes – 1 week, minute precision)
- 🗂️ Custom groups (switch in the sidebar; defaults: Work / Life / Study / Done), right-click to change color / clear / delete
- ↔️ Resizable sidebar by dragging; ☰ at the bottom-left collapses / expands it
- ↕️ Multiple sort modes: Custom (drag) / Due date / Priority / Completion / Created time / Title
- 💾 Local `data.json` storage, saved on change and loaded on start (System.Text.Json)
- 🎨 8 built-in themes + custom themes: Light / Dark / Nord / Ocean / Forest / Rose / Transparent / Glass
- ⚙️ Settings window: run-at-startup toggle + adjustable font / size / line spacing for task & body text (title-bar ☰ → Settings)
- 🪟 Custom-drawn title bar (traffic-light buttons at the top-right) + rounded window
- 🔔 Stays on the desktop: the close button hides to the tray, right-click the tray icon to quit, double-click to restore

---

## 📁 Project structure

```
todo_project/
├─ build.ps1 / build.bat        # one-click scripts to publish the self-contained single-file exe
└─ MinimalTodoApp/
   ├─ MinimalTodoApp.csproj      # project file (.NET 8 / WPF)
   ├─ App.xaml(.cs)              # app entry point
   ├─ Models/                    # data models (TodoItem / TodoGroup / AppData / theme / sort)
   ├─ ViewModels/                # MainViewModel (MVVM core)
   ├─ Views/                     # windows & dialogs (main / settings / task edit / theme edit / toast)
   ├─ Services/                  # DataService (local JSON read/write)
   ├─ Infrastructure/            # theme manager, run-at-startup, sound, Markdown, native API wrappers, i18n
   ├─ Converters/                # XAML value converters
   ├─ Lang/                      # Strings.zh.xaml / Strings.en.xaml (translation resources)
   └─ Themes/                    # 8 built-in theme resource dictionaries
```

---

## 🚀 Getting started

### Prerequisite: install the .NET 8 SDK

```powershell
winget install Microsoft.DotNet.SDK.8
```

Or download "SDK x64" from <https://dotnet.microsoft.com/download/dotnet/8.0>. Open a new terminal and verify:

```powershell
dotnet --list-sdks
```

### Build & run

In the `MinimalTodoApp` directory (containing `MinimalTodoApp.csproj`):

```powershell
dotnet restore        # restore NuGet packages (internet needed the first time)
dotnet run            # run directly (debug)
dotnet build -c Release   # or build Release
```

---

## 📦 Package as a dependency-free single-file exe (recommended)

Just run the script in the repo root (the scripts contain no Chinese):

```powershell
.\build.ps1     # PowerShell
```

or

```bat
build.bat       :: command line
```

The script publishes a **self-contained single file**; the target machine needs no .NET runtime installed.

Output path:

```
MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish\MinimalTodoApp.exe   (~63 MB)
```

Equivalent command:

```powershell
dotnet publish MinimalTodoApp\MinimalTodoApp.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true `
  -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:DebugType=none -p:SatelliteResourceLanguages=en
```

> If the target machine already has the .NET 8 Desktop Runtime, you can publish framework-dependent for a ~1.7 MB single file instead:
> `--self-contained false -p:PublishSingleFile=true -p:DebugType=none`

---

## 💾 Data file location

```
%AppData%\MinimalTodoApp\data.json
```

---

## 🔧 Dependencies (all lightweight libraries)

| Library | Purpose |
|---------|---------|
| CommunityToolkit.Mvvm | MVVM source generators, zero reflection |
| gong-wpf-dragdrop | drag-and-drop list reordering |
| H.NotifyIcon.Wpf | system tray |

> If `dotnet restore` reports a missing package version, change the corresponding `Version` in `.csproj` to the latest stable version reported by `dotnet add package <name>`.

---

## 💻 System requirements

Windows 10 (1809+) / Windows 11, x64

---

## 📄 More docs

- [Optimization log](MinimalTodoApp/优化记录.md)

---
<br>

<a name="简体中文"></a>

# MinimalTodoApp（简体中文）

**[English](#minimaltodoapp) | 简体中文**

一款占用内存小、启动快的 **Windows 本地待办事项软件**。

- **技术栈**：C# + WPF (.NET 8) + 标准 MVVM（CommunityToolkit.Mvvm 源生成器，零运行时反射）
- **特点**：本地存储、即改即存、自包含单文件可发布（目标机无需安装 .NET 运行时）
- **应用内多语言**：简体中文 / English，运行时一键切换无需重启（标题栏 ☰ 菜单 → 语言）

---

## ✨ 功能

- ✅ 任务增 / 删 / 改、标记完成；单击标题编辑文本，右键弹出操作菜单
- ☑️ 内置「已完成」分组：勾选完成的任务自动归集，取消勾选还原原分组
- 📅 截止日期 + 距 DDL 倒计时（今天 / 明天 / 剩 N 天 / 逾期）
- ⏱️ 输入任务后上方弹出优先级下拉 + 常用时间快捷选择（5 分钟～1 周，精确到分钟）
- 🗂️ 自定义分组（侧边栏切换，默认：工作 / 生活 / 学习 / 已完成），右键可改颜色 / 清空 / 删除
- ↔️ 分组栏可拖动调宽，左下角 ☰ 一键折叠 / 展开
- ↕️ 多种排序：自定义(拖拽) / 截止日期 / 优先级 / 完成状态 / 创建时间 / 标题
- 💾 本地 `data.json` 存储，变动即存、启动即载（System.Text.Json）
- 🎨 8 套内置主题 + 自定义主题：明亮 / 暗黑 / 极地 / 海洋 / 森林 / 玫瑰 / 透明 / 毛玻璃
- ⚙️ 设置窗口：开机自启动开关 + 任务/正文文字的字体、字号、行距可调（标题栏 ☰ → 设置）
- 🪟 自绘标题栏（交通灯按钮在右上角）+ 圆角窗口
- 🔔 常驻桌面：关闭按钮 = 隐藏到托盘，右键托盘菜单退出，双击托盘恢复

---

## 📁 项目结构

```
todo_project/
├─ build.ps1 / build.bat        # 一键发布自包含单文件 exe 的脚本
└─ MinimalTodoApp/
   ├─ MinimalTodoApp.csproj      # 项目文件（.NET 8 / WPF）
   ├─ App.xaml(.cs)              # 应用入口
   ├─ Models/                    # 数据模型（TodoItem / TodoGroup / AppData / 主题 / 排序）
   ├─ ViewModels/                # MainViewModel（MVVM 核心）
   ├─ Views/                     # 窗口与对话框（主窗口 / 设置 / 任务编辑 / 主题编辑 / 提示）
   ├─ Services/                  # DataService（本地 JSON 读写）
   ├─ Infrastructure/            # 主题管理、开机自启、声音、Markdown、原生 API 封装、国际化
   ├─ Converters/                # XAML 值转换器
   ├─ Lang/                      # Strings.zh.xaml / Strings.en.xaml（翻译资源）
   └─ Themes/                    # 8 套内置主题资源字典
```

---

## 🚀 快速开始

### 运行前提：安装 .NET 8 SDK

```powershell
winget install Microsoft.DotNet.SDK.8
```

或到 <https://dotnet.microsoft.com/download/dotnet/8.0> 下载 “SDK x64” 安装。装完新开终端确认：

```powershell
dotnet --list-sdks
```

### 编译与运行

在 `MinimalTodoApp` 目录（含 `MinimalTodoApp.csproj`）下：

```powershell
dotnet restore        # 还原 NuGet 包（首次需联网）
dotnet run            # 直接运行（调试）
dotnet build -c Release   # 或编译 Release
```

---

## 📦 打包为无依赖单文件 exe（推荐）

直接运行根目录脚本（脚本内无中文）：

```powershell
.\build.ps1     # PowerShell
```

或

```bat
build.bat       :: 命令行
```

脚本会发布**自包含单文件**，目标机无需安装任何 .NET 运行时。

产物路径：

```
MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish\MinimalTodoApp.exe   （约 63 MB）
```

等价命令：

```powershell
dotnet publish MinimalTodoApp\MinimalTodoApp.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true `
  -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:DebugType=none -p:SatelliteResourceLanguages=en
```

> 若目标机已装 .NET 8 桌面运行时，可改用框架依赖发布得到约 1.7 MB 的小体积单文件：
> `--self-contained false -p:PublishSingleFile=true -p:DebugType=none`

---

## 💾 数据文件位置

```
%AppData%\MinimalTodoApp\data.json
```

---

## 🔧 依赖（均为轻量库）

| 库 | 用途 |
|----|------|
| CommunityToolkit.Mvvm | MVVM 源生成器，零反射 |
| gong-wpf-dragdrop | 列表拖拽排序 |
| H.NotifyIcon.Wpf | 系统托盘 |

> 若 `dotnet restore` 报某个包版本不存在，把 `.csproj` 里对应 `Version` 改成 `dotnet add package <名称>` 提示的最新稳定版即可。

---

## 💻 系统要求

Windows 10（1809+）/ Windows 11，x64

---

## 📄 更多文档

- [优化记录](MinimalTodoApp/优化记录.md)
</content>
