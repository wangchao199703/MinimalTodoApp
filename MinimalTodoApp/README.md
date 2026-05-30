# Todo

一款占用内存小、启动快的 Windows 本地待办事项软件。
C# + WPF (.NET 8) + 标准 MVVM（CommunityToolkit.Mvvm 源生成器）。

## 功能
- ✅ 任务增 / 删 / 改、标记完成；**单击标题编辑文本，右键弹出操作菜单**
- ☑️ 内置「已完成」分组：**勾选完成的任务自动归集**，取消勾选还原原分组
- 📅 截止日期 + **距 DDL 倒计时**（今天/明天/剩 N 天/逾期）
- ⏱️ 输入任务文本后**上方弹出优先级下拉 + 常用时间快捷选择**（5 分钟～1 周，精确到分钟）
- 🗂️ 自定义分组（侧边栏切换，默认：工作 / 生活 / 学习 / 已完成）
  - 右键分组可**改颜色 / 清空 / 删除**
- ↔️ 分组栏**可拖动调宽**，左下角 ☰ 一键折叠/展开
- ↕️ 排序图标按钮（点击弹出）：自定义(拖拽) / 截止日期 / 优先级 / 完成状态 / 创建时间 / 标题
- 💾 本地 `data.json` 存储，变动即存、启动即载（System.Text.Json）
- 🎨 **8 套内置主题 + 自定义主题**：明亮 / 暗黑 / 极地 / 海洋 / 森林 / 玫瑰 / 透明 / 毛玻璃
- ⚙️ 设置窗口：**开机自启动**开关（标题栏 ☰ → 设置）
- 🪟 **自绘标题栏**（交通灯按钮在右上角）+ 圆角窗口
- 🔔 **常驻桌面**：关闭按钮 = 隐藏到托盘，右键托盘菜单退出，双击托盘恢复

> 详细的优化说明见 [优化记录.md](优化记录.md)。

## 数据文件位置
`%AppData%\MinimalTodoApp\data.json`

## 运行前提：安装 .NET 8 SDK
本机当前只装了 .NET 8 **运行时**，没有 **SDK**，无法编译。先安装 SDK（任选其一）：

```powershell
winget install Microsoft.DotNet.SDK.8
```
或到 https://dotnet.microsoft.com/download/dotnet/8.0 下载 “SDK x64” 安装。

装完新开一个终端，确认：
```powershell
dotnet --list-sdks
```

## 编译与运行
在本项目目录（含 `MinimalTodoApp.csproj`）下：

```powershell
# 还原 NuGet 包（首次需要联网）
dotnet restore

# 直接运行（调试）
dotnet run

# 或编译 Release
dotnet build -c Release
```

## 打包为无依赖单文件 exe（推荐）
直接运行根目录脚本（脚本内**无中文**）：
```powershell
# PowerShell
.\build.ps1
```
或
```bat
:: 命令行
build.bat
```
脚本会发布**自包含单文件**，目标机**无需安装任何 .NET 运行时**。
产物：`MinimalTodoApp\bin\Release\net8.0-windows\win-x64\publish\MinimalTodoApp.exe`（约 63 MB）。

等价命令：
```powershell
dotnet publish MinimalTodoApp\MinimalTodoApp.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true `
  -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
  -p:DebugType=none -p:SatelliteResourceLanguages=en
```

> 若目标机已装 .NET 8 桌面运行时，也可用框架依赖发布得到约 1.7 MB 的小体积单文件：
> `--self-contained false -p:PublishSingleFile=true -p:DebugType=none`

## 依赖（均为轻量库）
- CommunityToolkit.Mvvm —— MVVM 源生成器，零反射
- gong-wpf-dragdrop —— 列表拖拽排序
- H.NotifyIcon.Wpf —— 系统托盘

> 若 `dotnet restore` 报某个包版本不存在，把 `.csproj` 里对应 `Version` 改成
> `dotnet add package <名称>` 提示的最新稳定版即可。
