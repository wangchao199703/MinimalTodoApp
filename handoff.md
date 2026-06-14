# 交接文档 handoff.md —— MinimalTodoApp v2(Tauri 重写版)

> 写给接手的人/Claude:开工前**先读完本文 + 根目录 `CLAUDE.md` + `docs/tech-stack.md`**。
> 旧版功能迁移早已完成,现处于「按用户逐轮反馈持续打磨 UI」阶段。
> 最后更新:2026-06-13。

---

## 一、这是什么(背景)

- 原版:C#/WPF + .NET 8 的 Windows 本地待办(exe 63MB),**完整保留在 `legacy/`**,是迁移/对齐的参照物。
- 现版:**Tauri v2 + Rust(rusqlite/SQLite WAL)+ React 19 + TS + Zustand v5(无路由)+ Tailwind v4 + pragmatic-drag-and-drop + auto-animate**,便携 exe ≈10MB(需系统 WebView2)。
- 架构/命令/约定/坑见 **`CLAUDE.md`**,技术清单见 **`docs/tech-stack.md`**(改依赖/架构要同步更新它)。

## 二、每轮硬性仪式(见 `CLAUDE.md`「每轮改动工作流」1–5)

1. **`prompts.md`(根)**:每条需求做完追加**用户原始提示词逐字**(剔敏感信息)+ 改动摘要 + commit hash(本轮先标 `(本轮)`,下次提交回填上一轮哈希)。
2. **`release.md`(根)**:每次改动按**当前版本号**记摘要;**用户没说改版本号就不升版本**(沿用上次)。
3. **做完即本地 commit,不 push**;中文消息,结尾 `Co-Authored-By: Claude ...`;**等用户通知才 push / release**。
4. **做完即更新本文件 `handoff.md`**,随时可让他人接手。
5. **做完把应用 run 起来让用户验证**(`npm run tauri dev`),无特殊说明都要跑。
6. 附:i18n 双语同步(`src/lib/i18n.ts` 的 `EXTRA` zh/en 都加);`npm run build` 必过(tsc 严格);改 Rust 跑 `cargo check`。

工作风格(`CLAUDE.md` 6–9):不替用户假设需求(不清晰就停下讨论)、路径非最短直说并建议更优解、追根因不打补丁、输出说重点。

## 三、当前进度(均已本地提交,未 push)

### 最近一轮:新建后弹快捷设置,对齐 WPF(v2.0.0,未升版)

- **目标**:对齐 WPF——新建一条待办后弹小窗,可直接改这条任务的优先级 / 截止时间 / 周期提醒。
- **实现**:
  - `useAppStore.addTask` 改为**返回创建的 `Task`**(`Promise<void>`→`Promise<Task|undefined>`),供 `QuickAdd` 锚定新任务。
  - `QuickAdd.tsx`:`submit()` 成功后,若设置 `quick_add_popup` 开启,把新任务 id 存入 `postAddId`,锚定底部输入栏(`rowRef`)弹 `Popover`(复用 `ui/Popover`)。弹层**只存 id、实时从 `tasks` 取最新值**(`postTask`),任务被删则自动消失。
    - 优先级:高(3)/中(2)/低(1)段控 → `setPriority(id, p)`。
    - 截止:按钮显示当前值,点开复用 `DuePicker` → `setDue(id, d)`;行内 `X` 清除。
    - 周期提醒:按钮显示当前间隔,点开复用 `ReminderPicker` → `patchTask({reminder_enabled:true, reminder_interval_minutes})`;行内 `X` 关闭提醒(`reminder_enabled:false`)。用 `patchTask` 而非 `toggleReminder` 是为**显式启用/清除**,避开 toggle 的方向歧义;提醒计时基线 `last_reminded_at ?? created_at` 用刚建任务的 `created_at`(=此刻)天然正确,无需另设。
  - **非阻塞**:输入框保持焦点,可继续连续新建;ESC(`useEffect` 监听,放在早返回之前保证 hooks 顺序)/ 点外部(Popover 自带遮罩)/ 「完成」按钮均关闭。
  - **可选/可跳过**:新增持久化设置 `quick_add_popup`(**默认关闭**,老用户行为不变),设置→待办 加 `Toggle`。
