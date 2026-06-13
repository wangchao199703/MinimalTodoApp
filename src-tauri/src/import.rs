//! 旧版 WPF data.json → SQLite 一次性导入。
//! 触发条件:数据库无任何业务数据 且 settings 无 imported_at 且 旧文件存在。
//! 原 data.json 保持不动,可随时回到旧版。

use crate::database::data_dir;
use rusqlite::{params, Connection};
use serde::Deserialize;

const NIL_GUID: &str = "00000000-0000-0000-0000-000000000000";

// 旧版 System.Text.Json 输出为 PascalCase,缺省字段(WhenWritingNull)用 Option + default
#[derive(Deserialize)]
#[serde(rename_all = "PascalCase", default)]
struct OldGroup {
    id: String,
    name: String,
    order_index: i64,
    color: String,
    icon: String,
    icon_image: String,
    is_completed_group: bool,
    is_all_uncompleted_group: bool,
    is_quadrant_group: bool,
    is_tag_board_group: bool,
    is_collapsed: bool,
}

impl Default for OldGroup {
    fn default() -> Self {
        OldGroup {
            id: String::new(),
            name: String::new(),
            order_index: 0,
            color: "#3B82F6".into(),
            icon: String::new(),
            icon_image: String::new(),
            is_completed_group: false,
            is_all_uncompleted_group: false,
            is_quadrant_group: false,
            is_tag_board_group: false,
            is_collapsed: false,
        }
    }
}

impl OldGroup {
    fn is_special(&self) -> bool {
        self.is_completed_group
            || self.is_all_uncompleted_group
            || self.is_quadrant_group
            || self.is_tag_board_group
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "PascalCase", default)]
struct OldItem {
    id: String,
    title: String,
    is_completed: bool,
    due_date: Option<String>,
    group_id: Option<String>,
    original_group_id: Option<String>,
    priority: i32,
    order_index: i64,
    indent_level: i32,
    parent_id: Option<String>,
    is_collapsed: bool,
    is_pinned: bool,
    quadrant_override: Option<i32>,
    reminder_enabled: bool,
    reminder_interval_minutes: i32,
    created_at: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "PascalCase", default)]
struct OldNote {
    id: String,
    title: String,
    custom_title: String,
    content: String,
    group_id: Option<String>,
    order_index: i64,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "PascalCase", default)]
struct OldNoteGroup {
    id: String,
    name: String,
    order_index: i64,
    is_collapsed: bool,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "PascalCase", default)]
struct OldCustomTheme {
    key: String,
    display: String,
    colors: std::collections::HashMap<String, String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "PascalCase", default)]
struct OldAppData {
    groups: Vec<OldGroup>,
    items: Vec<OldItem>,
    notes: Vec<OldNote>,
    note_groups: Vec<OldNoteGroup>,
    custom_themes: Vec<OldCustomTheme>,
    // —— 标量设置(只列出需要迁移的)——
    theme: Option<String>,
    language: Option<String>,
    font_family: Option<String>,
    font_size: Option<f64>,
    line_spacing: Option<f64>,
    checkbox_size: Option<f64>,
    selected_group_id: Option<String>,
    untagged_column_index: Option<i64>,
    sort: Option<i64>,
    sidebar_width: Option<f64>,
    sidebar_collapsed: Option<bool>,
    input_bar_height: Option<f64>,
    schedule_width: Option<f64>,
    schedule_open: Option<bool>,
    inbox_collapsed: Option<bool>,
    note_font_family: Option<String>,
    note_font_size: Option<f64>,
    note_line_spacing: Option<f64>,
    theme_usage_order: Option<Vec<String>>,
    favorite_theme_keys: Option<Vec<String>>,
    always_on_top: Option<bool>,
    effects_enabled: Option<bool>,
    sound_enabled: Option<bool>,
    reminder_sound_enabled: Option<bool>,
    dock_edge: Option<i64>,
    auto_update_enabled: Option<bool>,
    ignored_update_version: Option<String>,
    show_holidays: Option<bool>,
    holiday_cache_by_year: Option<std::collections::HashMap<String, String>>,
    holiday_last_refresh_date: Option<String>,
    show_priority_block: Option<bool>,
    quadrant_important_high_only: Option<bool>,
    quadrant_urgent_include_soon: Option<bool>,
}

