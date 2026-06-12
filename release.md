# 版本发布记录(release.md)

> 每次发版在此追加版本号与变更摘要(最新在上)。详细每轮改动见 `优化记录.md`。

---

## v2.0.0(2026-06-12)— 整体重写

技术栈从 C#/WPF + .NET 8 整体重写为 **Tauri v2 + Rust(rusqlite/SQLite WAL)+ React 19 + TypeScript**。
包体 63 MB → 约 10 MB,毫秒级启动,数据即改即存。旧 WPF 版保留在 `legacy/`,首次启动自动迁移旧 data.json。

**功能(完整对齐旧版):**
- 任务:子待办、优先级、截止倒计时、周期提醒、置顶、六种排序、拖拽重排
- 视图:列表 / 四象限 / 标签看板(瀑布流)/ 便签(Markdown)/ 已完成
- 日历:右侧并排弹出面板,日/周/月三视图,国内法定节假日,拖待办设截止;
  打开时窗口右扩、待办不变(对齐旧版 OpenSchedule)
- 外观:23 套主题(玻璃拟态 6 / 浅色 9 / 深色 8),中英双语
- 侧栏:可折叠(图标态),标签为二级折叠项
- 窗口:自绘标题栏、系统托盘、贴边自动隐藏、置顶、开机自启、边缘缩放
- 更新:基于 GitHub Release 的应用内自动更新(便携 exe 换壳重启)

**版本号位置(发版三处同步递增):**
`src-tauri/tauri.conf.json` · `src-tauri/Cargo.toml` · `package.json`

**发布:** 更新本文件与 `release-notes.md` → `.\release.ps1`(构建便携 exe → FileVersion 校验 → tag → GitHub Release 上传)。
