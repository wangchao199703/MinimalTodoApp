# 交接文档：分组 → 标签 + 标签看板（v1.2.2，进行中）

> 给接手的 Claude：本任务把「分组」重构为「标签」，并新增「标签看板」视图。代码**已编译通过（`dotnet build -c Debug` 0 警告 0 错误）**，提交在 `main` 分支最新 commit `ae17bf3`（**未 push**）。但**还没运行验证、没加国际化字符串、没升版、没出 exe、没发 release**。请按下方「待办」继续。

## 用户原始需求（务必满足）

> 1、重构现在的分组功能，改成标签功能，标签功能层级和四象限、所有待办一个层级，在已完成下面，左侧的分组除了已完成全部移除，改为一个标签看板，标签看板可以复用四象限的样式。
> 新建待办的时候可以选择标签，不选择默认无标签，点击选择已有的标签，已有的标签右上角有❌可以删除，删除后该标签下的任务移动到无标签分组，也可以点击加号新建标签。
> 标签看板每个标签一个容器，容器宽度和四象限的一个象限一样，长度随里面的待办扩展，一个屏幕宽度可以放两个容器，容器自动贴齐。标签可以新增待办，点击待办有动画，不同标签容器之间的待办可以拖动。
> 所有待办因为没有分组了，取消折叠功能。容器上面显示图标和名称，参考四象限容器，容器图标可自己选择，可右键容器修改，创建标签时可选图标，不选就是默认图标。

**已与用户确认的决策**：① 单标签（一个任务最多一个标签）；② 「所有待办」列表每条任务显示标签小 chip；③ 看板容器右键 = 重命名 + 改图标 + 删除。**版本号 v1.2.2，用户验证确认后才发布 release 包。**

**交付流程（用户指定）**：先实现 → `dotnet run` 展示效果 → **停下等用户确认** → 出无依赖 exe → 写 `优化记录.md`（含原始提示词）/`release.md`/`release-notes.md` → 升版 1.2.2 → 提交并 push → **用户验证确认后**再 `release.ps1` 发布 v1.2.2。注意国际化（中英成对）。

## 核心设计（已落地）

把**普通 `TodoGroup` 当作「标签」**（不重命名类）。`TodoItem.GroupId` 现在存「标签 id」，`Guid.Empty` 或指向任何**特殊视图分组**都视为「无标签」。判定：`MainViewModel.TagOf(item)` 在普通标签里找不到即无标签。新增特殊视图分组 `IsTagBoardGroup`（仿 `IsQuadrantGroup`）承载「标签看板」入口。**完成态机制不变**（完成→`GroupId=已完成组`、`OriginalGroupId=原标签`；看板只显示未完成，不冲突）。

侧栏最终只剩：所有待办 / 已完成 / 四象限 / 标签看板 / 收集箱。普通分组行已移除（`SidebarGroups` 过滤为只含「所有待办」一项，仍用原 `GroupList` ListBox 渲染，折叠箭头与右键菜单已去掉）。

## 已完成的改动（commit ae17bf3）

