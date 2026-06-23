# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这是什么

MinimalTodoApp v2 —— Windows 本地待办应用,**Tauri v2 重写版**(旧 C#/WPF 版完整保留在 `legacy/`,数据可自动迁移)。Rust + rusqlite(SQLite WAL)做后端,React 19 + TypeScript + Tailwind CSS v4 做前端,Zustand v5 以 `currentView` 条件渲染取代路由。便携单 exe 分发(约 10 MB,需系统 WebView2),含 102 套主题、中英双语、托盘、贴边停靠、基于 GitHub 的自动更新。

## 命令

需要 Node ≥ 20 与 Rust stable-msvc(`cargo` 在 `%USERPROFILE%\.cargo\bin`)。

```powershell
npm run tauri dev            # 开发模式(vite 1420 端口 + cargo run,改 Rust 会自动重启)
npm run build                # tsc 严格检查 + vite 产物
npx tauri build --no-bundle  # 发布便携 exe → src-tauri\target\release\minimal-todo.exe
.\release.ps1                # 完整发布:构建 → FileVersion 校验 → tag → GitHub Release 上传
node scripts/convert-legacy-assets.mjs   # 从 legacy/ 重新生成主题 JSON 与 i18n 词典
```

**没有测试套件**,改动通过运行应用验证。端口 1420 残留进程:`taskkill /F /IM minimal-todo.exe`。

## 架构

**单一数据源:`src/store/useAppStore.ts`(Zustand)**。持有任务/标签/便签/设置/主题/语言/视图状态,动作 = 乐观更新本地 + 调 IPC。视图分发在 `App.tsx`:`view.kind`(all/completed/quadrant/tagboard/notes/group)条件渲染,无路由。

**IPC**(`src/lib/tauri-ipc.ts` ↔ `src-tauri/src/commands.rs`):全部命令的强类型封装。**约定:invoke 参数名与 Rust 形参完全一致(snake_case);补丁式更新可选字段传空串 `""` 表示清空,省略表示不变**(serde 三态)。

**持久化**(`src-tauri/src/database.rs`):SQLite 于 `%AppData%\MinimalTodoApp\todo.db`,WAL + synchronous=NORMAL。表:tasks / groups / notes / note_groups / custom_themes / settings(KV,40+ 标量设置全在这)。版本化迁移用 `PRAGMA user_version`,只向前追加。内置视图(全部/已完成/四象限/标签看板)不入库。**日期一律 `"YYYY-MM-DD HH:mm"` 空格分隔文本**(date-only 为 `"YYYY-MM-DD"`)。

**旧数据迁移**(`src-tauri/src/import.rs`):首启检测同目录旧 `data.json`(**PascalCase** + ISO8601 带时区),库为空且无 `imported_at` 标记时一次性导入,原文件不动。

**主题**(`src/lib/themes.ts` + `index.css`):三个家族共 12 套 —— 玻璃(glass/glass-ocean/glass-forest/glass-sunset,共用 `.glassy` 面板体系,渐变底在 `App.tsx` 的 BACKDROPS 表)、浅色(light 白侧栏基线 = `:root`,light-lavender/light-mint/light-sand 变体)、深色(dark 海军蓝基线 = `.dark`,dark-midnight/dark-mocha/dark-emerald 变体)。变体 class 名即主题键,只覆盖少量 token。变量经 `@theme inline` 映射成 Tailwind 语义色(`bg-card`/`text-text-1` 等);**侧栏有独立 token 组**(`--sidebar-*`)。新增变体:VALID_THEMES(themes.ts)+ index.css 变体块 + TitleBar THEME_OPTIONS 图标(玻璃系另加 BACKDROPS 渐变)。旧主题键启动时自动迁移(有效保留,其余→glass)。

**本地化**(`src/lib/i18n.ts` + `src/i18n/{zh,en}.json`):旧版 501 键全量 + `S.X.*` 补充键(EXTRA,词典同名键优先)。`t()`/`f()` 对齐旧版 Loc 语义,缺键回显键名。语言切换 = App 根节点 `key={language}` 整树重建。

**窗口外壳**(`src-tauri/src/window.rs`):托盘、贴边自动隐藏(Moved 事件检测吸附 + 150ms 轮询线程收起/唤出,QQ 式鼠标离开即收,`dock_edge` 持久化)、亚克力、自启。单实例用 tauri-plugin-single-instance(注册必须最先)。自绘标题栏:`decorations:false` + `data-tauri-drag-region`。

**自动更新**(`src/lib/updater.ts` + `src-tauri/src/updater.rs`):前端 fetch GitHub `releases/latest`(api.github.com 允许跨域)+ SemVer 三段比对 + 流式下载;字节经**原始 IPC**(invoke 传 Uint8Array,文件名放 header)交 Rust 写盘,bat 等旧进程退出后带 `--updated-from` 启动新版,新版启动回收旧 exe。保持便携 exe 模型,不用 tauri-plugin-updater。

**弹层约定**:一律 `ui/Popover.tsx`(Portal 到 body + fixed 定位),z 分层:弹层 50 / 右键菜单 200 / 模态 300。拖拽用 @atlaskit/pragmatic-drag-and-drop(`hooks/useSortableItem.ts` + 各视图 monitor),列表动画用 auto-animate。

## 发布

同步递增三处版本:`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`package.json`,更新 `release-notes.md`,提交后 `.\release.ps1`(tag 已存在会中止;FileVersion 与 conf 版本不一致会中止)。认证 `$env:GH_TOKEN` 优先,否则 git 凭据管理器。

**发布 token 约定(必守)**:GitHub token 放在 `C:\Users\wangchao\Desktop\tk.txt`。**含敏感信息——严禁打印、回显、写入任何文件 / 日志 / 提交 / 聊天记录**;只在命令运行时从该文件即时读取(如 git 凭据助手内 `cat` 该文件、或 PowerShell `Get-Content` 进变量)用于 push / GitHub API 认证,绝不让 token 出现在任何命令字符串或输出里。**重发同名版本(re-release)**:`release.ps1` 见 tag 已存在会中止,故走手动流程——构建并校验 FileVersion → 强制移动 tag 并 `push --force` → GitHub API 删旧同名资产 + 上传新资产 + PATCH release body(用 `release-notes.md`)→ 下载校验 SHA256。

## 称呼

- 回答问题时称呼用户为**主人**。

## 每轮改动工作流(必做)

**顺序:做完需求 → 先 run 起来让主人验证 → 再记录文档 → commit(不 push)。** 无特殊说明时一律按此顺序。

1. **做完就先 run 起来让主人验证**:无特殊说明时,每轮做完先把应用跑起来(`npm run tauri dev`)交主人走查,**验证后再记录文档**。
2. **记录用户提示词(双文件)**:用户每说完一条需求就记。
   - `prompts_origin.md`:追加**原始提示词原文 + 时间戳**(不是概括/提炼后的内容;**若被要求读某 md 文档,第一次读时把文档内容也原文记录,之后反复读时内容没变就不再重复记录**)。
   - `prompts.md`:追加**提炼后的内容 + 落地结果 + 时间戳**。
   - 两文件均不存在则创建、存在则续写,**剔除敏感信息**(密钥、token、隐私等)。
3. **改动记录到 `release.md`**:每次改动后,把**本次修改 + 当前时间**按**当前版本号**记到根目录 `release.md`(不存在则创建,存在则续写,剔除敏感信息);记录带版本号,平时可详细写,正式 release 时再据此汇总精简。**用户没说改版本号就绝不擅自提升**;没说版本号即沿用上次版本号,保持不变。
4. **做完即 commit,但不 push**:每轮做完就本地提交(中文消息,结尾带 Co-Authored-By);**等主人通知才 push / release**。
5. **做完即写交接文档**:每轮做完更新根目录 `handoff.md`(不存在则创建,存在则续写,剔除敏感信息),讲清背景/进度/下一步,随时准备让其他人接手继续工作。

## 工作风格(必守)

6. **不要假设主人清楚自己想要什么**:动机或目标不清晰时,停下来讨论;**主人提的需求有疑问点,停下来问主人,不要自己做决定。**
7. **目标清晰但路径不是最短的**:直接告诉主人,并建议更好的办法。
8. **遇到问题追根因,不打补丁**:每个决策都要能回答"为什么"。
9. **输出说重点**:砍掉一切不改变决策的信息。

## 环境约定(必守)

- **GitHub token 在桌面 `tk.txt`**,push **优先用 token 推送**(敏感信息约定见下方「发布 token 约定」,严禁外泄)。
- **安装软件默认不装 C 盘**,装到 `D:\BaiduSyncdisk\app\${软件名称}` 下。

## Clean Code 规范(编写 / 重构 / 审查代码必守)

保持代码优雅、可读、易维护:

1. **见名知意**:变量、函数、类名准确表达意图与职责;严禁无意义缩写(如 `tmp`、`data`、`fn`)或单字母变量(循环计数器除外)。
2. **单一职责 + 自解释**:一个函数只做一件事,尽量控制在 **50 行以内**,逻辑变复杂立即拆子函数;优先用清晰逻辑与命名让代码自解释,注释只解释**为什么(Why)**,绝不写解释**在做什么(What)**的废话注释。
3. **拒绝重复(DRY)**:严禁复制粘贴相似逻辑,有重复倾向就抽象 / 提取公共模块。
4. **优雅的错误处理**:显式优雅处理异常,**严禁空 `catch` 块**;返回值清晰明确,避免滥用 `null` 或返回含糊的魔法值。

## 🤖 多任务处理机制(Multi-Agent Workflow)

**触发条件**:当识别到用户的输入包含「多个且相互独立」的任务时,必须自动触发此机制。

**执行准则**:不要在一个回答里笼统处理,必须采用「多智能体模拟(Multi-Agent)」模式:

1. **任务分发**:作为「总调度师」,先梳理出共有几个独立任务。
2. **生成 Agent**:为每个任务动态分配一个最专业的虚拟 Agent(如:资深前端、数据分析师、文案总监等),并赋予其独立视角。
3. **隔离执行**:每个 Agent 独立处理自己的任务,严禁任务间的逻辑与上下文互相干扰。
4. **格式化输出**:必须按以下结构输出结果:
   - **📋 调度总览**:列出任务及对应的 Agent。
   - **🧑‍💻 [Agent 1 名称]**:输出任务 1 的结果。
   - **🧑‍🎨 [Agent 2 名称]**:输出任务 2 的结果。
   - …(以此类推)

> 注:此处「虚拟 Agent」指单条回复内的分角色组织/呈现方式;与真正后台并发的 Agent 工具(隔离 worktree/进程)是两回事——是否真的开后台 Agent 仍按需要与用户意图判断。

## 约定与坑

- 源码注释与提交信息用**中文**;`release.ps1` 刻意全 ASCII(构建脚本约定)。
- **`time` crate 钉在 0.3.47**(Cargo.lock):0.3.48 与 Rust 1.96 有 E0119 冲突,不要盲目 `cargo update`。
- vite 8 配 @vitejs/plugin-react 6(peer 要求);vite 8 已弃用 `minify:"esbuild"`;`server.watch` 必须忽略 `**/src-tauri/**`,否则 cargo 产物让 watcher EBUSY 崩溃。
- 新增持久化设置:直接 `saveSetting(key, value)` 写 settings 表,无迁移成本;新功能默认值保持向后兼容(默认关闭,不改老用户行为)。
- 新增主题颜色变量需同步:`index.css` 的全部 5 个主题块(`:root`/`.dark`/`.glass`/`.warm`/`.lumina`)与 `@theme inline` 映射。
- i18n 双语必须同步加(EXTRA 的 zh 与 en 两份)。
- **Tauri 命令多词裸参数必须加 `#[tauri::command(rename_all = "snake_case")]`**:默认期望 camelCase,snake_case 键对 String 直接报错、对 Option 静默变 None(曾致 `create_note(group_id)` 失效)。req 结构体参数不受影响。
- **CSS 动画别在 keyframes 里写 `transform: translate(...)` 与 Tailwind v4 的 `-translate-*` 叠加**:v4 的 translate 是独立 CSS 属性,二者会双重位移;keyframes 只动 scale/局部位移。
- **运行时建窗的 Tauri 命令必须 `async`**:同步命令在主线程执行,`WebviewWindowBuilder::build()` 在 Windows 需主线程消息循环创建 webview,主线程被命令阻塞即死锁(整 app 卡死)。多窗口(如独立设置窗 `open_settings_window`)用 `pub async fn`。
- **多窗口前端按窗口 label 路由**(`getCurrentWindow().label`),别用 URL query——`WebviewUrl::App("index.html?x=y")` 的 query 不作为路由会白屏。跨窗口设置同步走 `emit/listen("settings-changed")` + 模块层注册一次的 `setupSettingsSync`(勿放 React effect,StrictMode/HMR 会丢监听)。
- **全局字号要缩放根 `html` font-size**(Tailwind 文字皆 rem 才会等比缩放);写 `body { font-size }` 会被 `text-*` 覆盖。便签字号/行距经 `.note-prose` 上的 `--note-*` 变量生效(prose 自带 font-size 会盖掉父级继承)。
- **清空 settings 表时务必保留 `imported_at`**(还有 `language`):删了它下次启动会误触发旧 `data.json` 重导入(见 `reset_settings`)。
