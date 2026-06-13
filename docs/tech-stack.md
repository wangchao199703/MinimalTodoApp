# 技术清单(Tech Stack)

> MinimalTodoApp v2 —— Windows 本地待办,Tauri v2 重写版。
> 版本号取自 `package.json` / `src-tauri/Cargo.toml`。**改了依赖或架构请同步更新本文件。**

## 架构

- **Tauri v2** —— Rust 原生外壳 + 系统 WebView2 渲染前端,便携单 exe(约 10 MB,需系统自带 WebView2)。
- 前后端经 **IPC**(强类型 invoke / command,约定 snake_case + serde 三态补丁更新)通信。
- 前端无路由:Zustand 单一数据源(`src/store/useAppStore.ts`)+ `currentView` 条件渲染。
- 多窗口:主窗口 `main` + 独立设置窗口 `settings`(按窗口 label 路由,跨窗口经 `emit/listen` 事件同步设置)。

## 后端(Rust,edition 2021,MSVC)

| 库 | 版本 | 用途 |
|---|---|---|
| `tauri` | 2 | 外壳(features: protocol-asset / tray-icon / image-png) |
| `tauri-plugin-single-instance` | 2 | 单实例(注册必须最先) |
| `tauri-plugin-autostart` | 2 | 开机自启 |
| `window-vibrancy` | 0.6 | 亚克力 / 玻璃模糊 |
| `rusqlite` | 0.32 (bundled) | SQLite(WAL + synchronous=NORMAL) |
| `serde` / `serde_json` | 1 | 序列化(IPC 三态补丁更新) |
| `uuid` | 1 (v4) | 主键 / 图片文件名 |
| `chrono` | 0.4 | 日期时间 |
| `time`(传递依赖) | **钉 0.3.47** | 0.3.48 与 Rust 1.96 有 E0119 冲突,勿盲目 `cargo update` |

发布编译档:`[profile.release]` = `strip=symbols + lto + codegen-units=1 + opt-level=2`(体积优先);另有 `dev-release` 快速近发布档。

## 前端(React 19 + TypeScript)

| 库 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | 19.2 | UI |
| `typescript` | 5.9 | 严格类型(`tsc -b` 把关) |
| `vite` | 8.0 | 构建 / dev(端口 1420);配 `@vitejs/plugin-react` 6 |
| `tailwindcss` + `@tailwindcss/vite` | 4.3 | 样式(`@theme inline` 把 CSS 变量映射为语义色) |
| `zustand` | 5.0 | 状态(`useAppStore` 单一数据源) |
| `@tiptap/*` | 3.26 | 便签所见即所得 Markdown(starter-kit / markdown / image / task-list / task-item / text-style / pm / core / react) |
| `@atlaskit/pragmatic-drag-and-drop` (+ `-hitbox`) | 1.7 / 1.1 | 任务 / 标签 / 导航拖拽重排 |
| `@formkit/auto-animate` | 0.9 | 列表增删动画 |
| `lucide-react` | 1.16 | 图标 |
| `@tauri-apps/api` | 2.11 | 前端调 IPC / 窗口 / 事件 |
| `@tauri-apps/cli` | 2.11 | tauri 命令(devDep) |

## 数据 / 持久化

- **SQLite** 于 `%AppData%\MinimalTodoApp\todo.db`,版本化迁移用 `PRAGMA user_version`(只向前追加)。
- 表:tasks / groups / notes / note_groups / custom_themes / settings(KV,40+ 标量设置)。
- 资源文件:`note-images`、`group-icons` 目录(经 asset 协议渲染,scope 在 `tauri.conf.json`)。
- 旧 WPF 版同目录 `data.json` 首启一次性自动迁移(`imported_at` 标记防重导)。
- 日期一律 `"YYYY-MM-DD HH:mm"` 文本(date-only 为 `"YYYY-MM-DD"`)。

## 构建 / 发布

- 开发 `npm run tauri dev`;发布 `npx tauri build --no-bundle` → `src-tauri/target/release/minimal-todo.exe`。
- `release.ps1`:构建 → FileVersion 校验 → git tag → **GitHub Release** 上传。
- 自动更新:前端 fetch GitHub `releases/latest` + SemVer 三段比对 + 流式下载换壳重启(不依赖 tauri-plugin-updater)。
- 版本号三处同步递增:`src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` · `package.json`。

## 平台 / 工具链

- 目标 **Windows**(x64);自绘无边框标题栏 + 系统托盘 + 贴边自动隐藏 + 边缘缩放。
- 构建需 **Node ≥ 20** + **Rust stable-msvc**(`cargo` 在 `%USERPROFILE%\.cargo\bin`)。
- 主题:15 套(浅色 5 / 深色 4 / 玻璃 6),CSS 变量 token + `@theme inline` 映射;中英双语。

---

_最后更新:2026-06-13。改动依赖/架构后请同步本文件(见记忆 keep-tech-stack-doc-updated)。_
