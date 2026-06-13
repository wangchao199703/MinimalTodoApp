import zhDict from "../i18n/zh.json";
import enDict from "../i18n/en.json";

export type Lang = "zh-CN" | "en";

// 新版 UI 独有、旧版词典没有的少量补充键(若旧词典已有同名键则以旧词典为准)
const EXTRA: Record<Lang, Record<string, string>> = {
  "zh-CN": {
    "S.MenuTheme": "修改主题",
    "S.X.EmptyList": "没有待办,享受当下 ☕",
    "S.X.EmptyCompleted": "还没有已完成的任务",
    "S.X.ThemeEditorTitle": "自定义主题",
    "S.X.ThemeName": "主题名称",
    "S.X.Delete": "删除",
    "S.X.Edit": "编辑",
    "S.X.MakeSubtask": "变为子任务",
    "S.X.Outdent": "提升一级",
    "S.X.DeleteWithChildren": "删除(含子任务)",
    "S.X.ReminderOff": "关闭周期提醒",
    "S.X.ReminderOn": "周期提醒(30分)",
    "S.X.Pin": "置顶",
    "S.X.Unpin": "取消置顶",
    "S.X.U.Min": "分钟",
    "S.X.U.Hour": "小时",
    "S.X.U.Day": "天",
    "S.X.U.Week": "周",
    "S.X.Favorite": "收藏",
    "S.X.Unfavorite": "取消收藏",
    "S.X.ToggleMax": "最大化",
    "S.X.Minimize": "最小化",
    "S.X.NewTagName": "新标签",
    "S.X.Expand": "展开子任务",
    "S.X.Collapse": "折叠子任务",
    "S.X.Complete": "完成",
    "S.X.Uncomplete": "取消完成",
    "S.X.SortBy": "排序方式",
    "S.X.QuadrantHighOnly": "四象限「重要」仅含高优先级",
    "S.X.QuadrantSoon": "四象限「紧急」纳入 3 天内到期",
    "S.X.Notes": "便签",
    "S.X.Inbox": "收集箱",
    "S.X.NewNote": "新建便签",
    "S.X.NewNoteGroup": "新建分组",
    "S.X.Preview": "预览",
    "S.X.EditMode": "编辑",
    "S.X.UntitledNote": "无标题便签",
    "S.X.EmptyNotes": "选择或新建一个便签",
    "S.X.Schedule": "日程",
    "S.X.Weekdays": "一,二,三,四,五,六,日",
    "S.X.MonthFmt": "{0}年{1}月",
    "S.X.Today": "今天",
    "S.X.NoDayTasks": "这一天没有截止的任务",
    "S.X.CollapseSidebar": "折叠侧栏",
    "S.X.ExpandSidebar": "展开侧栏",
    "S.X.Calendar": "日历",
    "S.X.ViewDay": "日",
    "S.X.ViewWeek": "周",
    "S.X.ViewMonth": "月",
    "S.X.DayFmt": "{0}月{1}日",
    "S.X.InheritGlobal": "继承全局",
    "S.X.Inherit": "继承",
    "S.X.ConfirmDeleteTask": "确定删除该任务？此操作不可撤销。",
    "S.X.ConfirmDeleteTaskTree": "确定删除该任务及其全部子任务？此操作不可撤销。",
    "S.X.ConfirmDeleteTag": "确定删除标签「{0}」？其下任务将变为无标签。",
    "S.X.ConfirmClearCompleted": "确定清空全部已完成任务？此操作不可撤销。",
    "S.X.NoteGroupDeleteConfirm": "确定删除该分组？组内便签将移入其他分组，不会被删除。",
    "S.X.ResetDefaults": "恢复默认设置",
    "S.X.ResetDefaultsDesc": "将除语言外的所有设置恢复为默认值。",
    "S.X.ResetDefaultsConfirm": "确定将除语言外的所有设置恢复为默认值？此操作不可撤销。",
    "S.X.NoteInheritSizeSpacing": "字号·行距继承全局",
    "S.X.NoteInheritSizeSpacingDesc": "关闭后可单独设置便签的字号与行距。",
    "S.X.NoteInheritSize": "字号继承全局",
    "S.X.NoteInheritLineSpacing": "行距继承全局",
    "S.X.TagBoardRoot": "标签看板",
  },
  en: {
    "S.MenuTheme": "Theme",
    "S.X.EmptyList": "Nothing to do. Enjoy ☕",
    "S.X.EmptyCompleted": "No completed tasks yet",
    "S.X.ThemeEditorTitle": "Custom theme",
    "S.X.ThemeName": "Theme name",
    "S.X.Delete": "Delete",
    "S.X.Edit": "Edit",
    "S.X.MakeSubtask": "Make subtask",
    "S.X.Outdent": "Outdent",
    "S.X.DeleteWithChildren": "Delete (with subtasks)",
    "S.X.ReminderOff": "Turn off reminder",
    "S.X.ReminderOn": "Remind every 30 min",
    "S.X.Pin": "Pin",
    "S.X.Unpin": "Unpin",
    "S.X.U.Min": "min",
    "S.X.U.Hour": "h",
    "S.X.U.Day": "d",
    "S.X.U.Week": "w",
    "S.X.Favorite": "Favorite",
    "S.X.Unfavorite": "Unfavorite",
    "S.X.ToggleMax": "Maximize",
    "S.X.Minimize": "Minimize",
    "S.X.NewTagName": "New tag",
    "S.X.Expand": "Expand subtasks",
    "S.X.Collapse": "Collapse subtasks",
    "S.X.Complete": "Complete",
    "S.X.Uncomplete": "Uncomplete",
    "S.X.SortBy": "Sort by",
    "S.X.QuadrantHighOnly": 'Matrix "important" = high priority only',
    "S.X.QuadrantSoon": 'Matrix "urgent" includes due within 3 days',
    "S.X.Notes": "Notes",
    "S.X.Inbox": "Inbox",
    "S.X.NewNote": "New note",
    "S.X.NewNoteGroup": "New group",
    "S.X.Preview": "Preview",
    "S.X.EditMode": "Edit",
    "S.X.UntitledNote": "Untitled",
    "S.X.EmptyNotes": "Select or create a note",
    "S.X.Schedule": "Schedule",
    "S.X.Weekdays": "Mo,Tu,We,Th,Fr,Sa,Su",
    "S.X.MonthFmt": "{0}-{1}",
    "S.X.Today": "Today",
    "S.X.NoDayTasks": "Nothing due this day",
    "S.X.CollapseSidebar": "Collapse sidebar",
    "S.X.ExpandSidebar": "Expand sidebar",
    "S.X.Calendar": "Calendar",
    "S.X.ViewDay": "Day",
    "S.X.ViewWeek": "Week",
    "S.X.ViewMonth": "Month",
    "S.X.DayFmt": "{0}/{1}",
    "S.X.InheritGlobal": "Inherit global",
    "S.X.Inherit": "Inherit",
    "S.X.ConfirmDeleteTask": "Delete this task? This cannot be undone.",
    "S.X.ConfirmDeleteTaskTree": "Delete this task and all its subtasks? This cannot be undone.",
    "S.X.ConfirmDeleteTag": 'Delete tag "{0}"? Its tasks will become untagged.',
    "S.X.ConfirmClearCompleted": "Clear all completed tasks? This cannot be undone.",
    "S.X.NoteGroupDeleteConfirm":
      "Delete this group? Its notes move to another group and are not deleted.",
    "S.X.ResetDefaults": "Restore defaults",
    "S.X.ResetDefaultsDesc": "Reset all settings except language to their defaults.",
    "S.X.ResetDefaultsConfirm":
      "Restore all settings except language to defaults? This cannot be undone.",
    "S.X.NoteInheritSizeSpacing": "Inherit global size & spacing",
    "S.X.NoteInheritSizeSpacingDesc": "Turn off to set note size and line spacing separately.",
    "S.X.NoteInheritSize": "Inherit global size",
    "S.X.NoteInheritLineSpacing": "Inherit global line spacing",
    "S.X.TagBoardRoot": "Tag board",
  },
};

const dicts: Record<Lang, Record<string, string>> = {
  "zh-CN": { ...EXTRA["zh-CN"], ...(zhDict as Record<string, string>) },
  en: { ...EXTRA["en"], ...(enDict as Record<string, string>) },
};

let current: Lang = "zh-CN";

export function setLang(lang: Lang) {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** 取文案;缺失时返回键本身,未翻译的键会醒目暴露(对齐旧版 Loc.T) */
export function t(key: string): string {
  return dicts[current][key] ?? key;
}

/** 带 {0} {1} 占位符的格式化文案(对齐旧版 Loc.F) */
export function f(key: string, ...args: (string | number)[]): string {
  return t(key).replace(/\{(\d+)\}/g, (m, i) => {
    const v = args[Number(i)];
    return v === undefined ? m : String(v);
  });
}