- **改了**:`src/store/useAppStore.ts`(addTask 返回值)、`src/components/QuickAdd.tsx`(弹层主体)、`src/components/dialogs/SettingsPanel.tsx`(开关)、`src/lib/i18n.ts`(双语 4 键)。
- **未碰**:`dragDropEnabled`/`transparent`/拖拽排序,未升版本(2.0.0)。`npm run build`(tsc 严格)通过。**未启动 dev、未 kill 进程**。
- **需运行时目视验证**:① 设置→待办 打开「新建后弹出快捷设置」;② 新建一条待办→输入栏上方是否弹小窗;③ 改优先级/截止/周期提醒是否即时落到该任务;④ 弹层开着时继续打字 + Enter 是否能连续新建;⑤ ESC / 点别处 / 「完成」是否关闭;⑥ 设置关闭时新建行为是否与原来一致(不弹)。

### 上一轮:resize/最大化重绘改自动 + 修复贴边隐藏回归(v2.0.0,未升版)

- **Bug B(贴边自动隐藏失效,回归)根因**:上一轮 `f90f46d` 给 `show_main` 加的强制重绘 `set_size(w+1,h)→还原`(原第 58–61 行)是一处**无 `moving` 守卫的尺寸变更**;它在托盘「显示并居中」/单实例唤起时跑,会触发 `Resized`(以及 Windows 上 set_size 改变窗口原点带来的 `Moved`),干扰贴边轮询/`Moved` 监听,导致拖到边缘不再自动隐藏。**修复=移除该 nudge**(重绘职责改由前端承担,见 Bug A),贴边逻辑不再被自身尺寸抖动误扰。`show_main` 的「显示→`moving` 守卫下居中→清贴边态(`edge=NONE/hidden=false/pending=false`+持久化 `dock_edge=0`)」逻辑**保留不变**,「显示并居中」仍工作且不被贴边误收。`app.manage(Arc<DockState>)` 与 `setup_dock` 的 Moved/轮询逻辑均未动(经核对,二者非回归源)。
- **Bug A(resize/最大化后透桌)自动修复,改前端**:不再用 Rust `set_size` 一次性 nudge。`App.tsx` 新增 effect 监听 `getCurrentWindow().onResized()`(resize 拖边、最大化、还原都会触发)→ **防抖 120ms** → **纯 DOM 重绘**:根节点瞬时 `transform: translateZ(0)` + 读 `offsetHeight` 强制 reflow + `requestAnimationFrame` 撤回。
  - **为何前端而非 Rust**:① `set_size` 在窗口**最大化时会取消最大化**(任务点名的坑),纯 DOM 重绘对 OS 窗口尺寸**零副作用**,最大化照样修;② `set_size` 自身又触发 `Resized` → 反馈环,纯 DOM 重绘不改 OS 尺寸**不触发 `Resized`**,天然防反馈环;③ 不与贴边的 `Moved/Resized` 互扰(Bug B 的教训)。
  - **未碰**:`transparent:true`、`dragDropEnabled`、`ResizeBorders.tsx` 的 `startResizeDragging`(均按任务约束保留)。
- **改了**:`src-tauri/src/window.rs`(删 set_size nudge + 删无用 `PhysicalSize` 引入)、`src/App.tsx`(新增 onResized 防抖重绘 effect)。`cargo check`、`npm run build` 通过。未升版本(2.0.0)。**我未启动 dev、未 kill 任何进程**。
- **需运行时目视验证(必做)**:① 拖窗口到上/左/右边缘→是否自动隐藏、鼠标顶边缘→是否唤出(贴边是否恢复);② 向下拖边缩小窗口→内容是否填满、不再透桌;③ 单击标题栏最大化按钮→是否不再透桌、且窗口**仍保持最大化**(没被取消最大化);④ 托盘「显示并居中」→是否仍正常居中显示、之后还能正常贴边。

### 上一轮:窗口放大透出桌面 + 托盘「显示并居中」(v2.0.0,未升版)