- **`Models/TodoGroup.cs`**：`IsTagBoardGroup`、`IsSpecialGroup`（=四个内置视图分组之一）、`DisplayName`/`IndentMargin` 并入。
- **`Models/TodoItem.cs`**：运行时 `TagName/TagIcon/TagColor/HasTag`（`[JsonIgnore]`，VM 维护，列表 chip 用）。
- **`Infrastructure/GroupIcons.cs`**：`TagBoard = G(0xE8EC)`。
- **`Converters/Converters.cs`** + 注册于 `Themes/Controls.xaml`：`HexToLightBrushConverter`（key `HexToLightBrush`，hex→淡色，chip/徽标底）、`HalfWidthConverter`（key `HalfWidth`，宽度→半列宽，看板 WrapPanel.ItemWidth）。
- **`ViewModels/TagColumnVm.cs`**（新）：看板一列。`Tag`(null=无标签)/`IsUntagged`/`Items`/`DisplayName`/`Icon`/`IconImage`/`HasIconImage`/`Color`/`NewText`/`AddCommand`(调 `AddTaskToTag`)/`RefreshHeader`。
- **`ViewModels/TagBoardDropHandler.cs`**（新）：`IDropTarget`，落到列集合→`vm.DropToTag`。
- **`ViewModels/MainViewModel.cs`**：
  - `TagBoardGroup`/`EnsureTagBoardGroup()`/`SeedDefaultsIfEmpty` 追加标签看板组、构造里 `EnsureTagBoardGroup()`；`IsTagBoardSelected`、`IsBoardSelected`(=四象限||标签看板)；`OnSelectedGroupChanged` 通知三者。
  - `NormalTagGroups`、`TagOf(item)`；`MoveTargetGroups`/`FirstNormalGroup` 改用 `!IsSpecialGroup`。
  - 看板：`TagColumns`、`TagDropHandler`、`RefreshTagBoard()`（每标签一列 + 末尾「无标签」列，只装未完成顶层任务）、`DropToTag()`（同列复用 `ReorderQuadrant` 重排；跨列改 `GroupId`）。
  - 新建带标签：`NewTaskTagId`、`NewTaskTagDisplay`、`TagOptions`；`AddTask` 目标改为 `NewTaskTagId`/父标签/无标签；`AddTaskToTag(tag,title)`（容器「+ 添加」）。
  - 标签 CRUD：`CreateTag(name,glyph?)`；`DeleteGroup` 改为**把任务 GroupId 置 Empty（转无标签）不删任务**；`RenameGroup`/`EndEditGroup`/`SetGroupIcon(Image)` 都刷新 chip/看板。
  - `RefreshItems()` 内维护每条任务 chip 字段 + 末尾 `if(IsTagBoardSelected) RefreshTagBoard()`；`RefreshGroupCounts` 标签看板计数=顶层未完成；`RefreshSidebarSelection` 去掉折叠兜底；`OnLanguageChanged` 刷新无标签文案。
- **`Views/MainWindow.xaml`**：侧栏去折叠箭头/去 GroupList 右键菜单；新增 `TagBoardRow` 入口；新增 `TagBoardArea`（ScrollViewer→ItemsControl `x:Name=TagBoardItems`，WrapPanel `ItemWidth=HalfWidth`，容器模板=复用四象限外观 + 表头图标/名称(可内联重命名)/计数 + 底部「+ 添加」+ ListBox 用 `QuadrantListBox` 样式与 `QuadrantCardTemplate`、`DropHandler=TagDropHandler`、`ScrollViewer.VerticalScrollBarVisibility=Disabled`）；`TaskList`/排序按钮可见性改 `IsBoardSelected`，输入栏/分隔条在 `IsTagBoardSelected` 时隐藏；任务卡片 Col4 加标签 chip；新建选项面板加「标签」选择器 Popup（无标签/已有标签+❌/新建）。
- **`Views/MainWindow.xaml.cs`**：`TagBoard_Click`、`TagRename_Click`、`TagChangeIcon_Click`（复用 `IconPickerDialog`）、`TagDelete_Click`、`OpenTagPicker_Click`、`TagPick_Click`、`TagPickNone_Click`、`TagDeleteFromPicker_Click`、`NewTagNameBox_KeyDown`、`TagCreate_Click`；`SelectGroup` 改为只在「所有待办」时设 `GroupList.SelectedItem`；`OnTaskCompleting` 看板分支用 `FindVisualChildren<ListBox>(TagBoardItems)` 找容器播放 `AnimateTaskAway`。

## 待办（必须完成）

1. **国际化字符串**（最重要，现在用的是裸键，运行会显示键名）。在 `Lang/Strings.zh.xaml` 与 `Strings.en.xaml` **都**加，中英成对：
   - `S.Group.TagBoard`（标签看板 / Tag Board）
   - `S.Tag.Untagged`（无标签 / Untagged）
   - `S.Tag.New`（新建 / Add）—— 标签选择器里「+ 新建」按钮文字（建议短）
   - `S.Tag.Label`（标签 / Tag）—— 新建待办「标签」行标签
   - `S.Tag.AddPlaceholder`（添加待办… / Add a task…）—— 看板容器底部输入占位
   - `S.Tag.Rename`（重命名 / Rename）、`S.Tag.ChangeIcon`（更改图标 / Change icon）、`S.Tag.Delete`（删除标签 / Delete tag）
   - 放在文件末尾 `</ResourceDictionary>` 前，参考现有 `S.Quadrant.*` 的加法。
