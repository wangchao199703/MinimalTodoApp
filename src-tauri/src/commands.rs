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
//
// 约定:每个命令拆成「`#[tauri::command]` 壳(加锁) + `*_impl(conn, …)` 核心」两层,
// 核心函数只依赖 `&Connection`,便于在 `#[cfg(test)]` 里用内存库直接单测。

#[tauri::command]
pub fn get_groups(db: State<Db>) -> CmdResult<Vec<Group>> {
    let conn = db.0.lock().map_err(err)?;
    get_groups_impl(&conn)
}

pub(crate) fn get_groups_impl(conn: &Connection) -> CmdResult<Vec<Group>> {
    let mut stmt = conn
        .prepare("SELECT * FROM groups ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_group).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_group(db: State<Db>, name: String) -> CmdResult<Group> {
    let conn = db.0.lock().map_err(err)?;
    create_group_impl(&conn, name)
}

pub(crate) fn create_group_impl(conn: &Connection, name: String) -> CmdResult<Group> {
    let id = uuid::Uuid::new_v4().to_string();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(order_index), -1) + 1 FROM groups", [], |r| r.get(0))
        .map_err(err)?;
    // 标签默认无色(color=''),由用户右键「修改颜色」设色;TagIcon 空色即单色渲染
    conn.execute(
        "INSERT INTO groups (id, name, color, order_index) VALUES (?1, ?2, '', ?3)",
        params![id, name, order],
    )
    .map_err(err)?;
    conn.query_row("SELECT * FROM groups WHERE id = ?1", params![id], row_to_group)
        .map_err(err)
}

#[tauri::command]
pub fn update_group(db: State<Db>, req: UpdateGroupRequest) -> CmdResult<Group> {
    let conn = db.0.lock().map_err(err)?;
    update_group_impl(&conn, req)
}

pub(crate) fn update_group_impl(conn: &Connection, req: UpdateGroupRequest) -> CmdResult<Group> {
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
    delete_group_impl(&conn, id)
}

pub(crate) fn delete_group_impl(conn: &Connection, id: String) -> CmdResult<()> {
    // 任务的 group_id 外键 ON DELETE SET NULL,任务自动变为「无标签」
    conn.execute("DELETE FROM groups WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_groups(db: State<Db>, ids: Vec<String>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    reorder_groups_impl(&conn, ids)
}

pub(crate) fn reorder_groups_impl(conn: &Connection, ids: Vec<String>) -> CmdResult<()> {
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
    get_tasks_impl(&conn)
}

pub(crate) fn get_tasks_impl(conn: &Connection) -> CmdResult<Vec<Task>> {
    let mut stmt = conn
        .prepare("SELECT * FROM tasks ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_task).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_task(db: State<Db>, req: CreateTaskRequest) -> CmdResult<Task> {
    let conn = db.0.lock().map_err(err)?;
    create_task_impl(&conn, req)
}

pub(crate) fn create_task_impl(conn: &Connection, req: CreateTaskRequest) -> CmdResult<Task> {
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
    get_task_by_id(conn, &id)
}

#[tauri::command]
pub fn update_task(db: State<Db>, req: UpdateTaskRequest) -> CmdResult<Task> {
    let conn = db.0.lock().map_err(err)?;
    update_task_impl(&conn, req)
}

pub(crate) fn update_task_impl(conn: &Connection, req: UpdateTaskRequest) -> CmdResult<Task> {
    let mut t = get_task_by_id(conn, &req.id)?;

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
    delete_task_impl(&conn, id)
}

pub(crate) fn delete_task_impl(conn: &Connection, id: String) -> CmdResult<()> {
    // parent_id 外键 ON DELETE CASCADE,子孙任务随之删除
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(db: State<Db>, ids: Vec<String>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    reorder_tasks_impl(&conn, ids)
}

pub(crate) fn reorder_tasks_impl(conn: &Connection, ids: Vec<String>) -> CmdResult<()> {
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

// ---------- 便签 ----------

fn row_to_note(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get("id")?,
        title: row.get("title")?,
        custom_title: row.get("custom_title")?,
        content: row.get("content")?,
        group_id: row.get("group_id")?,
        order_index: row.get("order_index")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        deleted_at: row.get("deleted_at")?,
    })
}

#[tauri::command]
pub fn get_notes(db: State<Db>) -> CmdResult<Vec<Note>> {
    let conn = db.0.lock().map_err(err)?;
    get_notes_impl(&conn)
}

pub(crate) fn get_notes_impl(conn: &Connection) -> CmdResult<Vec<Note>> {
    // 正常列表只取未删除便签;已删除的进回收站(get_deleted_notes)
    let mut stmt = conn
        .prepare("SELECT * FROM notes WHERE is_deleted = 0 ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_note).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

/// 回收站:已软删除的便签,按删除时间倒序。
#[tauri::command]
pub fn get_deleted_notes(db: State<Db>) -> CmdResult<Vec<Note>> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn
        .prepare("SELECT * FROM notes WHERE is_deleted = 1 ORDER BY deleted_at DESC")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_note).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

/// 从回收站恢复一条便签(清除软删标记)。
#[tauri::command]
pub fn restore_note(db: State<Db>, id: String) -> CmdResult<Note> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "UPDATE notes SET is_deleted = 0, deleted_at = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(err)?;
    conn.query_row("SELECT * FROM notes WHERE id = ?1", params![id], row_to_note)
        .map_err(err)
}

/// 彻底删除一条便签(物理删除,不可恢复)。
#[tauri::command]
pub fn purge_note(db: State<Db>, id: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id]).map_err(err)?;
    Ok(())
}

/// 清空回收站(物理删除所有已软删除便签)。
#[tauri::command]
pub fn empty_note_trash(db: State<Db>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("DELETE FROM notes WHERE is_deleted = 1", []).map_err(err)?;
    Ok(())
}

// 多词裸参数必须显式 snake_case(Tauri 默认期望 camelCase,缺键的 Option 会静默变 None)
#[tauri::command(rename_all = "snake_case")]
pub fn create_note(db: State<Db>, group_id: Option<String>) -> CmdResult<Note> {
    let conn = db.0.lock().map_err(err)?;
    create_note_impl(&conn, group_id)
}

pub(crate) fn create_note_impl(conn: &Connection, group_id: Option<String>) -> CmdResult<Note> {
    // 便签必须归属某个分组:未指定时落到默认分组(无分组则自动建「收集箱」)
    let gid = match group_id {
        Some(g) if !g.is_empty() => g,
        _ => crate::database::default_note_group_id(conn).map_err(err)?,
    };
    let id = uuid::Uuid::new_v4().to_string();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MIN(order_index), 1) - 1 FROM notes", [], |r| r.get(0))
        .map_err(err)?;
    let now = now_text();
    conn.execute(
        "INSERT INTO notes (id, group_id, order_index, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![id, gid, order, now],
    )
    .map_err(err)?;
    conn.query_row("SELECT * FROM notes WHERE id = ?1", params![id], row_to_note)
        .map_err(err)
}

