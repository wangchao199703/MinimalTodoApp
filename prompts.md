# MinimalTodoApp v2 提示词记录(prompts.md)

> 本文逐轮记录用户的原始提示词、对应改动与提交 hash。
> 2026-06-12 起,项目从 C#/WPF 整体重写为 Tauri v2 + Rust(SQLite) + React 19(详见 CLAUDE.md)。
> 旧 WPF 版完整保留在 `legacy/`。

---

## 一、整体重写:WPF → Tauri v2(里程碑 M1~M8)

**提示词(原文):**
> D:\BaiduSyncdisk\code\todo-flow-master 参考这个项目对当前项目重启,这个是重构后的技术栈。最终技术栈清单(The Endgame Stack):Tauri v2 / Rust + rusqlite(SQLite WAL)/ React 19 + TypeScript / Zustand v5(currentView 条件渲染,零路由)/ @atlaskit/pragmatic-drag-and-drop / Tailwind CSS v4 + lucide-react / @formkit/auto-animate。目录结构 src-tauri + src/...

四个确认决定:完整对齐旧版全部功能;旧 WPF 工程移入 `legacy/`;首启自动导入旧 data.json;参考项目只借鉴架构不拷代码。后续多次「继续」推进里程碑。

| 里程碑 | 内容 | commit |
|---|---|---|
| M1 | 工程骨架 + 任务/标签 CRUD + 拖拽 + 明暗主题 + 持久化 | `59d1d16` |
| M2 | 子待办/优先级/截止倒计时/六种排序/周期提醒/四象限/标签看板 | `3ddc223` |
| M3 | 旧版 data.json 首启自动导入(PascalCase + ISO8601) | `e09df3f` |
| M4 | 102 套内置主题 + 主题编辑器 + 中英双语(501 键) | `26ef3b7` |
| M5 | 托盘/单实例/开机自启/亚克力/贴边停靠/置顶/特效音效/设置面板 | `25d61b0` |
| M6 | 便签(Markdown)+ 日程面板 + 国内节假日日历 | `07a5db3` |
| M7 | 自动更新 + 便携 exe 发布链路(包体 63MB→9.8MB) | `cf9d054` |
| M8 | 重写 CLAUDE.md/README/release-notes + 全量回归 | `0cd6f4b` |

---

## 二、主题系统重做

**提示词:** 主题抄一下 todo-flow-master 这个项目,改成和这个项目一样,之前的主题不要了。
- 废弃旧 102 套,改为 todo-flow 同款方案(CSS class 切换)。`60dfe00`

**提示词:** 主题不对,原来的主题左上角和左下角一样的,现在的主题左上角没有被应用;改为和我提供的另外的项目一致;注意参考的项目,左边侧边栏都是一样颜色,右边是另外一种颜色;主题 glass 也对不上,好好对比一下。
- 布局对齐 todo-flow(侧栏整列直通顶部);Glass 改为应用内深蓝渐变底 + 白磨砂玻璃面板;Warm 渐变底。`6a8e84a`

**提示词:** 只保留 glass 主题,然后参考这个 glass 创建几个同风格的主题,颜色不一样;再来几套经典的主题,比如浅色,深色。
- Glass 玻璃拟态家族 4 色(Glass/Ocean/Forest/Sunset)+ 经典 Light/Dark。`3980b12`

**提示词:** light 左边也改为白色,再加几套浅色系主题和深色系主题。
- Light 侧栏改纯白;浅色 +Lavender/Mint/Sand,深色 +Midnight/Mocha/Emerald。`c7d9c76` `912e7ed`

**提示词:** 将左上角的设置移动到右上角,放在最小化左边;参考我之前的 wpf 项目的主题,再来几套浅色系主题。
- ☰ 菜单移到右上角(最小化左边);移植旧 WPF 的 Rose/Sage/Haze/Clay 四套浅色主题(原始 hex)。`d3d0ab9`

**提示词:** 再看看旧版有没有好看的主题,再搬迁几套过来,顺序是浅色,深色,渐变这样排序,主题点击下拉的时候需要把色系展示在图标旁边。
- 再移植 Meadow + Nord/Slate/Graphite/Teal;菜单重排(浅色→深色→渐变)+ 每项色系色板。共 21 套。`4d2c94b`

**提示词:** glass 加个浅色和深色主题。
- 玻璃家族 +Frost(浅色玻璃)/Noir(深黑玻璃)。共 23 套。`605f0f0`

---

## 三、侧栏

**提示词:** 左边侧边栏支持折叠,折叠后只展示图标,用色块高亮当前选中项目。
- 底部折叠开关;折叠态 48px 只剩图标,选中项色块高亮。`ca6b3be`

**提示词:** 将标签全部放到标签下面,作为二级选项,标签增加可折叠按钮,默认是折叠的 →(纠正)标签不用单独分组,直接用上面的标签,不要两个标签。
- 去掉重复的「标签」标题,标签收为导航「标签看板」项的二级折叠子项(默认折叠)。`cc57cdc`

---

## 四、标签看板 / 四象限

**提示词:** 标签参考之前的 wpf 项目,容器大小自适应,并且用瀑布流。
- 标签看板改瀑布流(对齐旧版 MasonryPanel,列数随容器宽自适应)+ 禁用 WebView 默认右键菜单。`e25689d`

**提示词:** 四象限和标签的容器不够明显,参考一下之前的 wpf 应用。
- 容器加边框 + 彩色淡底图标徽章头(对齐旧版)。`b1da3a9`

**提示词:** 标签为空的,不需要再标签里面展示。
- 空标签卡不上看板。`510e267`

---

## 五、日历

**提示词:** 日历参考一下之前的 wpf,大一点,可以看到待办,可以拖动待办过去 →(纠正)日历不是单独的,而是在已有的基础上弹出来的,这样才可以拖进去待办。
- 日历改为右侧并排弹出面板(主列表可见,可拖待办进日历某天设截止)。`6ef3bc6`

**提示词:** 日历效果不对,参考一下之前的,日历和待办之间要可以拖动。日历下面还多了一行,下个月的不用展示。
- 面板加可拖分隔条调宽 + 月历行数自适应(5/6 行,不显示多余下月整行)。`7974127`

**提示词:** 拖动日历的时候待办不能动,只改变日历的大小 → 日历左边和待办相交的地方不能动 → 你看一下之前 wpf 的代码,点击日历待办窗口大小不变、右边多出日历;拖动日历不影响待办大小,改待办只能拖中间。/ 问题很大,点击日历后待办缩小了,待办应该保持不变。
- 完整对齐旧版 OpenSchedule:点击瞬间锁定待办宽度,窗口向右扩出日历(待办纹丝不动);待办固定、日历弹性列;补自绘窗口边缘缩放(ResizeBorders)。`3e5b0a3`

**提示词:** 日历要支持日视图、周视图、月视图;日历打开会闪屏,加点动画,让日历打开慢一点。→ 动画太慢搞快点,日/周/月三个按钮固定在右边。
- 日/周/月三视图切换(持久化,默认月);打开窗口宽度 rAF 平滑动画 + 日历淡入滑入(160ms)防闪;视图按钮固定最右。`cde69bc`

**提示词:** 动画实在是太慢了,缩短为原来的 1/4 时间。→ 日历弹出的动画,你直接抄原来 wpf 的动画吧。
- 照抄旧版 `Anim.FadeSlideIn(dx:24)`:窗口宽度**瞬时**变化(旧版注释:保持瞬时避免与贴边/最大化/分隔条竞态),面板内容淡入 200ms CubicEase.EaseOut + 右滑入 24px 280ms BackEase 弹簧(轻微过冲);删除 rAF 窗口宽度动画。`daabd4e`

---

## 六、设置与窗口行为(2026-06-13)

**提示词:** 设置参考一下之前的分组,不要一页,用不同的分组来实现;现在窗口贴边会触发 Windows 的全屏,需要屏蔽。
- 设置对话框改为左侧分组导航(对齐旧版 S.Settings.Nav.*):待办(特效/音效/提醒音/四象限口径)、便签(独立字体,空=继承全局)、通用(自启/节假日)、字体(全局字体/字号/行距)、关于(版本号/自动更新)。
- tauri.conf 窗口加 `maximizable:false`(移除 WS_MAXIMIZEBOX):拖窗口到屏幕顶边不再触发 Windows Snap 全屏,自有贴边停靠不受影响;程序化最大化按钮仍可用(已验证 1752→2582)。`22fb6a1`