- **现象**:用户拖边把窗口拉大后,网页内容只占左侧,右侧露出**真·桌面壁纸**。
- **根因**:主窗口 `tauri.conf.json` 是 `transparent:true`(为亚克力/圆角)。Windows + WebView2 在窗口**放大 resize 时,新暴露区域不重绘** → 透明窗口透出桌面。这是已知透明窗口重绘 artifact;**不要去掉 `transparent:true`**(毁亚克力/圆角与页面内拖拽)。resize 机制本身没问题(`ResizeBorders.tsx` 用原生 `startResizeDragging`,未动)。
- **改了什么**(仅 `src-tauri/src/window.rs`):
  1. 托盘 show 项标签:「显示主界面」→「显示并居中」/「Show window」→「Show & center」(`rebuild_tray` 与 `setup_tray` 两处都改)。事件 id 仍是 `"show"`。
  2. `show_main` 增强为「显示 → 居中 → 强制重绘」,既是托盘动作也是**一键恢复手段**(用户右击托盘即可修好当前透桌的窗口)。
     - **居中**:算 `mp + (ms - size)/2` 居中坐标后 `set_position`;**走贴边自动隐藏的「忽略自身移动」标志 `DockState.moving`**——置 `moving=true` → set_position → 还原。同时把 `edge` 清成 `EDGE_NONE`、`hidden=false`、`pending=false` 并持久化 `dock_edge=0`(居中=离开贴边)。**没用 `window.center()`**:它内部 set_position 不走该标志,会被贴边逻辑误判为用户拖动而收边(这是任务点名的坑)。
     - **`DockState` 跨函数访问**:`setup_dock` 里 `app.manage(state.clone())` 把 `Arc<DockState>` 托管;`show_main` 用 `app.try_state::<Arc<DockState>>()` 取回复用同一标志(`show_main` 是自由函数,拿不到闭包里的 state,故走托管)。
     - **强制重绘**:`inner_size()` 取当前内层尺寸,`set_size(w+1, h)` 再 `set_size(原)`(`PhysicalSize`),促 WebView2 重绘整窗,消除透桌。**此重绘 workaround 是否真消除透桌,需运行时目视验证。**
- **未做 C(resize 结束自动重绘)**:`Resized` 事件没有像 Moved 那样的 `moving` 守卫,要自己加防抖 + 防 `set_size` 反馈环,复杂且有 jank/反馈环风险;A/B 的「显示并居中」恢复手段已覆盖根因,故按任务「不过度设计」跳过。若日后要做:监听 `Resized` + 防抖 ~200ms + 一个 `resizing`/自身 set_size 守卫(参照 Moved 的 `moving`)。
- **验证**:`cargo check` 通过;`npm run build`(tsc 严格 + vite)通过。未升版本(仍 2.0.0)。**注意我未启动 dev / 未 kill 进程**(本机多项目并行);Rust 由主会话的 dev 自动重编。

---

HEAD = `9774cd2`。近期工作已全部提交,工作树干净:

- `c63a878` 标签简化为全宽看板 + 侧栏统一打磨 + 右键改色 + 工作流文档化(详见 §四 历史)。
- `03a9e1f` **后端测试套件(首次)**:`commands.rs` 命令体抽成 `*_impl(conn, …)` 核心函数(壳只加锁转调,逻辑/SQL 未改),便于用内存库单测;新增覆盖标签/任务/便签/便签分组/自定义主题/设置 CRUD + 迁移 + 三态补丁 + 收集箱自愈 + 纯函数。
- `9774cd2` **旧数据迁移测试**:`import.rs` 抽 `import_into(conn, &old)`,测试 ISO 日期转换/Nil GUID/内置视图分组跳过/优先级 0→Medium/parent 校验/sort 与 selected_group 映射/便签导入等。

**测试现状**:`cargo test --lib` **36 项全过**(命令 + DB + 迁移导入)。前端 `npm run build`(tsc 严格)通过。无前端单测框架(按用户验收口径:后端 cargo + 构建 + 冲烟)。跑测试:`export PATH="$USERPROFILE/.cargo/bin:$PATH"; cargo test --lib --manifest-path src-tauri/Cargo.toml`。

