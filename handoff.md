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

## 三、⚠️ 当前未提交的工作(本会话积压的一大批 UI 打磨)

最后提交是 `0b9a598`。其后一连串小轮**尚未提交**,核心是「标签简化 + 侧栏统一打磨 + 右键改色 + 工作流文档化」:

- **标签简化**:删除 `src/components/TagSidebar.tsx`(标签第二侧边栏整体移除);主侧栏「标签」改回普通导航行,点击直接进**全宽标签看板**(`views/TagBoardView.tsx` 全宽渲染,无第二侧栏);保留任务-标签归属数据与后端。`App.tsx` 去掉 `group` 分支,`tagboard` 直接全宽。
- **右键改色**:新增通用 `src/components/dialogs/ColorDialog.tsx`,主侧栏导航项(`nav_color_<key>`)、便签分组(`notegroup_color_<id>`)、标签(`group.color`)统一「默认无色 + 右键菜单『修改颜色』」;`TagColorDialog` 加「无色」清除。
- **标签颜色清空**:Rust 迁移 **v2**(清历史默认蓝 `#3B82F6`)、**v3**(清空所有标签色),`create_group` 默认色改空串——见 `src-tauri/src/database.rs` / `commands.rs`。
- **侧栏统一**:一/二侧栏图标统一 14 号、位置对齐;折叠按钮统一置底;折叠态图标默认 `text-sidebar-strong`(不再 hover 才显色);`TaskItem` 待办圆圈左内距缩半(`pl-1.5`)。
- **便签折叠态镜像树**(`views/NotesView.tsx`):第二侧栏收起为图标列时按分组呈现——展开分组铺开便签 `FileText` 图标,折叠分组只显示一个 `Folder` 分组图标(点击展开)。
- **文档/工作流**:`优化记录.md` → `git mv` 为 `prompts.md`;`CLAUDE.md` 新增「每轮改动工作流」1–5 +「工作风格」6–9;新建本 `handoff.md`(由旧 `交接文档.md` 重命名而来)。

`npm run build` 已过,无 TS 错。**接手第一件事:按规则 3 做一次中文本地 commit(把这批一起提交,不 push)。**

## 四、近期已提交的大事(committed,均未 push)

- `0b9a598` 侧栏彩色化与收起图标化 + 设置面板重排 + 便签字体双开关。
- `ccc3478` 标签/便签改回独立第二侧边栏 + 支持调宽与收起(注:标签第二侧栏在 §三 中又被移除)。
- `1df529a` 主题精简重做为 15 套 + 新增 `docs/tech-stack.md`。
- `4ba7844` 设置改为独立原生窗口 + 字体修复 + 恢复默认 + 默认主题 light。
- `14cbe50` 侧栏导航项可拖动排序 + 模态框标题栏可拖动移位。
- 更早见 git log 与 `prompts.md`。

## 五、🚫 已尝试并「整体回退」的实验(别重做,除非用户明确要)

- **最小化「缩小飞向托盘」动画**(genie):CSS 版与 framer-motion 版都试过,效果不满意,已回退。
- **framer-motion**:引入过又**彻底卸载**(package.json 无)。列表动画用 `@formkit/auto-animate`,弹窗用 CSS `modal-in`。

## 六、开发与自测

- 跑:`npm run tauri dev`(vite 1420 + cargo run,改 Rust 自动重启;改 `tauri.conf.json`/`capabilities` 要完全重启)。
- **多项目并行注意端口**:本项目 vite 固定 1420、`devUrl=localhost:1420`。若同时跑别的 Tauri 项目(如 ShellPicker),两边 devUrl 撞 1420 会导致**对方窗口加载本项目前端**、报 `Command get_tasks not found`(串进本项目 vite 日志)——这不是本项目 bug,让对方改端口即可。
- **进程清理要精确**:只针对本项目 `minimal-todo.exe`,**别按端口杀进程、别按名通配**,以免误伤其它项目。
- 数据库 `%AppData%\MinimalTodoApp\todo.db`。预览某主题/视图最稳:停应用 → 写 `settings` 表 → 重启。
- 截图自测坑:合成点击/拖拽不可靠(拖拽/文件框/动画手感让用户手测);PowerShell 截图先 `SetProcessDPIAware()`;贴边隐藏会把窗口停到屏外(删 `settings.dock_edge` 拉回);IME 易把英文合成成中文。

## 七、当前 UI 结构速记

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
