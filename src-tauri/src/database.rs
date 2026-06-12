use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// 全局数据库连接(tauri 托管状态)
pub struct Db(pub Mutex<Connection>);

/// 数据目录沿用旧版 WPF 的 %AppData%\MinimalTodoApp,
/// 便于首启时就近发现旧版 data.json 完成迁移
pub fn data_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").expect("APPDATA 环境变量不存在");
    PathBuf::from(appdata).join("MinimalTodoApp")
}

pub fn init() -> rusqlite::Result<Connection> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).expect("无法创建数据目录");
    let conn = Connection::open(dir.join("todo.db"))?;

    // WAL + NORMAL:毫秒级高频写入的关键配置;cache_size 负值单位为 KiB
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "cache_size", -8000)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    migrate(&conn)?;
    Ok(conn)
}

/// 默认便签分组:取 order_index 最小的分组;一个都没有时自动新建「收集箱/Inbox」
/// (收集箱已实体化为普通分组:初始自带、可删、可改名,与其他分组无区别)
pub fn default_note_group_id(conn: &Connection) -> rusqlite::Result<String> {
    if let Ok(id) = conn.query_row(
        "SELECT id FROM note_groups ORDER BY order_index LIMIT 1",
        [],
        |r| r.get::<_, String>(0),
    ) {
        return Ok(id);
    }
    create_inbox_group(conn)
}

/// 自愈:把无分组的便签归入某个分组(必要时自动创建),幂等。
/// prefer_named_inbox=true(启动迁移):优先找/建名为「收集箱/Inbox」的分组,
///   老用户虚拟收集箱里的便签原地变成实体收集箱,不混入既有分组;
/// prefer_named_inbox=false(删分组后):并入剩余的第一个分组,
///   一个不剩才新建收集箱承接——保证收集箱本身也能像普通分组一样被删除。
pub fn ensure_notes_grouped(conn: &Connection, prefer_named_inbox: bool) -> rusqlite::Result<()> {
    let orphans: i64 =
        conn.query_row("SELECT COUNT(*) FROM notes WHERE group_id IS NULL", [], |r| r.get(0))?;
    if orphans == 0 {
        return Ok(());
    }
    let gid = if prefer_named_inbox {
        match conn.query_row(
            "SELECT id FROM note_groups WHERE name IN ('收集箱', 'Inbox') ORDER BY order_index LIMIT 1",
            [],
            |r| r.get::<_, String>(0),
        ) {
            Ok(id) => id,
            Err(_) => create_inbox_group(conn)?,
        }
    } else {
        default_note_group_id(conn)?
    };
    conn.execute(
        "UPDATE notes SET group_id = ?1 WHERE group_id IS NULL",
        rusqlite::params![gid],
    )?;
    Ok(())
}

/// 新建「收集箱/Inbox」分组(排到最前),返回 id
fn create_inbox_group(conn: &Connection) -> rusqlite::Result<String> {
    let en = conn
        .query_row("SELECT value FROM settings WHERE key = 'language'", [], |r| {
            r.get::<_, String>(0)
        })
        .map(|v| v == "en")
        .unwrap_or(false);
    let order: i64 = conn
        .query_row("SELECT COALESCE(MIN(order_index), 1) - 1 FROM note_groups", [], |r| r.get(0))
        .unwrap_or(0);
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO note_groups (id, name, order_index, is_collapsed) VALUES (?1, ?2, ?3, 0)",
        rusqlite::params![id, if en { "Inbox" } else { "收集箱" }, order],
    )?;
    Ok(id)
}

/// 版本化迁移:user_version 记录当前模式版本,只向前追加
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    if version < 1 {
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS groups (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL DEFAULT '',
                order_index INTEGER NOT NULL DEFAULT 0,
                color       TEXT NOT NULL DEFAULT '#3B82F6',
                icon        TEXT NOT NULL DEFAULT '',
                icon_image  TEXT NOT NULL DEFAULT '',
                is_collapsed INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id                        TEXT PRIMARY KEY,
                title                     TEXT NOT NULL DEFAULT '',
                is_completed              INTEGER NOT NULL DEFAULT 0,
                due_date                  TEXT,
                group_id                  TEXT REFERENCES groups(id) ON DELETE SET NULL,
                original_group_id         TEXT,
                priority                  INTEGER NOT NULL DEFAULT 2,
                order_index               INTEGER NOT NULL DEFAULT 0,
                indent_level              INTEGER NOT NULL DEFAULT 0,
                parent_id                 TEXT REFERENCES tasks(id) ON DELETE CASCADE,
                is_collapsed              INTEGER NOT NULL DEFAULT 0,
                is_pinned                 INTEGER NOT NULL DEFAULT 0,
                quadrant_override         INTEGER,
                reminder_enabled          INTEGER NOT NULL DEFAULT 0,
                reminder_interval_minutes INTEGER NOT NULL DEFAULT 30,
                last_reminded_at          TEXT,
                created_at                TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

            CREATE TABLE IF NOT EXISTS note_groups (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL DEFAULT '',
                order_index INTEGER NOT NULL DEFAULT 0,
                is_collapsed INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS notes (
                id           TEXT PRIMARY KEY,
                title        TEXT NOT NULL DEFAULT '',
                custom_title TEXT NOT NULL DEFAULT '',
                content      TEXT NOT NULL DEFAULT '',
                group_id     TEXT REFERENCES note_groups(id) ON DELETE SET NULL,
                order_index  INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_themes (
                key         TEXT PRIMARY KEY,
                display     TEXT NOT NULL DEFAULT '',
                colors_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            PRAGMA user_version = 1;
            COMMIT;
            "#,
        )?;
    }

    Ok(())
}
