//! 自动更新落地侧:版本检查由前端完成(api.github.com 允许跨域),
//! 但**资产下载必须走 Rust**——GitHub 资产 CDN(release-assets.githubusercontent.com)
//! 不返回 CORS 头,前端 fetch 会被 WebView2 拦截(下载立即失败、无任何进度)。
//! 本模块负责:Rust 侧流式下载新版 exe(带进度事件)→ 写盘 → bat 换壳重启
//! → 新版启动后回收旧 exe。保留旧版「便携单 exe」分发模型,不走安装包。

use tauri::{AppHandle, Emitter};

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

/// 把新版 exe 字节写盘,生成临时 bat(等本进程退出 → 启动新版,带 --updated-from 指向旧 exe),
/// 然后稍后优雅退出本进程。成功返回后应用即将自行重启。
fn swap_and_restart(app: &AppHandle, file_name: &str, bytes: &[u8]) -> Result<(), String> {
    let new_exe = target_dir().join(file_name);
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
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(0);
    });
    Ok(())
}

/// 流式下载新版 exe 并换壳重启:从 `url`(GitHub 资产直链,会 302 到无 CORS 的 CDN,
/// 故必须在 Rust 侧下载)读取字节,边下边 emit `update-progress`(0~1),完成后写盘 + 重启。
/// async 命令在后台线程池执行,阻塞下载放进 spawn_blocking,绝不卡主线程消息循环。
#[tauri::command]
pub async fn download_update(app: AppHandle, url: String, file_name: String) -> Result<(), String> {
    // 命令本身是 async,直接用 reqwest 异步客户端跑在 Tauri 的 tokio 运行时上;
    // 切忌在此用 reqwest::blocking(它会在异步运行时内再起阻塞运行时,导致下载未开始即失败)。
    let client = reqwest::Client::builder()
        .user_agent("MinimalTodoApp-update")
        .build()
        .map_err(err)?;
    let mut resp = client.get(&url).send().await.map_err(err)?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut received: u64 = 0;
    let mut last_emit = 0.0f64;
    while let Some(chunk) = resp.chunk().await.map_err(err)? {
        buf.extend_from_slice(&chunk);
        received += chunk.len() as u64;
        if total > 0 {
            let ratio = received as f64 / total as f64;
            // 节流:每涨 1% 才上报一次(末尾必报)
            if ratio - last_emit >= 0.01 || ratio >= 1.0 {
                last_emit = ratio;
                let _ = app.emit("update-progress", ratio);
            }
        }
    }
    let _ = app.emit("update-progress", 1.0_f64);
    swap_and_restart(&app, &file_name, &buf)
}

/// 旧的「前端下载 → 传原始字节」入口,保留兼容:接收新版 exe 字节(Raw body + x-file-name header)。
/// 现网下载已改走 `download_update`(避开资产 CDN 的 CORS),此命令一般不再调用。
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
    swap_and_restart(&app, &file_name, bytes)
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