### ⚠️ 一项待用户确认的功能决策(夜间审计发现)

用户要求「参考 WPF 补全所有功能」。逐项审计结论:**任务/便签/提醒引擎/完成音效/四象限/置顶/缩进/完成级联/日历/排序/导入导出 均已对齐 WPF**。**唯一明显缺口 = 主题管理**:
- WPF 有「自定义主题编辑器」(ThemeEditorDialog + ColorPicker)与「主题收藏」(FavoriteThemeKeys)。
- 现版后端 `get/save/delete_custom_theme` 命令俱全、`import.rs` 也迁移 custom_themes 与 favorite_theme_keys,但**前端无 UI、从不调用**;i18n 有 `S.X.Favorite` 键无实现。
- **未实现的原因**:该领域正是用户近期**刻意精简为 15 套主题**的范围,补回自定义主题编辑器可能与该方向冲突;且它高度视觉化,无人值守无法目视校准配色。**留待用户确认是否要做**——要做的话后端已就绪,只差前端编辑器 UI + `applyTheme` 应用自定义 CSS 变量 + 菜单列出 + store 载入 customThemes。

## 四、近期已提交的大事(committed,均未 push)

- **便签拖入 .md 导入**:从资源管理器把 `.md`/`.markdown` 拖进便签区 → 建便签(标题=文件名去扩展名,正文=Markdown 文本,直接存 `notes.content`,TipTap 以 `contentType:"markdown"` 渲染,无需转换)并打开(多份选最后一条);拖到分组头则归类到该组,拖空白处落默认分组。实现:store `importNotesFromFiles(files, groupId?)`(`createNote`→`updateNote` 回填);`src/lib/markdownIO.ts` 加 `readMarkdownDrop/isMarkdownFile/stripMdExt`;`NotesView.tsx` 容器 + `NotesTree.tsx` 各分组头挂 **React 合成 `onDragOver`(preventDefault)/`onDragLeave`/`onDrop`**,仅当 `dataTransfer.types` 含 `Files` 才拦截(避开内部排序拖拽),分组头 drop `stopPropagation` 防冒泡;i18n `S.X.DropMdToImport` 双语。**未碰 `dragDropEnabled:false`**。⚠️ **该功能依赖 WebView2 在 `dragDropEnabled:false` 下向网页派发「来自资源管理器的外部文件 drop」,需运行时验证;若不派发则另议方案(绝不可开 OS 拖放,否则毁掉排序)。** `npm run build` 通过。
- **提示音风格(4 套成对)**:`src/lib/effects.ts` 新增 `playComplete(style)`/`playReminder(style)` + 合成原语 `tone`/`bowl`/`drop`,4 套风格 `minimal`/`game`/`zen`/`cute`(`SOUND_STYLES`、`normalizeSoundStyle`)。完成音与提醒音跟随同一设置键 `sound_style`(默认 `minimal`,贴近原完成音)。触发处:`TaskItem.tsx`(完成)、`App.tsx` 提醒轮询(提醒)按 `sound_style` 分发;原 `sound_enabled`/`reminder_sound_enabled` 开关保留。设置→待办 加「提示音风格」网格,每项带「完成/提醒」试听按钮(`SettingsPanel.tsx`)。i18n `S.Settings.SoundStyle.*` 双语已加(`src/i18n/{zh,en}.json`)。`npm run build` 通过。注:`playCelebration`/`playReminderDing` 旧导出仍保留未删(无引用,可后续清理)。
- `0b9a598` 侧栏彩色化与收起图标化 + 设置面板重排 + 便签字体双开关。
- `ccc3478` 标签/便签改回独立第二侧边栏 + 支持调宽与收起(注:标签第二侧栏在 §三 中又被移除)。
- `1df529a` 主题精简重做为 15 套 + 新增 `docs/tech-stack.md`。
- `4ba7844` 设置改为独立原生窗口 + 字体修复 + 恢复默认 + 默认主题 light。
- `14cbe50` 侧栏导航项可拖动排序 + 模态框标题栏可拖动移位。
- 更早见 git log 与 `prompts.md`。

