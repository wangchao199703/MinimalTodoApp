# 交接文档 handoff.md —— MinimalTodoApp v2(Tauri 重写版)

> 写给接手的人/Claude:开工前**先读完本文 + 根目录 `CLAUDE.md` + `docs/tech-stack.md`**。
> 旧版功能迁移早已完成,现处于「按用户逐轮反馈持续打磨 UI」阶段。
> 最后更新:2026-06-14。

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

### 最近一轮:补齐「重新安装/修复当前版本」(对齐 WPF)(v2.0.0,未升版)

- **背景/动机**:Tauri 版自动更新(`src/lib/updater.ts` + `src-tauri/src/updater.rs`)只检测「更高版本→升级」,缺 WPF `UpdateService.FetchReleaseByTagAsync(tag)` 那条「按当前版本 tag 重新拉取同一 Release、重装同版本」用于修复损坏/卡顿的路径。
- **做法(只改前端,Rust 零改动)**:
  - `updater.ts` 新增 `export async function fetchReinstallInfo()`:拼 `tag = "v" + 当前版本` → fetch `https://api.github.com/repos/<REPO_SLUG>/releases/tags/<tag>`(owner/repo 沿用既有常量,已抽成 `REPO_SLUG`)→ 取末尾 `.exe` 便携资产 → 返回 `UpdateInfo{version=currentVersion, currentVersion, reinstall:true}`;失败/无资产弹 `S.Update.CheckFailed`/`S.Update.NoAsset` Toast 返回 null。**不做版本比较**。
  - 抽出共享 `GithubRelease` 类型、`pickExeAsset(release)` 选资产、`REPO_SLUG` 常量;`checkForUpdate` 改用之(行为不变)。`UpdateInfo` 加可选 `reinstall?: boolean`。
  - **下载+重启完全复用既有 `downloadAndApply`**(流式下载 → `new Uint8Array` → 原始 IPC `invoke("apply_update", bytes, {headers:{"x-file-name":...}})`),Rust `apply_update`/`cleanup_after_update` 对「同名/同版本」exe 天然适用,**未改一行 Rust**。
  - `UpdateDialog.tsx` 加 `reinstall` 模式(`props.info.reinstall===true`):标题正文用 `f("S.Update.Reinstall", version)` 替代 `NewVersion`;隐藏「跳过此版本」(重装无此语义);取消钮文案 `S.Update.Close`、主按钮文案 `S.Settings.ReinstallBtn`。升级模式行为不变。
  - **入口**:`SettingsPanel.tsx` 关于(about)段,自动更新开关下加一行「重新安装当前版本」+ 描述 + 按钮(`S.Settings.Reinstall*`);点按钮 → `startReinstall()`(`reinstallBusy` 防重入 + `S.Update.Checking` Toast)→ `fetchReinstallInfo()` → 成功则 `setReinstallInfo` 打开同一 `<UpdateDialog>`(带进度条)。