/// "2026-06-09T05:00:00+08:00" / "2026-06-09T05:00:00.0576525+08:00" / 无时区 → "YYYY-MM-DD HH:mm"
fn to_due_text(iso: &str) -> Option<String> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(iso) {
        return Some(dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string());
    }
    if let Ok(naive) = chrono::NaiveDateTime::parse_from_str(iso, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(naive.format("%Y-%m-%d %H:%M").to_string());
    }
    None
}

fn valid_id(id: &Option<String>) -> Option<String> {
    match id {
        Some(s) if !s.is_empty() && s != NIL_GUID => Some(s.clone()),
        _ => None,
    }
}

/// 若满足条件则执行导入,返回是否导入了数据
pub fn maybe_import(conn: &Connection) -> Result<bool, String> {
    let err = |e: &dyn std::fmt::Display| e.to_string();

    let already: i64 = conn
        .query_row("SELECT COUNT(*) FROM settings WHERE key = 'imported_at'", [], |r| r.get(0))
        .map_err(|e| err(&e))?;
    if already > 0 {
        return Ok(false);
    }
    let has_data: i64 = conn
        .query_row(
            "SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM groups) + (SELECT COUNT(*) FROM notes)",
            [],
            |r| r.get(0),
        )
        .map_err(|e| err(&e))?;
    if has_data > 0 {
        return Ok(false);
    }
    let path = data_dir().join("data.json");
    if !path.exists() {
        return Ok(false);
    }

    let raw = std::fs::read_to_string(&path).map_err(|e| err(&e))?;
    let old: OldAppData = serde_json::from_str(&raw).map_err(|e| err(&e))?;

    import_into(conn, &old)?;
    Ok(true)
}