2. **升版 1.2.1 → 1.2.2**：`MinimalTodoApp/MinimalTodoApp.csproj` 的 `<Version>`/`<FileVersion>`/`<AssemblyVersion>` 三处（FileVersion/AssemblyVersion 用 `1.2.2.0`）。
3. **`dotnet run --project MinimalTodoApp/MinimalTodoApp.csproj -c Debug` 运行验证**（见下「验证清单」），**然后停下让用户确认**，不要直接出包/发布。
4. 确认后：`.\build.ps1` 出无依赖 exe → 追加 `优化记录.md`（第四十三轮，**务必抄录上面的「用户原始需求」**）、`release.md`（v1.2.2 段）、`release-notes.md`（v1.2.2 中英段）→ commit（中文 message，述标签重构 + i18n）→ push main。
5. **用户最终确认后**再 `.\release.ps1` 发布 v1.2.2（`v1.2.2` tag 不存在，按 CLAUDE.md 直接发布即可；GH token 走 git 凭据管理器或 `$env:GH_TOKEN`，`gh` CLI 本机未安装，`release.ps1` 用 REST，不需要它）。
6. 收尾后**删除本交接文档** `MinimalTodoApp/HANDOFF-标签重构.md`（别提交进 release）。

## 验证清单（运行时重点核对）

- 侧栏只剩 所有待办 / 已完成 / 四象限 / 标签看板 / 收集箱；无分组行、无折叠箭头；点四个入口都能切换且选中色块正确。
- **标签看板**：每标签一个容器 + 「无标签」容器；一行两个、宽≈一个象限、高随内容、自动贴齐（`WrapPanel.ItemWidth=HalfWidth` 是否随窗口宽自适应、会不会因滚动条挤成三列——必要时调 `HalfWidthConverter` 里的 `-26` 余量）。
- 容器内「+ 添加」回车建该标签任务；勾选完成有卡片消失动画（`OnTaskCompleting` 看板分支）；任务可跨容器拖动（改标签）且同容器内可重排；右键容器可重命名（内联，复用 `GroupNameEdit_*` 处理器，TextBox `DataContext={Binding Tag}`）/改图标/删除（删除→任务进「无标签」列）。
- **新建待办**：选项面板「标签」按钮显示当前选择（默认「无标签」），点开可选已有标签 / ❌ 删除（其任务转无标签）/ 输入名+「新建」建标签并选中；建出的任务 chip 正确。
- 「所有待办」列表每条任务显示标签 chip（无标签不显示）；改标签/改图标/重命名后 chip 与看板同步。
- **数据迁移**：用现有 `%AppData%\MinimalTodoApp\data.json` 启动——工作/学习/生活变成标签且任务不丢；老的「未分组」（GroupId 指向「所有待办」聚合组）落入「无标签」列。
- 中英切换：标签看板标题、无标签、选择器、容器右键等文案都正确（注意 `S.Tag.*` 里 C# `Loc.T` 取的「无标签」随语言刷新——已在 `OnLanguageChanged` 接 `RefreshTagBoard`）。

## 已知风险/注意点

- 残留**未使用命令**：`AddGroupCommand`、`ToggleGroupCollapseCommand`、`ClearGroup`（已完成右键「清空已完成」仍用 `ClearGroupCommand`，保留）、`SidebarGroups`/`MoveTaskToGroup` 等仍在但 UI 基本不再触发，无害，可不动。
- `RefreshTagBoard()` 每次**全量重建** `TagColumns`（清空+重加）。计时器（30s）**没有**调它（标签不随时间变），所以容器「+ 添加」输入不会被打断；但任何增删/拖动/完成会重建，属预期。
- 看板容器 ListBox 设了 `ScrollViewer.VerticalScrollBarVisibility=Disabled` 让其按内容撑高（外层 `TagBoardArea` 统一滚动）。若某标签任务极多导致虚拟化/性能问题再议（通常标签内任务不多）。
- 标签**创建时选图标**：当前实现为「建标签用默认图标（`IconForName`），到看板右键『更改图标』改」。用户原话「创建时可选图标」未在创建弹层内直接提供图标选择。**建议运行展示时向用户说明**；若用户坚持要创建即选图标，可在「+ 新建」流程里建完后自动 `new IconPickerDialog(vm, newTag)`，或在新建行加一个图标按钮。

## 常用命令

```powershell
dotnet build MinimalTodoApp/MinimalTodoApp.csproj -c Debug -nologo   # 编译(注意 MinimalTodoApp 目录下有 *_wpftmp.csproj,必须指定 csproj)
dotnet run --project MinimalTodoApp/MinimalTodoApp.csproj -c Debug    # 运行(GUI,用 Stop-Process -Name MinimalTodoApp 关闭以便重建)
.\build.ps1        # 出无依赖单文件 exe
.\release.ps1      # 发布 GitHub Release(按 csproj 版本)
```
