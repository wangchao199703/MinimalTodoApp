using System;
using System.Collections.Generic;

namespace MinimalTodoApp.Models;

/// <summary>
/// 持久化到 data.json 的根对象.分组与任务均为扁平列表，无对象互相引用，
/// 因此 System.Text.Json 序列化时不会出现循环引用问题.
/// </summary>
public class AppData
{
    public List<TodoGroup> Groups { get; set; } = new();

    public List<TodoItem> Items { get; set; } = new();

    /// <summary>主题名称(对应 Themes 目录下的 xaml 文件名).</summary>
    public string Theme { get; set; } = "Light";

    /// <summary>界面语言(zh-CN / en).对应 Lang 目录下的 Strings.{lang}.xaml.</summary>
    public string Language { get; set; } = "zh-CN";

    /// <summary>正文/任务文字字体(可在设置里调整，持久化).空串表示跟随系统默认字体.</summary>
    public string FontFamily { get; set; } = "Microsoft YaHei UI, Segoe UI";

    /// <summary>正文/任务文字基准字号(可在设置里调整，持久化).默认 14(与现代系统正文一致).</summary>
    public double FontSize { get; set; } = 14;

    /// <summary>行距倍率(默认 1.1，略松更透气)，同时影响文字行高与任务行间距，持久化.</summary>
    public double LineSpacing { get; set; } = 1.1;

    /// <summary>勾选框圆环直径(可在设置里调整，持久化).0=未设置(首次按字号+2，约与文字等高).</summary>
    public double CheckboxSize { get; set; }

    /// <summary>分组默认图标是否已初始化.false 时启动会给 所有待办/已完成/工作/学习/生活 强制赋默认图标一次.</summary>
    public bool GroupIconsInitialized { get; set; }

    /// <summary>上次选中的分组 Id(null 表示“全部任务”).</summary>
    public Guid? SelectedGroupId { get; set; }

    /// <summary>标签看板「无标签」列的位置(列序索引);-1=末位(默认,兼容旧数据).</summary>
    public int UntaggedColumnIndex { get; set; } = -1;

    /// <summary>上次使用的排序方式.</summary>
    public SortMode Sort { get; set; } = SortMode.Custom;

    /// <summary>左侧分组栏宽度(可由分隔条拖动调整).</summary>
    public double SidebarWidth { get; set; } = 113;

    /// <summary>左侧分组栏是否已折叠(隐藏).</summary>
    public bool SidebarCollapsed { get; set; }

    /// <summary>添加任务输入栏的高度(可由分隔条上下拖动调整，持久化).</summary>
    public double InputBarHeight { get; set; } = 40;

    /// <summary>右侧日程面板宽度(可由分隔条拖动调整，持久化).</summary>
    public double ScheduleWidth { get; set; } = 300;

    /// <summary>右侧日程面板是否展开(持久化，上次展开则下次启动也展开).</summary>
    public bool ScheduleOpen { get; set; }

    /// <summary>全部便签(v1.2.0 新增便签模块).向后兼容默认空.</summary>
    public List<Note> Notes { get; set; } = new();

    /// <summary>收集箱中的便签分组(分类).向后兼容默认空.</summary>
    public List<NoteGroup> NoteGroups { get; set; } = new();

    /// <summary>收集箱根是否折叠(持久化):折叠时侧栏隐藏便签分组与便签列表.</summary>
    public bool InboxCollapsed { get; set; }

    /// <summary>中央区域是否处于便签视图(持久化，下次启动恢复).</summary>
    public bool NotesViewOpen { get; set; }

    /// <summary>上次选中的便签 Id.</summary>
    public Guid? SelectedNoteId { get; set; }

    /// <summary>便签正文字体(收集箱设置，与待办区独立).空=继承全局/产品默认(向后兼容:存量用户便签外观不变).</summary>
    public string NoteFontFamily { get; set; } = "";

