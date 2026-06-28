use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// 全局数据库连接(tauri 托管状态)
pub struct Db(pub Mutex<Connection>);

/// 默认数据目录沿用旧版 WPF 的 %AppData%\MinimalTodoApp,
/// 便于首启时就近发现旧版 data.json 完成迁移。
pub fn default_data_dir() -> PathBuf {
    let appdata = std::env::var("APPDATA").expect("APPDATA 环境变量不存在");
    PathBuf::from(appdata).join("MinimalTodoApp")
}

/// 实际数据根目录:优先读「数据位置指针」(自定义路径),否则用默认目录。
///
/// 指针文件存在不随数据迁移的固定位置(%LOCALAPPDATA%\MinimalTodoApp\datapath),
/// 详见 storage.rs。todo.db / note-images / group-icons / clipboard-images 全部从
/// 这一个根推导,所以根一变它们整体跟着走。**绝不能把指针存进 todo.db**
/// (库自己会被搬走 → 启动时读不到指针 → 引导死锁)。
pub fn data_dir() -> PathBuf {
    crate::storage::resolve_data_dir()
}

/// 剪贴板图片目录,与 note-images/group-icons 同级,从「数据根目录」(data_dir)推导。
/// 数据位置可配置后,根一变它自动跟随,调用方无需改路径。
pub fn clipboard_images_dir() -> PathBuf {
    let dir = data_dir().join("clipboard-images");
    let _ = std::fs::create_dir_all(&dir);
    dir
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

/// 测试辅助:在传入的(通常是内存)连接上跑全部迁移,供 commands/database 单测建库。
#[cfg(test)]
pub(crate) fn migrate_for_test(conn: &Connection) -> rusqlite::Result<()> {
    migrate(conn)
}

// ---- 剪贴板低层写入(供监听线程与命令共用)----

/// 最近一条剪贴记录的 hash,用于连续复制去重
pub fn clip_latest_hash(conn: &Connection) -> Option<String> {
    conn.query_row(
        "SELECT hash FROM clips WHERE is_deleted = 0 ORDER BY id DESC LIMIT 1",
        [],
        |r| r.get(0),
    )
    .ok()
}

/// 读取一项标量设置(供监听线程读「去重 / 过期」开关,不经命令层)
pub fn read_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", rusqlite::params![key], |r| r.get(0))
        .ok()
}

/// 去重(移到最前)前的探查:同 `hash` 的历史记录里,未置顶行的 id、它们携带的标签(去重并集)、
/// 以及是否存在「已置顶」的同内容行。
pub struct ClipDupInfo {
    /// 待删的未置顶旧行 id
    pub unpinned_ids: Vec<i64>,
    /// 这些旧行携带的标签 id(并集,用于移到最前后保留分组归属)
    pub tag_ids: Vec<i64>,
    /// 是否已有「置顶」的同内容行(若有则跳过新增,置顶项本就在最前)
    pub has_pinned: bool,
}

pub fn clip_dup_info(conn: &Connection, hash: &str) -> rusqlite::Result<ClipDupInfo> {
    let mut stmt = conn.prepare("SELECT id, pinned FROM clips WHERE hash = ?1 AND is_deleted = 0")?;
    let rows: Vec<(i64, i64)> = stmt
        .query_map(rusqlite::params![hash], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let has_pinned = rows.iter().any(|(_, p)| *p != 0);
    let unpinned_ids: Vec<i64> = rows.iter().filter(|(_, p)| *p == 0).map(|(id, _)| *id).collect();

    let mut tag_ids = Vec::new();
    if !unpinned_ids.is_empty() {
        let placeholders = unpinned_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT DISTINCT tag_id FROM clip_tags WHERE clip_id IN ({placeholders})");
        let mut tstmt = conn.prepare(&sql)?;
        let params = rusqlite::params_from_iter(unpinned_ids.iter());
        tag_ids = tstmt.query_map(params, |r| r.get(0))?.collect::<Result<_, _>>()?;
    }
    Ok(ClipDupInfo { unpinned_ids, tag_ids, has_pinned })
}

/// 删掉指定的未置顶旧行(连带标签关联)。故意**不删图片文件**——相同 hash = 相同文件名,
/// 新插入的记录会复用同一文件,删了会丢图。
pub fn clip_delete_rows(conn: &Connection, ids: &[i64]) -> rusqlite::Result<()> {
    for id in ids {
        conn.execute("DELETE FROM clip_tags WHERE clip_id = ?1", rusqlite::params![id])?;
        conn.execute("DELETE FROM clips WHERE id = ?1", rusqlite::params![id])?;
    }
    Ok(())
}

/// 给某剪贴行补打一组标签(移到最前时保留原分组归属)
pub fn clip_attach_tags(conn: &Connection, clip_id: i64, tag_ids: &[i64]) -> rusqlite::Result<()> {
    for tag in tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO clip_tags (clip_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![clip_id, tag],
        )?;
    }
    Ok(())
}