#[tauri::command]
pub fn update_note(db: State<Db>, req: UpdateNoteRequest) -> CmdResult<Note> {
    let conn = db.0.lock().map_err(err)?;
    update_note_impl(&conn, req)
}

pub(crate) fn update_note_impl(conn: &Connection, req: UpdateNoteRequest) -> CmdResult<Note> {
    let mut n = conn
        .query_row("SELECT * FROM notes WHERE id = ?1", params![req.id], row_to_note)
        .map_err(err)?;
    if let Some(v) = req.title {
        n.title = v;
    }
    if let Some(v) = req.custom_title {
        n.custom_title = v;
    }
    if let Some(v) = req.content {
        n.content = v;
    }
    if let Some(v) = patch(req.group_id) {
        // 空串(原「移回收集箱」语义)→ 默认分组;便签不再有无分组状态
        n.group_id = match v {
            Some(g) => Some(g),
            None => Some(crate::database::default_note_group_id(conn).map_err(err)?),
        };
    }
    n.updated_at = now_text();
    conn.execute(
        "UPDATE notes SET title=?2, custom_title=?3, content=?4, group_id=?5, updated_at=?6 WHERE id=?1",
        params![n.id, n.title, n.custom_title, n.content, n.group_id, n.updated_at],
    )
    .map_err(err)?;
    Ok(n)
}

#[tauri::command]
pub fn delete_note(db: State<Db>, id: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    delete_note_impl(&conn, id)
}

pub(crate) fn delete_note_impl(conn: &Connection, id: String) -> CmdResult<()> {
    // 软删除:标记进回收站(可恢复 / 彻底删除),不物理移除
    conn.execute(
        "UPDATE notes SET is_deleted = 1, deleted_at = ?2 WHERE id = ?1",
        params![id, now_text()],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_notes(db: State<Db>, ids: Vec<String>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    reorder_notes_impl(&conn, ids)
}

pub(crate) fn reorder_notes_impl(conn: &Connection, ids: Vec<String>) -> CmdResult<()> {
    let tx = conn.unchecked_transaction().map_err(err)?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute("UPDATE notes SET order_index = ?1 WHERE id = ?2", params![i as i64, id])
            .map_err(err)?;
    }
    tx.commit().map_err(err)
}

fn row_to_note_group(row: &Row) -> rusqlite::Result<NoteGroup> {
    Ok(NoteGroup {
        id: row.get("id")?,
        name: row.get("name")?,
        order_index: row.get("order_index")?,
        is_collapsed: row.get("is_collapsed")?,
    })
}

#[tauri::command]
pub fn get_note_groups(db: State<Db>) -> CmdResult<Vec<NoteGroup>> {
    let conn = db.0.lock().map_err(err)?;
    get_note_groups_impl(&conn)
}

pub(crate) fn get_note_groups_impl(conn: &Connection) -> CmdResult<Vec<NoteGroup>> {
    let mut stmt = conn
        .prepare("SELECT * FROM note_groups ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_note_group).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_note_group(db: State<Db>, name: String) -> CmdResult<NoteGroup> {
    let conn = db.0.lock().map_err(err)?;
    create_note_group_impl(&conn, name)
}

pub(crate) fn create_note_group_impl(conn: &Connection, name: String) -> CmdResult<NoteGroup> {
    let id = uuid::Uuid::new_v4().to_string();
    let order: i64 = conn
        .query_row("SELECT COALESCE(MAX(order_index), -1) + 1 FROM note_groups", [], |r| r.get(0))
        .map_err(err)?;
    conn.execute(
        "INSERT INTO note_groups (id, name, order_index) VALUES (?1, ?2, ?3)",
        params![id, name, order],
    )
    .map_err(err)?;
    conn.query_row("SELECT * FROM note_groups WHERE id = ?1", params![id], row_to_note_group)
        .map_err(err)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_note_group(
    db: State<Db>,
    id: String,
    name: Option<String>,
    is_collapsed: Option<bool>,
) -> CmdResult<NoteGroup> {
    let conn = db.0.lock().map_err(err)?;
    update_note_group_impl(&conn, id, name, is_collapsed)
}

pub(crate) fn update_note_group_impl(
    conn: &Connection,
    id: String,
    name: Option<String>,
    is_collapsed: Option<bool>,
) -> CmdResult<NoteGroup> {
    let mut g = conn
        .query_row("SELECT * FROM note_groups WHERE id = ?1", params![id], row_to_note_group)
        .map_err(err)?;
    if let Some(v) = name {
        g.name = v;
    }
    if let Some(v) = is_collapsed {
        g.is_collapsed = v;
    }
    conn.execute(
        "UPDATE note_groups SET name=?2, is_collapsed=?3 WHERE id=?1",
        params![g.id, g.name, g.is_collapsed],
    )
    .map_err(err)?;
    Ok(g)
}

#[tauri::command]
pub fn delete_note_group(db: State<Db>, id: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    delete_note_group_impl(&conn, id)
}

pub(crate) fn delete_note_group_impl(conn: &Connection, id: String) -> CmdResult<()> {
    // 外键 ON DELETE SET NULL 先置空,再由自愈逻辑把组内便签归入剩余的第一个分组
    // (一个分组都不剩且有便签时,自动新建「收集箱」承接)
    conn.execute("DELETE FROM note_groups WHERE id = ?1", params![id]).map_err(err)?;
    crate::database::ensure_notes_grouped(conn, false).map_err(err)?;
    Ok(())
}

// ---------- 自定义主题 ----------

#[tauri::command]
pub fn get_custom_themes(db: State<Db>) -> CmdResult<Vec<CustomTheme>> {
    let conn = db.0.lock().map_err(err)?;
    get_custom_themes_impl(&conn)
}

pub(crate) fn get_custom_themes_impl(conn: &Connection) -> CmdResult<Vec<CustomTheme>> {
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
    save_custom_theme_impl(&conn, theme)
}

pub(crate) fn save_custom_theme_impl(conn: &Connection, theme: CustomTheme) -> CmdResult<()> {
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
    delete_custom_theme_impl(&conn, key)
}

pub(crate) fn delete_custom_theme_impl(conn: &Connection, key: String) -> CmdResult<()> {
    conn.execute("DELETE FROM custom_themes WHERE key = ?1", params![key])
        .map_err(err)?;
    Ok(())
}

// ---------- 设置 ----------

#[tauri::command]
pub fn get_settings(db: State<Db>) -> CmdResult<HashMap<String, String>> {
    let conn = db.0.lock().map_err(err)?;
    get_settings_impl(&conn)
}

pub(crate) fn get_settings_impl(conn: &Connection) -> CmdResult<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(err)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(err)?;
    rows.collect::<Result<HashMap<_, _>, _>>().map_err(err)
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    set_setting_impl(&conn, key, value)
}

pub(crate) fn set_setting_impl(conn: &Connection, key: String, value: String) -> CmdResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(err)?;
    Ok(())
}

/// 恢复默认设置:删除全部设置项,使其回落到代码默认值。
/// 刻意保留:language(用户要求不重置)、imported_at(删了会在下次启动误触发旧数据重导入)。
#[tauri::command]
pub fn reset_settings(db: State<Db>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    reset_settings_impl(&conn)
}

pub(crate) fn reset_settings_impl(conn: &Connection) -> CmdResult<()> {
    conn.execute(
        "DELETE FROM settings WHERE key NOT IN ('language', 'imported_at')",
        [],
    )
    .map_err(err)?;
    Ok(())
}

// ---------- 导入导出 ----------

/// 文件名只保留安全字符,防路径穿越(导出 Markdown 用)
fn safe_file_name(file_name: &str) -> String {
    file_name
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect()
}

/// 桌面目录(无桌面则用户目录);各种「导出到桌面」共用
fn desktop_dir() -> CmdResult<std::path::PathBuf> {
    let home = std::env::var("USERPROFILE").map_err(err)?;
    let desktop = std::path::Path::new(&home).join("Desktop");
    Ok(if desktop.is_dir() { desktop } else { std::path::PathBuf::from(&home) })
}

/// 把文本写到桌面(无桌面则用户目录),返回完整路径(导出 Markdown 用,免引入 dialog 插件)
#[tauri::command(rename_all = "snake_case")]
pub fn export_file(file_name: String, content: String) -> CmdResult<String> {
    let dir = desktop_dir()?;
    let safe = safe_file_name(&file_name);
    let path = dir.join(if safe.is_empty() { "export.md".into() } else { safe });
    std::fs::write(&path, content).map_err(err)?;
    Ok(path.to_string_lossy().into_owned())
}

/// 把剪贴项图片(`src_path` 为库内 PNG 绝对路径)复制到桌面为 `file_name`,返回完整路径。
/// 图片是二进制,不能走 export_file(写文本),单独提供拷贝命令。
#[tauri::command(rename_all = "snake_case")]
pub fn save_clip_image(src_path: String, file_name: String) -> CmdResult<String> {
    let dir = desktop_dir()?;
    let safe = safe_file_name(&file_name);
    let path = dir.join(if safe.is_empty() { "clip-image.png".into() } else { safe });
    std::fs::copy(&src_path, &path).map_err(err)?;
    Ok(path.to_string_lossy().into_owned())
}

// ---------- 便签图片仓库(沿用旧版 NoteImageStore 目录,正文只存文件名) ----------

fn note_images_dir() -> std::path::PathBuf {
    let dir = crate::database::data_dir().join("note-images");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[tauri::command]
pub fn note_image_dir() -> String {
    note_images_dir().to_string_lossy().into_owned()
}

/// 从 x-ext header 解析出安全的小写扩展名(只留字母数字,最长 8 位,空则 png)
fn safe_ext(raw: Option<&str>) -> String {
    let ext: String = raw
        .unwrap_or("png")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    if ext.is_empty() { "png".to_string() } else { ext.to_lowercase() }
}

/// 保存便签图片:invoke 传原始字节,扩展名放 x-ext header,返回仓库内唯一文件名
#[tauri::command]
pub fn save_note_image(request: tauri::ipc::Request) -> CmdResult<String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw body".into());
    };
    let ext = safe_ext(request.headers().get("x-ext").and_then(|v| v.to_str().ok()));
    let name = format!("{}.{}", uuid::Uuid::new_v4().simple(), ext);
    std::fs::write(note_images_dir().join(&name), bytes).map_err(err)?;
    Ok(name)
}

