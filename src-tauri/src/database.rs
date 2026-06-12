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
