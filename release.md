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

> 以上未递增版本号(仍 2.0.0)、未发版。发版时再统一递增三处版本号 + 写 `release-notes.md` + 跑 `release.ps1`。

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
