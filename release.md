# 版本发布记录(release.md)

> 每次发版在此追加版本号与变更摘要(最新在上)。详细每轮改动见 `prompts.md`。

---

## 开发中(v2.0.0 之后,未发版)

自 v2.0.0 起按用户逐轮反馈打磨,累积变更(详见 `prompts.md`):

- **主题**:重做为 **15 套**——浅色 Classic/Grove/Notion/Things/TickTick、深色 Onyx/Dusk/OLED/Linear、玻璃 6 套;**默认主题 Classic(浅色)**;删除旧的杂项主题。
- **标签图标**:支持自定义图片导入(沿用旧版 `group-icons` 目录,旧数据图标复活)。
- **侧栏**:五个内置导航项可自由拖动排序(顺序持久化)。
- **设置改为独立原生窗口**:可拖到主窗口外/任意屏幕位置、可缩放;与主窗口主题/字体/语言/各开关**实时双向同步**。
- **对话框**:标题栏可按住拖动移位(7 个对话框共用 Modal)。
- **字体设置修复**:全局字号改为缩放根 rem(整 UI 等比),便签字号/字体/行距经 CSS 变量精确生效;便签「字号·行距继承全局」改为独立开关。
- **恢复默认设置**:设置→通用 一键将所有设置恢复默认(保留语言)。
- **侧栏彩色化**:主侧栏内置项 + 便签分组支持上色;图标默认无色,**右键→修改颜色**自定义(通用 `ColorDialog`,与标签同款),持久化在 settings。
- **标签简化**:删除标签第二侧边栏,「标签」入口点击直接进**全宽标签看板**(保留任务-标签数据);标签默认色清空(迁移 v2/v3),统一为无色基线 + 右键自定义。
- **标签第二侧边栏恢复 + 拖待办到分组(v2.0.0)**:撤销上面的「标签简化」,改回原来的第二侧边栏。恢复 `src/components/TagSidebar.tsx`(参照被删版与便签第二侧栏布局):点「标签」进 `tagboard` 视图即展开第二侧栏——顶部「标签看板」入口(全宽看板)+ 各标签(分组)列表;点某标签进 `view.kind==="group"` 该标签任务视图,可右键改名/改色/改图标/删除、拖动重排、调宽/收起(状态持久化 `tags_sidebar_width`/`tags_sidebar_collapsed`)。`App.tsx` 给 `tagboard` 与 `group` 两个视图都套「第二侧栏 + 内容」布局;`Sidebar.tsx` 标签主入口在 group 视图也保持选中态。**新增:拖待办到标签上归类**——每个标签行/折叠图标经 `dropTargetForElements` 注册为放置目标(数据 `{type:"task-tag",groupId}`),TagSidebar 自有 monitor 把 `source.type==="task"` 的落下 → `patchTask({group_id})`;与任务列表内部排序(TaskList 的 `task→task` monitor + `moveTask`)靠数据 type 区分共存(落到 `task-tag` 目标时 `moveTask` 因 target 非 task 自然 no-op)。复用既有 i18n 键、未碰 `dragDropEnabled`、未升版本。`npm run build` 通过。
- **侧栏统一打磨**:一/二侧栏图标统一 14 号、位置对齐;折叠按钮统一置底;折叠态图标默认清晰(不再 hover 才显色);待办圆圈左内距缩短约 50%。
- **窗口放大透出桌面 + 托盘恢复手段**(v2.0.0):托盘「显示主界面」改为「显示并居中」(`Show & center`);`show_main` 增强为「显示 → 居中 → 强制 WebView2 重绘」,既是托盘动作也是一键修复手段。根因是主窗口 `transparent:true`,Windows + WebView2 放大 resize 时新暴露区域不重绘而透出桌面壁纸;修复办法是微调一次内层尺寸(`set_size(w+1,h)` 再还原)触发整窗重绘。居中走贴边自动隐藏的「忽略自身移动」标志(`DockState.moving`,经 `app.manage(Arc<DockState>)` 托管供 `show_main` 复用),避免居中被误判为用户拖动而收边。未做 resize 结束自动重绘(C):`Resized` 无类似 `moving` 守卫,防抖 + 防 `set_size` 反馈环复杂且有 jank 风险,「显示并居中」恢复手段已覆盖。
- **窗口 resize/最大化重绘改自动 + 修复贴边隐藏回归**(v2.0.0):
  - **贴边自动隐藏回归修复**:上轮(`f90f46d`)给 `show_main` 加的「微调内层尺寸 `set_size(w+1,h)` 强制重绘」是一处**无 `moving` 守卫的尺寸变更**,会触发 `Resized`/`Moved` 干扰贴边轮询(尤其托盘「显示并居中」时),导致拖到边缘不再自动隐藏。**移除该 `set_size` 重绘 nudge**,贴边逻辑不再被自身的尺寸抖动误扰;「显示并居中」仍照常(显示→`moving` 守卫下居中→清贴边态)。
  - **resize/最大化后自动重绘改前端**:透明窗口透出桌面的重绘,从 Rust 的一次性 `set_size` 改为前端 `App.tsx` 监听 `getCurrentWindow().onResized()`(resize 拖边、最大化、还原都会触发)→ 防抖 120ms → 纯 DOM 重绘(根节点瞬时 `transform: translateZ(0)` + 强制 reflow + rAF 撤回)。**对 OS 窗口尺寸零副作用**:既不会像 `set_size` 那样在最大化时取消最大化,也不会和贴边的 `Moved/Resized` 互扰,且天然带防反馈环(纯 DOM 不触发 `Resized`)。`cargo check`、`npm run build` 通过,未升版本(2.0.0)。