/// 清理过期剪贴项:只针对**默认分组**(未打任何分组标签)且**未置顶**、created_at 早于 `cutoff_ms` 的记录。
/// 返回 (被删行数, 不再被引用的图片文件路径)——行数 0 时调用方可跳过「通知前端重拉」。
pub fn clip_purge_expired(conn: &Connection, cutoff_ms: i64) -> rusqlite::Result<(usize, Vec<String>)> {
    // 先收将被删行里涉及的图片路径,删后再判断哪些文件无人引用。
    // `id NOT IN (clip_tags.clip_id)` = 未归入任何分组 = 默认分组,过期清理只动这里。
    let mut stmt = conn.prepare(
        "SELECT id, image_path FROM clips
         WHERE pinned = 0 AND created_at < ?1
           AND id NOT IN (SELECT clip_id FROM clip_tags)",
    )?;
    let rows: Vec<(i64, Option<String>)> = stmt
        .query_map(rusqlite::params![cutoff_ms], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let deleted = rows.len();
    let mut maybe_files = Vec::new();
    for (id, path) in &rows {
        conn.execute("DELETE FROM clip_tags WHERE clip_id = ?1", rusqlite::params![id])?;
        conn.execute("DELETE FROM clips WHERE id = ?1", rusqlite::params![id])?;
        if let Some(p) = path {
            maybe_files.push(p.clone());
        }
    }
    let mut orphans = Vec::new();
    for p in maybe_files {
        let still: i64 = conn
            .query_row("SELECT COUNT(*) FROM clips WHERE image_path = ?1", rusqlite::params![p], |r| r.get(0))?;
        if still == 0 {
            orphans.push(p);
        }
    }
    Ok((deleted, orphans))
}

/// 把过期设置键(never/7d/1m/3m/1y)换算成毫秒时长;不过期返回 None
pub fn clip_expiry_ms(value: &str) -> Option<i64> {
    const DAY: i64 = 86_400_000;
    match value {
        "7d" => Some(7 * DAY),
        "1m" => Some(30 * DAY),
        "3m" => Some(90 * DAY),
        "1y" => Some(365 * DAY),
        _ => None, // "" / "never" / 未知 → 永不过期
    }
}

/// 当前 Unix 毫秒时间戳(剪贴记录 created_at / 过期清理共用)
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 插入一条剪贴记录,返回新行 id
pub fn clip_insert(conn: &Connection, c: &crate::models::NewClip) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO clips (kind, text, image_path, thumbnail_b64, hash, created_at, pinned)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
        rusqlite::params![c.kind, c.text, c.image_path, c.thumbnail_b64, c.hash, now_ms()],
    )?;
    Ok(conn.last_insert_rowid())
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

    if version < 2 {
        // 标签去掉默认颜色:把旧的默认蓝(列默认值 #3B82F6)清空,标签默认无色,
        // 由用户右键「修改颜色」自定义。用户另选的非默认色原样保留。
        conn.execute_batch(
            r#"
            BEGIN;
            UPDATE groups SET color = '' WHERE color = '#3B82F6';
            PRAGMA user_version = 2;
            COMMIT;
            "#,
        )?;
    }

    if version < 3 {
        // 标签彻底去掉彩色:清空所有标签颜色(含导入的旧色),一律默认无色,
        // 由用户右键「修改颜色」按需重新上色。
        conn.execute_batch(
            r#"
            BEGIN;
            UPDATE groups SET color = '';
            PRAGMA user_version = 3;
            COMMIT;
            "#,
        )?;
    }

    if version < 4 {
        // 剪贴板:后台监听系统剪贴板,文本/图片入库;剪贴板标签独立成套(clip_tags 关联)。
        // clips 用自增整型主键(append-only 高频写入,无需跨表 UUID 引用)。
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS clips (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                kind          TEXT    NOT NULL,
                text          TEXT,
                image_path    TEXT,
                thumbnail_b64 TEXT,
                hash          TEXT    NOT NULL,
                created_at    INTEGER NOT NULL,
                pinned        INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_clips_created ON clips(created_at DESC);

            CREATE TABLE IF NOT EXISTS clip_tags_def (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                name  TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS clip_tags (
                clip_id INTEGER NOT NULL,
                tag_id  INTEGER NOT NULL,
                PRIMARY KEY (clip_id, tag_id)
            );

            PRAGMA user_version = 4;
            COMMIT;
            "#,
        )?;
    }

    if version < 5 {
        // 便签回收站:软删除(is_deleted/deleted_at),删除不再物理移除,进回收站可恢复/彻底删。
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE notes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE notes ADD COLUMN deleted_at TEXT;
            PRAGMA user_version = 5;
            COMMIT;
            "#,
        )?;
    }

    if version < 6 {
        // 剪贴项软删除:删除先标记 is_deleted=1(从列表隐藏),撤回置回 0;启动时落定清除残留。
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE clips ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
            PRAGMA user_version = 6;
            COMMIT;
            "#,
        )?;
    }

    // v7:剪贴项备注字段(用户可右键添加备注,显示在标签位置)
    if version < 7 {
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE clips ADD COLUMN note TEXT;
            PRAGMA user_version = 7;
            COMMIT;
            "#,
        )?;
    }

    // v8:便签子分组——note_groups 加自引用 parent_id(删父级联删子树),支持无限嵌套
    if version < 8 {
        conn.execute_batch(
            r#"
            BEGIN;
            ALTER TABLE note_groups ADD COLUMN parent_id TEXT REFERENCES note_groups(id) ON DELETE CASCADE;
            CREATE INDEX IF NOT EXISTS idx_note_groups_parent ON note_groups(parent_id);
            PRAGMA user_version = 8;
            COMMIT;
            "#,
        )?;
    }

    Ok(())
}