// ---------- 分组(标签)自定义图标图片(沿用旧版 GroupIcons 目录,icon_image 存文件名) ----------

fn group_icons_dir() -> std::path::PathBuf {
    let dir = crate::database::data_dir().join("group-icons");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[tauri::command]
pub fn group_icon_dir() -> String {
    group_icons_dir().to_string_lossy().into_owned()
}

/// 保存分组自定义图标:invoke 传原始字节,扩展名放 x-ext header,返回仓库内唯一文件名
#[tauri::command]
pub fn save_group_icon(request: tauri::ipc::Request) -> CmdResult<String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw body".into());
    };
    let ext = safe_ext(request.headers().get("x-ext").and_then(|v| v.to_str().ok()));
    let name = format!("{}.{}", uuid::Uuid::new_v4().simple(), ext);
    std::fs::write(group_icons_dir().join(&name), bytes).map_err(err)?;
    Ok(name)
}

/// 已导入图标文件名是否为受支持的图片扩展名(对齐旧版 CustomImages 过滤)
fn is_supported_image(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "ico" | "bmp" | "gif" | "webp")
}

/// 列出已导入的分组自定义图标文件名(按修改时间倒序,对齐旧版 CustomImages)
#[tauri::command]
pub fn list_group_icons() -> Vec<String> {
    let dir = group_icons_dir();
    let mut entries: Vec<(std::time::SystemTime, String)> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if !is_supported_image(&name) {
                return None;
            }
            let mtime = e.metadata().and_then(|m| m.modified()).ok()?;
            Some((mtime, name))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.into_iter().map(|(_, n)| n).collect()
}

// ---------- 剪贴板 ----------
//
// 剪贴项由后台监听线程写入(见 clipboard.rs);这里只提供读取/删除/打标签/置顶,
// 以及把剪贴项「加入待办 / 加入便签」(find-or-create「剪切板」标签/分组)。

fn row_to_clip(row: &Row) -> rusqlite::Result<ClipItem> {
    Ok(ClipItem {
        id: row.get("id")?,
        kind: row.get("kind")?,
        text: row.get("text")?,
        image_path: row.get("image_path")?,
        thumbnail_b64: row.get("thumbnail_b64")?,
        hash: row.get("hash")?,
        created_at: row.get("created_at")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        tag_ids: Vec::new(),
    })
}