## 五、🚫 已尝试并「整体回退」的实验(别重做,除非用户明确要)

- **最小化「缩小飞向托盘」动画**(genie):CSS 版与 framer-motion 版都试过,效果不满意,已回退。
- **framer-motion**:引入过又**彻底卸载**(package.json 无)。列表动画用 `@formkit/auto-animate`,弹窗用 CSS `modal-in`。
- **第一版「版式」实验(已否决)**(2026-06-14):纯 CSS 微调的 4 套(经典/柔卡/紧凑/极简,TitleBar 切换),用户嫌差异太小**全否**,`git reset` 回退(留档 `3a9f089`)。教训:换肤差异要做足(改 DOM 结构,不只圆角阴影)。
- **当前「界面版式」系统(已落地,非否决)**:按 Gemini 文档重做,在**设置→通用→界面版式**切换 **经典/苹果(Things)/极客(Linear)/可爱(Waterdrop)**。实现见 `themes.ts`(DESIGNS/applyDesign)、`index.css` 末尾 `.design-*` 块、`TaskItem.tsx`(统一可换肤 DOM:`--pri` 变量 + `.task-check/.task-pri-dot/.task-pri-icon/.task-tag`)。等用户挑定方向后再把该版式延伸到便签/日历/侧栏面板。

## 六、开发与自测

- 跑:`npm run tauri dev`(vite 1420 + cargo run,改 Rust 自动重启;改 `tauri.conf.json`/`capabilities` 要完全重启)。
- **多项目并行注意端口**:本项目 vite 固定 1420、`devUrl=localhost:1420`。若同时跑别的 Tauri 项目(如 ShellPicker),两边 devUrl 撞 1420 会导致**对方窗口加载本项目前端**、报 `Command get_tasks not found`(串进本项目 vite 日志)——这不是本项目 bug,让对方改端口即可。
- **进程清理要精确**:只针对本项目 `minimal-todo.exe`,**别按端口杀进程、别按名通配**,以免误伤其它项目。
- 数据库 `%AppData%\MinimalTodoApp\todo.db`。预览某主题/视图最稳:停应用 → 写 `settings` 表 → 重启。
- 截图自测坑:合成点击/拖拽不可靠(拖拽/文件框/动画手感让用户手测);PowerShell 截图先 `SetProcessDPIAware()`;贴边隐藏会把窗口停到屏外(删 `settings.dock_edge` 拉回);IME 易把英文合成成中文。

## 七、当前 UI 结构速记

- 新建待办 `QuickAdd.tsx`(内联输入栏):标题 + 优先级 + **标签选择器**(Tag 钮)+ **父级选择器**(ListTree 钮,建为子待办、标签跟随父)+ 提醒 + 截止;`addTask` 支持 `group_id`/`parent_id`。编辑用 `TaskEditDialog`(双击)。快捷时间:截止到 4周、提醒 12 档(对齐 WPF)。
- 主侧栏 `Sidebar.tsx`:5 个内置导航项(所有待办/四象限/**标签**/便签/已完成,可拖排序),右键改色,底部折叠开关。
- `tagboard` 视图(`App.tsx` dispatch):`<TagBoardView/>` **全宽**(无第二侧栏)。
- `notes` 视图:`NotesView`(第二侧栏便签树 + 编辑区,可调宽/收起;收起为图标列,镜像分组折叠态)。
- 设置:独立原生窗口(`SettingsWindow.tsx` + `SettingsPanel.tsx`),`☰` 菜单 → 设置打开。

## 八、动手前 checklist

1. 读 `CLAUDE.md` + `docs/tech-stack.md` + 本文。
2. **先收尾 §三 未提交批次**:实跑确认 → 确认 `prompts.md` 已记 → 中文 commit(不 push)。
3. `npm run tauri dev` 跑起来;多项目时注意 §六 端口冲突。
4. 做任何一项先看 `legacy/` 对应源码,**对齐旧版**是默认要求。
5. 每轮按 §二 1–5 仪式走;**不 push、不 release**,除非用户明说。
