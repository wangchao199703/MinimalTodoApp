## MinimalTodoApp v1.2.0

### English

A big feature release: a brand-new **Notes / Inbox** module plus task and grouping upgrades — still a single self-contained exe, no .NET runtime needed.

- **Notes (Inbox)** — a rich-text note editor (bold/italic/underline/strikethrough, headings, bullet & checkable task lists) living in the left sidebar. Notes persist as Markdown.
- **Note groups & drag-and-drop** — organize notes into collapsible groups; drag notes to reorder, move between groups, or back to the inbox root. The inbox and each group fold/expand from the right-click menu.
- **Insert images into notes** — pick an image and it's copied into local storage and embedded inline; it stays with the note across restarts.
- **Text color in notes** — color any selection; notes follow the app's global font/size/line-spacing (one consistent setting, no per-note font controls).
- **Select text → Add to to-do** — right-click selected note text to turn each line into a task.
- **Group management by right-click** — create a group by right-clicking any group (then rename inline); rename existing groups; fold/expand "All to-dos" to hide your groups.
- **Ungrouped to-dos** — create tasks under "All to-dos" that don't belong to any group; drag a task onto "All to-dos" to remove it from its group.
- **Priority color block (optional)** — a setting to hide the checkbox ring color and instead show a soft full-height color bar (red/amber/green) flush along each task card's left edge, rounded to follow the card corners. Off by default, so existing users are unaffected.
- **Modernized dialogs & fixes** — note/group deletion now uses a themed confirm dialog; fixed task text looking blurry on hover.
- Data and settings carry over as-is.

Download `MinimalTodoApp-v1.2.0-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

功能大版本：全新「便签 / 收集箱」模块 + 待办与分组升级 —— 仍是自包含单文件 exe，无需安装 .NET 运行时。

- **便签（收集箱）** —— 左侧栏内置富文本便签编辑器（加粗/斜体/下划线/删除线、标题、无序列表、可勾选任务列表），正文以 Markdown 持久化。
- **便签分组与拖拽** —— 便签可归入可折叠分组；拖动便签重排、跨组移动、或拖回收集箱根；收集箱与各分组均可右键折叠/展开。
- **便签插入图片** —— 选图后复制到本地并内嵌，重启后图片仍随便签保留。
- **便签文字着色** —— 可对选中文字着色；便签字体/字号/行距统一跟随应用全局设置（不再有便签单独的字体设置）。
- **选中文本 → 加入待办** —— 右键便签中选中的文本，可逐行转为待办。
- **分组右键管理** —— 右键任意分组即可「新建分组」（随后内联重命名）；重命名已有分组；折叠/展开「所有待办」以收起分组列表。
- **未分组待办** —— 可在「所有待办」下创建不属于任何分组的待办；把待办拖到「所有待办」即可移出分组。
- **优先级色块（可选）** —— 新增设置：隐藏勾选圈的优先级颜色，改在任务卡片左侧用一条贴边、随卡片圆角收口的淡色竖条（红/橙/绿）区分优先级。默认关闭，存量用户不受影响。
- **弹窗现代化与修复** —— 便签/分组删除改用主题化确认弹窗；修复鼠标悬停时任务文字发虚。
- 数据与设置完全兼容，升级即用。

下载 `MinimalTodoApp-v1.2.0-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。

---

## MinimalTodoApp v1.1.7

### English

A look-and-feel release: modern visuals and fluid, iPhone/Mac-inspired animations throughout the app.