**提示词:** 现在贴窗口不会自动隐藏,参考一下之前 wpf 的实现逻辑。
- 根因:旧实现等「鼠标离开窗口」才收,拖完松手鼠标天然在窗口上 → 表现为不自动隐藏。
- 对齐旧版 TryDockAfterDrag/DockTo/HideToEdge/探针语义重写(window.rs):拖入贴边区置 pending,左键松开(GetAsyncKeyState 判定)后对齐到边并**立即收起**;唤出后再收起需鼠标带 60px 缓冲连续离开约 450ms;左键按住不收。顺带修复启动恢复失效(setup 时拿不到 monitor → 改由轮询线程首拍处理,真机验证重启自动贴回)。`85901f3`

**提示词:** 帮我写个交接文档放在根目录下面,我让另外的 claude 继续干活,讲清楚背景,两个文档 优化记录.md 和 release.md;继续进行旧版软件的迁移。
- 新建 `交接文档.md`:项目背景、两个记录文档的硬性约定、当前状态(未推送/未发布/贴边待复核)、**待迁移功能清单**(任务编辑对话框/删除确认/标签改色改图标/清空已完成/快捷提醒/便签图片与拖拽/帮助/导入导出等,均附 legacy 源码位置)、动手前 checklist。`c63a878`

**提示词:** 收起侧边栏的改为图标和文字,和上面的统一逻辑。→ 折叠后多了个横的滚动条,展开状态标签是折叠的,折叠状态下也保持折叠。
- 底部折叠/展开按钮复用 NavRow(展开态图标+文字,图标态只剩图标,样式与导航行一致)。
- 修横向滚动条:图标态容器内边距 p-2→p-1(36px 按钮 + 8px < 48px)并 overflow-x-hidden。
- 标签区折叠状态(tags_section_collapsed)在图标态同样生效:折叠时图标态不再显示标签图标列。`c63a878`

---

## 七、旧版功能迁移(2026-06-13)

**提示词:** D:\BaiduSyncdisk\code\todo_project\交接文档.md 读这个文档继续干活
- 按交接文档「待迁移清单」完成高优先级四项(均对齐 legacy 行为):
- **任务编辑对话框**(`dialogs/TaskEditDialog.tsx`,对齐旧版 TaskEditDialog):右键任务→「编辑」弹出,改标题(留空保留原标题)/优先级三档圆点 chip/截止日期(启用开关 + 日期 + 时 + 分 5 分钟步进、回填取最近一档),保存走 patchTask 并清象限覆盖。
- **删除确认**(`ui/ConfirmDialog.tsx`,对齐旧版 ConfirmDialog):命令式 `await confirm({title,message})` + App 挂载 ConfirmHost(z-300,Esc 取消/Enter 确认)。接入:删任务(区分含子任务文案)、删标签(提示其下任务变无标签)、删便签/便签分组(复用旧版 S.Note.*Confirm 键)、清空已完成。
- **标签改颜色/图标**:`lib/groupIcons.ts` 移植旧版 GroupIcons.cs 六分类 Segoe Fluent Icons 码位;`dialogs/IconPickerDialog.tsx` 分类字形网格点击即应用(选字形清空 icon_image,对齐旧版);`dialogs/TagColorDialog.tsx` 12 色预设点击即应用 + 原生取色器自定义(防抖落库)。侧栏标签行与标签看板卡片头均加右键菜单(重命名/修改颜色/更改图标/删除),图标渲染统一走 `ui/TagIcon.tsx`(有字形用 Segoe 字体着色显示,旧数据导入的字形直接复活;无字形回退 lucide Tag)。store 新增 patchGroup。
- **清空已完成**(S.Group.ClearCompleted):已完成视图标题栏加按钮,确认后 store.clearCompleted 逐条删除。
- i18n 新增 EXTRA 键(zh/en 双语):S.X.ConfirmDeleteTask / ConfirmDeleteTaskTree / ConfirmDeleteTag / ConfirmClearCompleted。
- 未迁移残留:图标选择器的「自定义图片导入」(旧版 OpenFileDialog + group-icons 目录)本轮未做,需要 dialog 插件/资源协议支持,留待后续。`54ce44c`

**提示词:** 贴边隐藏太敏感了，抄一下之前的要有动画
- 根因:收起/唤出都是 `set_position` 瞬移(无动画),且探针节拍 150ms×3 拍与旧版不同,瞬移+粗节拍叠加显得突兀敏感。
- 照抄旧版动画语义(window.rs):收起 = 220ms CubicEase **EaseInOut** 滑出(HideToEdge),唤出 = 220ms CubicEase **EaseOut** 滑入(ShowFromEdge);动画在探针线程内阻塞执行,天然等效旧版「动画期间探针不响应」(`_isDockAnimating`),动画全程置 moving 标志屏蔽 Moved 误判。
- 探针节拍对齐旧版:150ms→90ms,防抖阈值 3→5 拍(90×5≈450ms 与旧版 OutsideTickThreshold 一致)。
- 启动恢复贴边仍瞬时收起不播动画(对齐旧版 `HideToEdge(animate:false)`,boot_restore 一次性标志);拖拽贴边松手后先瞬时对齐到边再滑出(对齐旧版 DockTo 先归位再动画,避免斜向飞跃)。`7e3f269`

