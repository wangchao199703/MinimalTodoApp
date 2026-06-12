use crate::database::Db;
use crate::models::*;
use rusqlite::{params, Connection, Row};
use std::collections::HashMap;
use tauri::State;

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn now_text() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M").to_string()
}

/// 补丁字段三态:None=不变,Some(None)=清空(空串),Some(Some)=设置
fn patch(v: Option<String>) -> Option<Option<String>> {
    match v {
        None => None,
        Some(s) if s.is_empty() => Some(None),
        Some(s) => Some(Some(s)),
    }
}

fn row_to_task(row: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        title: row.get("title")?,
        is_completed: row.get("is_completed")?,
        due_date: row.get("due_date")?,
        group_id: row.get("group_id")?,
        original_group_id: row.get("original_group_id")?,
        priority: row.get("priority")?,
        order_index: row.get("order_index")?,
        indent_level: row.get("indent_level")?,
        parent_id: row.get("parent_id")?,
        is_collapsed: row.get("is_collapsed")?,
        is_pinned: row.get("is_pinned")?,
        quadrant_override: row.get("quadrant_override")?,
        reminder_enabled: row.get("reminder_enabled")?,
        reminder_interval_minutes: row.get("reminder_interval_minutes")?,
        last_reminded_at: row.get("last_reminded_at")?,
        created_at: row.get("created_at")?,
    })
}

fn row_to_group(row: &Row) -> rusqlite::Result<Group> {
    Ok(Group {
        id: row.get("id")?,
        name: row.get("name")?,
        order_index: row.get("order_index")?,
        color: row.get("color")?,
        icon: row.get("icon")?,
        icon_image: row.get("icon_image")?,
        is_collapsed: row.get("is_collapsed")?,
    })
}

fn get_task_by_id(conn: &Connection, id: &str) -> CmdResult<Task> {
    conn.query_row("SELECT * FROM tasks WHERE id = ?1", params![id], row_to_task)
        .map_err(err)
}

// ---------- 标签(分组) ----------

#[tauri::command]
pub fn get_groups(db: State<Db>) -> CmdResult<Vec<Group>> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn
        .prepare("SELECT * FROM groups ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_group).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_group(db: State<Db>, name: String) -> CmdResult<Group> {
    let conn = db.0.lock().map_err(err)?;
    let id = uuid::Uuid::new_v4().to_string();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(order_index), -1) + 1 FROM groups", [], |r| r.get(0))
        .map_err(err)?;
    conn.execute(
        "INSERT INTO groups (id, name, order_index) VALUES (?1, ?2, ?3)",
        params![id, name, order],
    )
    .map_err(err)?;
    conn.query_row("SELECT * FROM groups WHERE id = ?1", params![id], row_to_group)
        .map_err(err)
}

#[tauri::command]
pub fn update_group(db: State<Db>, req: UpdateGroupRequest) -> CmdResult<Group> {
    let conn = db.0.lock().map_err(err)?;
    let mut g = conn
        .query_row("SELECT * FROM groups WHERE id = ?1", params![req.id], row_to_group)
        .map_err(err)?;
    if let Some(v) = req.name {
        g.name = v;
    }
    if let Some(v) = req.color {
        g.color = v;
    }
    if let Some(v) = req.icon {
        g.icon = v;
    }
    if let Some(v) = req.icon_image {
        g.icon_image = v;
    }
    if let Some(v) = req.is_collapsed {
        g.is_collapsed = v;
    }
    conn.execute(
        "UPDATE groups SET name=?2, color=?3, icon=?4, icon_image=?5, is_collapsed=?6 WHERE id=?1",
        params![g.id, g.name, g.color, g.icon, g.icon_image, g.is_collapsed],
    )
    .map_err(err)?;
    Ok(g)
}

#[tauri::command]
pub fn delete_group(db: State<Db>, id: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    // 任务的 group_id 外键 ON DELETE SET NULL,任务自动变为「无标签」
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_groups(db: State<Db>, ids: Vec<String>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    let tx = conn.unchecked_transaction().map_err(err)?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE groups SET order_index = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)
}

// ---------- 任务 ----------