- **Springy animations everywhere** — buttons squish and bounce back when pressed, the check mark pops when you complete a task, and new tasks fade in with a gentle lift. All motion follows one design system (fast, subtle, with a light spring overshoot).
- **Every popup now glides in** — dialogs (Settings, Edit task, Themes…), right-click menus, dropdowns and the date picker open with the same scale-and-fade entrance instead of snapping into place.
- **Silky theme switching** — picking a theme cross-fades the whole window from the old skin to the new one instead of flashing.
- **Livelier calendar** — switching Day/Week/Month or jumping to Today animates the view in; paging back and forth slides the content in the direction you're going.
- **Better drag & drop** — dragging a to-do shows a translucent card that follows your cursor, and the insertion line now uses your theme's accent color so it's easy to see.
- **Modern UI polish** — accent indicator on the selected sidebar group, bolder list header, countdown badges as rounded pills, slimmer scrollbars, hover highlights that fade smoothly on every control, roomier card padding.
- **Better default typography** — new defaults: Microsoft YaHei UI, size 14, line spacing 1.1 (new installs / restore-defaults only).
- **Fixes** — sidebar accent indicator no longer stays lit on the previous group; line-spacing values below 0.8 are no longer clamped back.
- Animations respect Windows' "Show animations" accessibility setting; nothing else changed — your data and settings carry over as-is.

Download `MinimalTodoApp-v1.1.7-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

本次是外观与动效专版：全面现代化的界面 + 参考 iPhone/Mac 的灵动动画。

- **弹簧动效遍布全程** —— 按钮按下轻缩、松开回弹；完成任务时对勾弹跳打勾；新增待办淡入上浮。所有动效遵循统一规范（快速、克制、带轻微弹簧过冲）。
- **所有弹层优雅进场** —— 设置/编辑任务/主题等弹窗、右键菜单、下拉框、日期选择器，都以同款「缩放 + 淡入」进场，不再瞬间弹出。
- **丝滑换肤** —— 切换主题时整窗从旧皮肤交叉淡变到新皮肤，不再闪一下。
- **日历更灵动** —— 切换天/周/月或回「今天」有缩放淡入；前后翻页时内容沿翻页方向弹性滑入。
- **拖拽更好看** —— 拖动待办时有半透明卡片影像跟随光标，插入位置指示线改用主题强调色，一眼可见。
- **界面现代化打磨** —— 侧栏选中分组的强调色指示条、更醒目的列表大标题、倒计时胶囊徽章、更纤细的滚动条、全部控件的悬停渐变高亮、更透气的卡片留白。
- **默认排版优化** —— 新默认：微软雅黑 UI、字号 14、行距 1.1（仅影响新安装与「恢复默认」）。
- **修复** —— 侧栏指示条切换分组后不再残留高亮；行距设到 0.8 以下不再被夹回。
- 所有动画跟随 Windows「显示动画」无障碍设置；数据与设置完全兼容，升级即用。

下载 `MinimalTodoApp-v1.1.7-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。

---

## MinimalTodoApp v1.1.6

### English

This update focuses on the calendar, readability and holidays — eight feedback fixes.

- **Calendar no longer overlaps** — in Day/Week views, tasks at the same time now sit side by side instead of stacking on top of each other; Month cells show tasks as compact chips placed side by side (wrapping as needed).
- **Date picker readable on every theme** — the editor's calendar pop-up now themes its day numbers, today/selected markers and out-of-month days, so they stay clear on dark and colored skins.
- **Drag a task onto the calendar** — drop a to-do on the calendar to set its due time: Day/Week views snap to the hour you drop on, Month view sets it to 18:00. A one-time tip explains this the first time you open the calendar.
- **Gentler backgrounds** — the most vivid light themes (Macaron mint/sakura/lemon, Dunhuang azure/terracotta) are desaturated so they're easier on the eyes over long sessions.
- **Tighter line spacing** — the minimum line spacing now goes down to 0.4 (was 0.8).
- **Better defaults** — default font size 13, line spacing 1.0, checkbox 18 for a more comfortable out-of-the-box look (new installs / restore-defaults only).
- **Chinese public holidays & weekends** — the calendar shows national holidays (with names) and highlights weekends/days-off the same way. Holiday data is fetched online and cached for the current and next year, refreshed at most once a day. Toggle it in Settings; on by default.
- **Support the developer** — the About page now invites you to star the project on GitHub; the button opens the repo.