- **i18n**:`S.Settings.Reinstall`/`ReinstallDesc`/`ReinstallBtn`、`S.Update.Reinstall`、`S.Update.Close` **此前已在 zh/en 双语就位**(本轮无新增 key)。
- **改了**:`src/lib/updater.ts`、`src/components/dialogs/UpdateDialog.tsx`、`src/components/dialogs/SettingsPanel.tsx`。`npm run build`(tsc 严格 + vite)通过。**未启动 dev、未 kill 任何进程**(任务约束)。未碰 `dragDropEnabled`/`transparent`/拖拽排序。
- **需运行时验证(无法在 dev 完整走通)**:真正重装需有「与当前运行版本号完全一致的真实 GitHub Release 且含便携 .exe 资产」。当前 dev 跑的是 2.0.0,若 GitHub 上无 `v2.0.0` Release 或其无 .exe 资产,点按钮只会弹 `检查更新失败`/`暂无安装包` Toast——这是预期保护,非 bug。完整链路(下载→bat 换壳→`--updated-from` 重启→回收旧 exe)须**打包成便携 exe 后**配真实同版本 Release 实测。可先验:点按钮能触发 `检查更新…` Toast、且关于段 UI 正常。
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
- `tagboard` / `group` 视图(`App.tsx` dispatch):**已改回第二侧边栏** `TagSidebar.tsx`——顶部「标签看板」入口 + 各标签列表(点标签进 `group` 视图),可右键改名/改色/改图标/删除、拖动重排、调宽/收起(`tags_sidebar_width`/`tags_sidebar_collapsed`)。`tagboard` 右侧 = `<TagBoardView/>`,`group` 右侧 = `<TaskList/>+<QuickAdd/>`。**支持拖待办到标签上归类**:标签行/折叠图标为 `dropTargetForElements` 目标(`{type:"task-tag",groupId}`),TagSidebar 自有 monitor → `patchTask({group_id})`;与任务排序 DnD(TaskList 的 `task→task` + `moveTask`)靠 type 区分共存(落 task-tag 时 moveTask 自然 no-op)。注:`store.init` 仍只恢复 `tagboard/notes/completed/quadrant`,不恢复具体 `group` 视图(重启回退「全部」,符合原状)。
- `notes` 视图:`NotesView`(第二侧栏便签树 + 编辑区,可调宽/收起;收起为图标列,镜像分组折叠态)。
- 设置:独立原生窗口(`SettingsWindow.tsx` + `SettingsPanel.tsx`),`☰` 菜单 → 设置打开。

## 八、动手前 checklist

1. 读 `CLAUDE.md` + `docs/tech-stack.md` + 本文。
2. **先收尾 §三 未提交批次**:实跑确认 → 确认 `prompts.md` 已记 → 中文 commit(不 push)。
3. `npm run tauri dev` 跑起来;多项目时注意 §六 端口冲突。
4. 做任何一项先看 `legacy/` 对应源码,**对齐旧版**是默认要求。
5. 每轮按 §二 1–5 仪式走;**不 push、不 release**,除非用户明说。

## 九、周期提醒系统通知(本轮,2.0.0)

- **背景**:周期提醒 `useReminderLoop`(`src/App.tsx`)原只 `pushToast` 弹 app 内 toast,最小化/隐藏/失焦看不见;旧版 WPF 用托盘气泡(NotifyIcon balloon)能在最小化时弹右下角。
- **实现**:接入 Tauri 官方 `tauri-plugin-notification`。
  - Rust:`Cargo.toml` 加 `tauri-plugin-notification = "2"`;`lib.rs` 在 autostart 插件**之后**追加 `.plugin(tauri_plugin_notification::init())`(**单实例插件仍最先**,顺序未动);`capabilities/default.json` 加 `notification:default`。
  - 前端:`src/lib/notify.ts` 暴露 `notifyReminder(title, intervalMinutes, dueDate)`;`App.tsx` 触发处在 `pushToast` 后 `void notifyReminder(...)`。
- **按窗口可见性区分**:仅 `!isVisible() || isMinimized()` 时发 OS 通知(可见时只 toast,避免重复打扰);窗口状态获取失败时保守发,保证「最小化必弹」。标题=`S.Fmt.ReminderToastTitle`,正文对齐旧版气泡(`ReminderMsg`/`ReminderMsgWithDue`)。权限按需 `requestPermission` 且缓存。
- **验证**:`npm run build` + `cargo check` 均过。未升版本(2.0.0)。
- **下一步可选**:目前系统通知点击无跳转动作(纯展示);若要点通知唤起主窗口/定位任务,可加 `onAction` 监听 + `window::show_main`。是否做交用户定。
- **运行时验证点**:跑起来 → 建一个开了周期提醒、间隔很短(如 1 分钟)的待办 → 最小化窗口 → 等提醒触发 → 看 Windows 右下角是否弹系统通知;再不最小化时确认只弹 app 内 toast、不弹系统通知。

---

## 交接:侧栏剪贴板功能(搬迁 ShellPicker · v2.0.0)

**背景**:把 ShellPicker(`D:\BaiduSyncdisk\code\ShellPicker\app`,只读参考)的剪贴板核心搬进本 app 侧栏。