/// 给一批剪贴项批量填充 tag_ids(单次查询 clip_tags 后合并)
fn attach_clip_tags(conn: &Connection, clips: &mut [ClipItem]) -> CmdResult<()> {
    if clips.is_empty() {
        return Ok(());
    }
    let mut map: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut stmt = conn.prepare("SELECT clip_id, tag_id FROM clip_tags").map_err(err)?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
        .map_err(err)?;
    for row in rows {
        let (c, t) = row.map_err(err)?;
        map.entry(c).or_default().push(t);
    }
    for clip in clips.iter_mut() {
        if let Some(ts) = map.get(&clip.id) {
            clip.tag_ids = ts.clone();
        }
    }
    Ok(())
}

/// 取单条剪贴项(含 tag_ids),供监听线程入库后回读 emit
pub(crate) fn get_clip_impl(conn: &Connection, id: i64) -> CmdResult<Option<ClipItem>> {
    let mut clip = conn
        .query_row("SELECT * FROM clips WHERE id = ?1", params![id], row_to_clip)
        .ok();
    if let Some(c) = clip.as_mut() {
        attach_clip_tags(conn, std::slice::from_mut(c))?;
    }
    Ok(clip)
}

#[tauri::command]
pub fn get_clips(db: State<Db>) -> CmdResult<Vec<ClipItem>> {
    let conn = db.0.lock().map_err(err)?;
    get_clips_impl(&conn)
}

pub(crate) fn get_clips_impl(conn: &Connection) -> CmdResult<Vec<ClipItem>> {
    // 置顶在前,其余按时间倒序;软删除的(is_deleted=1)不出现在列表
    let mut stmt = conn
        .prepare("SELECT * FROM clips WHERE is_deleted = 0 ORDER BY pinned DESC, id DESC LIMIT 500")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_clip).map_err(err)?;
    let mut clips = rows.collect::<Result<Vec<_>, _>>().map_err(err)?;
    attach_clip_tags(conn, &mut clips)?;
    Ok(clips)
}

/// 软删除剪贴项:标记 is_deleted=1(从列表隐藏,图片留待撤回);撤回置回 0。
#[tauri::command]
pub fn soft_delete_clip(db: State<Db>, id: i64) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("UPDATE clips SET is_deleted = 1 WHERE id = ?1", params![id])
        .map_err(err)?;
    Ok(())
}

/// 撤回软删除:置回 is_deleted=0 并返回该剪贴项(含 tag_ids)供前端插回列表。
#[tauri::command]
pub fn restore_clip(db: State<Db>, id: i64) -> CmdResult<Option<ClipItem>> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("UPDATE clips SET is_deleted = 0 WHERE id = ?1", params![id])
        .map_err(err)?;
    get_clip_impl(&conn, id)
}

#[tauri::command]
pub fn delete_clip(db: State<Db>, id: i64) -> CmdResult<()> {
    let removed = {
        let conn = db.0.lock().map_err(err)?;
        delete_clip_impl(&conn, id)?
    };
    // 无其它记录引用的图片文件一并删除,避免幽灵文件
    if let Some(path) = removed {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

/// 删除剪贴项(连带其标签关联);若是图片且无其它记录引用同一文件,返回该路径供删文件
pub(crate) fn delete_clip_impl(conn: &Connection, id: i64) -> CmdResult<Option<String>> {
    let image_path: Option<String> = conn
        .query_row("SELECT image_path FROM clips WHERE id = ?1", params![id], |r| r.get(0))
        .ok()
        .flatten();
    conn.execute("DELETE FROM clip_tags WHERE clip_id = ?1", params![id]).map_err(err)?;
    conn.execute("DELETE FROM clips WHERE id = ?1", params![id]).map_err(err)?;
    if let Some(path) = image_path {
        let still: i64 = conn
            .query_row("SELECT COUNT(*) FROM clips WHERE image_path = ?1", params![path], |r| r.get(0))
            .map_err(err)?;
        if still == 0 {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn pin_clip(db: State<Db>, id: i64, pinned: bool) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("UPDATE clips SET pinned = ?1 WHERE id = ?2", params![pinned as i64, id])
        .map_err(err)?;
    Ok(())
}

// ---- 剪贴板标签 ----

fn row_to_clip_tag(row: &Row) -> rusqlite::Result<ClipTag> {
    Ok(ClipTag { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? })
}

#[tauri::command]
pub fn get_clip_tags(db: State<Db>) -> CmdResult<Vec<ClipTag>> {
    let conn = db.0.lock().map_err(err)?;
    get_clip_tags_impl(&conn)
}

pub(crate) fn get_clip_tags_impl(conn: &Connection) -> CmdResult<Vec<ClipTag>> {
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM clip_tags_def ORDER BY name COLLATE NOCASE")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_clip_tag).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_clip_tag(db: State<Db>, name: String) -> CmdResult<ClipTag> {
    let conn = db.0.lock().map_err(err)?;
    create_clip_tag_impl(&conn, &name)
}

pub(crate) fn create_clip_tag_impl(conn: &Connection, name: &str) -> CmdResult<ClipTag> {
    // 同名已存在则复用(find-or-create)
    conn.execute(
        "INSERT OR IGNORE INTO clip_tags_def (name, color) VALUES (?1, '')",
        params![name],
    )
    .map_err(err)?;
    conn.query_row("SELECT id, name, color FROM clip_tags_def WHERE name = ?1", params![name], row_to_clip_tag)
        .map_err(err)
}

#[tauri::command]
pub fn rename_clip_tag(db: State<Db>, id: i64, name: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("UPDATE clip_tags_def SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn set_clip_tag_color(db: State<Db>, id: i64, color: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("UPDATE clip_tags_def SET color = ?1 WHERE id = ?2", params![color, id])
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_clip_tag(db: State<Db>, id: i64) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute("DELETE FROM clip_tags WHERE tag_id = ?1", params![id]).map_err(err)?;
    conn.execute("DELETE FROM clip_tags_def WHERE id = ?1", params![id]).map_err(err)?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_clip_tag(db: State<Db>, clip_id: i64, tag_id: i64) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?1, ?2)",
        params![clip_id, tag_id],
    )
    .map_err(err)?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_clip_tag(db: State<Db>, clip_id: i64, tag_id: i64) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "DELETE FROM clip_tags WHERE clip_id = ?1 AND tag_id = ?2",
        params![clip_id, tag_id],
    )
    .map_err(err)?;
    Ok(())
}

/// 单标签语义:一条剪贴项最多打一个标签。先清掉该剪贴项已有的全部关联,再(可选)写入新标签。
/// tag_id <= 0 表示「清空标签」(不写新关联),供取消/清除用。
/// 替换菜单与拖拽两条路径里旧的「toggle 可多标签」逻辑,保证 tag_ids 至多 1 个。
#[tauri::command(rename_all = "snake_case")]
pub fn set_clip_item_tag(db: State<Db>, clip_id: i64, tag_id: i64) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    set_clip_item_tag_impl(&conn, clip_id, tag_id)
}

pub(crate) fn set_clip_item_tag_impl(conn: &Connection, clip_id: i64, tag_id: i64) -> CmdResult<()> {
    conn.execute("DELETE FROM clip_tags WHERE clip_id = ?1", params![clip_id]).map_err(err)?;
    if tag_id > 0 {
        conn.execute(
            "INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?1, ?2)",
            params![clip_id, tag_id],
        )
        .map_err(err)?;
    }
    Ok(())
}

/// 编辑剪贴项文本(独立编辑窗口手动保存时调用)。只改文本类记录的 text 字段;
/// 不重算 hash(hash 仅供监听线程做连续去重,改历史项不影响它),也不动图片项。
#[tauri::command(rename_all = "snake_case")]
pub fn update_clip_text(db: State<Db>, clip_id: i64, text: String) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "UPDATE clips SET text = ?1 WHERE id = ?2 AND kind = 'text'",
        params![text, clip_id],
    )
    .map_err(err)?;
    Ok(())
}

