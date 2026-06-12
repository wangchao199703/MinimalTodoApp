# MinimalTodoApp

极简 Windows 本地待办应用(Tauri v2 重写版)。便携单 exe 约 10 MB,毫秒级启动,数据全程本地(SQLite)。

## 功能

- 任务:子任务层级、优先级、截止倒计时、周期提醒、置顶、六种排序、拖拽重排
- 视图:列表 / 四象限矩阵 / 标签看板 / 已完成 / 便签(Markdown)
- 日程:右侧月历面板,国内法定节假日标注,拖任务到日期设截止
- 外观:102 套内置主题 + 自定义主题编辑器,中英双语,亚克力透明系
- 窗口:系统托盘、贴边自动隐藏(QQ 式)、窗口置顶、开机自启
- 更新:基于 GitHub Release 的应用内自动更新
- 迁移:首次启动自动导入旧版(WPF)的 data.json 数据

## 开发

```powershell
npm install
npm run tauri dev        # 需要 Node ≥20 与 Rust stable-msvc
```

技术栈:Tauri v2 · Rust + rusqlite(WAL)· React 19 + TypeScript · Zustand v5 · Tailwind CSS v4 · @atlaskit/pragmatic-drag-and-drop · @formkit/auto-animate

旧版 C#/WPF 实现保留于 `legacy/`。