**已完成(前后端)**:
- 后端:`clipboard.rs`(监听,默认开启)、`database.rs`(迁移 v4 三表 + `clipboard_images_dir()` + `clip_insert`/`clip_latest_hash`)、`commands.rs`(剪贴板读取/删除/置顶/标签 CRUD/打标签 + `get_clip_impl`)、`models.rs`(ClipItem/ClipTag/NewClip)、`lib.rs`(注册模块/start_watching/11 命令)、`Cargo.toml`、`tauri.conf.json`(asset 作用域)。
- 前端:`views/ClipboardView.tsx`、`tauri-ipc.ts`、`useAppStore.ts`(clipboard 视图 + 状态 + clip-added 监听 + clipToTask/clipToNote find-or-create)、`Sidebar.tsx`(入口 + 默认顺序 + 老顺序补位)、`App.tsx`、`i18n.ts`。

**关键设计**:
- 数据根目录出口集中在 `database::clipboard_images_dir()`(从 `data_dir()` 推导),任务2「数据位置可配置」时只改这一处的根即可。
- 剪贴板标签独立成套(`clip_tags_def`),不复用待办「标签/分组」(groups),互不干扰。
- clips 用自增整型主键(append-only 高频写入),与 app 其余 UUID 表无引用关系。
- 「剪切板」待办标签/便签分组用 find-or-create(兼容中英名),参照 store 既有 `importNotesToImportGroup`。
- `clip-added` 监听在模块层注册一次(`setupClipboardListener`,仅主窗口),避免 StrictMode/HMR 丢监听或重复插入。

**验证状态**:`npm run build` + `cargo check` + `cargo test --lib`(39 passed)全过。未升版本(2.0.0)。**未运行 tauri dev**(本机多 worktree 并行,按任务要求不启动 dev、不 kill 进程)。

**需运行时验证点(交用户走查)**:
1. 复制一段文本 / 一张图片 → 切到侧栏「剪切板」,看是否实时进列表(文本显示文本、图片显示缩略图);连续复制同一内容只记一次。
2. 剪贴项右键「加入待办」→ 待办里出现该条且打了「剪切板」标签(标签看板里有「剪切板」标签);右键「加入便签」→ 便签「剪切板」分组下出现该便签(图片便签能显示图)。
3. 第二侧栏:新建剪切板标签、给剪贴项打标签、点标签过滤、改名/改色/删标签;侧栏宽度拖动/收起持久化。
4. 侧栏顺序:新用户默认 所有待办/已完成/标签/四象限/剪切板/便签;老用户(已有 sidebar_order)升级后「剪切板」补位到四象限后、便签前,既有相对顺序不乱;导航项仍可拖动重排并持久化。

**未决/取舍**:
- 监听用 `clipboard-rs`(ShellPicker 用名,crate 名带连字符);默认开启(有意覆盖「新功能默认关」约定,用户明确要默认开)。当前未做「关闭监听」开关——如需可加设置项 + 监听线程读 settings 判断是否记录。
- 列表上限 500 条(`get_clips` LIMIT 500),未做自动清理/容量上限 GC,后续可加。

---

## 数据存储位置(数据迁移)—— 交接

**背景/目标**:用户要在 设置·通用 新增「数据存储位置」,选新目录后把待办、便签、标签图标、剪贴板(文本与图片)整体搬到新位置。剪贴板文本/图片的存储位置也随之改变。

**实现要点**:
- 所有数据都从 `database::data_dir()` 单一根推导。本轮让它可配置(剪贴板那轮预留的出口):优先读指针文件,否则默认 `%AppData%\MinimalTodoApp`。
- 指针 = `%LOCALAPPDATA%\MinimalTodoApp\datapath`(纯文本)。**为什么放这**:必须是不随数据迁移的固定位置——库自己会被搬走,若指针存库里则搬走后启动读不到指针 → 引导死锁。读指针在 db::init 打开库之前。
- 迁移命令 `migrate_data_dir(new_dir)`:WAL checkpoint → `storage::migrate_data_root`(copy→verify→写指针→标记旧根待清理)→ 改写新库 clips.image_path 前缀。失败回滚、旧数据不动。
- 旧根删除推迟到下次启动(`cleanup_pending_old_root`,db 打开前),规避 Windows 文件锁;有「当前根 != 旧根」安全闸。
- 迁移后需重启(`restart_app` 命令,换壳 bat)。