- **便签折叠态镜像树**:第二侧栏收起为图标列时按分组呈现——展开分组铺开便签图标,折叠分组只显示一个分组图标(点击展开)。
- **工作流约定**:`CLAUDE.md` 新增「每轮改动工作流」(1–5)+「工作风格」(6–9)——提示词记 `prompts.md`(原 `优化记录.md`,已 `git mv`)、改动记 `release.md`、未授权不升版本号、做完即本地 commit 不 push、写 `handoff.md`、做完 run 起来验证;并约定追根因不打补丁、路径非最短直说、输出说重点。
- **后端测试套件(首次)**:`commands.rs` 每个命令体抽成可测的 `*_impl(conn, …)` 核心函数(命令壳只加锁转调,逻辑/SQL 未改);新增 `#[cfg(test)]` 覆盖标签/任务/便签/便签分组/自定义主题/设置的 CRUD、迁移幂等与建表、三态补丁(due/group/parent)、四象限覆盖清零、父删级联子、收集箱自愈、设置重置保留 language/imported_at,以及纯函数(safe_file_name/safe_ext/is_supported_image)。`database.rs` 加 DB 层测试。无功能行为改动。
- **旧数据迁移测试**:`import.rs` 抽出纯逻辑 `import_into(conn, &old)`,新增测试覆盖 ISO 日期转换、Nil/空 GUID 过滤、内置视图分组跳过与 order 压实、优先级 0→Medium、GroupId 回退 OriginalGroupId、悬空 parent 丢弃、sort 索引→模式名、selected_group_id→视图映射、便签导入、标量布尔与 imported_at。**`cargo test` 累计 36 项全过**。无功能行为改动。
- **功能审计**:对照 legacy WPF 全面核对,确认任务/便签/提醒/四象限/置顶/缩进/日历/排序/导入导出已达功能对齐;唯一明显缺口为**主题管理(自定义主题编辑器 + 主题收藏)**——属近期刻意精简范围,留待确认,未实现。
- **新建待办交互对齐 WPF**:① 截止快捷项补「2周 / 4周」;② 周期提醒快捷项对齐 WPF 的 12 档;③ 新建输入栏新增**标签选择器**(可直接把新任务建进某标签);④ 新增**父级选择器**(直接建为子待办,标签跟随父、缩进+1)。`addTask` 扩展支持 `group_id`/`parent_id`。
- **界面版式(换肤)**:设置→通用→「界面版式」可选 **经典 / 苹果(Things)/ 极客(Linear)/ 可爱(Waterdrop)** 4 套,统一 DOM + CSS 变量换肤,只改布局质感、不动配色,覆盖列表/四象限/标签看板;新增标签 `#` 后缀、优先级圆点/信号图标等可换肤元素。持久化 `design`、跨窗口实时同步,默认「经典」(老用户观感不变)。
- **多级子任务设计(新版式)**:父任务**半满态复选框** + **子任务进度条** + **克制缩进 12px/级** + **树状引导线** + **折叠箭头统一右边缘悬浮显现**(勾选框靠左);经典保持现状。
- **界面版式增至 7 套**:在原 经典/苹果/极客/可爱 之外新增 **文档(Notion)/ 流体(Fluent 毛玻璃)/ 粗野(Neo-Brutalism)**,各有独立的卡片质感、勾选框、半满态、进度条与引导线;设置→通用→界面版式 切换。
- **优先级展示改为独立设置**(与版式正交):设置→通用→「优先级展示」可选 **复选框环着色 / 左侧竖线 / 信号强度 / 圆点着色 / 无**;基线勾选框环色中性,优先级表达按设置叠加。默认复选框环着色。
- **勾选框自定义 → 自定义版式**:设置→外观→「勾选框」可调 形状(圆环/方框)/大小/粗细;在某内置版式上改任意一项即**派生一个「自定义版式」**(记录基于哪套),不污染内置版式;版式网格列出内置 + 自定义(可删)。勾选框设置只对该自定义版式生效,非全局。「跟随版式」置灰时显示该版式真实值。
- **设置新增「外观」分组**:界面版式 / 勾选框 / 优先级展示 / 字体 从「通用」移入新分组「外观」(排在通用下面);通用只留 自启 / 节假日 / 恢复默认。
- **版式精简 + 默认调整**:移除「经典」版式(剩 极客/苹果/可爱/文档/流体/粗野 6 套);默认版式改为**极客**、默认优先级展示改为**圆点着色**;老用户旧值自动归一。
- **新增「清晰透明」版式**:纯净白玻 / 微色调 / 双层面板——高覆盖玻璃 + 纯色文字 + 收敛优先级(强调可读性,不发光不渐变),共 9 套版式。
- **父子任务完成逻辑对齐 WPF**:单独完成的子任务(父未完成)**原地保留划线、不消失、只放烟花不滑出**;某父的子任务全部完成才自动完成父、整族归入已完成;按「根任务是否完成」划分未完成/已完成视图。
- **子任务进度显示可选**:除「数字 1/2」「直线进度条」外新增「**圆环**」——直接把**父任务勾选框按完成比例饼形填充**;在 设置→外观→「进度」按版式自定义(改了即派生自定义版式,非全局)。
- **子待办层级等比缩小**:子待办越深,勾选框/标题字号/行距越小(`--ds` 缩放因子,封顶第 3 层);各版式勾选框尺寸统一经 `--cb-base` 解析,自定义尺寸/层级缩放叠加。
- **修复·从已完成还原**:取消勾选(还原)父任务时,后代子任务同步取消勾选(整族完成→整族还原),不再残留勾选态。
- **修复·已完成视图折叠**:已完成视图改走 `sortTree` 构树,父任务展开/折叠子任务恢复有效。
- **修复·拖拽排序全失效**:Tauri 窗口加 `dragDropEnabled:false`——此前 WebView2 的 OS 级拖放吞掉页面内 HTML5 DnD,导致待办/标签/便签/侧栏全部无法拖动排序;关掉后恢复。
- **父子任务窄窗排版(微缩进+视觉降级)**:子任务改为轻微缩小(每层 6%,封顶 2 层)+ **字重/颜色降级**(标题降为常规字重、未完成变浅)+ **阶梯对齐缩进**(子复选框对齐父文字开头,各版式按自身复选框+间距,`--indent-step`)+ 引导线落在缩进通道——主要靠层次而非尺寸区分父子,适配窄窗。
- **标题换行 + 复选框对齐首行**:待办标题由单行省略(`truncate`)改为**换行完整显示**(`break-words`),长任务不再被截断;配套把全部 9 套版式统一**顶对齐**、复选框对齐标题第一行(消除居中版式换行后复选框跑中间的问题),对齐窄窗排版文档。
- **拖拽支持改父级(子待办)**:把待办拖到两条之间,**层级自动变为下面那条一致**(可拖入/拖出某父级);被拖任务连带整棵子树移动、子孙层级同步。新增 `moveTask`,取代原纯重排逻辑。
- **提示音风格(4 套成对)**:完成音/周期提醒音改为可选风格,WebAudio 合成、零依赖。新增设置 `sound_style`(`minimal`|`game`|`zen`|`cute`,默认 `minimal` 贴近原完成音观感),完成音与提醒音跟随**同一风格**(音色家族一致)。① **极简现代**:完成=玻璃叮一声(triangle+低通)、提醒=两次轻柔合成器滴答;② **奖励游戏化**:完成=明亮铃铛上扬叮(复用 bell)、提醒=3 音上扬电子旋律;③ **自然禅意**:完成=水滴气泡+钵尾韵、提醒=颂钵长尾缓慢渐弱(~2.3s);④ **俏皮可爱**:完成=气泡破裂上扬两连泡、提醒=马林巴跳跃两音。提醒音统一柔和起音 + 低通压高频防刺耳、留渐弱尾音。`effects.ts` 新增 `playComplete(style)`/`playReminder(style)` 与 `tone/bowl/drop` 合成原语;`TaskItem.tsx`(完成)、`App.tsx`(提醒)按 `sound_style` 分发,保留 `sound_enabled`/`reminder_sound_enabled` 两开关。设置→待办新增「提示音风格」选择,每套带「完成/提醒」两个试听按钮。i18n 双语同步。
- **完成音/提醒音独立选择**:把上面的「单一风格驱动两者」拆成**两个独立设置** `complete_sound_style` / `reminder_sound_style`,完成音与周期提醒音各 4 套任选、自由组合;设置区改为两个独立选择器(各带试听),读取各自键(回退旧 `sound_style` 兼容)。默认:**完成音=俏皮可爱、周期提醒音=奖励游戏化、完成音效默认开启**。
- **便签支持拖入 .md 导入**:从资源管理器把一个/多个 `.md`/`.markdown` 拖进便签区 → 自动建便签(标题=文件名去扩展名,正文=Markdown 文本)并打开(多份打开最后一条);拖到某分组上则归类到该分组,拖到空白处落默认分组。**纯网页 File API 实现**(容器与各分组头 `onDragOver`(preventDefault)+`onDrop`,`dataTransfer.types` 含 `Files` 才拦截,`file.text()` 读内容,不依赖文件路径),与内部排序拖拽互不干扰;**未改 `dragDropEnabled:false`**(保护排序功能)。新增 store action `importNotesFromFiles`、`markdownIO.ts` 的 `readMarkdownDrop/isMarkdownFile/stripMdExt`、i18n 键 `S.X.DropMdToImport`(双语)。拖悬停时便签区/目标分组高亮。**注:WebView2 在 `dragDropEnabled:false` 下是否派发外部文件 drop 需运行时验证;若不派发则需另议方案(但不得开 OS 拖放)。**
- **全界面拖入 .md → 「导入」分组兜底**:不再限于便签界面——在**任意视图**(任务/四象限/标签看板等)拖入 `.md` → 自动归入名为「导入/Import」的便签分组(没有则按当前语言创建),并切到便签视图打开。`App.tsx` 根容器挂全局 file-drop(仅 `Files` 类型才拦截,不碰内部排序拖拽);便签视图内的拖入仍走原逻辑(默认/指定分组)并 `stopPropagation` 防二次导入。新增 store `importNotesToImportGroup`。
- **重新安装/修复当前版本(对齐 WPF)**:此前自动更新只检测「更高版本」,缺 WPF 的「重新安装当前版本」(修复损坏/卡顿)。设置→关于,自动更新开关下新增「重新安装当前版本」按钮 → 按当前版本 tag(`v<当前版本>`)拉取 `releases/tags/<tag>` 同一 Release 的便携 exe,**复用既有下载+换壳重启链路**(`downloadAndApply` → 原始 IPC `apply_update` → bat 等旧进程退出后带 `--updated-from` 启动同版本、新版回收旧 exe),Rust 侧零改动。`updater.ts` 新增 `fetchReinstallInfo()`(抽出共享 `pickExeAsset`/`GithubRelease`/`REPO_SLUG`),返回 `UpdateInfo{reinstall:true}`;`UpdateDialog` 加 reinstall 模式(标题 `S.Update.Reinstall`、隐藏「跳过此版本」、按钮改「重新安装/关闭」)。i18n 键(`S.Settings.Reinstall*`/`S.Update.Reinstall`/`S.Update.Close`)双语此前已就位,无新增。**真正重装需有对应版本的真实 GitHub Release,dev 环境无法完整走到换壳重启,需打包后实测。**
- **新建后弹快捷设置(对齐 WPF)**:新建一条待办后,锚定底部输入栏弹出 `Popover`(复用 `ui/Popover`),可直接改这条任务的**优先级**(高/中/低段控,调 `setPriority`)/ **截止时间**(复用 `DuePicker`,调 `setDue`)/ **周期提醒**(复用 `ReminderPicker`,调 `patchTask` 显式启用/清除)。`addTask` 改为返回创建的 `Task`(`Promise<void>`→`Promise<Task|undefined>`),弹层只存其 id、实时从 `tasks` 取最新值。**非阻塞**:输入框保持焦点可继续连续新建,ESC / 点外部 / 「完成」均关闭。**可选/可跳过**:新增持久化设置 `quick_add_popup`(**默认关闭**,不改老用户行为),设置→待办 加开关;关闭时新建行为与原完全一致。i18n 双语同步(`S.X.QuickSetTitle`/`QuickSetDone`/`QuickAddPopup`/`QuickAddPopupDesc`)。`npm run build` 通过,未升版本(2.0.0)。

