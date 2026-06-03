## MinimalTodoApp v1.1.3

### English

This re-release adds **automatic updates**.

- **Auto update check** — on launch and every hour, the app checks GitHub for a newer version. If one is found, it shows the new version and that release's notes (what's new).
- **One-click update** — click **Update now** to download the new version; the app then exits the current version, moves the old exe to the Recycle Bin, and automatically launches the new one. Run-at-startup is repointed to the new version automatically.
- **Ignore / Skip** — you can **Ignore** an update (you'll be reminded next time) or **Skip this version** (it won't be offered again automatically; a manual check still shows it).
- **Manual check in Settings** — Settings → General has a **Check for updates** button to check on demand.
- **Toggle off** — Settings → General has a **Check for updates automatically** switch; turn it off and the app stops auto-checking.

All older releases (v1.0.0–v1.1.2) have been rebuilt with this feature, so any future download from any release page can auto-update. Data stays fully compatible. Version remains 1.1.3.

Download `MinimalTodoApp-v1.1.3-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

本次重新发布新增了**自动更新**功能。

- **自动检查更新** —— 应用启动时以及每隔一小时，会去 GitHub 检查是否有新版本；若有，会显示新版本号与该版本的更新说明（更新了什么）。
- **一键更新** —— 点击「立即更新」即可下载新版本；随后应用退出当前版本、把旧的 exe 移入回收站，并自动启动新版本；开机自启动也会自动指向新版本。
- **忽略 / 此版本不再提示** —— 可以「忽略」本次更新（下次仍会提示），或选择「此版本不再提示」（自动检查不再提示该版本，手动检查仍会提示）。
- **设置里手动检查** —— 设置 →「常规」新增「检查更新」按钮，可随时手动检查。
- **可关闭自动更新** —— 设置 →「常规」的「自动检查更新」开关，关闭后不再自动检查。

所有旧版本（v1.0.0–v1.1.2）的发布资产也已用含该功能的构建重新发布，今后从任意 Release 页面下载的程序都能自动更新。数据完全兼容，版本号维持 1.1.3。

下载 `MinimalTodoApp-v1.1.3-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。