**改了哪些文件**:
- 新增 `src-tauri/src/storage.rs`(指针读写、迁移、启动清理、重启 bat)。
- `src-tauri/src/database.rs`(`data_dir()` 走 storage、新增 `default_data_dir()`)。
- `src-tauri/src/commands.rs`(`get_data_dir` / `migrate_data_dir` / `restart_app`)。
- `src-tauri/src/lib.rs`(注册 storage 模块、启动调 cleanup、注册 3 命令、加 dialog 插件)。
- `src-tauri/Cargo.toml`(+ tauri-plugin-dialog)、`capabilities/default.json`(+ dialog:allow-open)。
- `src/lib/tauri-ipc.ts`(getDataDir/migrateDataDir/restartApp)、`SettingsPanel.tsx`(UI)、`src/lib/i18n.ts`(双语 S.X.DataLocation*)、`package.json`(+ @tauri-apps/plugin-dialog)。

**运行时验证点**(需跑起来走查):
1. 设置·通用 显示当前数据位置;点「选择新位置」选一个空目录 → 确认。
2. 迁移成功 → 弹「立即重启」→ 重启后:待办 / 便签 / 标签自定义图标 / 剪贴板图片 全部还在且正常显示(尤其剪贴板图片**全尺寸预览**走 image_path 绝对路径,验证前缀已改写)。
3. 旧位置(`%AppData%\MinimalTodoApp` 或上一处)的 todo.db 与三图片目录在重启后被清空。
4. 失败路径:选一个已含 todo.db / 非空 clipboard-images 的目录 → 应中止报冲突,旧数据不动。

**未决/取舍/风险**:
- 校验用「文件数 + 总字节一致」。迁移窗口内剪贴板监听线程若往旧 `clipboard-images` 写新图片,可能导致计数不一致 → 安全地中止迁移(旧数据完好),用户重试即可。可接受;若要更稳可在迁移期间临时暂停监听(当前未做)。
- 迁移用复制(非 rename),跨盘也可靠;同盘大数据量会慢一点,换来 copy→verify→delete 的安全性。

---

## 交接:修复剪贴板监听图片失败(v2.0.0,仅后端)

**背景/根因**:剪贴板后台 watcher 文本正常、图片不进列表。逐行对照 ShellPicker 可用版 `app/src-tauri/src/clipboard.rs`,移植版 `handle`/`handle_image` 调用序列(get_image→to_png→get_bytes→thumbnail)、clipboard-rs(0.3.4)、image(0.25.10)与默认 feature 全部一致——**不是移植丢行**。真因是 Windows 剪贴板「延迟渲染」竞态:变化事件常在图片格式(CF_DIB/CF_PNG,尤其 CF_BITMAP→DIB 合成)落盘前就触发,`has(Image)` 此刻为假 → 落进 text 分支被吞;文本同步渲染故正常。

**改动(只动 `src-tauri/src/clipboard.rs`)**:
- `handle()` 分支判据由 `if self.ctx.has(ContentFormat::Image)` 改为 `if self.image_ready()`。
- 新增 `image_ready()`:最多轮询 5 次、每轮退避 50ms(约 250ms 上限),以「has(Image) 且 get_image() 确能取到图」为最终判据;到位走图片分支,否则回退文本。`handle_image` 体未改。
- 未碰 commands.rs / lib.rs / database.rs / models.rs / 任何前端;time 仍 0.3.47;版本仍 2.0.0。

**验证状态**:`cargo check`(冷 target)通过(本 worktree 无 node_modules/dist,codegen 用一次性占位 `dist/index.html` 过 `generate_context!`,check 后已删,工作树仅 clipboard.rs 改动)。

