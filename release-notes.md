## MinimalTodoApp v1.1.2

### English

This release focuses on drag/hierarchy refinements, a calendar time axis, task pinning, and a one-click always-on-top button.

- **Instant collapse arrow after drag** — dragging a task to change its level now immediately refreshes the parent/child relationship, so the collapse arrow appears at once. The arrow was restyled (rounded hover highlight, softer ▾/▸ glyphs). Adding a subtask now auto-expands its parent.
- **0–24h time axis in the calendar** — the Day and Week views now show a 0–24 hour ruler on the left, with tasks positioned vertically by their due time (untimed tasks go into a top "all-day" band). The Month view now shows the `HH:mm` time on each task chip.
- **Pin tasks to top** — right-click a task to pin it. A pinned top-level task keeps its whole family at the very top of the list, regardless of the current sort order.
- **Always-on-top button** — a pin button was added to the left of the ☰ menu button to keep the window in front; the old right-click "always on top" menu was removed.

Download `MinimalTodoApp-v1.1.2-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

本次为体验与功能优化版本：

- **拖动后折叠箭头立即刷新** —— 拖动任务改变层级后立刻刷新父子关系、马上显示折叠箭头；箭头重新美化（圆角悬停高亮 + 更柔和的 ▾/▸）。添加子待办后自动展开父待办。
- **日历 0–24 小时时间轴** —— 天视图与周视图左侧新增 0–24 小时刻度轴，任务按截止时间纵向定位（未定时任务归入顶部"全天"带区）；月视图任务块显示 `HH:mm` 时间，方便看任务在哪个时间段。
- **任务置顶** —— 右键任务即可置顶；顶层任务置顶后，其整族始终排在列表最上方，无论当前排序方式。
- **窗口置顶按钮** —— 在 ☰ 菜单按钮左侧新增置顶图钉按钮，点击让窗口始终在最前；移除旧的右键"置于顶层"菜单。

下载 `MinimalTodoApp-v1.1.2-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。