/// 启动落定:删除上次会话里被软删但未撤回的剪贴项(撤回只在同会话 Toast 期内有效),
/// 并清理由此产生的孤儿图片(无其他行引用的 image_path)。
pub fn purge_deleted_clips(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("SELECT id, image_path FROM clips WHERE is_deleted = 1")?;
    let rows: Vec<(i64, Option<String>)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(Result::ok)
        .collect();
    for (id, _) in &rows {
        conn.execute("DELETE FROM clips WHERE id = ?1", rusqlite::params![id])?;
    }
    // 删除后再判孤儿:image_path 不再被任何行引用 → 删文件
    for (_, path) in &rows {
        if let Some(p) = path {
            let cnt: i64 = conn
                .query_row("SELECT COUNT(*) FROM clips WHERE image_path = ?1", rusqlite::params![p], |r| r.get(0))?;
            if cnt == 0 {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migrate_is_idempotent() {
        let conn = mem_db();
        // 再跑一次不应报错(版本已是最新,各分支跳过)
        migrate(&conn).unwrap();
        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 8);
    }

    #[test]
    fn default_note_group_creates_inbox_once() {
        let conn = mem_db();
        let id1 = default_note_group_id(&conn).unwrap();
        // 第二次调用复用同一个收集箱,不重复新建
        let id2 = default_note_group_id(&conn).unwrap();
        assert_eq!(id1, id2);
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM note_groups", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn ensure_notes_grouped_prefers_named_inbox_on_migration() {
        let conn = mem_db();
        // 造一个已有的普通分组 + 一条无分组的孤儿便签(模拟老数据虚拟收集箱)
        conn.execute(
            "INSERT INTO note_groups (id, name, order_index) VALUES ('g1', '工作', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, group_id, order_index, created_at, updated_at)
             VALUES ('n1', NULL, 0, '2026-01-01 00:00', '2026-01-01 00:00')",
            [],
        )
        .unwrap();

        ensure_notes_grouped(&conn, true).unwrap();

        // 孤儿便签应进了新建的「收集箱」,而不是混入既有的「工作」
        let gid: String =
            conn.query_row("SELECT group_id FROM notes WHERE id='n1'", [], |r| r.get(0)).unwrap();
        let name: String =
            conn.query_row("SELECT name FROM note_groups WHERE id=?1", params![gid], |r| r.get(0))
                .unwrap();
        assert!(matches!(name.as_str(), "收集箱" | "Inbox"));
        assert_ne!(gid, "g1");
    }

    #[test]
    fn ensure_notes_grouped_noop_when_no_orphans() {
        let conn = mem_db();
        conn.execute(
            "INSERT INTO note_groups (id, name, order_index) VALUES ('g1', '工作', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO notes (id, group_id, order_index, created_at, updated_at)
             VALUES ('n1', 'g1', 0, '2026-01-01 00:00', '2026-01-01 00:00')",
            [],
        )
        .unwrap();
        ensure_notes_grouped(&conn, false).unwrap();
        // 没有孤儿便签:不应新建收集箱
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM note_groups", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }
}