**运行时验证点(需跑起来)**:
1. 从浏览器/截图工具/画图复制图片 → 剪贴板列表实时出现图片缩略图项。
2. 文本复制仍正常、去重仍生效。
3. 快速连续复制不同图片,均能捕获(竞态退避足够)。

**取舍/风险**:250ms 上限是经验值,极慢的延迟渲染源理论上仍可能超时回退文本;真出现可调大轮询次数。每次图片复制最多多花约 250ms 在 watcher 线程(独立线程,不阻塞 UI),可接受。
## 本轮(2026-06-15):剪贴板视图 5 项打磨

**背景**:剪贴板视图(`ClipboardView.tsx` + 后台监听 `clipboard.rs`)已落地。本轮按用户反馈打磨 5 点:右键编辑/复制、拖拽打标签、标签过滤、单标签、搜索。**`clipboard.rs` 是另一 agent 的地盘,本轮全程未碰**。

**做了什么**:
1. 右键「复制」:`copy_clip` 命令(commands.rs)用 `clipboard-rs` 写回系统剪贴板(文本/图片)。
2. 右键「编辑」:独立原生窗口 `clip-editor`(便签式 Markdown,左编辑右预览,手动保存,未保存关闭三选确认)。
   - 建窗 `open_clip_editor_window`(**async**,避免主线程死锁);待编辑 id 经 `ClipEditorTarget(Mutex)` 暂存 + `take_clip_editor_target` 取走(不用 URL query);复用经 `clip-editor-target` 事件;保存经 `clip-updated` 回同步主窗口。
   - 前端 `main.tsx` 按 label 路由到新组件 `ClipEditorWindow.tsx`;capabilities 加 `clip-editor` 窗口 + `allow-destroy`。
3. 拖拽打标签:`ClipRow` 拖源(type `clip-item`)、标签行/收起按钮 dropTarget(`canDrop` 只认 `clip-item`),落下即单标签。
4. 单标签:`set_clip_item_tag`(先清后写,至多 1);store `setClipItemTag` 替换 `toggleClipItemTag`;菜单加「无标签」清空项。
5. 搜索:列表上方搜索框,按 `clip.text` 前端过滤(与标签筛选叠加)。

**task3 过滤根因结论**:`main` 上菜单路径的过滤逻辑本就正确(number 比较、includes 对齐、乐观更新本地 tag_ids),无可复现 bug;本轮统一单标签后过滤与之一致,菜单/拖拽打标签后点该标签都能筛出。若用户仍复现「看不到」,优先怀疑后台监听把同内容重新入库成**新 id**(新项无标签),需结合 clipboard.rs owner 排查。

**验证**:`npm run build`(tsc 严格)+ `cargo check` + `cargo test --lib`(40 passed)全过;time 仍 0.3.47;版本仍 2.0.0;未启动 dev。

**运行时验证点**(需跑起来走查):
1. 文本项右键「编辑」→ 弹独立窗口;改文字 → 关闭弹三选;点「保存并关闭」→ 主窗口该项文本更新;「不保存关闭」→ 不变;「取消」→ 留在编辑窗。点底部「保存」后直接关窗不应再弹确认。
2. 右键「复制」:文本/图片项复制后,去别处 Ctrl+V 应得到该内容(注意会作为新项回到列表顶部)。
3. 拖拽:把某剪贴项拖到第二侧栏某标签(展开/收起态都试)→ 打上该标签且替换原标签(单标签)。
4. 单标签:右键标签菜单选 A 再选 B → 只剩 B;选「无标签」→ 清空。
5. 过滤:打标签后点侧栏该标签 → 能筛出该项。
6. 搜索:输入关键词 → 按文本过滤;清除恢复;与标签筛选可叠加。
7. 图片项:右键无「编辑」(仅文本可编辑);编辑窗对图片项显示提示文案。

**未决/取舍**:
- 复制写回会触发后台监听把同内容重新入库置顶(与 ShellPicker 一致),可接受;若不想置顶需在 clipboard.rs 侧加「自写忽略」(非本轮范围)。
- 编辑窗口载入用 `getClips()` 全量按 id 找(无单条命令),列表上限 500,量小可接受。