/// 把某条剪贴项内容写回系统剪贴板(右键「复制」)。
/// 文本 → 写文本;图片 → 读原图文件写图片。复用 clipboard.rs 已引入的 clipboard-rs(不碰 clipboard.rs)。
/// 注:写回会被后台监听线程当作一次新复制再入库到顶部——与 ShellPicker「粘贴即置顶」一致,可接受。
#[tauri::command(rename_all = "snake_case")]
pub fn copy_clip(db: State<Db>, clip_id: i64) -> CmdResult<()> {
    set_clipboard_to_clip(&db, clip_id)
}

/// 把一张图片文件写入系统剪贴板(剪贴项「复制」与截图「复制」共用,DRY)。
pub fn set_clipboard_image_from_path(path: &str) -> CmdResult<()> {
    use clipboard_rs::common::RustImage;
    use clipboard_rs::{Clipboard, ClipboardContext};
    let ctx = ClipboardContext::new().map_err(err)?;
    let img = clipboard_rs::RustImageData::from_path(path).map_err(err)?;
    ctx.set_image(img).map_err(err)?;
    Ok(())
}

/// 把某条剪贴项内容写到系统剪贴板(copy_clip 与自动粘贴共用)。
fn set_clipboard_to_clip(db: &Db, clip_id: i64) -> CmdResult<()> {
    use clipboard_rs::{Clipboard, ClipboardContext};
    let (kind, text, image_path): (String, Option<String>, Option<String>) = {
        let conn = db.0.lock().map_err(err)?;
        conn.query_row(
            "SELECT kind, text, image_path FROM clips WHERE id = ?1",
            params![clip_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(err)?
    };
    if kind == "image" {
        let path = image_path.ok_or("CLIP_NO_IMAGE")?;
        set_clipboard_image_from_path(&path)?;
    } else {
        let ctx = ClipboardContext::new().map_err(err)?;
        ctx.set_text(text.unwrap_or_default()).map_err(err)?;
    }
    Ok(())
}

/// 双击剪贴项:写好系统剪贴板 → 还原上一个外部窗口的焦点 → 模拟 Ctrl+V 粘贴到原光标处。
/// 写剪贴板后置「忽略下次记录」标记,避免把刚粘贴的内容当新复制重复入库。
#[tauri::command(rename_all = "snake_case")]
pub fn paste_clip_to_previous(app: tauri::AppHandle, db: State<Db>, clip_id: i64) -> CmdResult<()> {
    use tauri::Manager;
    crate::clipboard::skip_next_record();
    set_clipboard_to_clip(&db, clip_id)?;
    // 粘贴按键(默认 Ctrl+V,可设 Shift+Insert)+ 语言(被拦时提示用)
    let (paste_keys, en) = {
        let conn = db.0.lock().map_err(err)?;
        let pk = crate::database::read_setting(&conn, "clip_paste_keys").unwrap_or_default();
        let en = crate::database::read_setting(&conn, "language").as_deref() == Some("en");
        (crate::paste::PasteKeys::from_setting(&pk), en)
    };
    // 还原焦点 + 发键放到独立线程:先让本次命令返回、剪贴板写入落定,再切前台粘贴
    if let Some(tracker) = app.try_state::<std::sync::Arc<crate::paste::ForegroundTracker>>() {
        let tracker = tracker.inner().clone();
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(80));
            // 目标是管理员窗口被系统拦:剪贴板已写好,弹系统通知提示手动粘贴(此时焦点已在目标窗口,应用内 toast 看不到)
            if let crate::paste::PasteOutcome::BlockedElevated =
                crate::paste::paste_to_previous(&tracker, paste_keys)
            {
                notify_paste_blocked(&app, en);
            }
        });
    }
    Ok(())
}

