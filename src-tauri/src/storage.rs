//! 数据存储位置(可配置数据根目录)。
//!
//! 设计要点(为什么这么做):
//! - 全部数据(todo.db + WAL/SHM、note-images、group-icons、clipboard-images)都从单一
//!   根 `database::data_dir()` 推导。让这个根可配置,数据整体跟着走。
//! - 自定义根目录写在「指针文件」`%LOCALAPPDATA%\MinimalTodoApp\datapath`——一个**不随
//!   数据迁移的固定位置**。绝不能把它存进 todo.db:库自己会被搬到新位置,启动时若要先读
//!   库才知道库在哪 → 引导死锁。%LOCALAPPDATA% 是本机级、不随用户选的数据目录移动。
//! - 迁移用 **copy → verify → 写指针 → 标记旧根待清理 → 提示重启**。绝不先删后拷;复制
//!   并校验通过前不动旧数据;校验失败立刻回滚(删掉新根里这次拷的半成品),旧数据原封不动。
//!   db 在运行进程里是打开状态(Windows 文件锁),不在运行时删库;旧根的删除推迟到**下次
//!   启动**(此时新位置已生效、旧库无人占用)由 `cleanup_pending_old_root()` 完成。

use std::path::{Path, PathBuf};

/// 指针文件:记录自定义数据根目录(存在不随数据迁移的固定位置)。
fn pointer_path() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    PathBuf::from(local).join("MinimalTodoApp").join("datapath")
}

/// 待清理标记:记录「上一处旧数据根」,下次启动删除(此时新根已生效,旧库不再被占用)。
fn pending_cleanup_path() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    PathBuf::from(local).join("MinimalTodoApp").join("pending-cleanup")
}

/// 解析数据根目录:优先用指针文件里的自定义路径(存在且是有效目录),否则默认目录。
/// 纯函数式、无副作用(除按需建 LOCALAPPDATA 父目录),可在 db::init 打开库之前调用。
pub fn resolve_data_dir() -> PathBuf {
    if let Ok(s) = std::fs::read_to_string(pointer_path()) {
        let s = s.trim();
        if !s.is_empty() {
            let p = PathBuf::from(s);
            if p.is_dir() {
                return p;
            }
        }
    }
    crate::database::default_data_dir()
}

/// 当前是否使用了自定义数据位置(用于 UI 显示「恢复默认位置」与否,非必需)。
pub fn current_data_dir_string() -> String {
    resolve_data_dir().to_string_lossy().into_owned()
}

fn write_pointer(dir: &Path) -> std::io::Result<()> {
    let p = pointer_path();
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, dir.to_string_lossy().as_bytes())
}

/// 启动时清理「上一处旧数据根」:仅当指针已指向别处(迁移确实完成)时才删,
/// 删完移除标记。失败不阻塞启动(下次启动还会再试)。
pub fn cleanup_pending_old_root() {
    let marker = pending_cleanup_path();
    let Ok(old) = std::fs::read_to_string(&marker) else { return };
    let old = old.trim();
    if old.is_empty() {
        let _ = std::fs::remove_file(&marker);
        return;
    }
    let old_path = PathBuf::from(old);
    let current = resolve_data_dir();
    // 安全闸:只有当前实际根 != 旧根 时才删,绝不误删正在用的数据。
    if same_dir(&old_path, &current) {
        let _ = std::fs::remove_file(&marker);
        return;
    }
    remove_old_root_data(&old_path);
    let _ = std::fs::remove_file(&marker);
}

/// 两个路径是否指向同一目录(规范化后比较,忽略大小写差异由 OS 决定;这里做字符串归一)。
fn same_dir(a: &Path, b: &Path) -> bool {
    let na = a.canonicalize().unwrap_or_else(|_| a.to_path_buf());
    let nb = b.canonicalize().unwrap_or_else(|_| b.to_path_buf());
    na == nb
}

/// 本 app 在数据根下拥有的条目(只删这些,绝不 remove_dir_all 整个用户选的目录——
/// 用户可能选了一个含其它文件的目录)。
const DB_FILES: [&str; 4] = ["todo.db", "todo.db-wal", "todo.db-shm", "todo.db-journal"];
const DATA_DIRS: [&str; 3] = ["note-images", "group-icons", "clipboard-images"];

/// 删除旧根下属于本 app 的数据(库文件 + 三个图片目录)。逐项删,容错。
fn remove_old_root_data(root: &Path) {
    for f in DB_FILES {
        let _ = std::fs::remove_file(root.join(f));
    }
    for d in DATA_DIRS {
        let _ = std::fs::remove_dir_all(root.join(d));
    }
}

/// 递归复制目录(用于 note-images / group-icons / clipboard-images,通常是平目录)。
fn copy_dir_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

/// 统计目录里的文件数与总字节(递归),用于迁移后校验。
fn dir_stats(dir: &Path) -> (u64, u64) {
    let mut count = 0u64;
    let mut bytes = 0u64;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let (c, b) = dir_stats(&entry.path());
                    count += c;
                    bytes += b;
                } else {
                    count += 1;
                    bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                }
            }
        }
    }
    (count, bytes)
}

/// 迁移失败时回滚:删掉这次往新根里拷的本 app 数据(新根原有的别的文件不动)。
fn rollback_new_root(new_root: &Path) {
    remove_old_root_data(new_root);
}