#[tauri::command]
pub fn get_tasks(db: State<Db>) -> CmdResult<Vec<Task>> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn
        .prepare("SELECT * FROM tasks ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_task).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_task(db: State<Db>, req: CreateTaskRequest) -> CmdResult<Task> {
    let conn = db.0.lock().map_err(err)?;
    let id = uuid::Uuid::new_v4().to_string();
    // 顶层新任务排最前;子任务追加到末尾(对齐旧版直觉)
    let order: i64 = if req.parent_id.is_some() {
        conn.query_row("SELECT COALESCE(MAX(order_index), 0) + 1 FROM tasks", [], |r| r.get(0))
            .map_err(err)?
    } else {
        conn.query_row("SELECT COALESCE(MIN(order_index), 1) - 1 FROM tasks", [], |r| r.get(0))
            .map_err(err)?
    };
    conn.execute(
        "INSERT INTO tasks (id, title, group_id, due_date, priority, parent_id, indent_level,
                            reminder_enabled, reminder_interval_minutes, order_index, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            req.title,
            req.group_id,
            req.due_date,
            req.priority.unwrap_or(2),
            req.parent_id,
            req.indent_level.unwrap_or(0),
            req.reminder_enabled.unwrap_or(false),
            req.reminder_interval_minutes.unwrap_or(30),
            order,
            now_text(),
        ],
    )
    .map_err(err)?;
    get_task_by_id(&conn, &id)
}

#[tauri::command]
pub fn update_task(db: State<Db>, req: UpdateTaskRequest) -> CmdResult<Task> {
    let conn = db.0.lock().map_err(err)?;
    let mut t = get_task_by_id(&conn, &req.id)?;

    if let Some(v) = req.title {
        t.title = v;
    }
    if let Some(v) = req.is_completed {
        t.is_completed = v;
    }
    if let Some(v) = patch(req.due_date) {
        t.due_date = v;
    }
    if let Some(v) = patch(req.group_id) {
        t.group_id = v;
    }
    if let Some(v) = patch(req.original_group_id) {
        t.original_group_id = v;
    }
    if let Some(v) = req.priority {
        t.priority = v;
    }
    if let Some(v) = req.indent_level {
        t.indent_level = v;
    }
    if let Some(v) = patch(req.parent_id) {
        t.parent_id = v;
    }
    if let Some(v) = req.is_collapsed {
        t.is_collapsed = v;
    }
    if let Some(v) = req.is_pinned {
        t.is_pinned = v;
    }
    if let Some(v) = req.quadrant_override {
        // 0 表示清除手动覆盖
        t.quadrant_override = if v == 0 { None } else { Some(v) };
    }
    if let Some(v) = req.reminder_enabled {
        t.reminder_enabled = v;
    }
    if let Some(v) = req.reminder_interval_minutes {
        t.reminder_interval_minutes = v;
    }
    if let Some(v) = patch(req.last_reminded_at) {
        t.last_reminded_at = v;
    }

    conn.execute(
        "UPDATE tasks SET title=?2, is_completed=?3, due_date=?4, group_id=?5, original_group_id=?6,
                          priority=?7, indent_level=?8, parent_id=?9, is_collapsed=?10, is_pinned=?11,
                          quadrant_override=?12, reminder_enabled=?13, reminder_interval_minutes=?14,
                          last_reminded_at=?15
         WHERE id=?1",
        params![
            t.id,
            t.title,
            t.is_completed,
            t.due_date,
            t.group_id,
            t.original_group_id,
            t.priority,
            t.indent_level,
            t.parent_id,
            t.is_collapsed,
            t.is_pinned,
            t.quadrant_override,
            t.reminder_enabled,
            t.reminder_interval_minutes,
            t.last_reminded_at,
        ],
    )
    .map_err(err)?;
    Ok(t)
}

#[tauri::command]
pub fn delete_task(db: State<Db>, id: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    // parent_id 外键 ON DELETE CASCADE,子孙任务随之删除
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(db: State<Db>, ids: Vec<String>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    let tx = conn.unchecked_transaction().map_err(err)?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET order_index = ?1 WHERE id = ?2",
            params![i as i64, id],
        )
        .map_err(err)?;
    }
    tx.commit().map_err(err)
}

// ---------- 自定义主题 ----------

#[tauri::command]
pub fn get_custom_themes(db: State<Db>) -> CmdResult<Vec<CustomTheme>> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn
        .prepare("SELECT key, display, colors_json FROM custom_themes")
        .map_err(err)?;
    let rows = stmt
        .query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
        })
        .map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        let (key, display, colors_json) = row.map_err(err)?;
        let colors = serde_json::from_str(&colors_json).unwrap_or_default();
        out.push(CustomTheme { key, display, colors });
    }
    Ok(out)
}

#[tauri::command]
pub fn save_custom_theme(db: State<Db>, theme: CustomTheme) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "INSERT INTO custom_themes (key, display, colors_json) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET display = excluded.display, colors_json = excluded.colors_json",
        params![
            theme.key,
            theme.display,
            serde_json::to_string(&theme.colors).map_err(err)?
        ],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_custom_theme(db: State<Db>, key: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("DELETE FROM custom_themes WHERE key = ?1", params![key])
        .map_err(err)?;
    Ok(())
}

// ---------- 设置 ----------

#[tauri::command]
pub fn get_settings(db: State<Db>) -> CmdResult<HashMap<String, String>> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(err)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?;
    rows.collect::<Result<HashMap<_, _>, _>>().map_err(err)
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}