Download `MinimalTodoApp-v1.1.6-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

本次聚焦日历、可读性与节假日，修复 8 项使用反馈。

- **日历不再重叠** —— 天/周视图中同一时段的任务改为并排显示，不再相互堆叠遮挡；月视图把任务排成紧凑的小色块并排展示（自动换行）。
- **日期选择器全皮肤可读** —— 编辑任务时弹出的日历，日号、今天/选中标记、非本月日期都已适配主题，深色/彩色皮肤下都清晰。
- **拖任务到日历设截止时间** —— 把待办拖到日历即可设置截止时间：天/周视图落到对应的整点，月视图设为当天 18:00。首次打开日历会弹一次提示说明（仅一次）。
- **背景更柔和** —— 把最鲜艳的浅色主题（马卡龙薄荷/樱花/柠檬、敦煌石青/土红）整体降饱和，长时间看更不易疲劳。
- **行距下限放宽** —— 行距最小值从 0.8 降到 0.4，可以更紧凑。
- **默认更舒适** —— 默认字号 13、行距 1.0、勾选框 18（仅影响新安装与「恢复默认」）。
- **国内节假日与周末** —— 日历显示国内法定节假日（标注节日名），并把周末/放假日一起高亮。节假日数据联网获取、缓存当年与次年、每天最多刷新一次。可在设置中开关，默认开启。
- **支持开发者** —— 「关于」页改为邀请你到 GitHub 给项目点个 Star，点击按钮打开仓库。

下载 `MinimalTodoApp-v1.1.6-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。

---

## MinimalTodoApp v1.1.5

### English

This update refreshes v1.1.5 with six feedback fixes on top of the theme overhaul (dedicated theme window, grouped palettes, visual color picker).

- **Show from tray, centered** — when the window is hidden against a screen edge, "Show" from the tray now un-docks and re-centers it instead of leaving it pinned to the edge.
- **Calendar resizing** — with the calendar open, dragging the window edge now shrinks only the calendar; the to-do list keeps its width and is resized only via the middle splitter.
- **Theme favorites** — right-click any theme to add it to the **Favorites** group, shown **first** (above Recent). Favorites can be **drag-reordered** and the order is saved; the group always shows, prompting you to right-click a theme when empty.
- **In-app help refreshed** — the "How to use" guide now covers every feature, including the theme window, favorites, live preview, calendar resizing and auto-update.
- **Custom themes & calendar** — custom themes now derive their calendar/popup accent colors from the colors you edited, so the calendar's today-highlight, hover and secondary text stay in tune with the theme.
- **Custom theme live preview** — editing a color previews instantly across the app (including the calendar). Close without saving and your previous theme is restored; save to keep it.
- **Rounded corners** — audited every popup and menu; all floating surfaces render with rounded corners.

Download `MinimalTodoApp-v1.1.5-win-x64.exe` and just double-click — no .NET runtime required (self-contained single file).

### 简体中文

本次在主题系统大改（独立主题窗口、分组配色、可视化取色器）基础上，刷新 v1.1.5，修复 6 项使用反馈。

- **托盘显示并居中** —— 窗口贴边隐藏时，托盘「显示主界面」会先取消贴边、把窗口居中显示，不再缩在屏幕边缘。
- **日历缩放** —— 打开日历后，拖动窗口边缘只会缩小日历，待办列表宽度保持不变；待办宽度只通过中间的分隔条调整。
- **主题收藏** —— 右键任意主题即可加入「收藏」分组，**置于最前**（在「常用」之上）。收藏内的主题可**拖动排序**且顺序会被保存；分组始终显示，为空时提示右键收藏。
- **使用说明刷新** —— 应用内「使用说明」补全所有功能：独立主题窗口、收藏、实时预览、日历缩放与自动更新。
- **自定义主题与日历** —— 自定义主题的日历/弹窗辅助色改为由你编辑的颜色派生，日历的今日高亮、悬停与次要文字都能与主题协调。
- **自定义主题实时预览** —— 改动颜色会立刻在整个程序（含日历）预览；不保存退出则还原为旧主题，保存才生效。
- **圆角** —— 排查全部弹窗与右键菜单，所有浮层均为圆角显示。

下载 `MinimalTodoApp-v1.1.5-win-x64.exe` 双击即可运行，无需安装 .NET 运行时（自包含单文件）。