/// 迁移结果:是否需要重启(总是 true,因为库需在新位置重新打开)。
pub struct MigrateOutcome {
    pub need_restart: bool,
}

/// 把数据根从当前位置迁到 `new_root`。安全顺序:校验 → 复制 → 校验 → 写指针 → 标记旧根待清理。
///
/// 失败任一步:回滚已拷入新根的本 app 数据并返回错误,**旧数据始终原封不动**。
/// 成功后**需要重启 app** 才彻底切换(库在新位置重新打开);旧根的删除在下次启动完成。
///
/// 注:db 由调用命令持有连接,这里不触碰运行中的连接——复制的是磁盘上的库文件。复制前
/// 调用方应已做 WAL checkpoint,把 -wal 落进主库,保证拷到的是完整数据。
pub fn migrate_data_root(new_root: &Path) -> Result<MigrateOutcome, String> {
    let old_root = resolve_data_dir();

    // 同一目录:无操作。
    if same_dir(&old_root, new_root) {
        return Err("MIGRATE_SAME_DIR".into());
    }

    // 1) 新目录必须存在/可建 且 可写。
    std::fs::create_dir_all(new_root).map_err(|e| format!("MIGRATE_MKDIR_FAILED:{e}"))?;
    let probe = new_root.join(".write_probe");
    std::fs::write(&probe, b"x").map_err(|_| "MIGRATE_NOT_WRITABLE".to_string())?;
    let _ = std::fs::remove_file(&probe);

    // 2) 冲突检测:新根里已存在会冲突的本 app 数据 → 中止,绝不覆盖。
    if new_root.join("todo.db").exists() {
        return Err("MIGRATE_CONFLICT_DB".into());
    }
    for d in DATA_DIRS {
        let p = new_root.join(d);
        if p.exists() && std::fs::read_dir(&p).map(|mut r| r.next().is_some()).unwrap_or(false) {
            return Err(format!("MIGRATE_CONFLICT_DIR:{d}"));
        }
    }

    // 3) 复制:库文件(含 WAL/SHM 等附属)+ 三个图片目录。
    //    复制全程出错即回滚新根、返回错误,旧数据不动。
    let mut copied_bytes = 0u64;
    for f in DB_FILES {
        let src = old_root.join(f);
        if src.exists() {
            let dst = new_root.join(f);
            match std::fs::copy(&src, &dst) {
                Ok(n) => copied_bytes += n,
                Err(e) => {
                    rollback_new_root(new_root);
                    return Err(format!("MIGRATE_COPY_DB_FAILED:{f}:{e}"));
                }
            }
        }
    }
    for d in DATA_DIRS {
        let src = old_root.join(d);
        if src.exists() {
            if let Err(e) = copy_dir_recursive(&src, &new_root.join(d)) {
                rollback_new_root(new_root);
                return Err(format!("MIGRATE_COPY_DIR_FAILED:{d}:{e}"));
            }
        }
    }

    // 4) 校验:关键文件存在 + 各图片目录文件数/字节与旧根一致。
    if old_root.join("todo.db").exists() && !new_root.join("todo.db").exists() {
        rollback_new_root(new_root);
        return Err("MIGRATE_VERIFY_DB_MISSING".into());
    }
    for d in DATA_DIRS {
        let (oc, ob) = dir_stats(&old_root.join(d));
        let (nc, nb) = dir_stats(&new_root.join(d));
        if oc != nc || ob != nb {
            rollback_new_root(new_root);
            return Err(format!("MIGRATE_VERIFY_MISMATCH:{d}:{oc}/{nc}:{ob}/{nb}"));
        }
    }
    let _ = copied_bytes; // 仅作复制阶段健全性参考

    // 5) 切换指针 → 新位置即刻成为权威。
    write_pointer(new_root).map_err(|e| {
        rollback_new_root(new_root);
        format!("MIGRATE_WRITE_POINTER_FAILED:{e}")
    })?;

    // 6) 标记旧根待清理:下次启动删除旧库与旧图片目录(此时旧库已无人占用)。
    let marker = pending_cleanup_path();
    if let Some(parent) = marker.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&marker, old_root.to_string_lossy().as_bytes());

    Ok(MigrateOutcome { need_restart: true })
}

/// 原地重启当前 exe:生成临时 bat,等本进程退出后再启动同一个 exe(不带任何回收参数)。
/// 复用 updater.rs 的换壳思路;迁移后用它让库在新位置重新打开。
pub fn spawn_restart() -> std::io::Result<()> {
    let exe = std::env::current_exe()?;
    let pid = std::process::id();
    let bat = std::env::temp_dir().join("minimal-todo-restart.bat");
    // chcp 65001 防中文路径乱码;轮询等待旧进程退出后再启动新版
    let script = format!(
        "@echo off\r\nchcp 65001 >nul\r\n:wait\r\ntasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul\r\nif not errorlevel 1 (\r\n  timeout /t 1 /nobreak >nul\r\n  goto wait\r\n)\r\nstart \"\" \"{exe}\"\r\ndel \"%~f0\"\r\n",
        pid = pid,
        exe = exe.display(),
    );
    std::fs::write(&bat, script)?;
    std::process::Command::new("cmd")
        .args(["/C", bat.to_str().unwrap_or_default()])
        .spawn()?;
    Ok(())
}
