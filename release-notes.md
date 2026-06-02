## MinimalTodoApp v1.1.3

### English

This re-release fixes the single-instance takeover across versions and makes the app live only in the notification tray.

- **Cross-version takeover fix** — when an older copy is already running and you confirm "exit the old version", the old one now actually quits and the new one takes over. The previous logic matched the old process by its *exact* process name, but released EXEs embed the version in their filename (`MinimalTodoApp-vX.Y.Z-win-x64`), so an old `v1.1.2` and a new `v1.1.3` never matched and the old one was never closed. Takeover is now version/filename-independent (graceful named-event signal + PID file + `MinimalTodoApp*` process-name prefix).
- **Tray-only** — the running app no longer shows a taskbar button; it lives only in the notification tray. Minimize now hides to the tray as well; double-click the tray icon to bring it back.

Data stays fully compatible. All previous 1.1.3 content (app icon, group icons, Glass theme, compact parent/child layout, adjustable fonts, etc.) is unchanged.

Download `MinimalTodoApp-v1.1.3-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

本次重新发布修复了「退出旧版本并接管」的跨版本号问题，并让程序运行时只驻留通知栏。

- **跨版本接管修复** —— 当已有旧版本在运行、你确认「退出旧版本」后，旧版本现在会真正退出、新版本接管。此前的逻辑按**完整进程名精确匹配**旧进程，而发布的 EXE 文件名带版本号（`MinimalTodoApp-vX.Y.Z-win-x64`），导致旧版 `v1.1.2` 与新版 `v1.1.3` 进程名不同、永远匹配不到，旧版本始终关不掉。现已改为与版本号/文件名无关的接管方式（命名事件优雅信号 + PID 文件 + `MinimalTodoApp*` 进程名前缀兜底）。
- **仅驻留通知栏** —— 运行时不再出现在任务栏，只在通知栏（系统托盘）显示；最小化也会隐藏到托盘，双击托盘图标即可重新唤出。

数据完全兼容。1.1.3 的其它内容（应用图标、分组图标、毛玻璃主题、紧凑父子布局、可调字体等）保持不变。

下载 `MinimalTodoApp-v1.1.3-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。