- **默认版式改「经典」+ 自启默认开 + 关闭/最小化到通知栏**:① 默认界面版式由极客改为**经典(apple)**,首启即经典、用户改后跟随;② **开机自启默认开启**,每次启动(重新)注册指向当前 exe(升级换新 exe 后自动更新关联),新增 `autostart_disabled` 记录用户手动关闭(关过就不再自动开),恢复默认=开;③ 标题栏**最小化/关闭按钮都改为隐藏到托盘**(`win.hide()`)——隐藏后不在任务栏、只在通知栏,双击托盘唤回(退出走托盘右键)。

> 以上未递增版本号(仍 2.0.0)。v2.0.0 发版准备:已写 `release-notes.md`;`release.ps1` 构建产物就绪,发布卡在 GitHub 鉴权(需 `GH_TOKEN`)。

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

## v2.0.0 — 周期提醒支持系统通知(最小化也能弹)

**问题:** 周期提醒原先只在 `useReminderLoop` 调 `pushToast` 弹 app 内 toast,窗口最小化/隐藏/失焦时看不见(对齐旧版 WPF 的托盘气泡能力缺失)。

**改动:**
- Rust:`src-tauri/Cargo.toml` 加 `tauri-plugin-notification = "2"`;`src-tauri/src/lib.rs` 在 autostart 插件之后追加 `.plugin(tauri_plugin_notification::init())`(单实例插件仍最先注册,顺序未动);`src-tauri/capabilities/default.json` 加 `notification:default` 权限。
- 前端:新增 `src/lib/notify.ts`(`notifyReminder`),`src/App.tsx` 的 `useReminderLoop` 触发处在 `pushToast` 之外调 `void notifyReminder(...)`;`package.json` 加 `@tauri-apps/plugin-notification`。
- **按窗口可见性区分**:仅当窗口 `!isVisible() || isMinimized()`(app 内 toast 看不见)时才发 OS 通知,可见时只保留 toast 避免重复打扰;窗口状态获取失败时保守发(保证「最小化必弹」不漏)。
- 通知标题 = `S.Fmt.ReminderToastTitle`(「待办:{title}」),正文对齐旧版气泡(`S.Fmt.ReminderMsgWithDue` 带截止 / `S.Fmt.ReminderMsg` + 间隔 `IntervalHours`/`IntervalMinutes`)。首次发通知前按需请求权限(权限结果缓存,避免每次 IPC)。失败静默,不影响提醒主流程。
- 验证:`npm run build` 通过,`cargo check --manifest-path src-tauri/Cargo.toml` 通过(`tauri-plugin-notification v2.3.3` 编入)。版本号保持 2.0.0。

## v2.0.0 — 侧栏新增剪贴板(搬迁 ShellPicker)