/// 纯导入逻辑:把已解析的旧数据写入(已迁移好表结构的)连接,单事务。
/// 与文件/前置条件检查解耦,便于用内存库直接单测迁移正确性。
fn import_into(conn: &Connection, old: &OldAppData) -> Result<(), String> {
    let err = |e: &dyn std::fmt::Display| e.to_string();

    let tx = conn.unchecked_transaction().map_err(|e| err(&e))?;

    // —— 标签:跳过 4 个内置视图分组,真实标签按原顺序压实 order_index ——
    let special_ids: Vec<String> = old
        .groups
        .iter()
        .filter(|g| g.is_special())
        .map(|g| g.id.clone())
        .collect();
    let mut real_groups: Vec<&OldGroup> = old.groups.iter().filter(|g| !g.is_special()).collect();
    real_groups.sort_by_key(|g| g.order_index);
    let real_ids: Vec<String> = real_groups.iter().map(|g| g.id.clone()).collect();
    for (i, g) in real_groups.iter().enumerate() {
        tx.execute(
            "INSERT INTO groups (id, name, order_index, color, icon, icon_image, is_collapsed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![g.id, g.name, i as i64, g.color, g.icon, g.icon_image, g.is_collapsed],
        )
        .map_err(|e| err(&e))?;
    }

    // —— 任务:GroupId 指向内置视图或空 GUID 时,回退到 OriginalGroupId / 无标签 ——
    let resolve_group = |item: &OldItem| -> Option<String> {
        let gid = valid_id(&item.group_id);
        match gid {
            Some(ref id) if !special_ids.contains(id) && real_ids.contains(id) => gid,
            _ => valid_id(&item.original_group_id).filter(|id| real_ids.contains(id)),
        }
    };
    let item_ids: Vec<String> = old.items.iter().map(|t| t.id.clone()).collect();
    for t in &old.items {
        let priority = if t.priority == 0 { 2 } else { t.priority }; // None 迁移为 Medium
        let parent = valid_id(&t.parent_id).filter(|id| item_ids.contains(id));
        tx.execute(
            "INSERT INTO tasks (id, title, is_completed, due_date, group_id, original_group_id,
                                priority, order_index, indent_level, parent_id, is_collapsed,
                                is_pinned, quadrant_override, reminder_enabled,
                                reminder_interval_minutes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                t.id,
                t.title,
                t.is_completed,
                t.due_date.as_deref().and_then(to_due_text),
                resolve_group(t),
                valid_id(&t.original_group_id),
                priority,
                t.order_index,
                t.indent_level,
                parent,
                t.is_collapsed,
                t.is_pinned,
                t.quadrant_override.filter(|q| (1..=4).contains(q)),
                t.reminder_enabled,
                t.reminder_interval_minutes,
                t.created_at.as_deref().and_then(to_due_text).unwrap_or_default(),
            ],
        )
        .map_err(|e| err(&e))?;
    }

    // —— 便签 ——
    for g in &old.note_groups {
        tx.execute(
            "INSERT INTO note_groups (id, name, order_index, is_collapsed) VALUES (?1, ?2, ?3, ?4)",
            params![g.id, g.name, g.order_index, g.is_collapsed],
        )
        .map_err(|e| err(&e))?;
    }
    let note_group_ids: Vec<String> = old.note_groups.iter().map(|g| g.id.clone()).collect();
    for n in &old.notes {
        tx.execute(
            "INSERT INTO notes (id, title, custom_title, content, group_id, order_index, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                n.id,
                n.title,
                n.custom_title,
                n.content,
                valid_id(&n.group_id).filter(|id| note_group_ids.contains(id)),
                n.order_index,
                n.created_at.as_deref().and_then(to_due_text).unwrap_or_default(),
                n.updated_at.as_deref().and_then(to_due_text).unwrap_or_default(),
            ],
        )
        .map_err(|e| err(&e))?;
    }

    // —— 自定义主题 ——
    for c in &old.custom_themes {
        tx.execute(
            "INSERT INTO custom_themes (key, display, colors_json) VALUES (?1, ?2, ?3)",
            params![c.key, c.display, serde_json::to_string(&c.colors).unwrap_or_default()],
        )
        .map_err(|e| err(&e))?;
    }

    // —— 标量设置 ——
    let put = |key: &str, value: String| -> Result<(), String> {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    };
    let b = |v: bool| if v { "1".to_string() } else { "0".to_string() };

    if let Some(v) = &old.theme {
        put("theme", v.clone())?;
    }
    if let Some(v) = &old.language {
        put("language", v.clone())?;
    }
    if let Some(v) = &old.font_family {
        put("font_family", v.clone())?;
    }
    if let Some(v) = old.font_size {
        put("font_size", v.to_string())?;
    }
    if let Some(v) = old.line_spacing {
        put("line_spacing", v.to_string())?;
    }
    if let Some(v) = old.checkbox_size {
        put("checkbox_size", v.to_string())?;
    }
    if let Some(v) = old.sort {
        let modes = ["custom", "due", "priority", "completed", "created", "title"];
        put("sort", modes.get(v as usize).unwrap_or(&"custom").to_string())?;
    }
    if let Some(v) = &old.selected_group_id {
        // 内置视图分组映射到新视图键
        let mapped = old
            .groups
            .iter()
            .find(|g| &g.id == v)
            .map(|g| {
                if g.is_completed_group {
                    "completed".to_string()
                } else if g.is_quadrant_group {
                    "quadrant".to_string()
                } else if g.is_tag_board_group {
                    "tagboard".to_string()
                } else if g.is_all_uncompleted_group {
                    String::new()
                } else {
                    g.id.clone()
                }
            })
            .unwrap_or_default();
        put("selected_group_id", mapped)?;
    }
    if let Some(v) = old.untagged_column_index {
        put("untagged_column_index", v.to_string())?;
    }
    if let Some(v) = old.sidebar_width {
        put("sidebar_width", v.to_string())?;
    }
    if let Some(v) = old.sidebar_collapsed {
        put("sidebar_collapsed", b(v))?;
    }
    if let Some(v) = old.input_bar_height {
        put("input_bar_height", v.to_string())?;
    }
    if let Some(v) = old.schedule_width {
        put("schedule_width", v.to_string())?;
    }
    if let Some(v) = old.schedule_open {
        put("schedule_open", b(v))?;
    }
    if let Some(v) = old.inbox_collapsed {
        put("inbox_collapsed", b(v))?;
    }
    if let Some(v) = &old.note_font_family {
        put("note_font_family", v.clone())?;
    }
    if let Some(v) = old.note_font_size {
        put("note_font_size", v.to_string())?;
    }
    if let Some(v) = old.note_line_spacing {
        put("note_line_spacing", v.to_string())?;
    }
    if let Some(v) = &old.theme_usage_order {
        put("theme_usage_order", serde_json::to_string(v).unwrap_or_default())?;
    }
    if let Some(v) = &old.favorite_theme_keys {
        put("favorite_theme_keys", serde_json::to_string(v).unwrap_or_default())?;
    }
    if let Some(v) = old.always_on_top {
        put("always_on_top", b(v))?;
    }
    if let Some(v) = old.effects_enabled {
        put("effects_enabled", b(v))?;
    }
    if let Some(v) = old.sound_enabled {
        put("sound_enabled", b(v))?;
    }
    if let Some(v) = old.reminder_sound_enabled {
        put("reminder_sound_enabled", b(v))?;
    }
    if let Some(v) = old.dock_edge {
        put("dock_edge", v.to_string())?;
    }
    if let Some(v) = old.auto_update_enabled {
        put("auto_update_enabled", b(v))?;
    }
    if let Some(v) = &old.ignored_update_version {
        put("ignored_update_version", v.clone())?;
    }
    if let Some(v) = old.show_holidays {
        put("show_holidays", b(v))?;
    }
    if let Some(v) = &old.holiday_cache_by_year {
        put("holiday_cache", serde_json::to_string(v).unwrap_or_default())?;
    }
    if let Some(v) = &old.holiday_last_refresh_date {
        put("holiday_last_refresh", v.clone())?;
    }
    if let Some(v) = old.show_priority_block {
        put("show_priority_block", b(v))?;
    }
    if let Some(v) = old.quadrant_important_high_only {
        put("quadrant_important_high_only", b(v))?;
    }
    if let Some(v) = old.quadrant_urgent_include_soon {
        put("quadrant_urgent_include_soon", b(v))?;
    }

    put(
        "imported_at",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    )?;

    tx.commit().map_err(|e| err(&e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::database::migrate_for_test(&conn).unwrap();
        conn
    }

    fn import_json(json: &str) -> Connection {
        let old: OldAppData = serde_json::from_str(json).unwrap();
        let conn = mem_db();
        import_into(&conn, &old).unwrap();
        conn
    }

    // ---- 纯函数 ----

    #[test]
    fn to_due_text_handles_tz_frac_and_naive() {
        // 格式正确性判断(不依赖本机时区):YYYY-MM-DD HH:mm
        let well_formed = |s: &str| {
            let b = s.as_bytes();
            s.len() == 16
                && b[4] == b'-'
                && b[7] == b'-'
                && b[10] == b' '
                && b[13] == b':'
                && s.chars().filter(|c| c.is_ascii_digit()).count() == 12
        };
        // 带时区:能解析并格式化(具体小时随本机时区,故只校验格式)
        let r = to_due_text("2026-06-09T05:00:00+08:00").unwrap();
        assert!(well_formed(&r), "got {r}");
        // 带小数秒 + 时区:也应能解析
        let r = to_due_text("2026-06-09T05:00:00.0576525+08:00").unwrap();
        assert!(well_formed(&r), "got {r}");
        // 无时区 naive:不涉及时区换算,可断言精确值
        assert_eq!(
            to_due_text("2026-06-09T05:00:00"),
            Some("2026-06-09 05:00".to_string())
        );
        // 非法
        assert_eq!(to_due_text("not-a-date"), None);
    }

    #[test]
    fn valid_id_filters_nil_and_empty() {
        assert_eq!(valid_id(&Some("abc".into())), Some("abc".to_string()));
        assert_eq!(valid_id(&Some(NIL_GUID.into())), None);
        assert_eq!(valid_id(&Some("".into())), None);
        assert_eq!(valid_id(&None), None);
    }

    // ---- 端到端导入 ----

    #[test]
    fn skips_builtin_view_groups_and_compacts_order() {
        let json = r#"{
            "Groups": [
                {"Id":"g-all","Name":"全部","IsAllUncompletedGroup":true,"OrderIndex":0},
                {"Id":"g-real1","Name":"工作","OrderIndex":5},
                {"Id":"g-done","Name":"已完成","IsCompletedGroup":true,"OrderIndex":1},
                {"Id":"g-real2","Name":"生活","OrderIndex":9}
            ]
        }"#;
        let conn = import_json(json);
        let groups = crate::commands::get_groups_impl(&conn).unwrap();
        // 只剩两个真实标签,按 OrderIndex 压实为 0、1
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].name, "工作");
        assert_eq!(groups[0].order_index, 0);
        assert_eq!(groups[1].name, "生活");
        assert_eq!(groups[1].order_index, 1);
    }

    #[test]
    fn task_priority_none_becomes_medium_and_due_converted() {
        let json = r#"{
            "Items": [
                {"Id":"t1","Title":"无优先级","Priority":0,"DueDate":"2026-06-09T05:00:00"},
                {"Id":"t2","Title":"高","Priority":3}
            ]
        }"#;
        let conn = import_json(json);
        let tasks = crate::commands::get_tasks_impl(&conn).unwrap();
        let t1 = tasks.iter().find(|t| t.id == "t1").unwrap();
        let t2 = tasks.iter().find(|t| t.id == "t2").unwrap();
        assert_eq!(t1.priority, 2, "Priority 0(None)迁移为 Medium");
        assert_eq!(t1.due_date.as_deref(), Some("2026-06-09 05:00"));
        assert_eq!(t2.priority, 3);
        assert_eq!(t2.due_date, None);
    }

    #[test]
    fn task_group_falls_back_when_pointing_to_builtin_or_nil() {
        let json = r#"{
            "Groups": [
                {"Id":"g-quad","Name":"四象限","IsQuadrantGroup":true,"OrderIndex":0},
                {"Id":"g-real","Name":"工作","OrderIndex":1}
            ],
            "Items": [
                {"Id":"t-builtin","Title":"指向内置视图","GroupId":"g-quad","OriginalGroupId":"g-real"},
                {"Id":"t-nil","Title":"空GUID标签","GroupId":"00000000-0000-0000-0000-000000000000"},
                {"Id":"t-ok","Title":"正常标签","GroupId":"g-real"}
            ]
        }"#;
        let conn = import_json(json);
        let tasks = crate::commands::get_tasks_impl(&conn).unwrap();
        let by = |id: &str| tasks.iter().find(|t| t.id == id).unwrap().clone();
        // 指向内置视图分组 → 回退到 OriginalGroupId(真实标签)
        assert_eq!(by("t-builtin").group_id.as_deref(), Some("g-real"));
        // 空 GUID → 无标签
        assert_eq!(by("t-nil").group_id, None);
        assert_eq!(by("t-ok").group_id.as_deref(), Some("g-real"));
    }

    #[test]
    fn dangling_parent_id_is_dropped() {
        let json = r#"{
            "Items": [
                {"Id":"t1","Title":"父不存在","ParentId":"nonexistent"},
                {"Id":"t2","Title":"父存在","ParentId":"t1"}
            ]
        }"#;
        let conn = import_json(json);
        let tasks = crate::commands::get_tasks_impl(&conn).unwrap();
        let t1 = tasks.iter().find(|t| t.id == "t1").unwrap();
        let t2 = tasks.iter().find(|t| t.id == "t2").unwrap();
        assert_eq!(t1.parent_id, None, "指向不存在的父应被丢弃(否则违反外键)");
        assert_eq!(t2.parent_id.as_deref(), Some("t1"));
    }

    #[test]
    fn sort_index_maps_to_mode_name() {
        // sort=2 → "priority"
        let conn = import_json(r#"{"Sort": 2}"#);
        let s = crate::commands::get_settings_impl(&conn).unwrap();
        assert_eq!(s.get("sort").unwrap(), "priority");
        // 越界 → custom
        let conn = import_json(r#"{"Sort": 99}"#);
        let s = crate::commands::get_settings_impl(&conn).unwrap();
        assert_eq!(s.get("sort").unwrap(), "custom");
    }

    #[test]
    fn selected_group_id_maps_builtin_views() {
        let json = r#"{
            "Groups": [{"Id":"g-done","Name":"已完成","IsCompletedGroup":true,"OrderIndex":0}],
            "SelectedGroupId": "g-done"
        }"#;
        let conn = import_json(json);
        let s = crate::commands::get_settings_impl(&conn).unwrap();
        assert_eq!(s.get("selected_group_id").unwrap(), "completed");
    }

    #[test]
    fn notes_and_note_groups_imported() {
        let json = r#"{
            "NoteGroups": [{"Id":"ng1","Name":"工作笔记","OrderIndex":0}],
            "Notes": [
                {"Id":"n1","Title":"标题","CustomTitle":"自定义","Content":"正文","GroupId":"ng1","OrderIndex":0,"CreatedAt":"2026-06-09T05:00:00"},
                {"Id":"n2","Title":"孤儿","GroupId":"00000000-0000-0000-0000-000000000000"}
            ]
        }"#;
        let conn = import_json(json);
        let groups = crate::commands::get_note_groups_impl(&conn).unwrap();
        assert_eq!(groups.len(), 1);
        let notes = crate::commands::get_notes_impl(&conn).unwrap();
        let n1 = notes.iter().find(|n| n.id == "n1").unwrap();
        assert_eq!(n1.custom_title, "自定义");
        assert_eq!(n1.group_id.as_deref(), Some("ng1"));
        assert_eq!(n1.created_at, "2026-06-09 05:00");
        // 指向空 GUID 的便签 → 无分组(NULL)
        let n2 = notes.iter().find(|n| n.id == "n2").unwrap();
        assert_eq!(n2.group_id, None);
    }

    #[test]
    fn scalar_settings_bools_and_imported_at() {
        let json = r#"{
            "AlwaysOnTop": true,
            "ShowHolidays": false,
            "Theme": "dark-onyx",
            "Language": "en"
        }"#;
        let conn = import_json(json);
        let s = crate::commands::get_settings_impl(&conn).unwrap();
        assert_eq!(s.get("always_on_top").unwrap(), "1");
        assert_eq!(s.get("show_holidays").unwrap(), "0");
        assert_eq!(s.get("theme").unwrap(), "dark-onyx");
        assert_eq!(s.get("language").unwrap(), "en");
        assert!(s.contains_key("imported_at"), "应写入 imported_at 防重导");
    }

    #[test]
    fn empty_json_imports_nothing() {
        let conn = import_json("{}");
        assert_eq!(crate::commands::get_tasks_impl(&conn).unwrap().len(), 0);
        assert_eq!(crate::commands::get_groups_impl(&conn).unwrap().len(), 0);
        // 即便没有业务数据,也应标记 imported_at
        let s = crate::commands::get_settings_impl(&conn).unwrap();
        assert!(s.contains_key("imported_at"));
    }
}