    /// <summary>便签正文基准字号(收集箱设置).0=未设置(继承全局).</summary>
    public double NoteFontSize { get; set; }

    /// <summary>便签正文行距倍率(收集箱设置).0=未设置(继承全局).</summary>
    public double NoteLineSpacing { get; set; }

    /// <summary>用户自定义主题列表.</summary>
    public List<CustomTheme> CustomThemes { get; set; } = new();

    /// <summary>主题最近使用顺序(队首=最近)，用于"常用"分组排序.向后兼容默认空.</summary>
    public List<string> ThemeUsageOrder { get; set; } = new();

    /// <summary>用户收藏的主题 Key(有序，可拖动排序)，构成主题窗口的"收藏"分组.向后兼容默认空.</summary>
    public List<string> FavoriteThemeKeys { get; set; } = new();

    /// <summary>窗口是否始终置于顶层.</summary>
    public bool AlwaysOnTop { get; set; }

    /// <summary>完成任务时是否播放烟花庆祝特效(默认开启).</summary>
    public bool EffectsEnabled { get; set; } = true;

    /// <summary>完成任务时是否播放音效(默认关闭).</summary>
    public bool SoundEnabled { get; set; }

    /// <summary>周期提醒触发时是否播放提示音(默认开启).</summary>
    public bool ReminderSoundEnabled { get; set; } = true;

    /// <summary>窗口贴边自动隐藏的边(0=未贴边，1=上，2=左，3=右).用于下次启动恢复贴边隐藏状态.</summary>
    public int DockEdge { get; set; }

    /// <summary>
    /// 是否已完成“首次启动时自动注册开机自启动”的初始化.
    /// 首启时默认开启开机自启动并把此标志置为 true，之后尊重用户在设置里的手动选择，不再强制覆盖.
    /// </summary>
    public bool StartupInitialized { get; set; }

    /// <summary>是否启用自动检查更新(默认开启).关闭后启动与每小时定时都不再自动检查.</summary>
    public bool AutoUpdateEnabled { get; set; } = true;

    /// <summary>用户选择“此版本不再提示”的版本号(如 1.1.4).自动检查命中该版本时静默跳过；手动检查仍会提示.</summary>
    public string IgnoredUpdateVersion { get; set; } = "";

    /// <summary>日历是否显示国内法定节假日(默认开启).联网获取并本地缓存.</summary>
    public bool ShowHolidays { get; set; } = true;

    /// <summary>节假日数据缓存:年份 → 该年原始 JSON(holiday-cn 数据集).缓存当年+次年，避免每次启动联网.</summary>
    public Dictionary<int, string> HolidayCacheByYear { get; set; } = new();

    /// <summary>节假日上次成功联网刷新的日期(yyyy-MM-dd，空=从未).每天最多刷新一次.</summary>
    public string HolidayLastRefreshDate { get; set; } = "";

    /// <summary>是否已展示过"拖拽任务到日历设置截止时间"的一次性功能提示(仅提示一次).</summary>
    public bool CalendarDragHintShown { get; set; }

    /// <summary>
    /// 待办勾选圈是否「不显示优先级颜色」:开启后圆环用中性灰，改在任务最前方显示一个优先级色块
    /// (红/黄/绿 三色，类似分组色块)来区分优先级.默认关闭(沿用彩色圆环).
    /// </summary>
    public bool ShowPriorityBlock { get; set; }

    /// <summary>
    /// 四象限「重要」判定是否仅含「高」优先级:true=仅高为重要;false(默认)=高+中均为重要.
    /// </summary>
    public bool QuadrantImportantHighOnly { get; set; }

    /// <summary>
    /// 四象限「紧急」判定是否纳入「3 天内到期(临近)」:true=逾期/今天/3天内都算紧急;
    /// false(默认)=仅逾期或今天到期算紧急.
    /// </summary>
    public bool QuadrantUrgentIncludeSoon { get; set; }
}