- **后台剪贴板监听(默认开启)**:新增 `src-tauri/src/clipboard.rs`,用 `clipboard-rs` 在独立线程跑阻塞式 watcher(主线程不阻塞),系统剪贴板一变化即入库——文本直接存,图片存 PNG 到 `%AppData%\MinimalTodoApp\clipboard-images\` + 库存绝对路径 + 内嵌 base64 缩略图;按「与上一条 hash 相同则跳过」去重;emit `clip-added` 让前端实时插入。移植自 ShellPicker `clipboard.rs`,逻辑/去重一致。
- **存储**:`database.rs` 迁移 **v4** 新增 `clips`(自增整型主键,append-only)、`clip_tags_def`(剪贴板标签,独立于待办标签)、`clip_tags`(关联)三表;图片目录经新增的 `clipboard_images_dir()` 从 `data_dir()` 推导(集中出口,为后续「数据位置可配置」预留)。`tauri.conf.json` asset 作用域加 `clipboard-images/**`。
- **剪贴板视图 + 第二侧栏**:新增 `view.kind==="clipboard"` 与 `ClipboardView.tsx`——第二侧栏(剪切板标签:全部入口 + 各标签,可点选过滤、双击改名、右键改色/删,可拖宽/收起,复用便签/标签第二侧栏版式)+ 剪贴项列表(文本/图片缩略图 + 标签点 + 置顶/删除 + 右键菜单)。
- **右键加入待办 / 便签**:剪贴项右键「加入待办」用文本建待办并打「剪切板」待办标签(分组没有则 find-or-create,兼容中英);「加入便签」把内容建成便签放「剪切板」便签分组(没有则 find-or-create);图片项加入便签时正文用 Markdown 图片引用 asset 路径。
- **侧栏入口 + 重排**:`Sidebar.tsx` 加「剪切板」导航项;默认顺序改为 所有待办 / 已完成 / 标签 / 四象限 / 剪切板 / 便签。导航项仍可拖动排序且持久化;老用户已有顺序里没有「剪切板」时,按默认顺序的相对位置「补位」插入(落在四象限后、便签前),不丢失既有排序。
- **依赖**:`Cargo.toml` 加 `clipboard-rs=0.3.4`、`sha2`、`base64`、`image(png)`、`anyhow`;`time` 仍钉 0.3.47,无 E0119 冲突。
- 验证:`npm run build`(tsc 严格)+ `cargo check` + `cargo test --lib`(39 passed,含 4 个新测试)全过。版本保持 2.0.0。

## v2.0.0 — 设置·通用新增「数据存储位置」(数据整体迁移)

- **可配置数据根**:`database.rs` 的 `data_dir()` 改为优先读「数据位置指针」、否则用默认目录(原默认实现拆为 `default_data_dir()`)。todo.db / note-images / group-icons / clipboard-images 全从这一个根推导,所以换位置后待办、便签、标签图标、剪贴板文本与图片整体跟着走。
- **指针固定位置**:新增 `src-tauri/src/storage.rs`,自定义路径写在 `%LOCALAPPDATA%\MinimalTodoApp\datapath`(不随数据迁移的本机级位置;绝不存进 todo.db,否则库搬走后读不到 → 引导死锁)。指针读取在打开库之前生效。
- **安全迁移**`migrate_data_dir` 命令:复制前 WAL checkpoint;`storage::migrate_data_root` 做 校验可写+冲突检测 → 复制(库文件含 WAL/SHM + 三图片目录)→ 校验(文件数/字节一致 + 关键文件存在)→ 写指针 → 标记旧根待清理。**copy→verify→delete**,任一步失败回滚新根、旧数据原封不动。迁移成功后改写新库里 clips.image_path 的旧根→新根前缀(剪贴板图片预览依赖绝对路径)。
- **旧根清理 + 重启**:旧库不在运行时删(Windows 文件锁),下次启动 `cleanup_pending_old_root()`(db 打开前、带安全闸)删除旧库与图片目录。迁移完成需重启,新增 `restart_app` 命令(复用换壳 bat),UI 弹「立即重启」。
- **依赖/权限**:新增 `tauri-plugin-dialog`(Cargo + npm)+ `dialog:allow-open` 权限(原生文件夹选择)。
- **UI**:`SettingsPanel.tsx` 通用段新增「数据存储位置」(当前目录 + 选择新位置 → 确认 → 迁移 → 重启提示),i18n 双语。
- 验证:`npm run build` + `cargo check`(time 仍 0.3.47)全过。版本保持 2.0.0。

## v2.0.0 — 修复:剪贴板监听图片失败(延迟渲染竞态)

- **现象**:后台剪贴板监听文本正常、图片失败——复制图片后列表不出现该项。
- **根因**:Windows 剪贴板「延迟渲染」。变化事件(WM_CLIPBOARDUPDATE)常在图片格式(CF_DIB/CF_PNG,尤其从 CF_BITMAP 合成的 DIB)真正落到剪贴板**之前**就触发;此刻 `has(ContentFormat::Image)`/`get_image` 读到无图,代码遂落入 text 分支把图片当文本吞掉。文本(CF_UNICODETEXT)同步渲染故不受影响。逐行对照 ShellPicker 可用版,`handle`/`handle_image` 的调用序列与依赖版本(clipboard-rs 0.3.4 / image 0.25.10)完全一致,确认非移植丢行,而是该竞态暴露差异。
- **修复(只动 `src-tauri/src/clipboard.rs`)**:新增 `image_ready()` 短时轮询(最多 5 次、每轮退避 50ms,约 250ms 上限),以「`has(Image)` 且 `get_image()` 确能取到图」为最终判据;到位才走图片分支,否则才回退文本。不打补丁、不改前端、不动 commands/database/lib。
- 验证:`cargo check`(冷 target)通过。版本保持 2.0.0。
## v2.0.0 — 剪贴板视图 5 项打磨(右键编辑/复制 · 拖拽打标签 · 标签过滤 · 单标签 · 搜索)

- **右键「复制」**:剪贴项右键菜单加「复制」,把内容写回系统剪贴板。文本→写文本,图片→读原图文件写图片。新增后端命令 `copy_clip`(commands.rs,复用 clipboard.rs 已引入的 `clipboard-rs`,**未碰 clipboard.rs**)。写回会被后台监听当作新复制再入库置顶(同 ShellPicker「粘贴即置顶」)。
- **右键「编辑」= 独立 OS 窗口(便签式 Markdown)**:文本项右键「编辑」→ 打开独立原生窗口(label=`clip-editor`)。左编辑右预览(切换),`renderMarkdown` 预览,**手动点保存才落库**。未保存关闭弹「保存 / 不保存 / 取消」三选(`onCloseRequested` 拦截 + `destroy` 绕过二次拦截)。
  - 建窗命令 `open_clip_editor_window(clip_id)` 为 **async**(主线程消息循环建 webview,否则死锁);待编辑 id 经后端 `ClipEditorTarget(Mutex<Option<i64>>)` 暂存(不走 URL query,query 不作为路由会白屏),窗口挂载后 `take_clip_editor_target` 取走;窗口复用经 `clip-editor-target` 事件切换。保存经 `clip-updated` 事件同步回主窗口列表。
  - 前端按 `getCurrentWindow().label` 路由(main.tsx 新增 `clip-editor` 分支 → `ClipEditorWindow.tsx`);capabilities `windows` 加 `clip-editor`,补 `core:window:allow-destroy`。
- **拖拽打标签**(task2):`ClipRow` 注册拖源(type=`clip-item`,带 clipId);`ClipTagRow` 与收起态标签按钮各自注册 dropTarget(`canDrop` 只认 `clip-item`,落下即 `setClipItemTag`)。这些元素原本无 dropTarget,不存在「同元素重复注册」问题。
- **单标签语义**(task4):新增后端 `set_clip_item_tag(clip_id, tag_id)`——先清该剪贴项全部关联再(可选)写一个,`tag_id<=0`=清空,保证 `tag_ids` 至多 1 个。菜单(替换原标签 + 「无标签」清空项)与拖拽两条路径都走它。前端 store `toggleClipItemTag` → `setClipItemTag` 单选语义。
- **标签过滤**(task3):根因核查——`main` 上菜单路径的过滤本就正确(`clipFilterTagId` 与 `tag_ids` 均为 number、`includes` 比较对齐、toggle 乐观更新本地)。本轮统一为单标签后,过滤改为 `clipFilterTagId!=null && !c.tag_ids.includes(...)` 与单标签一致,打标签(菜单/拖拽)后点该标签必能筛出。
- **搜索**(task5):`ClipboardView` 右侧顶部加搜索框(参照 ShellPicker),按 `clip.text` 前端过滤已加载列表(标签筛选 + 文本搜索叠加),带清除按钮。
- 新增/改动文件:`commands.rs`(set_clip_item_tag/update_clip_text/copy_clip + 单元测试)、`window.rs`(ClipEditorTarget + open_clip_editor_window/take_clip_editor_target)、`lib.rs`(注册命令 + manage 状态)、`capabilities/default.json`、`ClipEditorWindow.tsx`(新)、`ClipboardView.tsx`、`main.tsx`、`useAppStore.ts`、`tauri-ipc.ts`、`i18n.ts`(双语新键)。**未碰 clipboard.rs**。
- 验证:`npm run build`(tsc 严格)+ `cargo check` + `cargo test --lib`(40 passed,含 1 个新单标签测试)全过;`time` 仍 0.3.47。版本保持 2.0.0。

## v2.0.0 — 修复:「重新安装当前版本」点击后无进度(资产下载被 CORS 拦)

- **现象**:设置→关于→「重新安装」,点击后无任何进度/反馈。
- **根因**:资产下载用的是前端 `fetch(assetUrl)`。GitHub 资产直链 302 跳到 CDN `release-assets.githubusercontent.com`,该域**不返回 CORS 头**(实测:`api.github.com` 有 `ACAO:*`、资产 CDN 无),WebView2 按同源策略直接拦截 → 下载瞬间抛错。检查接口(api.github.com)能跨域所以对话框照常打开,但点「重新安装」后下载即死;又因设置在独立窗口、该窗口没有 `<Toasts/>` 宿主,失败 Toast 也不可见 → 表现为「点击后无进度」。同一路径的常规自动更新下载其实也一并坏掉。原 `updater.rs` 注释里「资产下载允许跨域」的假设是错的。
- **修复(追根因)**:把资产下载移到 Rust(不受 CORS 约束)。
  - `src-tauri/src/updater.rs`:新增 async 命令 `download_update(url, file_name)`,`spawn_blocking` 里用 `reqwest::blocking` 流式下载(64KB/块),边下边 `emit("update-progress", 0~1)`(每涨 1% 上报),完成后落盘 + 换壳重启。把原「写盘+bat 重启+退出」抽成 `swap_and_restart` helper,`apply_update`(旧前端传字节入口,保留兼容)与新命令共用。
  - 依赖:`Cargo.toml` 加 `reqwest 0.12`(`default-features=false` + `blocking` + `native-tls`)。native-tls=Windows SChannel,免装 OpenSSL/NASM,构建链路最稳;`time` 仍 0.3.47 未受影响。
  - 前端 `src/lib/updater.ts`:`downloadAndApply` 改为 `listen("update-progress")` + `invoke("download_update",{url,fileName})`,删掉前端 fetch/reader 与 `apply_update` 原始字节调用。
  - `src/components/dialogs/UpdateDialog.tsx`:下载失败时在对话框内**内联**显示错误(设置窗口无 Toast 宿主,必须就地可见),不再只靠 Toast。
- 验证:`npm run build`(tsc 严格)+ `cargo check`(reqwest 0.12.28 经 schannel 编译通过、`time` 仍 0.3.47)全过。版本保持 2.0.0。

## v2.0.0 — 修复:重新安装点击后无弹窗/进度(抄 WPF 更新逻辑)

- **现象**:点「重新安装」既不弹对话框也无进度。
- **根因**(两层):
  1. **GitHub 匿名 API 限流**:`fetchReinstallInfo` 要先调 `api.github.com/.../releases/tags/v{ver}` 拿资产。匿名接口 60 次/小时/IP,反复测试(启动即自动检查 + 多次手动)把配额打空 → 返回 **403** → 抛错 → 不弹对话框。
  2. **设置独立窗口无 `<Toasts/>` 宿主**:失败 Toast(「检查更新失败,请稍后再试」)根本不显示 → 按钮像死的。对照 WPF:手动检查会**明确提示**「检查失败」,本应用却把反馈吞了。
- **修复(抄 WPF「服务端拉取 + 明确反馈」)**:
  - **重装直接拼直链、不调 API**(`src/lib/updater.ts` `fetchReinstallInfo`):资产名/地址由 release.ps1 命名约定完全确定(tag=`v{ver}`、`MinimalTodoApp-v{ver}-win-x64.exe`),直接构造 `github.com/{repo}/releases/download/{tag}/{asset}`。既不耗 API 配额、也能在限流时照常重装;资产真不存在则 Rust 下载报 HTTP 404、对话框内可见。重装无需 Release notes 故不再解析。
  - **设置窗口挂 `<Toasts/>` 宿主**(`SettingsWindow.tsx`):检查更新/数据迁移等所有 `pushToast` 反馈就地可见(此前数据迁移提示也一并不可见,本次一并修)。
  - **重装按钮旁内联状态**(`SettingsPanel.tsx`):「检查中…」/「检查更新失败,请稍后再试」持久显示(Toast 会自动消失,对齐 WPF 手动检查的明确持久反馈)。
  - 下载仍走上一轮的 Rust `download_update`(reqwest,绕开资产 CDN 的 CORS),与 WPF 的服务端 HttpClient 下载同理。
- 验证:`npm run build`(tsc 严格)+ dev-release 构建通过;桌面验证 exe 已生成。版本保持 2.0.0。

## v2.0.0 — 检查更新:加设置内入口 + 三态明确反馈 + 启动检查节流(对齐 WPF)

- **背景/答疑**:原「检查更新」只在标题栏 ☰ 菜单(主窗口),结果靠 Toast(已是最新/失败),有新版才弹对话框;设置里没有入口。且 `checkForUpdate` 把「已是最新」与「检查失败」都collapse成 `null`,反馈不精确(限流时可能被当成"已是最新")。
- **改动(抄 WPF SettingsDialog 的 StatusText 范式)**:
  - **`checkForUpdate` 改三态契约**(对齐 WPF `CheckAsync`):返回 `UpdateInfo`=有新版;`null`=确实已是最新(或无资产/被忽略);**抛异常**=检查未成功(网络/HTTP 非 2xx 如 403 限流)。不再自吞 Toast,交调用方反馈。
  - **设置「关于」新增「检查更新」行**(`SettingsPanel.tsx`):按钮 + 持久状态行(检查中… / 已是最新 / 检查失败),有新版弹 `UpdateDialog`。复用既有 `S.Settings.CheckUpdate(Desc)` i18n 键(原已定义未用)。
  - **标题栏菜单「检查更新」**(`TitleBar.tsx`):三态各给明确 Toast(有新版弹框 / 已是最新 / 检查失败),失败不再被误报成已是最新。
  - **启动检查节流**(`App.tsx`):上次自动检查不足 1 小时则跳过本次启动检查(localStorage 记时间戳),避免频繁重启白耗 GitHub 匿名接口 60 次/小时配额;长时运行仍由 12 小时定时覆盖;后台检查失败一律静默。
- 验证:`npm run build`(tsc 严格)通过。版本保持 2.0.0。

## v2.0.0 — 修复:更新/重装下载卡 0% 后失败(异步命令内误用 reqwest::blocking)

- **现象**:检查更新发现 v2.0.0 / 或重装,点下载后进度条卡 0%,随即「更新失败」。
- **根因**:`download_update` 是 `async` 命令(跑在 Tauri 的 tokio 运行时上),却在 `spawn_blocking` 里用 **`reqwest::blocking`**——阻塞客户端会在异步运行时内再起一个阻塞运行时,下载尚未开始即失败(故进度永远 0%、随后抛错)。这是我上一版的实现错误。
- **修复**:命令内直接用 **reqwest 异步客户端**(`client.get(url).send().await` + `resp.chunk().await` 流式读取并 emit 进度),不再 `spawn_blocking`/`blocking`。`Cargo.toml` 的 reqwest 特性从 `["blocking","native-tls"]` 改为 `["native-tls"]`(异步客户端 + Windows SChannel)。
- **顺带**:`UpdateDialog` 下载失败时把**真实错误**挂到红字的 `title`(悬停可见),便于定位(HTTP 码 / TLS / 网络)。
- 验证:`npm run build` + `cargo check`(reqwest 0.12.28 异步 + schannel 编译通过)全过。版本保持 2.0.0,待用户验证后重新 release。

## v2.0.0 — 修复:重新安装下载完成后装不上(写盘覆盖运行中的 exe 被文件锁挡下)

- **实测定位(本机)**:下载本身没问题(`reqwest` 异步流式实测 200、字节完整)。卡在**安装写盘**:
  - `swap_and_restart` 旧逻辑把新版写到 `target_dir/资产名` = `<exe目录>/MinimalTodoApp-v2.0.0-win-x64.exe`;当用户运行的正是同名已发布 exe 时,该路径**就是正在运行的 exe**。
  - 本机实测覆盖/删除正在运行的 exe:`fs::write` → `os error 32(另一个程序正在使用此文件)`、`remove_file` → `os error 5(拒绝访问)`;但 `rename`(改名挪开)可行、同目录写新文件可行。
  - 故下载到 100% 后写盘即失败 → 报「更新失败」。(dev 下 exe 名为 `minimal-todo.exe`、与资产名不同,不冲突,所以开发时看不出来。)
- **修复(就地替换,只用实测可行的操作)**:`swap_and_restart` 改为——
  1. 把**正在运行的 exe 改名挪开**(`xxx.exe` → `xxx.exe.old-<pid>`);
  2. 原路径**写入新版字节**(此时原路径已空);
  3. bat 等旧进程退出 → **删掉挪开的旧文件(带重试)** → **启动原路径新版** → 自删。
  - 新版与旧版**同路径同名**,便携模型不变,且与资产文件名无关。写新版失败会**回滚改名**,绝不把应用弄成缺文件。
  - 目录不可写等极端情况**兜底**:写到 `%LOCALAPPDATA%\MinimalTodoApp` 并从那启动,`--updated-from` 回收旧 exe(沿用原机制)。
- **验证**:写了端到端实测(改名挪开→原路径写新版→bat 等退出→删旧→重启),本机跑通:重启起来的新版写出 marker(`RESTARTED OK`)、挪开的旧文件被清理。`cargo check` 无警告。版本保持 2.0.0。

## v2.0.0 — 新增:更新对话框「手动下载」(打开下载地址兜底)

- **需求**:抄 WPF 加手动下载——用户澄清为「手动打开下载地址」的功能。
- **实现**:更新/重装对话框新增「手动下载」按钮,用系统默认浏览器打开该版本资产直链(`info.assetUrl`),交浏览器自行下载,作为应用内自动更新失败时的兜底。
  - 后端命令 `open_url`(`updater.rs`):仅放行 http(s),`explorer.exe <url>` 调默认浏览器(单参数,免 cmd 的 `&` 转义坑);`lib.rs` 注册。
  - 前端 `updater.ts` `openDownloadUrl` 封装;`UpdateDialog.tsx` 加按钮;i18n 双语 `S.Update.ManualDownload`(手动下载/Download manually)。
- 验证:`npm run build`(tsc 严格)通过。版本保持 2.0.0。

## v2.0.0 — 「手动下载」加设置内独立入口(关于段)

- **需求**:除更新对话框内的手动下载外,设置「关于」也放一份可直接点击的「手动下载」。
- **实现**:`SettingsPanel.tsx` 关于段(检查更新/重新安装下方)新增「手动下载」行,点击用默认浏览器打开**当前版本**资产直链自行下载。
  - `updater.ts` 抽 `releaseAssetUrl(version)` 共用助手(重装与手动下载共用同一命名约定直链),`fetchReinstallInfo` 改用它。
  - i18n 双语 `S.Settings.ManualDownloadDesc`;按钮复用 `S.Update.ManualDownload`。
- 验证:`npm run build`(tsc 严格)通过。版本保持 2.0.0。

## v2.0.0 — 区分手动下载目标:对话框内=当前版本,设置内=最新版本

- **需求**:重装/更新对话框内的「手动下载」打开**当前版本**;设置「关于」里独立的「手动下载」打开**最新版本**。
- **实现**:
  - 设置内「手动下载」改为打开最新发布页 `LATEST_RELEASE_PAGE`(`https://github.com/{repo}/releases/latest`,GitHub 自动重定向到最新 release)。资产名带版本号、无稳定 latest 直链,故打开发布页让用户在页面下载最新版。
  - 对话框内「手动下载」不变(仍打开 `info.assetUrl`:重装=当前版本、更新=目标新版,均符合语境)。
  - i18n 双语 `S.Settings.ManualDownloadDesc` 文案改为「最新版本」。
- 验证:`npm run build`(tsc 严格)通过。版本保持 2.0.0。

## v2.0.0 — 主窗口永不在任务栏显示(只在通知栏托盘)

- **需求**:应用永远不在任务栏显示,只在通知栏(托盘)。
- **实现**:`tauri.conf.json` 主窗口加 `"skipTaskbar": true`(创建期静态设置,跨 hide/show 持久;window.rs 的 show()/set_focus() 不会重置)。窗口仅经托盘图标(双击「显示并居中」)唤出。
- 验证:发布构建通过;需运行确认任务栏始终无图标、托盘可正常唤出。版本保持 2.0.0。

## v2.0.0 — 重新安装/更新逻辑照搬 WPF(弃用自创的就地替换/bat)

- **背景**:此前自创的「就地替换运行中 exe + bat 重启」反复出问题。改为**原封不动照搬旧版 WPF `UpdateService` 的安装逻辑**。
- **WPF 模型(本次严格对齐)**:
  1. **下载到独立文件**(`resolve_download_path` ← WPF `ResolveDownloadPath`):exe 同目录可写优先,但**绝不写正在运行的 exe**(运行中被文件锁→覆盖必失败,这正是旧 bug),同名冲突退 `%LOCALAPPDATA%`,再冲突加 pid 前缀。
  2. **直接拉起新版**(`start_new_and_exit` ← WPF `TryStartNewVersion` 的 `Process.Start`,**不用脚本/bat**):传 `--updated-from <旧exe>` + `--old-pid <旧进程>`,随后本进程优雅退出。
  3. **新版接管旧版**(`takeover_old_instance` ← WPF `EnsureSingleInstance(fromUpdate)`):新版启动**先**等旧实例退出(~5s)、超时强杀,**再**注册单实例插件——否则单实例会让新版直接退出。kernel32 直链 OpenProcess/WaitForSingleObject/TerminateProcess。
  4. **回收旧 exe**(`cleanup_after_update` ← WPF `CleanupAfterUpdate`):旧进程消失后删旧 exe(带重试)。
- **删除**自创的 `swap_and_restart`/`spawn_restart_bat`(就地改名 + bat)。`download_update`/`apply_update` 改调 `start_new_and_exit`;`lib.rs` 在单实例插件注册前调 `takeover_old_instance`。
- **本机实测**:takeover 端到端跑通——OLD 拉起 NEW、NEW 等 3s 后强杀 OLD、确认 `old_alive_after=false`、NEW(子进程)在父被杀后仍存活并完成。正常路径下旧实例 ~400ms 优雅退出,无需强杀。`cargo check` 无警告。版本保持 2.0.0。

## v2.0.0 — 修复:贴边隐藏间歇失灵(轮询漏拍 + 唤出触发带过窄)

- **现象**:贴边自动隐藏/唤出偶发不响应。
- **两处根因/加固**(`window.rs` 贴边轮询线程):
  1. **轮询漏拍**:原 tick 把 `current_monitor()` 一并解构,返回 `None`/`Err` 即 `continue` 跳过**整拍**——收起态(窗口大部移出屏幕)下它偶发取不到显示器,于是 reveal/hide 那拍不执行 → 间歇失灵。改为:显示器几何**成功即缓存(mon_x/y/w/h)、失败用缓存**,绝不因取不到显示器跳过整拍。
  2. **唤出触发带过窄**:原唤出要求鼠标顶到屏幕硬边缘 2~3px;但露出的可见条宽 `REVEAL_PX`(4px),且双屏共享边等"软边界"处鼠标会越界到邻屏、顶不住边 → 偶发唤不出。改为触发带 = 可见条宽 `REVEAL_PX`:鼠标停在露出的细条上即唤出,更稳更直观。
- **说明**:GUI 贴边交互无法在无头环境复现,本次为针对两处最可能成因的稳健性修复,需运行实测确认。`cargo check` 无警告。版本保持 2.0.0。

## v2.0.0 — 修复:双屏贴边完全失灵(照搬 WPF 的「光标所在屏工作区」)

- **现象**:双显示器电脑上贴边自动隐藏完全不工作(尤其副屏)。
- **根因**:贴边几何用了窗口的 `current_monitor()`,且用整块显示器边界(非工作区)。**窗口收起后会滑过显示器边界、跨到邻屏**,此刻再取窗口所在屏会取到**邻屏**,几何全错 → reveal/hide 判定永远不成立 → 完全失灵。上一版加的「缓存窗口显示器」也治标不治本(缓存的是窗口屏,跨屏后仍错)。
- **修复(原封不动对齐 WPF `_dockedWa` + `GetCursorScreenWorkArea`)**:
  - 新增 `MonitorFromPoint(pt, NEAREST)` + `GetMonitorInfo().rcWork`(user32 直链;结构体布局本机实测 size=40、rcWork 正确排除任务栏)——取**点/光标所在屏**的**工作区**(排除任务栏),而非窗口 current_monitor、非整屏。
  - 贴边判定(Moved)改用**光标所在屏工作区**(`cursor_work_area`,对齐 WPF `TryDockAfterDrag`)。
  - 贴边那一刻把**贴附屏工作区记进 `DockState`(wa_l/t/r/b)**,收起/唤出/对齐**全程复用**(对齐 WPF `_dockedWa`);窗口滑出跨屏后**绝不**再实时取屏。启动恢复时用窗口当前位置所在屏补捕获。
  - 收起目标、对齐位置、唤出触发带、唤出目标全部改用工作区坐标 + WPF 同款 ±1/±2 边距。
- 验证:`cargo check` 无警告;Win32 工作区助手本机实测正确(size=40、work 排除任务栏)。本机仅单屏无法复现双屏交互,逻辑与 WPF 一致。版本保持 2.0.0。

## v2.0.0 — 回退:贴边逻辑退回 dfaa7e0(多屏工作区重写完全失灵)

- **背景**:上一版(740d1e5)照 WPF 改用「光标所在屏工作区(Win32 MonitorFromPoint/GetMonitorInfo)」,**在真机上贴边完全用不了**(连单屏自动隐藏都没了)。最可能因:轮询线程里**原生 Win32 坐标与 Tauri 的 cursor_position/outer_position 坐标空间不一致**(高 DPI 缩放下一个物理一个逻辑),所有边界比较失效。无法在本机复现/验证(本机单屏、且 GUI 贴边交互无法无头驱动),故按用户要求**回退**。
- **动作**:`git checkout dfaa7e0 -- src-tauri/src/window.rs`,把贴边代码退回到「偶尔失灵但能自动隐藏」的可用版本(current_monitor + 显示器缓存 + REVEAL_PX 唤出带,全程用 Tauri 同一坐标空间)。其余所有修复(重装照搬 WPF、skipTaskbar、手动下载等)保持不变。
- **后续**:多屏修复方向(工作区)本身是对的,但需在真机(尤其带 DPI 缩放的双屏)上测过坐标空间再上;不再盲改盲发。
- 验证:`cargo check` 无警告。版本保持 2.0.0。

## v2.0.0 — 修复:贴边多隐藏几次后失效(自移动 Moved 被误判为用户拖动,污染 edge)

- **现象**:贴边能用,但多收起/唤出几次后失灵;点「显示并居中」立刻恢复。
- **根因**:`show_main`(显示并居中)会**重置** edge/hidden/pending/moving,故能临时复原——说明这些状态被逐次污染。污染来自 `Moved` 事件处理器:它在**每次**窗口位置变化时跑(用户拖动 + 程序滑入滑出/对齐的 set_position 都会触发)。收起动画结束时 `moving` 先置 false、`hidden` 后置 true,二者之间有缝;**尾随的自移动 Moved 在这条缝里被当成用户拖动**,按收起态的窗口坐标把 `edge` 改错(如 LEFT→TOP)、`pending` 置真,几次累积后 edge 与实际不符 → reveal 永不触发 → 卡死。
- **修复(参考 WPF `TitleBar_MouseLeftButtonDown`)**:WPF 只在 `DragMove()`(用户按住左键拖动)结束后才 `TryDockAfterDrag` 检测贴边,程序自身的隐藏/唤出动画从不触发检测。照此:`Moved` 处理器加 `lbutton_down()` 闸——**只在用户按住左键拖动时才检测贴边**。所有程序自移动都在左键松开状态发生,天然排除,根除污染。`lbutton_down()` 已被 pending 分支依赖、确证可靠。
- 验证:`cargo check` 无警告。版本保持 2.0.0。

## v2.0.0 — 修复:双屏禁止贴到屏间共享边(左屏右边/右屏左边)

- **现象(用户定位)**:双屏时把窗口贴到「左屏的右边」(即两屏之间的共享边界)就出问题。
- **根因**:屏间共享边不是真正的屏幕外沿。贴到这条边后收起会把窗口往这个方向滑——滑到**邻屏**上(而非屏幕外),`current_monitor()` 随之返回邻屏,收起/唤出几何全错 → 失灵。
- **修复(按用户要求:这两条共享边禁止贴边)**:贴边检测时,若某条边的「外侧」紧挨着另一块显示器,就**不允许**贴到这条边——只允许贴到**桌面外沿**。用 Tauri `available_monitors()`(与 current_monitor 同一坐标系,无 Win32 坐标错配风险)判断「边外侧 2px 处是否落在另一块屏上」:是则该边禁用。
  - 左屏右边 / 右屏左边(共享边)→ 外侧压着邻屏 → 禁用;
  - 各屏的外沿(左屏左边、右屏右边、各屏上边)→ 外侧无屏 → 正常可贴。
  - 单屏不受影响(外侧无屏,所有边照常可贴)。
- 验证:`cargo check` 无警告;单屏行为不变(无回归)。版本保持 2.0.0。

## v2.0.0 — 剪切板/标签看板四项优化

1. **剪切板「默认」分组右键清空**:默认分组按钮加右键菜单「清空」→ 二次确认 → 删除全部未分组剪贴项。新增 store `clearUngroupedClips`;确认文案复用 `S.X.ConfirmClearClipTag`(名字传「默认」)。
2. **新建分组同名自动加序号**:`addClipTag` 在客户端先按现有分组名去重——新分组 / 新分组2 / 新分组3 …,不再因同名被后端拒绝而失败。
3. **第二侧边栏下限放宽到 60**:剪切板/标签/便签三个第二侧栏宽度可拖范围 160–460 → **60–460**(最窄可拖到 60,比第一侧栏还窄;持久化不变)。
4. **标签看板容器内「+ 添加」**(参考 WPF 各容器自带 `AddTaskToTag`):标签看板每张卡片底部加输入框,回车以本列标签建一条待办(「无标签」列 → 不归组)。占位文案复用 `S.Tag.AddPlaceholder`。
   - 注:看板只显示有任务的列(空标签列不上板,沿用既有设计),故「+ 添加」出现在已有任务的卡片底部。
- 验证:`npm run build`(tsc 严格)通过。版本保持 2.0.0。

## v2.0.0 — 新增:全局快捷键(召唤窗口 + 切换视图,可改)

- **需求**:全局快捷键召唤主窗口并切换第一侧栏视图:Alt+1 便签 / Alt+2 剪切板 / Alt+3 标签看板 / Alt+4 四象限 / Alt+5 全部待办;设置里可改。召唤=从隐藏恢复 + 若在底层则浮到最前,**不居中、不常驻置顶**(点别处会正常退后)。
- **实现**:
  - 依赖 `tauri-plugin-global-shortcut`。`window.rs`:`register_hotkeys`(按设置 `hotkey_*` 注册,空则用默认 Alt+1..5;解析失败/被占用则跳过)、`HotkeyMap`(快捷键→视图 反查)、`on_hotkey`(触发→`summon_main`+emit「summon-view」)、`summon_main`(unminimize+show+set_focus,不居中不置顶)、命令 `update_hotkeys`/`pause_hotkeys`。`lib.rs` 注册插件(Pressed 时 `on_hotkey`)+ manage `HotkeyMap` + setup 调 `register_hotkeys`。
  - 加速键写法实测:`Alt+1`/`Control+Shift+K`/`Alt+F1` 均被 `Shortcut::from_str` 接受。
  - 前端:`main.tsx` 仅主窗口 `listen("summon-view")`→`setView`;设置「通用」段加 5 个**快捷键录制按钮**(点一下→按组合键即存并重注册;录制期间先 `pause_hotkeys` 放开全局热键,否则按键被系统吞掉录不到;需含 Alt/Ctrl/Shift;Esc/失焦取消)。保存先 `await setSetting` 落库再 `update_hotkeys`,避免读到旧值。i18n 双语。
- 验证:`npm run build` + `cargo check` 全过;加速键解析本机实测通过。GUI 全局热键触发需运行实测。版本保持 2.0.0。

## v2.0.0 — 修:更新后仍是旧版 + 贴边隐藏支持快捷键唤出

1. **更新后跑起来的还是旧版(手动退出再开新版才正常)**:更新时新版是作为旧版的**子进程**被拉起的,会继承旧版的控制台/句柄/进程组,行为与全新启动不同(经典的「子进程异常、全新启动正常」征象)。改为**完全脱离父进程**启动新版:`stdin/out/err` 置 null + `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` 创建标志(`updater.rs` start_new_and_exit)。
2. **贴边隐藏后快捷键唤不出**:`summon_main` 原来只 show+focus,对贴边收起态只会把屏幕外的细条 show 出来。改为:召唤时若处于贴边收起态,先把窗口**滑回完整可见位置 + 清 hidden**(`reveal_docked`),并给 ≈2s 的「召唤宽限」——这段时间内轮询不自动收起(新增 `DockState.summon_grace`),给鼠标移过去的时间;之后回归正常贴边自动隐藏。
- 验证:`cargo check` 无警告。版本保持 2.0.0。