**提示词:** 参考之前的wpf的动画，给新的应用加上动画；给便签加上md支持，支持输入md语法实时生效；再次对比和wpf缺失的功能，补齐；进行功能测试，修复所有的功能bug；注意旧版没有支持md,我们这次加上实时渲染md，支持插入图片；注意我们有sqlite了，文本不要存json，存sqlite
- **动画体系移植**(index.css 新增 Anim 规范 CSS 动画,对齐旧版 AnimationHelper:Base 200ms CubicEase 淡入 + Emphasis 280ms BackEase 弹簧):模态框/确认框进场缩放淡入(`modal-in`,全部 Modal 复用)、弹层/右键菜单 Fast 档下滑淡入(`pop-in`)、中央区视图切换 IntroScaleFade(`view-in`,App.tsx 重触发 class 不重挂、保住 QuickAdd 草稿)、日历切视图 IntroScaleFade + 翻页 FadeSlideIn(dx:±24 方向感)、Toast 上方滑落。
- **便签实时 Markdown(新增,旧版没有)**:tiptap v3(@tiptap/react + starter-kit + @tiptap/markdown + task-list/task-item + image + text-style)替换 textarea/预览切换;输入 `# `、`- `、`- [ ]`、`**粗**` 等语法实时生效(input rules),工具栏对齐旧版(标题循环/粗斜删/代码/列表/任务/字色/插图);正文仍以 Markdown 文本存 SQLite notes.content。旧版 `<color=#x>` 标记转 span 实时着色(实测用户便签红绿色已正确渲染),`<img=fn>` 转标准图片节点。
- **便签插入图片(新增)**:工具栏选图/粘贴/拖入三路,字节走原始 IPC 由 Rust 存 `%AppData%\MinimalTodoApp\note-images`(沿用旧版 NoteImageStore 目录),正文只存 `noteimg://文件名`,渲染经 asset 协议(tauri.conf 开 assetProtocol + scope)。
- **补齐缺失功能**:新任务快捷提醒(QuickAdd 铃铛 + ReminderPicker 快捷档/自定义值×单位,对齐旧版 S.ChooseReminder);帮助对话框(S.Help.* 全套,略去语音输入等新版不存在项);导入导出 Markdown(对齐旧版 MarkdownService 格式:## 分组 + `- [ ]` + 两空格缩进层级,导出写桌面、导入文件选择解析重建层级);便签拖拽排序/拖入分组(NotesDropHandler 语义);完成音效复刻旧版双声上行钟音(A5→E6 泛音+指数衰减,替换三连音);托盘菜单随语言即时重建(rebuild_tray 命令)。
- **实测修复 2 个 bug**:① Tailwind v4 的 -translate-x-1/2 是独立 translate 属性,模态进场 keyframes 再写 transform:translate 会叠加双倍偏移(帮助框飘到左上角被裁切)→ keyframes 只动 scale;② Tauri 命令多词裸参数默认期望 camelCase,`export_file(file_name)` 直接报错,且暴露**存量隐性 bug**:`create_note(group_id)`/`update_note_group(is_collapsed)` 的 snake_case 键被静默当 None(分组里新建便签、便签分组折叠从未真正生效)→ 三命令加 `#[tauri::command(rename_all = "snake_case")]`。
- 实测通过:便签编辑/着色/撤销/自动保存、帮助、导出(桌面文件格式正确)、快捷提醒建任务、删除确认、日历开关/翻页。图片粘贴与导入(文件对话框)留用户手测。`7840570`

**提示词:** 将标签的折叠按钮平时硬撑，鼠标移动到上面才展示；新建按钮也是；做点动画效果，然后标签和其他的侧边栏的图标和文字对齐
- 标签行重构为与 NavRow 完全同版式(px-2 + gap-2,图标/文字与所有待办等行对齐;原左侧常驻箭头列是错位根源)。
- 折叠箭头 + 新建按钮移到行右侧,平时 opacity-0 且不可点,悬停 150ms 淡入(计数同步淡出让位);箭头改单个 ChevronRight,展开态 transition 旋转 90°。`2bc4b8a`

**提示词:** 现在的滚动条太粗了，参考一下之前的wpf，修改为细长的滚动条
- 全局 `::-webkit-scrollbar` 样式对齐旧版 ScrollThumb 规格:7px 槽内留 2px 透明边 → 可见滑块 3px 圆角细条;轨道/角落透明、无箭头按钮;默认 `#55888888` 同款 rgba(136,136,136,.33),悬停/拖动加深为 `#99888888` 同款 .6;滑块最短 28px。之前完全没写滚动条样式,是 Chromium 默认粗条。`25697fd`

**提示词:** 将便签的第二侧边栏合并到第一侧边栏，加入折叠和取消折叠按钮，默认硬撑，移到上面才展示
- 新建 `NotesTree.tsx`:便签视图的第二侧边栏(收集箱/分组/便签列表 + 拖拽重排/拖入分组/删除确认)整体迁入主侧栏,配色改用 sidebar token;点便签 = 选中并跳便签视图(任意视图下可达)。
- 侧栏「便签」行改为与「标签」行同款模式:本体 NavRow 版式(图标文字对齐,计数 = 便签总数),折叠箭头 + 新建便签 + 新建分组三个按钮平时隐藏、悬停 150ms 淡入(计数淡出让位),箭头展开态旋转 90°;折叠状态存 `notes_section_collapsed`,默认折叠;新建后自动展开并跳便签视图。
- `NotesView.tsx` 瘦身为纯编辑区(标题 + NoteEditor + 空态),第二侧边栏移除。`f7e2c3f`

**提示词:** 便签的二级分组的样式和一级分组一致，默认隐藏新建和折叠按钮，移到上面才展示，然后分组向左靠一点，所有的二级分组对齐
- 收集箱/分组头改为与一级导航行同版式:Folder/Inbox 图标(14)+ text-sm 文字 + 右侧计数,px-2 行距一致;去掉左侧常驻箭头 → 分组整体左移,与标签二级行同缩进对齐。
- 折叠箭头(旋转动画)/新建便签/删除按钮全部平时隐藏,悬停 150ms 淡入(计数淡出让位);整行点击即折叠/展开,双击重命名保留;收集箱悬停只出箭头。
- 便签行(三级)缩进调为 pl-7,对齐分组名文字起点。`69547a3`

**提示词:** 收集箱改为默认的一个便签分组，初始自带，可以删除，和其他的普通分组没有区别
- 收集箱实体化:不再有「group_id 为空 = 虚拟收集箱」,便签必须归属真实分组。Rust 端自愈逻辑(database.rs):启动时把无分组便签归入名为「收集箱/Inbox」的分组(没有就自动建并排最前,老库一次性迁移);新建便签未指定分组 → 落到排序第一个分组(零分组时自动建收集箱);删除分组 → 组内便签并入剩余第一个分组(一个不剩才新建收集箱承接)——保证收集箱本身可以像普通分组一样删除/改名。
- 前端:NotesTree 删掉虚拟收集箱节,树里只有真实分组;store 删分组后整体回灌 notes/noteGroups,新建便签后同步分组列表;删分组确认文案改为「组内便签将移入其他分组」(新 EXTRA 键 S.X.NoteGroupDeleteConfirm,zh/en)。`e61e34f`

**提示词:** 当前的主题不好看，你给我设计几套主题，要求耐看，经典
- 新增 4 套业界公认的经典护眼配色(均用各自官方原始色值):
- **Solarized Light**(`light-solarized`):Ethan Schoonover 经典暖纸底 #fdf6e3 + 浅褐侧栏 #eee8d5 + 蓝强调 #268bd2;红/黄/绿告警用 solarized #dc322f/#b58900/#859900。
- **Paper**(`light-paper`):羊皮纸暖底 #f3ead4 + 墨青强调 #2c7a6f,暖棕文字,阅读/便签友好。
- **Solarized Dark**(`dark-solarized`):深青基底 #002b36 + 面板 #073642 + 灰青文字 #93a1a1 + 蓝强调。
- **Gruvbox**(`dark-gruvbox`):Pavel Pertsev 暖复古底 #282828 + 米色文字 #ebdbb2 + 橙强调 #fe8019(accent-text 用深色 #282828 保对比)。
- 三处同步:`themes.ts`(LIGHT/DARK_THEMES 数组 + THEME_LABELS + THEME_PREVIEW)、`index.css`(4 个变体块,写全 token 集对齐移植主题风格)、`TitleBar.tsx`(THEME_OPTIONS 图标 Sunrise/BookOpen/Eclipse/Box)。
- 实测(写 DB 切主题重启逐套截图)四套均正常;`npm run build` 过。`1474767`

**提示词:** D:\BaiduSyncdisk\code\todo_project\交接文档.md 继续干活(经询问后选定本轮做「标签图标自定义图片导入」——交接文档低优先级清单遗留项)
- 补齐旧版 GroupIcons 的「自定义图片导入」(原 `54ce44c` 轮因缺资源协议支持而搁置):
- **Rust**(commands.rs):仿 NoteImageStore 新增分组图标仓库 `%AppData%\MinimalTodoApp\group-icons`(与旧版同目录,旧数据导入的图标文件原样复活);命令 `save_group_icon`(原始字节走 IPC、x-ext header、返回唯一文件名)、`group_icon_dir`、`list_group_icons`(按修改时间倒序,对齐旧版 CustomImages);lib.rs 注册三命令。
- **资源协议**:tauri.conf assetProtocol scope 增列 `group-icons/**`。
- **渲染**:`ui/TagIcon.tsx` 新增 `iconImage` 入参与 `resolveGroupIcon`(`groupicon://文件名`→仓库目录;旧版导入的绝对路径直接经 asset 协议);优先级 图片 > 字形 > lucide Tag 兜底。三处调用(侧栏窄/宽 + 标签看板卡头)透传 `group.icon_image`。store init 的 Promise.all 预取图标目录,确保侧栏首帧能解析图片。
- **UI**(`dialogs/IconPickerDialog.tsx`):分类行追加「自定义」tab,选中后显示「导入图片…」按钮 + 已导入图片网格(`<input type=file>`→saveGroupIcon→`groupicon://`)。选字形清空 icon_image、选图片清空字形(图片优先,数据保持干净)。i18n 键(S.IconCat.Custom / S.IconPicker.Import)上轮已预置,无新增。
- `npm run build` 过、`cargo check` 过。图片导入(文件对话框)留用户手测。`097f8d2`

**提示词:** 1、侧边栏的按钮需要可以自由拖动排序;2、设置弹窗需要可以自由拖动,对于弹窗都这么处理
- **侧栏内置导航项拖动排序**(Sidebar.tsx):五个内置项(所有待办/四象限/标签/便签/已完成)由硬编码顺序改为按 `settings.sidebar_order` 渲染,可整行拖动重排(复用 useSortableItem,type=`nav`,与标签 type=`group` 互不干扰);标签/便签的二级内容(分组列表/便签树)随父项一起移动。顺序持久化、解析时过滤未知键并按默认顺序补全缺失(向后兼容)。新增 `SortableNav` 拖拽外壳 + `parseNavOrder` + nav 拖放 monitor;原 header JSX 抽成 `navHeader`/`navChildren` 由 order 驱动渲染。
- **模态框标题栏拖动移位**(ui/Modal.tsx):标题栏可按住拖动移位,位移走 CSS `translate` 属性(与居中 -50% 合成),刻意不占用 `transform`——留给 modal-in 的 scale 动画,规避 CLAUDE.md 记的「translate 双重位移」坑;关闭按钮 stopPropagation 不触发拖动。**全部 7 个对话框共用 Modal**(设置/图标/标签色/任务编辑/导入导出/帮助/更新),故一处改动全覆盖。ConfirmDialog 是无标题栏的瞬时确认框,本轮未加(用户要可再说)。
- 仅前端改动,`npm run build` 过;dev 热更新无报错。拖动交互(合成鼠标不可靠)留用户手测。`14cbe50`

**提示词:** 没有看到可以拖动设置的地方;设置的弹窗只能在app内拖动,可以拖动到app外吗(经询问选定「设置转独立原生窗口」)
- **设置改为独立原生窗口**(可拖到主窗口外/任意屏幕位置,WebView 内的 DOM 模态做不到):
- Rust(window.rs)`open_settings_window`:`WebviewWindowBuilder` 建/聚焦 label=`settings` 的无边框可缩放窗口。**必须 `async`**——同步命令在主线程执行,而 `build()` 在 Windows 需主线程消息循环创建 webview,主线程被命令阻塞即死锁(实测复现:日志停在 building、整 app 卡死;改 async 后两窗口正常)。
- 前端按**窗口 label** 路由(main.tsx:`getCurrentWindow().label==="settings"`→`SettingsWindow`,否则 `App`)。曾用 `?window=settings` 经 `WebviewUrl::App` 加载→白屏(query 不解析为路由),改 label 解决。
- 设置面板抽成 `SettingsPanel` 复用;新增 `SettingsWindow`(自绘标题栏拖动/关闭 + `ResizeBorders` + 自带 `ConfirmHost`);删除旧应用内 `SettingsDialog`;TitleBar 菜单改为 `ipc.openSettingsWindow()`。`capabilities` 把 settings 窗纳入授权(拖动/关闭/事件)。
- **跨窗口实时同步**:`saveSetting` 广播 `settings-changed` 事件;模块层 `setupSettingsSync`(main.tsx 注册一次,避免 StrictMode/HMR 丢监听)→ `applyRemoteSetting`(带回环防护)应用主题/字体/语言/各开关。

**提示词:** 设置弹窗打开是空白的 / 打开设置卡死,你实际测试debug一下
- 即上:白屏=URL query 路由(改窗口 label);卡死=同步命令建窗主线程死锁(改 `async`)。均加日志 + 自动复现实测定位/确认。

**提示词:** 设置的字体字号,便签的字体字号,改了后没有实时刷新,修复一下,你实际测试验证一下
- **根因是 CSS 层叠,不是同步**(字体 family 能生效证明跨窗口同步本身 OK):
- 全局字号:原写 `body { font-size }` 被 Tailwind `text-*`(rem)层叠覆盖 → 改为 `applyFontSettings` 缩放根 `html` font-size(rem 全局等比缩放;14 为中性=16px 保默认观感),`body` 改 `1rem`。
- 便签字号/字体/行距:`.note-prose` 自身的 `font-size` 盖掉父级继承值 → 改为消费 `--note-font-size/--note-font-family/--note-line-height` 变量(`NotesView` 下发),直接落在 prose;未设时回退默认字号/全局行距/继承全局字体。
- `init()` 补 `applyFontSettings`(原只在 App effect,恢复默认重载不触发)。实测截图确认全局字体/字号、便签字号均生效。
- 注:任务项单行 `truncate`,全局行距无可见对象,主要作用于多行内容(便签)。

**提示词:** 设置增加恢复默认值选项,将所有设置恢复默认,不包括语言
- 设置→通用 新增「恢复默认设置」按钮(二次确认)。Rust `reset_settings` 删除 settings 表全部项,**保留 `language`(用户要求)+ `imported_at`(删了下次启动会误触发旧 data.json 重导入)**;开机自启另复位为关(存于系统)。`emit("settings-reset")` → 两窗口各自重载(主窗 `init`、设置窗 `initSettingsWindow`)。实测:DB 校验(seeded 键删除、language·imported_at 保留、theme 回默认),主窗实时复位(视图回全部/字号正常/侧栏展开)。

**提示词:** 便签的字号行距的继承应该单独弄个按钮;默认的主题用light
- 便签字号·行距继承改为**独立开关**(设置→便签「字号·行距继承全局」,默认开);关掉才显示字号(10–22)/行距(0.9–1.6)滑块,去掉旧「滑块拖到 0 = 继承」的别扭交互(`note_font_size/line_spacing` 为 0 仍表示继承,语义不变)。
- **默认主题 glass → light**(`migrateThemeKey` 未设置/无效键一律回落 light);顺手清掉测试残留的 `theme=glass`。
- i18n 双语同步(S.X.ResetDefaults*、S.X.NoteInheritSizeSpacing*);`npm run build` + `cargo check` 过;实测主题默认 light、设置窗各项正常。`4ba7844`

**提示词:**(主题精简与重做,经多轮)「说明一下当前软件的主题…我让 gemini 给我搞几套主题配色」→「把这四套主题应用起来」→「保留这四套和 glass 主题,其他全删除」→「再加上这里面的(5 套仿知名 App)主题」
- 主题家族重做为 **Glass(6)+ 精选纯色**,共 **15 套**:
- 浅色(5):Classic(纯白克莱因蓝)、Grove(暖绿灰)、Notion(高级暖灰)、Things(macOS 冷白)、TickTick(柔和靛蓝)。
- 深色(4):Onyx(近黑高对比)、Dusk(蓝调)、OLED(纯黑赛博青)、Linear(硅谷紫罗兰)。
- 玻璃(6):Glass/Ocean/Forest/Sunset/Frost/Noir(保留)。
- **删除** 旧的 16 套(light/lavender/mint/sand/rose/sage/haze/clay/meadow/solarized/paper、dark/midnight/mocha/emerald/nord/slate/graphite/teal/solarized/gruvbox);`index.css` 减约 417 行,保留 `:root`/`.dark`/`.glassy` 基线。
- **默认主题 → `light-classic`**;`migrateThemeKey` 让已删除的旧主题键(老用户存的)自动回落到 Classic。
- 接 Gemini 配色时统一修正:把它惯用的 `--sidebar-muted-fg` 改回项目 `--sidebar-muted`、补上它每套都漏的 `--sidebar-fg-strong`;深色主题侧栏选中文字它给得偏暗(对比不足),提亮到 accent 同色。
- 三处注册同步:`themes.ts`(GLASS/LIGHT/DARK 数组 + THEME_LABELS + THEME_PREVIEW)、`index.css` 变体块、`TitleBar` THEME_OPTIONS + 图标(顺带清理不再用的图标 import)。
- 实测(写 DB + 重启逐套截图)Classic/Onyx/Grove、Notion、Linear 渲染正确;`npm run build` 过。

**提示词:** 给我一下当前项目的技术清单 / 导出成 docs/tech-stack.md 放进仓库;后面如果改了需要自动更新,写入记忆里面
- 新增 `docs/tech-stack.md`(架构/后端/前端/数据/构建发布/平台工具链 + 版本号表)。
- 记忆写入 `keep-tech-stack-doc-updated`(feedback):以后增删/升级依赖或改架构时同步更新该文件。`1df529a`

**提示词:**
> - 便签还是改回之前的一版,有第二侧边栏,去掉第一侧边栏的隐藏新建等按钮
> - 便签的第二侧边栏长度要求可以调整
> - 标签参考便签也放第二侧边栏,将现在的便签页面放到便签看板页面,选中标签默认打开标签看板
> - 标签分组少了个标签看板,默认选中标签看板;标签看板要和下面的标签分组区分开;层级不同,父与子的关系
> - 取消层级关系
> - 标签和便签的第二侧边栏支持收起,新增收起按钮

- **标签 / 便签 改回独立「第二侧边栏」**(此前曾把列表内联进主侧栏,本轮反向):
- 新增 `TagSidebar.tsx`:标签第二侧边栏。顶部「标签看板」父级行(Kanban 图标,点击→看板视图、看板时高亮)+ `＋`新建标签 + 收起按钮;下面平铺各标签(`TagRow`,点击→该标签任务,右键改色/图标/改名/删除,拖拽重排)。**与「标签看板」同级平铺、无缩进**(用户先要父子缩进、后又要求取消)。
- `App.tsx`:`tagboard` 与 `group` 视图均渲染 `<TagSidebar/>` + 右侧内容(看板 / 该标签任务列表);`notes` 视图仍是 `NotesView`。
- `Sidebar.tsx`:主侧栏「标签」「便签」改回**普通导航行**,删掉原内联列表 + 悬停淡入的折叠/新建按钮、旧 `GroupRow`、标签重排 monitor、`navChildren` 及 tags/notes 折叠 state。
- `NotesView.tsx`:便签视图 = 第二侧边栏(便签树 + 新建便签/分组 + 收起按钮)+ 右侧编辑区;`NotesTree.tsx` 外缩进 `pl-4 → px-1`(从主侧栏移到第二侧栏)。
- 两个第二侧边栏均支持:**右边缘拖动改宽**(持久化 `tags_sidebar_width` / `notes_sidebar_width`,默认 224,范围 160–460)、**收起**(持久化 `tags_sidebar_collapsed` / `notes_sidebar_collapsed`,收起后只剩 w-8 窄条 + 展开按钮)。
- i18n 双语新增 `S.X.TagBoardRoot`(标签看板 / Tag board);无 Rust 改动,`npm run build` 过。`ccc3478`

**提示词:**
> - 收起第二侧边后,和第一侧边一样,需要展示图标
> - 将第一侧边栏改为彩色,风格统一起来
> - 便签的第二侧边栏也改为彩色
> - 设置通用栏放到最上面,字体放到通用里面
> - 便签字体继承全局改为两个按钮,字号,行距是单独的按钮
> - 字体字号继承全局,不要影响,显示出继承的值,然后置为灰色
> - 第二侧边栏折叠后,折叠按钮保持在最上面

- **第二侧栏收起后改为图标列**(对齐主侧栏收起态,w-12 + `h-9 w-9` 圆角图标按钮):
  - `TagSidebar` 收起:展开按钮 + 标签看板图标 + 各标签彩色图标(点击进对应视图,选中高亮)。
  - `NotesView` 收起:展开按钮 + 新建便签图标 + 各便签图标(点击选中)。
- **一/二侧栏彩色化,统一风格**:
  - 主侧栏(`Sidebar`)五个内置项各配固定色(所有待办蓝/四象限橙/标签青/便签黄/已完成绿),图标用该色渲染,选中态也保持彩色(对齐标签图标);底部折叠开关仍中性灰。
  - 便签第二侧栏(`NotesTree`):便签分组无颜色字段,按 id 哈希到 8 色调色板分配稳定色,Folder 图标上色,分组下便签新增前置 `FileText` 图标继承分组色;收起态便签图标同样按分组色上色(导出 `colorForId` 复用)。
- **设置面板重排**(`SettingsPanel`):导航顺序改为 通用→待办→便签→关于(通用置顶、默认打开);原独立「字体」页并入「通用」(显示节假日下方、恢复默认上方)。
- **便签字体继承拆为两个独立开关**:「字号继承全局」「行距继承全局」各自控制(底层 `note_font_size`/`note_line_spacing` 各自 0=继承,语义不变);**继承开启时滑块不隐藏,而是显示对应全局值并 `opacity-50` + `disabled` 置灰**,一眼可见继承值且防误改。i18n 双语加 `S.X.NoteInheritSize`/`NoteInheritLineSpacing`。
- **第二侧栏收起后展开按钮置顶**(原在底部),与展开态折叠按钮位置一致。
- 纯前端,`npm run build` 过。拖拽/收起手感留用户手测。`0b9a598`

**提示词:** 将图标都取消彩色,但是用户可以设置为彩色 / 不是在设置修改,而是可以右键修改颜色 / 和标签的右键样式保持一致,右键弹出修改颜色选项
- **图标默认无色,改由「右键 → 修改颜色」自定义**(对齐标签的右键交互,先否决了「设置里开关」与「直接弹调色板」两个方案):
  - 新建通用 `dialogs/ColorDialog.tsx`(镜像 `TagColorDialog`:12 色网格 + 自定义色输入 200ms 防抖 + 「无色」清除),供主侧栏与便签分组复用;`TagColorDialog` 也补「无色」清除项。
  - 主侧栏(`Sidebar`):去掉固定色,改 `nav_color_<key>` 持久化;右键弹 `Popover` 菜单「修改颜色」→ `ColorDialog`;默认无色。
  - 便签树(`NotesTree`):去掉哈希调色板,改 `noteGroupColor(settings, groupId)` 读 `notegroup_color_<id>`;分组右键「修改颜色」→ `ColorDialog`,分组下便签继承。
- i18n 双语加 `S.X.NoColor`;`npm run build` 过。

**提示词:** 标签的第二侧边栏去掉默认颜色 / 标签的第二侧边栏需要去掉彩色(选择:清空所有标签颜色)
- 标签默认色由 `#3B82F6` 改为空串 `''`(`create_group` 的 INSERT 同步);新增**向前迁移** v2(把历史默认蓝 `#3B82F6` 清空)、v3(**清空所有标签颜色**,用户选择)。
- 标签颜色一律改为「无色基线 + 右键自定义」,与导航/便签分组统一。

**提示词:** 第二侧边栏的折叠都放到下面 / 待办的圆圈和边缘的距离缩短50% / 第一侧边栏和第二侧边栏的图标和文字大小统一,位置对齐
- 两个第二侧栏的**折叠/展开按钮统一移到底部**(对齐主侧栏)。
- 待办卡片左内距减半:`TaskItem` 卡片 `px-3 py-2` → `py-2 pr-3 pl-1.5`(圆圈到左边缘距离缩短约 50%)。
- 一/二侧栏图标统一 14 号、文字 `text-sm`,行版式与位置对齐。

**提示词:** 移除标签的分组功能,移除标签的第二侧边栏(选择:只去标签界面,保留任务-标签数据/后端)/ 标签的第一侧边栏要保留(选择:点开进标签看板)
- **删除标签第二侧栏 `TagSidebar.tsx`**;主侧栏「标签」改回普通导航行,点击直接进**全宽标签看板**(`TagBoardView` 全宽渲染,无第二侧栏);保留任务的标签归属数据与后端。
- `App.tsx` 视图分发去掉 `group` 分支,`tagboard` 直接渲染全宽看板;store 开机视图恢复支持 `tagboard`(单个标签视图不再可达,回退全部)。

**提示词:** 折叠侧边栏平时浅色展示,鼠标移动去才正常展示
- 折叠态图标默认色由偏淡的 `text-sidebar-fg`/`text-sidebar-muted` 改为 `text-sidebar-strong`,hover 只保留背景高亮——平时即清晰,不再需鼠标移上去才显示正常(主侧栏 + 便签第二侧栏折叠态)。

**提示词:** 第二侧边栏和第一侧边栏对齐,图标大小保持一致
- 折叠态第二侧栏图标 16 → **14 号**,与主侧栏一致;补 `h-9` 顶部占位(等于主侧栏标题区高度)、列表 `pt-0`、底部 `p-1`,使两栏首图标纵向对齐。

**提示词:** 第二侧边栏折叠时,如果展示时里面就是展开的就展开,如果里面是折叠的也折叠 / 如果折叠时是折叠的分组,要显示一个分组图标,而不是不显示
- 便签第二侧栏折叠成图标列时**按分组顺序、镜像展开态的树**:展开的分组铺开其下便签 `FileText` 图标;折叠的分组只显示一个 `Folder` 分组图标(带分组色,点击即展开),不再整组隐藏。

**提示词:** 1、我所有说的提示词说完后都需要记录到优化记录.md(不含敏感信息);2、所有修改记录到 release.md 并带版本号,版本号我没说改不要擅自提升;将这两条更新到当前项目的 claude.md
- `CLAUDE.md` 新增「每轮改动工作流(必做)」小节:① 用户每条需求的原始提示词追加到根目录 `优化记录.md`(剔除敏感信息);② 每次改动按当前版本号记到根目录 `release.md`,**未经指示不擅自升版本号**。
- 即时生效:回填上一批 `c63a878`→`0b9a598`,补记本会话此后各轮(本条目即按新规则记录);`release.md` 开发中段同步补这批 UI 打磨摘要。`c63a878`

**提示词:** 优化记录.md 重命名为 prompts.md;将下面更新到当前项目的 claude.md —— 1、用户说完就记,记录用户提示词:用户每说完一条需求,把原始提示词追加到根目录的 prompts.md(不存在则创建,存在则续写),剔除敏感信息(密钥、token、隐私等),其余原文保留。2、做完即记,改动记录到 release.md:每次改动后按当前版本号记到根目录 release.md,带上版本号,平时详细写、正式 release 时再汇总精简;用户没说改版本号就绝不擅自提升,没说版本号即沿用上次版本号、保持不变。
- `git mv 优化记录.md prompts.md`(保留 git 历史);更新 `CLAUDE.md`「每轮改动工作流」两条措辞并改引用为 `prompts.md`。
- 同步把 `release.md` 内 3 处活引用、`prompts.md` 标题里的旧名「优化记录」改为 `prompts.md`(历史逐字提示词保持原样不动)。`c63a878`

**提示词:** 将下面更新到当前项目的 claude.md —— 1 记提示词到 prompts.md(剔敏感信息);2 改动记 release.md 带版本号、未授权不升版本号;3 做完即 commit 但不 push,等通知再 push/release;4 做完即写交接文档到 handoff.md;5 无特殊说明做完就 run 起来让我验证;6 不要假设我清楚自己想要什么,动机/目标不清晰就停下讨论;7 目标清晰但路径不是最短的,直接告诉我并建议更好办法;8 遇问题追根因不打补丁,每个决策能回答"为什么";9 输出说重点,砍掉一切不改变决策的信息。
- `CLAUDE.md`「每轮改动工作流」扩为 1–5(提示词记 prompts.md、改动记 release.md、做完即本地 commit 不 push、写 handoff.md、做完 run 起来验证),新增「工作风格」6–9(不替用户假设需求、路径非最短直说、追根因不打补丁、输出说重点)。
- 即时生效:本条按规则 1 记此处,规则 2 记 release.md,规则 4 写 handoff.md,规则 3 做本地提交(含本会话积压批次,不 push)。`c63a878`

**提示词:** 我要睡觉了,我要你参考旧的 wpf 项目,补全所有的功能,要求功能都通过测试,你现在有一次提问的机会,后面我就睡觉了,你自己干,有问题先记录下来跳过,自主决策。(提问环节确认:「通过测试」=后端 cargo 测试 + 构建必过 + 逐功能冲烟记录)
- **自主夜间任务,分轮进行**。先盘点 legacy WPF 与现版差距:数据模型/命令已基本对齐;提醒引擎(App.tsx useReminderLoop)、完成/提醒音效(effects.ts)均已实现;**主要功能缺口=自定义主题编辑器**(后端 custom_theme 命令俱全但前端从未调用、无 UI)。
- **第 1 轮:后端 cargo 测试套件 + 命令可测化重构**。把 `commands.rs` 每个命令体抽成 `*_impl(conn, …)` 核心函数(命令壳只加锁转调,逻辑/SQL 一字未改);新增 `#[cfg(test)]` 覆盖标签/任务/便签/便签分组/自定义主题/设置 CRUD + 迁移幂等 + 三态补丁 + 收集箱自愈 + 纯函数(safe_file_name/safe_ext)。`database.rs` 加 `migrate_for_test` 辅助与 DB 层测试。**25 个测试全过、零警告**。`03a9e1f`
- **第 2 轮:旧数据迁移 `import.rs` 可测化 + 测试**。把纯导入逻辑抽成 `import_into(conn, &old)`(`maybe_import` 只管前置检查/读文件/解析);新增测试覆盖 `to_due_text`(ISO 带时区/小数秒/naive,时区无关断言)、`valid_id`(空/Nil GUID)、端到端:跳过 4 个内置视图分组并压实 order、优先级 0→Medium、GroupId 指向内置视图回退 OriginalGroupId、空 GUID→无标签、悬空 parent_id 丢弃、sort 索引→模式名、selected_group_id→视图键映射、便签/便签分组导入、布尔标量与 imported_at。**累计 36 个测试全过**。`9774cd2`
- **第 3 轮:纯逻辑核对 + 验证收尾**。再核对前端高风险纯逻辑 `sort.ts`(6 排序 + 置顶优先 + 树展平折叠)、`quadrant.ts`(两开关 + 覆盖优先 + Q1–Q4 派生)均与 WPF 一致。`npm run build`(tsc 严格)通过、`cargo test` 36 项全过、dev 重编运行;更新 `handoff.md` 记进度/测试现状/主题编辑器待确认决策。`(本轮)`
- **功能差距审计结论**:数据模型/命令、提醒引擎(App.tsx useReminderLoop)、完成/提醒音效(effects.ts)、四象限/置顶/缩进/完成级联子孙/清空已完成/日历/排序/导入导出 均已对齐 WPF。**唯一明显缺口=主题管理(自定义主题编辑器 + 主题收藏 FavoriteThemeKeys)**:后端 custom_theme 命令俱全但前端无 UI、i18n 有 Favorite 键无实现。因该领域是用户近期**刻意精简为 15 套**的范围、且高度视觉化无法无人值守校验,**判定为待用户确认的跳过项,未擅自实现**(见 handoff)。`9774cd2`/`c3b88f3`

**提示词:** 保持现状(主题编辑器不做),你继续检查其他功能点,比如新建待办的时候的弹窗。(审计后选择对齐:补齐截止快捷项 2周/4周、提醒快捷项对齐 WPF、新建时可选标签、新建时可选父级)
- **新建待办交互审计**:`TaskEditDialog`(双击编辑)字段与 WPF 完全一致;新建仍是内联栏(WPF 亦然)。发现 4 处差异并按用户选择全部对齐:
  - DuePicker 快捷项补 **2周(20160)/4周(40320)**(`lib/date.ts quickTimes`)。
  - ReminderPicker 快捷项改为 WPF 的 12 档 `[1,10,30,60,120,300,1440,2880,7200,10080,20160,40320]`。
  - QuickAdd 加**标签选择器**(Tag 钮→Popover 列「无标签」+各标签),新建可直接归入某标签(补回全宽看板后失去的能力)。
  - QuickAdd 加**父级选择器**(ListTree 钮→Popover 列未完成任务带缩进),直接建为子待办;选了父级则隐藏标签钮、标签跟随父。
  - store `addTask` 扩展接受 `group_id`/`parent_id`:有父级则标签跟随父、缩进 = 父+1(封顶 6),对齐旧版 `AddTask`。i18n 双语加 `S.X.NewTaskTag/NewTaskParent/NewTaskAsChildOf`。`npm run build` 通过。`7a63061`

**提示词:**(版式探索)前端不好看,重画几套挑选 →(看后)这几套都不行,撤销 → 参考桌面文档(Gemini 给的 3 套风格),设计多三种 UI 放到设置可切换。
- 第一次尝试的 4 套(经典/柔卡/紧凑/极简,标题栏切换、仅 CSS 微调)**用户全否,已 `git reset` 回退**(留档 `3a9f089`)。
- 本轮按 Gemini 文档重做、放**设置**里切换,且**重构 TaskItem 为统一可换肤 DOM**(差异更大):
  - **苹果 Things**:无边框 + 下分隔线 + 留白,圆形 20px 细线勾选(中性边框),优先级用标题前**小圆点**,标签 `#文字` 浅色后缀。
  - **极客 Linear**:紧凑 + 1px 下边框,方圆角 16px 勾选,优先级**前置信号图标**(SignalLow/Med/High),标签**暗色胶囊**。
  - **可爱 Waterdrop**:独立卡片 + 1rem 大圆角 + 柔阴影 + 外距,大圆 24px 粗勾选(优先级色),标题 15px 粗,标签/副信息**彩色胶囊**。
  - 经典保留为默认(现状)。
- 实现:`themes.ts` design 轴(classic/apple/linear/cute)+ `applyDesign`;统一基线 `.task-check/.task-pri-dot/.task-pri-icon/.task-tag` + 3 套 `.design-*` CSS(双类覆盖 Tailwind);TaskItem 加 `--pri` 变量、标签后缀、圆点/信号图标元素;store design 状态 + 跨窗口同步;**设置→通用→界面版式** 2×2 卡片切换器;i18n 双语 `S.X.Design.*`。`npm run build` 通过。`94737b3`

**提示词:** 参考桌面文档(Gemini 多级子任务方案)按这样设计多级任务。
- 按文档在三套新版式实现**多级(最多 6 级)子任务**视觉(经典保持现状)。架构说明:现版任务树是「扁平列表+缩进」(拖拽/排序依赖),不改递归组件以免动拖拽;在扁平架构内用 CSS+少量 DOM 落地:
  - **半满态复选框**:父任务部分子完成且自身未完成 → 苹果/极客横杠 `Minus`、可爱圆点(`::after`)+ 半满底;经典保持空框。
  - **子任务进度条**:父任务标题下,苹果细 2px、可爱粗 6px、极客不用条(留 `1/3`);苹果/可爱隐藏 n/m 计数。
  - **克制缩进**:经典 18px/级,三套新版式收紧到 12px/级(`--lvl` + calc)。
  - **树状引导线**:极客常驻、苹果 hover 显现(缩进行 `::before` 竖线);可爱靠卡片不画线。
  - **折叠箭头悬浮显现**:苹果/极客平时隐藏、hover 整行才显(防误触);可爱/经典常驻。
- TaskItem 加 `--lvl`/`data-level` + `indeterminate`/`progress` + `.task-collapse/.task-half/.task-progress/.task-subcount`;`index.css` 末尾加多级块。`npm run build` 通过。`92aaf9d`

**提示词:** 将所有的折叠按钮放到右边边,左边的勾选框往左边靠。
- 所有版式:折叠箭头从**左侧**(勾选框前)移到**行右边缘**(删除按钮之后);删掉左侧折叠/占位块,勾选框自然靠左(约左移 20px)。`.task-collapse` 的 hover 显隐逻辑与位置无关,仍生效(苹果/极客 hover 才显,经典/可爱常驻)。`npm run build` 通过。`88ad01e`

**提示词:** 参考桌面文档(已更新,加了风格 4/5/6)再加几套。
- 文档新增 3 套,按方案落地为新版式(复用现有统一 DOM + `task-*` hook,只加 CSS 皮肤 + 注册 + i18n),共 **7 套**:
  - **④文档 Notion**:弱边界、hover 整行成块、极小行距、方框灰方块半满、`#`标签去前缀、细实线引导、右侧 hover 箭头;用 `1/3` 计数不用进度条。
  - **⑤流体 Fluent**:毛玻璃 `backdrop-blur` + 半透明白描边 + 柔阴影、发光勾选(半满发光横杠)、**发光进度条**、左侧**发光引导线**、半透明胶囊标签。
  - **⑥粗野 Brutalism**:粗黑边(`--primary-text` 充当黑,浅近黑/深近白)+ 硬偏移阴影(hover 位移放大)、方块勾选、贴纸标签(带边+硬阴影)、粗黑引导线。
- `themes.ts` DESIGNS 加 notion/fluent/brutal;i18n 双语加 `S.X.Design.{Notion,Fluent,Brutal}{,Desc}`;`index.css` 末尾加 3 套 `.design-*`。设置→通用→界面版式 2×2 自动列出 7 套。`npm run build` 通过。`439a2cf`

**提示词:** 将苹果、极客、文档、无优先级展示抽取为设置,并且将这次优先级改动回撤,优先级展示通过设置调整。
- **回撤** 上一轮「优先级按版式寄生上色」提交(`git reset --hard` 去掉 8b0483b:含 cute 马卡龙/fluent 光晕/brutal 色块等)。
- **新增「优先级展示」设置轴**(与版式正交,`<html>.prio-*`,4 选项):**苹果**(复选框圆环着色 + 高优先级标题后红 `!`)/ **极客**(行最左 2px gutter 竖线)/ **文档**(标题文字着色 高红中黄 + 小圆点)/ **无**(不展示)。
- 解耦:基线勾选框环色改**中性** `--muted-text`(原为 `--pri`),去掉版式耦合的优先级指示(`.design-apple .task-pri-dot`、`.design-linear .task-pri-icon` 删除),TaskItem 移除信号图标元素 + 加 `.task-pri-mark`;优先级表达全部改由 `prio-*` 按 `data-pri`/`--pri` 叠加。
- `themes.ts` 加 PRIORITY_STYLES + applyPriorityStyle/migratePriorityStyle;store priorityStyle 状态 + setter + init/initSettingsWindow 应用 + applyRemoteSetting 跨窗口同步;设置→通用 新增「优先级展示」选择器;i18n 双语 `S.X.Prio.*`;默认 apple。`npm run build` 通过。`29e1348`

**提示词:** 优先级展示设置项加上移除的信号强度。
- 「优先级展示」加回 **信号强度** 选项(原 linear 版式移除的 Signal 图标):TaskItem 重新加回 `task-pri-icon`(SignalLow/Med/High,按 `--pri` 着色,放复选框前);`prio-signal` 显示之、勾选框环保持中性。PRIORITY_STYLES 加 `signal`,i18n 双语 `S.X.Prio.Signal`。共 5 选项(苹果/极客/信号强度/文档/无)。`npm run build` 通过。`fd77167`

**提示词:** 苹果(圆环+!)改名为 复选框环着色;极客(左侧竖线)改名为 左侧竖线;文档(标题着色)改为 圆点着色。
- 选项名改为直接描述机制,且行为与名一致(内部 key apple/linear/notion 不变,免迁移):
  - **复选框环着色**:去掉高优先级 `!`,只留复选框圆环按优先级着色(删 `prio-apple` 的 task-pri-mark 规则)。
  - **左侧竖线**:仅改名,行为不变。
  - **圆点着色**:去掉标题文字着色,只留标题前优先级小圆点(删 `prio-notion` 的 task-title 着色规则,留 task-pri-dot)。
- i18n 双语改 `S.X.Prio.{Apple,Linear,Notion}` 标签。`npm run build` 通过。`ff62d6e`

**提示词:** 新增设置项目:勾选框样式(圆环/方框)、勾选框大小、勾选框线条粗细 →(改方向)勾选框不对全局生效,如果修改了某个版式的设置,自动生成一个自定义版式并写上基于什么版式而来。(确认:每次从内置版式改都新建一个,带删除按钮)
- 勾选框 3 项(形状/大小/粗细)**不全局生效**,而是绑定到「自定义版式」:在内置版式上改任意一项 → **派生一个新自定义版式**(记录 base),切过去;已在自定义版式上改则就地更新。
- 机制:`themes.ts` 加 `applyCheckbox`(在 `<html>` 切 `cb-*` class + 写 `--check-radius/size/bw` 变量)、`CustomDesign` 类型 + `parseCustomDesigns`/`resolveDesign`/`applyActiveDesign`(active design = 基础版式 class + 勾选框覆盖);`index.css` 加 `html.cb-* .task-check`(特异性 0,2,1 > 版式 0,2,0,故仅自定义生效时覆盖)。
- store:`design` 改 string(可为 `custom:<id>`)+ `customDesigns` 状态;新增 `editCheckbox(dim,value)`(派生/更新)与 `deleteCustomDesign(id)`;init/initSettingsWindow/applyRemoteSetting 改用 `applyActiveDesign`(含 `custom_designs` key 跨窗口同步)。
- 设置→通用→界面版式:网格列出内置 7 套 + 自定义版式(标「自定义·基于X」+ 覆盖摘要 + 右上角 × 删除);新增「勾选框」三组控件(形状按钮、大小/粗细 跟随版式开关+滑块)。i18n 双语 `S.X.Checkbox.*`/`S.X.Design.Custom`。`npm run build` 通过。`3da3af6`

**提示词:** 大小和粗细跟随版式的置灰需要显示出真实的值。
- 「跟随版式」(滑块置灰)时显示该版式**真实勾选框值**而非 "—":设置窗口无任务卡、拿不到 getComputedStyle,故在 `themes.ts` 建 `DESIGN_CHECKBOX_DEFAULT`(各内置版式 size/width px,与 index.css 对应)。
- SettingsPanel 取当前生效版式的基础版式默认值:置灰时滑块值/数值显示该真实值;关掉「跟随版式」时从该真实值起步(`editCheckbox("size", String(defs.size))`)。`npm run build` 通过。`33c3602`

**提示词:** 将界面样式和字体抽取一个分组叫做外观,放在通用下面。
- 设置新增分组 **「外观」**(`SettingsPanel` Section 加 `appearance`,排在 `general` 之后):把 界面版式 + 勾选框 + 优先级展示 + 字体 从「通用」移入「外观」;「通用」只留 开机自启 / 显示节假日 / 恢复默认。i18n 双语 `S.X.Appearance`。`npm run build` 通过。`1758217`

**提示词:** 界面版式移除经典,默认用极客加圆点着色。
- `themes.ts`:`DESIGNS` 去掉 `classic`(剩 6 套:极客/苹果/可爱/文档/流体/粗野);`DEFAULT_DESIGN` → `linear`、`DEFAULT_PRIORITY_STYLE` → `notion`(圆点着色);同步从 `DESIGN_LABEL_KEY/DESC_KEY/CHECKBOX_DEFAULT` 删 classic。
- store 默认 `design:"linear"`/`priorityStyle:"notion"`;init/initSettingsWindow 用 `migrateDesign` 归一内置键(老用户存的 `classic` → 默认 linear,`custom:<id>` 原样保留)。SettingsPanel 的勾选框默认值 fallback 改 `.linear`。`npm run build` 通过。`2089d83`

**提示词:** 检查 6 套版式待办的字体大小,可爱版式字体特别大。
- 排查:只有可爱版式 `.design-cute .task-title` 显式 `font-size: 0.9375rem`(15px),其余 5 套都用基线 `text-sm`(14px)→ 可爱偏大。去掉可爱的 `font-size` 覆盖(保留 `font-weight:700`),6 套标题字号统一 14px,仅字重不同。`npm run build` 通过。`6fae429`

**提示词:** 再加几套(桌面文档:4 套"清晰透明"风,强调可读性)→ 此前曾加过 4 套炫酷玻璃(视界/霓虹/全息/亚克力)被用户「撤销」(`git reset` 回退);本轮按新文档做"高可读"玻璃。
- 文档三原则:文字纯色不发光、玻璃高覆盖率(≥60% 底)、优先级收敛为实体点/线/块。据此加 **4 套**(共 10 套):
  - **纯净白玻 frost**:`--card-bg` 80% 高覆盖磨砂(随主题自适应)+ 纯色深字,最清晰。
  - **深邃暗玻 darkglass**:固定 `slate-900/72` 深玻 + 纯白字(配深色/玻璃主题)。
  - **微色调 tinted**:高覆盖玻璃 + `--pri` 极淡晕染(8% 嵌套 color-mix)+ 优先级色描边(其标志,例外地内置优先级)。
  - **双层面板 panel**:`app-task-list` 玻璃底 + `task-item` 纯实底任务条(外透内实,最清晰)。
- 其余 3 套玻璃只做材质,优先级仍走 prio-* 设置;各套复用 task-* hook(半满态/进度条)。`themes.ts` DESIGNS 加 frost/darkglass/tinted/panel + LABEL/DESC/CHECKBOX_DEFAULT;i18n 双语;`index.css` 加 4 套 `.design-*`。`npm run build` 通过。`6b9cf24`

**提示词:** 移除暗玻主题,其他保留。
- 移除「深邃暗玻 darkglass」:从 `themes.ts` DESIGNS/LABEL/DESC/CHECKBOX_DEFAULT 删除、删 `index.css` 的 `.design-darkglass` 块、删 i18n 双语键。保留 纯净白玻/微色调/双层面板;共 9 套版式。`npm run build` 通过。`f149129`

**提示词:** 流体的子任务前面的线太粗了,参考极客和文档,浅一点细一点。
- 流体引导线由 2px 强调色 + 外发光,改为与极客/文档一致:**1px + `--divider` 浅灰、无发光、贯通全高**(`.design-fluent .task-item:not([data-level=0])::before`)。`npm run build` 通过。`d9a3097`

**提示词:** 父子任务逻辑有问题,参考旧版 WPF:不是所有子任务完成时,单独完成的子任务不消失,只放烟花,不播左移消失动画。
- 对齐旧版 `MainViewModel`(OnItemPropertyChanged + RootOf 过滤):
  - **显示按「根任务是否完成」划分**(`selectVisibleTasks` 加 `rootOfTask`):整族未完成 → 未完成视图(其下已完成的子任务**原地划线保留**);整族已完成 → 已完成视图。`clearCompleted` 也只清「根已完成」的整族。
  - **完成逻辑**(`toggleComplete` 重写):**活子待办**(有父且父未完成)= 只打钩、不整族完成、不消失;并**向上传播**(某父的直接子全完成 → 自动完成该父,逐级向上)。**顶层/父已完成** = 整族完成(随后因根已完成而消失)。
  - **动画**(`TaskItem.completeWithEffects`):活子待办完成时**只放烟花、不播 `.completing` 滑出动画、不消失**;顶层/整族完成仍滑出。
- `npm run build` 通过。`62ee100`

**提示词:** 父任务进度现在是 数字1/2 或直线涂色,加一个圆环百分比涂色,并加入设置可自定义,每个样式都自定义(不是全局)。
- 父任务子任务进度新增第三种「**圆环百分比**」(`.task-progress-ring`,conic-gradient + mask 做空心环,`--pct` 传百分比);并做成**按版式自定义**(复用勾选框的自定义版式机制,非全局):
  - `themes.ts`:`CustomDesign` 加 `progress` 维度;`applyProgress(mode)` 切 `html.pg-{count,bar,ring}` class;`resolveDesign`/`applyActiveDesign` 带上 progress;`PROGRESS_MODES`/`PROGRESS_LABEL_KEY`。
  - store:`editCheckbox` 的 dim 加 `"progress"`,派生的自定义版式带 `progress:""`。
  - `index.css`:`.task-progress-ring` 基线 + `html.pg-*` 三套强制规则(特异性高于版式默认,只显一种)。
  - `TaskItem`:meta 行渲染圆环元素。`SettingsPanel`:外观→「进度」4 按钮(跟随版式/数字/直线/圆环),改即派生;自定义版式摘要带进度。i18n 双语 `S.X.Progress.*`。`npm run build` 通过。`b536585`

**提示词:** 完成百分比不要单独弄圆环,直接用勾选框填充。
- 去掉独立的 `.task-progress-ring` 元素;`--pct` 移到容器、父任务勾选框加 `is-parent` 类;「圆环」进度模式用 `html.pg-ring .task-check.is-parent` 填充勾选框,并隐藏数字/进度条与半满标记。`npm run build` 通过。`8b58076`

**提示词:** 不要实心圆环,参考上一版设计(空心环)。
- 把勾选框的实心饼填充改回**空心进度环**:`conic-gradient(accent var(--pct), divider 0)`(已完成段 accent + 余量段 divider)+ `radial-gradient` mask 挖空中心 + `border-color: transparent`——勾选框本体即进度环(对齐上一版独立小圆环的观感)。`npm run build` 通过。`27bc336`

**提示词:** 圆环显示异常,自查确认。
- 自查发现 3 处并修复:① conic 硬停止裸 `0`(无单位)在 WebView 下可能解析异常 → 改 `var(--divider) var(--pct)` 显式同位;② mask 用默认 `circle`(farthest-corner)致方框内中心孔偏大/环怪 → 改 `circle closest-side`(58%/60%)相对圆精确;③ 环规则特异性 (0,3,1) 被 `.prio-apple .task-check:not(...)`(0,4,0)盖过致环外多套一圈优先级色边框 → 选择器加 `:not(.is-done)` 提到 (0,4,1),`border-color: transparent` 稳定生效。`27bc336`/`cc1548a`

**提示词:**(附图)圆环显示异常——方形勾选框版式下成了「半蓝半白方块」。
- 根因:默认版式极客(及文档/粗野)的勾选框是**方形**,conic + 圆形 mask 套在方框上就成了半填充方块。圆环进度本质是圆,故圆环模式下给父任务勾选框**强制 `border-radius: 9999px`**(覆盖方形/自定义形状),conic 与圆 mask 对齐 → 干净空心环。`npm run build` 通过。`816962c`

**提示词:**(附图)还是不行。
- conic + mask 在 WebView2 下太脆(方框/track 可见度/seam),仍异常。**改用 SVG 进度环**(业界可靠做法):TaskItem 在父任务勾选框内渲染 `<svg class="task-ring">`(track 圆 + fill 弧,`stroke-dasharray: var(--pct-num) 100` + `pathLength=100` + `rotate(-90deg)`);容器传数值 `--pct-num`。圆环模式下勾选框去边框/底、SVG `inset:-2px` 铺满。SVG 本身是圆,方框版式也正常。`npm run build` 通过。`a0aa59b`

**提示词:** 进度选项「圆环」改名为「勾选框」;针对方形勾选框做适配,和圆形一样,只是显示方形。
- 改名:`S.X.Progress.Ring` 「圆环」→「勾选框」(en Checkbox)。
- 形状自适配:SVG 圆环无法跟随方形,改回 **conic 填充 + `::before` 内缩挖洞** 成环——conic 被勾选框自身 `border-radius` 裁形(圆框→圆/方框→方),`::before` 洞 `border-radius: inherit` 自动跟随;勾选框不再强制圆,保留各版式/自定义形状。圆框显示圆环、方框显示方框环。`npm run build` 通过。`1bc25e2`

**提示词:**(附图)显示异常。
- conic+::before 仍渲染异常(seam/太厚)。**回到 SVG 进度环**(此前圆框版本用户已认可),并**按形状渲染 `<circle>` 或圆角 `<rect>`**:`themes.ts` 加 `DESIGN_ROUND` 表 + `isRoundCheckbox(design, customs)`(cb 形状覆盖优先);TaskItem 读 `design`/`customDesigns`,圆框渲染 `<circle>`(rotate -90 从 12 点)、方框渲染 `<rect rx=5>`;`stroke-dasharray=var(--pct-num) 100` + `pathLength=100`,track 浅灰整圈 + fill 强调色弧。`npm run build` 通过。`140e301`

**提示词:** 各版式默认进度:苹果/可爱/流体/白玻/微色调=勾选框,粗野=直线。
- `themes.ts` 加 `DESIGN_PROGRESS_DEFAULT` 表(linear=count, apple/cute/fluent/frost/tinted=ring, notion=count, panel=bar, brutal=bar);`applyActiveDesign` 在进度覆盖为空(跟随版式)时采用该表 → 每个版式有自己的默认进度模式。`npm run build` 通过。`9f6c45c`

**提示词:** 苹果、可爱、白玻、微色调、双层面板 参考流体,子任务前加竖线。
- 把苹果原来的 1.5px hover 显现引导线改成与流体一致(**1px `--divider` 浅灰常驻**),并同样加给 可爱/纯净白玻/微色调/双层面板(合并到一条 `.design-* .task-item:not([data-level=0])::before` 规则)。`npm run build` 通过。`f6338e1`

**提示词:** 勾选框大小调整后,圆心没有和文字高度的中间对齐。
- 根因:apple/cute/notion/fluent/brutal 用 `align-items: flex-start` + **固定 `margin-top`**,边距不随勾选框尺寸变,调大就把圆心顶偏(items-center 的 linear/frost/tinted/panel 靠 flex 居中,本就无此问题)。
- 修法:5 套 flex-start 版式的固定 margin-top 改为 **`calc((1.25rem - var(--check-size, 版式默认尺寸)) / 2)`**——按标题行高(text-sm=1.25rem)居中,`var(--check-size, 默认)` 同时覆盖「跟随版式默认尺寸」与「自定义尺寸」两种情形,圆心恒落文字中线。`npm run build` 通过。`(本轮)`