/// 目标为管理员权限窗口、自动粘贴被系统拦时,弹系统通知提示手动粘贴。
fn notify_paste_blocked(app: &tauri::AppHandle, en: bool) {
    use tauri_plugin_notification::NotificationExt;
    let (title, body) = if en {
        (
            "Copied to clipboard",
            "Target is an administrator window — Ditto-style auto-paste is blocked. Press Ctrl+V to paste manually.",
        )
    } else {
        (
            "已复制到剪贴板",
            "目标是管理员权限窗口,无法自动粘贴。请手动按 Ctrl+V 粘贴。",
        )
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

// ---------- 数据存储位置(可配置数据根 + 迁移)----------

/// 当前数据根目录(绝对路径),供设置 UI 显示。
#[tauri::command]
pub fn get_data_dir() -> String {
    crate::storage::current_data_dir_string()
}

/// 迁移数据到 `new_dir`:安全顺序见 storage::migrate_data_root(copy→verify→写指针→标记旧根待清理)。
///
/// 本命令额外处理两件运行时相关的事:
/// 1) 复制前做 WAL checkpoint(TRUNCATE),把 -wal 里的改动落进主库 todo.db,
///    保证拷到新位置的库是完整最新数据。**不动旧库其它内容**(失败时旧数据须原封不动)。
/// 2) clips.image_path 存的是**绝对路径**(见 clipboard.rs),迁移成功后,在**新位置的库**里
///    把旧根前缀改写成新根前缀,否则图片预览(convertFileSrc(image_path))失效。
///    只改新库、不碰旧库:这样若迁移失败旧库保持纯净;旧库下次启动随旧根一并清理。
///    note-images / group-icons 只存文件名,无需改写。
/// 完成后需重启 app(库在新位置重新打开),返回 true 表示需重启。
#[tauri::command(rename_all = "snake_case")]
pub fn migrate_data_dir(db: State<Db>, new_dir: String) -> CmdResult<bool> {
    let new_root = std::path::PathBuf::from(new_dir.trim());
    if new_root.as_os_str().is_empty() {
        return Err("MIGRATE_EMPTY_PATH".into());
    }
    let old_root = crate::storage::resolve_data_dir();

    // 1) 复制前 checkpoint:把 -wal 落进主库(只读不改业务数据)。
    {
        let conn = db.0.lock().map_err(err)?;
        let _ = conn.pragma_update(None, "wal_checkpoint", "TRUNCATE");
    }

    // 2) 安全迁移(copy→verify→写指针→标记旧根待清理);失败旧数据原封不动。
    let outcome = crate::storage::migrate_data_root(&new_root)?;

    // 3) 迁移成功:在新位置的库里改写剪贴板图片绝对路径前缀(旧根 → 新根)。
    //    单独开一个一次性连接,不影响进程持有的旧库连接。
    let old_prefix = old_root.to_string_lossy().to_string();
    let new_prefix = new_root.to_string_lossy().to_string();
    if let Ok(conn) = Connection::open(new_root.join("todo.db")) {
        // SUBSTR 起点用 SQLite 自己的 LENGTH(按字符计),避免中文路径下 Rust 字节长度错位。
        let _ = conn.execute(
            "UPDATE clips SET image_path = ?2 || SUBSTR(image_path, LENGTH(?1) + 1) \
             WHERE image_path LIKE ?1 || '%'",
            params![old_prefix, new_prefix],
        );
    }

    Ok(outcome.need_restart)
}

/// 应用迁移后重启:复用更新换壳的 bat 思路,等本进程退出后原地重启同一个 exe。
/// 不带 --updated-from(不回收自身),仅重启让库在新位置重新打开。
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) -> CmdResult<()> {
    crate::storage::spawn_restart().map_err(err)?;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 建一个迁移到最新版的内存库(与 database::init 同样开启外键),供各命令 *_impl 单测。
    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::database::migrate_for_test(&conn).unwrap();
        conn
    }

    fn upd_task(id: &str) -> UpdateTaskRequest {
        UpdateTaskRequest {
            id: id.to_string(),
            title: None,
            is_completed: None,
            due_date: None,
            group_id: None,
            original_group_id: None,
            priority: None,
            indent_level: None,
            parent_id: None,
            is_collapsed: None,
            is_pinned: None,
            quadrant_override: None,
            reminder_enabled: None,
            reminder_interval_minutes: None,
            last_reminded_at: None,
        }
    }

    fn new_task(title: &str) -> CreateTaskRequest {
        CreateTaskRequest {
            title: title.to_string(),
            group_id: None,
            due_date: None,
            priority: None,
            parent_id: None,
            indent_level: None,
            reminder_enabled: None,
            reminder_interval_minutes: None,
        }
    }

    // ---- 迁移 / 模式 ----

    #[test]
    fn migration_sets_version_4_and_creates_tables() {
        let conn = mem_db();
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 6);
        // 既有六表 + 剪贴板三表都在
        for t in [
            "groups", "tasks", "note_groups", "notes", "custom_themes", "settings",
            "clips", "clip_tags_def", "clip_tags",
        ] {
            let n: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    params![t],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "缺表 {t}");
        }
    }

    // ---- 标签(分组) ----

    #[test]
    fn group_crud_and_default_no_color() {
        let conn = mem_db();
        let g = create_group_impl(&conn, "工作".into()).unwrap();
        assert_eq!(g.name, "工作");
        assert_eq!(g.color, "", "新标签默认无色");
        assert_eq!(g.order_index, 0);

        // 改名 + 上色
        let req = UpdateGroupRequest {
            id: g.id.clone(),
            name: Some("学习".into()),
            color: Some("#ff0000".into()),
            icon: None,
            icon_image: None,
            is_collapsed: Some(true),
        };
        let g2 = update_group_impl(&conn, req).unwrap();
        assert_eq!(g2.name, "学习");
        assert_eq!(g2.color, "#ff0000");
        assert!(g2.is_collapsed);

        // 列表能读到
        assert_eq!(get_groups_impl(&conn).unwrap().len(), 1);
        delete_group_impl(&conn, g.id).unwrap();
        assert_eq!(get_groups_impl(&conn).unwrap().len(), 0);
    }

    #[test]
    fn deleting_group_nulls_task_group_id() {
        let conn = mem_db();
        let g = create_group_impl(&conn, "组".into()).unwrap();
        let mut req = new_task("有标签的任务");
        req.group_id = Some(g.id.clone());
        let t = create_task_impl(&conn, req).unwrap();
        assert_eq!(t.group_id.as_deref(), Some(g.id.as_str()));

        delete_group_impl(&conn, g.id).unwrap();
        // ON DELETE SET NULL:任务还在,但标签清空
        let t2 = get_task_by_id(&conn, &t.id).unwrap();
        assert_eq!(t2.group_id, None);
    }

    #[test]
    fn reorder_groups_persists_indices() {
        let conn = mem_db();
        let a = create_group_impl(&conn, "A".into()).unwrap();
        let b = create_group_impl(&conn, "B".into()).unwrap();
        let c = create_group_impl(&conn, "C".into()).unwrap();
        reorder_groups_impl(&conn, vec![c.id.clone(), a.id.clone(), b.id.clone()]).unwrap();
        let names: Vec<String> = get_groups_impl(&conn).unwrap().into_iter().map(|g| g.name).collect();
        assert_eq!(names, vec!["C", "A", "B"]);
    }

    // ---- 任务 ----

    #[test]
    fn create_task_defaults_match_legacy() {
        let conn = mem_db();
        let t = create_task_impl(&conn, new_task("写测试")).unwrap();
        assert_eq!(t.title, "写测试");
        assert!(!t.is_completed);
        assert_eq!(t.priority, 2, "默认中优先级");
        assert_eq!(t.reminder_interval_minutes, 30);
        assert!(!t.reminder_enabled);
        assert_eq!(t.indent_level, 0);
        assert!(!t.created_at.is_empty());
    }

    #[test]
    fn top_tasks_prepend_children_append() {
        let conn = mem_db();
        let first = create_task_impl(&conn, new_task("first")).unwrap();
        let second = create_task_impl(&conn, new_task("second")).unwrap();
        // 顶层新任务排到最前:second 的 order_index 应更小
        assert!(second.order_index < first.order_index);

        // 子任务追加到末尾
        let mut childreq = new_task("child");
        childreq.parent_id = Some(first.id.clone());
        let child = create_task_impl(&conn, childreq).unwrap();
        assert!(child.order_index > first.order_index);
        assert!(child.order_index > second.order_index);
    }

    #[test]
    fn update_task_patch_tristate_due_date() {
        let conn = mem_db();
        let t = create_task_impl(&conn, new_task("t")).unwrap();
        assert_eq!(t.due_date, None);

        // Some(非空) = 设置
        let mut r = upd_task(&t.id);
        r.due_date = Some("2026-06-13 09:00".into());
        let t = update_task_impl(&conn, r).unwrap();
        assert_eq!(t.due_date.as_deref(), Some("2026-06-13 09:00"));

        // None = 不变(只改 title)
        let mut r = upd_task(&t.id);
        r.title = Some("改标题".into());
        let t = update_task_impl(&conn, r).unwrap();
        assert_eq!(t.due_date.as_deref(), Some("2026-06-13 09:00"));
        assert_eq!(t.title, "改标题");

        // Some("") = 清空
        let mut r = upd_task(&t.id);
        r.due_date = Some("".into());
        let t = update_task_impl(&conn, r).unwrap();
        assert_eq!(t.due_date, None);
    }

    #[test]
    fn quadrant_override_zero_clears() {
        let conn = mem_db();
        let t = create_task_impl(&conn, new_task("q")).unwrap();
        let mut r = upd_task(&t.id);
        r.quadrant_override = Some(3);
        let t = update_task_impl(&conn, r).unwrap();
        assert_eq!(t.quadrant_override, Some(3));

        let mut r = upd_task(&t.id);
        r.quadrant_override = Some(0); // 0=清除
        let t = update_task_impl(&conn, r).unwrap();
        assert_eq!(t.quadrant_override, None);
    }

    #[test]
    fn deleting_parent_cascades_children() {
        let conn = mem_db();
        let parent = create_task_impl(&conn, new_task("parent")).unwrap();
        let mut cr = new_task("child");
        cr.parent_id = Some(parent.id.clone());
        let child = create_task_impl(&conn, cr).unwrap();

        delete_task_impl(&conn, parent.id.clone()).unwrap();
        // ON DELETE CASCADE:子任务也没了
        assert!(get_task_by_id(&conn, &child.id).is_err());
        assert_eq!(get_tasks_impl(&conn).unwrap().len(), 0);
    }

    #[test]
    fn reorder_tasks_persists() {
        let conn = mem_db();
        let a = create_task_impl(&conn, new_task("A")).unwrap();
        let b = create_task_impl(&conn, new_task("B")).unwrap();
        reorder_tasks_impl(&conn, vec![a.id.clone(), b.id.clone()]).unwrap();
        let order: Vec<String> = get_tasks_impl(&conn).unwrap().into_iter().map(|t| t.title).collect();
        assert_eq!(order, vec!["A", "B"]);
    }

    // ---- 便签 / 便签分组 ----

    #[test]
    fn create_note_auto_creates_inbox() {
        let conn = mem_db();
        assert_eq!(get_note_groups_impl(&conn).unwrap().len(), 0);
        let n = create_note_impl(&conn, None).unwrap();
        // 无分组时自动建「收集箱」并归入
        assert!(n.group_id.is_some());
        let groups = get_note_groups_impl(&conn).unwrap();
        assert_eq!(groups.len(), 1);
        assert!(matches!(groups[0].name.as_str(), "收集箱" | "Inbox"));
    }

    #[test]
    fn update_note_sets_fields_and_touches_updated_at() {
        let conn = mem_db();
        let g = create_note_group_impl(&conn, "笔记".into()).unwrap();
        let n = create_note_impl(&conn, Some(g.id.clone())).unwrap();
        let req = UpdateNoteRequest {
            id: n.id.clone(),
            title: Some("标题".into()),
            custom_title: Some("自定义".into()),
            content: Some("正文 **md**".into()),
            group_id: None,
        };
        let n2 = update_note_impl(&conn, req).unwrap();
        assert_eq!(n2.title, "标题");
        assert_eq!(n2.custom_title, "自定义");
        assert_eq!(n2.content, "正文 **md**");
        assert_eq!(n2.group_id.as_deref(), Some(g.id.as_str()));
    }

    #[test]
    fn update_note_empty_group_falls_back_to_default() {
        let conn = mem_db();
        let g = create_note_group_impl(&conn, "默认".into()).unwrap();
        let n = create_note_impl(&conn, Some(g.id.clone())).unwrap();
        // 传空串 = 清空 → 回落默认分组(便签不允许无分组)
        let req = UpdateNoteRequest {
            id: n.id.clone(),
            title: None,
            custom_title: None,
            content: None,
            group_id: Some("".into()),
        };
        let n2 = update_note_impl(&conn, req).unwrap();
        assert_eq!(n2.group_id.as_deref(), Some(g.id.as_str()));
    }

    #[test]
    fn delete_note_group_regroups_orphans() {
        let conn = mem_db();
        let g1 = create_note_group_impl(&conn, "一".into()).unwrap();
        let _g2 = create_note_group_impl(&conn, "二".into()).unwrap();
        let n = create_note_impl(&conn, Some(g1.id.clone())).unwrap();
        // 删掉便签所在分组:便签不应丢失,应被并入剩余分组
        delete_note_group_impl(&conn, g1.id.clone()).unwrap();
        let n2 = get_notes_impl(&conn).unwrap().into_iter().find(|x| x.id == n.id).unwrap();
        assert!(n2.group_id.is_some());
        assert_ne!(n2.group_id.as_deref(), Some(g1.id.as_str()));
    }

    #[test]
    fn note_group_update_and_reorder() {
        let conn = mem_db();
        let a = create_note_group_impl(&conn, "A".into()).unwrap();
        let b = create_note_group_impl(&conn, "B".into()).unwrap();
        update_note_group_impl(&conn, a.id.clone(), Some("AA".into()), Some(true)).unwrap();
        let groups = get_note_groups_impl(&conn).unwrap();
        let aa = groups.iter().find(|g| g.id == a.id).unwrap();
        assert_eq!(aa.name, "AA");
        assert!(aa.is_collapsed);

        // 便签重排
        let n1 = create_note_impl(&conn, Some(a.id.clone())).unwrap();
        let n2 = create_note_impl(&conn, Some(b.id.clone())).unwrap();
        reorder_notes_impl(&conn, vec![n1.id.clone(), n2.id.clone()]).unwrap();
        let ids: Vec<String> = get_notes_impl(&conn).unwrap().into_iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![n1.id, n2.id]);
    }

    // ---- 自定义主题 ----

    #[test]
    fn custom_theme_upsert_get_delete() {
        let conn = mem_db();
        let mut colors = std::collections::HashMap::new();
        colors.insert("--bg".to_string(), "#101010".to_string());
        let theme = CustomTheme {
            key: "my-theme".into(),
            display: "我的主题".into(),
            colors: colors.clone(),
        };
        save_custom_theme_impl(&conn, theme).unwrap();
        let got = get_custom_themes_impl(&conn).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].key, "my-theme");
        assert_eq!(got[0].colors.get("--bg").unwrap(), "#101010");

        // 同 key 再存 = 覆盖(upsert)
        colors.insert("--bg".to_string(), "#202020".to_string());
        save_custom_theme_impl(
            &conn,
            CustomTheme { key: "my-theme".into(), display: "改名".into(), colors },
        )
        .unwrap();
        let got = get_custom_themes_impl(&conn).unwrap();
        assert_eq!(got.len(), 1, "upsert 不应新增行");
        assert_eq!(got[0].display, "改名");
        assert_eq!(got[0].colors.get("--bg").unwrap(), "#202020");

        delete_custom_theme_impl(&conn, "my-theme".into()).unwrap();
        assert_eq!(get_custom_themes_impl(&conn).unwrap().len(), 0);
    }

    // ---- 设置 ----

    #[test]
    fn settings_upsert_and_reset_preserves_language() {
        let conn = mem_db();
        set_setting_impl(&conn, "theme".into(), "dark".into()).unwrap();
        set_setting_impl(&conn, "language".into(), "en".into()).unwrap();
        set_setting_impl(&conn, "imported_at".into(), "2026-01-01".into()).unwrap();
        // upsert:同 key 覆盖
        set_setting_impl(&conn, "theme".into(), "light".into()).unwrap();
        assert_eq!(get_settings_impl(&conn).unwrap().get("theme").unwrap(), "light");

        reset_settings_impl(&conn).unwrap();
        let s = get_settings_impl(&conn).unwrap();
        assert!(s.get("theme").is_none(), "theme 应被重置");
        assert_eq!(s.get("language").unwrap(), "en", "language 必须保留");
        assert_eq!(s.get("imported_at").unwrap(), "2026-01-01", "imported_at 必须保留");
    }

    // ---- 纯函数 ----

    #[test]
    fn safe_file_name_strips_path_chars() {
        assert_eq!(safe_file_name("a/b\\c:d*e?.md"), "abcde.md");
        assert_eq!(safe_file_name("正常名.md"), "正常名.md");
        assert_eq!(safe_file_name("///"), "");
    }

    #[test]
    fn safe_ext_normalizes() {
        assert_eq!(safe_ext(Some("PNG")), "png");
        assert_eq!(safe_ext(Some("jp!g")), "jpg");
        assert_eq!(safe_ext(None), "png");
        assert_eq!(safe_ext(Some("")), "png");
        assert_eq!(safe_ext(Some("verylongextension")), "verylong");
    }

    #[test]
    fn is_supported_image_filters() {
        assert!(is_supported_image("a.png"));
        assert!(is_supported_image("a.JPG"));
        assert!(is_supported_image("a.webp"));
        assert!(!is_supported_image("a.txt"));
        assert!(!is_supported_image("noext"));
    }

    #[test]
    fn patch_tristate() {
        assert_eq!(patch(None), None);
        assert_eq!(patch(Some("".into())), Some(None));
        assert_eq!(patch(Some("x".into())), Some(Some("x".to_string())));
    }

    // ---- 剪贴板 ----

    fn insert_text_clip(conn: &Connection, text: &str, hash: &str) -> i64 {
        crate::database::clip_insert(
            conn,
            &NewClip {
                kind: "text".into(),
                text: Some(text.into()),
                image_path: None,
                thumbnail_b64: None,
                hash: hash.into(),
            },
        )
        .unwrap()
    }

    #[test]
    fn clip_insert_list_and_latest_hash() {
        let conn = mem_db();
        insert_text_clip(&conn, "a", "ha");
        let id_b = insert_text_clip(&conn, "b", "hb");
        let clips = get_clips_impl(&conn).unwrap();
        assert_eq!(clips.len(), 2);
        // 默认按 id 倒序:最新的 b 在最前
        assert_eq!(clips[0].id, id_b);
        assert_eq!(clips[0].text.as_deref(), Some("b"));
        assert_eq!(crate::database::clip_latest_hash(&conn).as_deref(), Some("hb"));
    }

    #[test]
    fn clip_tag_crud_and_attach() {
        let conn = mem_db();
        let cid = insert_text_clip(&conn, "x", "h1");
        let tag = create_clip_tag_impl(&conn, "工作").unwrap();
        // 同名复用同一 id
        assert_eq!(create_clip_tag_impl(&conn, "工作").unwrap().id, tag.id);
        conn.execute(
            "INSERT INTO clip_tags (clip_id, tag_id) VALUES (?1, ?2)",
            params![cid, tag.id],
        )
        .unwrap();
        let clips = get_clips_impl(&conn).unwrap();
        assert_eq!(clips[0].tag_ids, vec![tag.id]);
        assert_eq!(get_clip_tags_impl(&conn).unwrap().len(), 1);
    }

    #[test]
    fn set_clip_item_tag_is_single() {
        let conn = mem_db();
        let cid = insert_text_clip(&conn, "x", "h1");
        let t1 = create_clip_tag_impl(&conn, "A").unwrap();
        let t2 = create_clip_tag_impl(&conn, "B").unwrap();
        // 设 t1
        set_clip_item_tag_impl(&conn, cid, t1.id).unwrap();
        assert_eq!(get_clips_impl(&conn).unwrap()[0].tag_ids, vec![t1.id]);
        // 设 t2:替换(单标签),不叠加
        set_clip_item_tag_impl(&conn, cid, t2.id).unwrap();
        assert_eq!(get_clips_impl(&conn).unwrap()[0].tag_ids, vec![t2.id]);
        // 清空(tag_id<=0)
        set_clip_item_tag_impl(&conn, cid, 0).unwrap();
        assert!(get_clips_impl(&conn).unwrap()[0].tag_ids.is_empty());
    }

    #[test]
    fn delete_clip_drops_tag_links() {
        let conn = mem_db();
        let cid = insert_text_clip(&conn, "x", "h1");
        let tag = create_clip_tag_impl(&conn, "t").unwrap();
        conn.execute(
            "INSERT INTO clip_tags (clip_id, tag_id) VALUES (?1, ?2)",
            params![cid, tag.id],
        )
        .unwrap();
        // 纯文本删除返回 None(无图片文件需清理)
        assert_eq!(delete_clip_impl(&conn, cid).unwrap(), None);
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM clip_tags", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        assert_eq!(get_clips_impl(&conn).unwrap().len(), 0);
    }
}
