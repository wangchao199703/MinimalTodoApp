//! 自动更新落地侧:检查与下载由前端完成(api.github.com 与资产下载均允许跨域),
//! 本模块负责:接收新版 exe 字节 → 写盘 → bat 换壳重启 → 新版启动后回收旧 exe。
//! 保留旧版「便携单 exe」分发模型,不走安装包。

use tauri::AppHandle;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// 更新文件落盘目录:exe 同目录优先,不可写则退到 %LOCALAPPDATA%\MinimalTodoApp
fn target_dir() -> std::path::PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let probe = dir.join(".write_probe");
            if std::fs::write(&probe, b"x").is_ok() {
                let _ = std::fs::remove_file(&probe);
                return dir.to_path_buf();
            }
        }
    }
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let dir = std::path::PathBuf::from(local).join("MinimalTodoApp");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 接收新版 exe 的原始字节(invoke 传 ArrayBuffer,文件名放 header),
/// 写盘后生成临时 bat:等待本进程退出 → 启动新版(带 --updated-from 指向旧 exe)。
#[tauri::command]
pub fn apply_update(app: AppHandle, request: tauri::ipc::Request) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw body".into());
    };
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("MinimalTodoApp-update.exe")
        .to_string();

    let new_exe = target_dir().join(&file_name);
    std::fs::write(&new_exe, bytes).map_err(err)?;

    let old_exe = std::env::current_exe().map_err(err)?;
    let pid = std::process::id();
    let bat = std::env::temp_dir().join("minimal-todo-update.bat");
    // chcp 65001 防中文路径乱码;轮询等待旧进程退出后再启动新版
    let script = format!(
        "@echo off\r\nchcp 65001 >nul\r\n:wait\r\ntasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul\r\nif not errorlevel 1 (\r\n  timeout /t 1 /nobreak >nul\r\n  goto wait\r\n)\r\nstart \"\" \"{new}\" --updated-from \"{old}\"\r\ndel \"%~f0\"\r\n",
        pid = pid,
        new = new_exe.display(),
        old = old_exe.display(),
    );
    std::fs::write(&bat, script).map_err(err)?;

    std::process::Command::new("cmd")
        .args(["/C", bat.to_str().unwrap_or_default()])
        .spawn()
        .map_err(err)?;

    // 给前端一点时间收到返回,再优雅退出
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(0);
    });
    Ok(())
}

/// 新版启动时回收旧 exe(由 --updated-from 参数传入)。
/// 旧进程可能还在收尾,后台重试删除,不阻塞启动。
pub fn cleanup_after_update() {
    let args: Vec<String> = std::env::args().collect();
    let Some(pos) = args.iter().position(|a| a == "--updated-from") else { return };
    let Some(old) = args.get(pos + 1).cloned() else { return };
    if old.is_empty() {
        return;
    }
    std::thread::spawn(move || {
        let path = std::path::PathBuf::from(&old);
        // 自身路径保护:绝不删除当前 exe
        if let Ok(me) = std::env::current_exe() {
            if me == path {
                return;
            }
        }
        for _ in 0..20 {
            if !path.exists() || std::fs::remove_file(&path).is_ok() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}
