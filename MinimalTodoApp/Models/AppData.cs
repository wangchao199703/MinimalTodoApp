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

    /// <summary>正文/任务文字基准字号(可在设置里调整，持久化).</summary>
    public double FontSize { get; set; } = 14;

    /// <summary>行距倍率(1.0=标准)，同时影响文字行高与任务行间距，持久化.</summary>
    public double LineSpacing { get; set; } = 1.0;

    /// <summary>上次选中的分组 Id(null 表示“全部任务”).</summary>
    public Guid? SelectedGroupId { get; set; }

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

    /// <summary>用户自定义主题列表.</summary>
    public List<CustomTheme> CustomThemes { get; set; } = new();

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
}
