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
    })
}

#[tauri::command]
pub fn get_notes(db: State<Db>) -> CmdResult<Vec<Note>> {
    let conn = db.0.lock().map_err(err)?;
    let mut stmt = conn.prepare("SELECT * FROM notes ORDER BY order_index").map_err(err)?;
    let rows = stmt.query_map([], row_to_note).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

// 多词裸参数必须显式 snake_case(Tauri 默认期望 camelCase,缺键的 Option 会静默变 None)
#[tauri::command(rename_all = "snake_case")]
pub fn create_note(db: State<Db>, group_id: Option<String>) -> CmdResult<Note> {
    let conn = db.0.lock().map_err(err)?;
    // 便签必须归属某个分组:未指定时落到默认分组(无分组则自动建「收集箱」)
    let gid = match group_id {
        Some(g) if !g.is_empty() => g,
        _ => crate::database::default_note_group_id(&conn).map_err(err)?,
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
            None => Some(crate::database::default_note_group_id(&conn).map_err(err)?),
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
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id]).map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_notes(db: State<Db>, ids: Vec<String>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
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
    let mut stmt = conn
        .prepare("SELECT * FROM note_groups ORDER BY order_index")
        .map_err(err)?;
    let rows = stmt.query_map([], row_to_note_group).map_err(err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(err)
}

#[tauri::command]
pub fn create_note_group(db: State<Db>, name: String) -> CmdResult<NoteGroup> {
    let conn = db.0.lock().map_err(err)?;
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
    // 外键 ON DELETE SET NULL 先置空,再由自愈逻辑把组内便签归入剩余的第一个分组
    // (一个分组都不剩且有便签时,自动新建「收集箱」承接)
    conn.execute("DELETE FROM note_groups WHERE id = ?1", params![id]).map_err(err)?;
    crate::database::ensure_notes_grouped(&conn, false).map_err(err)?;
    Ok(())
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

/// 恢复默认设置:删除全部设置项,使其回落到代码默认值。
/// 刻意保留:language(用户要求不重置)、imported_at(删了会在下次启动误触发旧数据重导入)。
#[tauri::command]
pub fn reset_settings(db: State<Db>) -> CmdResult<()> {
    let conn = db.0.lock().map_err(err)?;
    conn.execute(
        "DELETE FROM settings WHERE key NOT IN ('language', 'imported_at')",
        [],
    )
    .map_err(err)?;
    Ok(())
}

// ---------- 导入导出 ----------

/// 把文本写到桌面(无桌面则用户目录),返回完整路径(导出 Markdown 用,免引入 dialog 插件)
#[tauri::command(rename_all = "snake_case")]
pub fn export_file(file_name: String, content: String) -> CmdResult<String> {
    let home = std::env::var("USERPROFILE").map_err(err)?;
    let desktop = std::path::Path::new(&home).join("Desktop");
    let dir = if desktop.is_dir() { desktop } else { std::path::PathBuf::from(&home) };
    // 文件名只保留安全字符,防路径穿越
    let safe: String = file_name
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let path = dir.join(if safe.is_empty() { "export.md".into() } else { safe });
    std::fs::write(&path, content).map_err(err)?;
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

/// 保存便签图片:invoke 传原始字节,扩展名放 x-ext header,返回仓库内唯一文件名
#[tauri::command]
pub fn save_note_image(request: tauri::ipc::Request) -> CmdResult<String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw body".into());
    };
    let ext: String = request
        .headers()
        .get("x-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("png")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let ext = if ext.is_empty() { "png".to_string() } else { ext.to_lowercase() };
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
    let ext: String = request
        .headers()
        .get("x-ext")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("png")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let ext = if ext.is_empty() { "png".to_string() } else { ext.to_lowercase() };
    let name = format!("{}.{}", uuid::Uuid::new_v4().simple(), ext);
    std::fs::write(group_icons_dir().join(&name), bytes).map_err(err)?;
    Ok(name)
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
            let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
            if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "ico" | "bmp" | "gif" | "webp") {
                return None;
            }
            let mtime = e.metadata().and_then(|m| m.modified()).ok()?;
            Some((mtime, name))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.into_iter().map(|(_, n)| n).collect()
}
