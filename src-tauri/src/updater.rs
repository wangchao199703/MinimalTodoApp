//! 自动更新落地侧(**逻辑对齐旧版 WPF `UpdateService`**):
//! 版本检查由前端完成;资产下载走 Rust(GitHub 资产 CDN 无 CORS 头,前端 fetch 会被 WebView2 拦)。
//! 安装严格照搬 WPF:
//!  1. **下载到独立文件**(`resolve_download_path`,对齐 WPF `ResolveDownloadPath`)——
//!     **绝不写正在运行的 exe**(运行中的 exe 被文件锁,覆盖必失败),同名冲突退到 `%LOCALAPPDATA%`;
//!  2. **直接拉起新版**(对齐 WPF `TryStartNewVersion` 的 `Process.Start`,不用脚本/bat),
//!     传 `--updated-from <旧exe>` 与 `--old-pid <旧进程>`;
//!  3. **新版接管旧版**(对齐 WPF `EnsureSingleInstance(fromUpdate)`):新版启动先等/强杀旧实例,
//!     再注册单实例,确保新版一定起来(`takeover_old_instance`);
//!  4. **回收旧 exe**(对齐 WPF `CleanupAfterUpdate`,`cleanup_after_update`)。
//! 保留「便携单 exe」分发模型,不走安装包。

use tauri::{AppHandle, Emitter};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// 进程操作(接管旧实例用):kernel32 直链,免新增依赖。对齐 WPF「新版静默接管旧版」。
#[link(name = "kernel32")]
extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
    fn TerminateProcess(handle: isize, exit_code: u32) -> i32;
    fn WaitForSingleObject(handle: isize, ms: u32) -> u32;
    fn CloseHandle(handle: isize) -> i32;
}
const PROCESS_TERMINATE: u32 = 0x0001;
const SYNCHRONIZE: u32 = 0x0010_0000;
const WAIT_OBJECT_0: u32 = 0x0000_0000;

/// 用系统默认浏览器打开 URL(「手动下载」用):把下载地址交给浏览器自行下载,
/// 作为应用内自动更新失败时的兜底。explorer.exe 接单个参数,免 cmd 的 `&` 转义坑。
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    // 仅允许 http(s),避免被诱导打开任意本地程序/协议
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("invalid url".into());
    }
    std::process::Command::new("explorer")
        .arg(&url)
        .spawn()
        .map_err(err)?;
    Ok(())
}

/// 目录是否可写(探针文件)。
fn is_writable(dir: &std::path::Path) -> bool {
    let probe = dir.join(".w_probe");
    match std::fs::write(&probe, b"x") {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// 选下载落地路径(对齐 WPF `ResolveDownloadPath`):exe 同目录可写优先;
/// 但**绝不**落到正在运行的 exe(否则文件锁导致写盘失败,这正是旧实现的 bug)——
/// 冲突则退到 `%LOCALAPPDATA%\MinimalTodoApp`,仍冲突则加 pid 前缀确保唯一。
fn resolve_download_path(asset_name: &str) -> std::path::PathBuf {
    let cur = std::env::current_exe().ok();
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(dir) = cur.as_ref().and_then(|e| e.parent()) {
        if is_writable(dir) {
            candidates.push(dir.join(asset_name));
        }
    }
    let local = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
        .join("MinimalTodoApp");
    let _ = std::fs::create_dir_all(&local);
    candidates.push(local.join(asset_name));
    candidates.push(local.join(format!("{}-{}", std::process::id(), asset_name)));
    for c in candidates {
        if cur.as_deref() != Some(c.as_path()) {
            return c;
        }
    }
    local.join(format!("{}-{}", std::process::id(), asset_name))
}

/// 把新版字节写到独立文件并拉起新版,然后退出本进程(对齐 WPF `DownloadAsync`+`TryStartNewVersion`)。
/// 新版带 `--updated-from <旧exe>`(供回收旧 exe)与 `--old-pid <本进程>`(供新版接管旧版)。
/// **全程不碰正在运行的 exe**,不写脚本。
fn start_new_and_exit(app: &AppHandle, file_name: &str, bytes: &[u8]) -> Result<(), String> {
    let new_exe = resolve_download_path(file_name);
    if let Some(p) = new_exe.parent() {
        let _ = std::fs::create_dir_all(p);
    }
    std::fs::write(&new_exe, bytes).map_err(err)?;

    let old_exe = std::env::current_exe().map_err(err)?;
    let old_pid = std::process::id();
    // 直接拉起新版,**完全脱离父进程**:不继承控制台/句柄、独立进程组。
    // 否则新版作为旧版的子进程,会继承旧版的句柄(含单实例锁等),行为与全新启动不同——
    // 这正是「更新后跑起来的还是旧版/异常,手动退出再开新版才正常」的根因。
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    std::process::Command::new(&new_exe)
        .arg("--updated-from")
        .arg(&old_exe)
        .arg("--old-pid")
        .arg(old_pid.to_string())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(err)?;

    // 给前端收到返回的时间,然后优雅退出(SQLite 已逐操作持久化,无需额外保存)
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
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
    start_new_and_exit(&app, &file_name, &buf)
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
    start_new_and_exit(&app, &file_name, bytes)
}

/// 新版启动时**接管旧版**(对齐 WPF `EnsureSingleInstance(fromUpdate)`):
/// 由 `--old-pid` 指定旧实例,先等其自行退出,超时则强杀,直到旧实例完全消失。
/// **必须在注册 tauri-plugin-single-instance 之前调用**——否则单实例插件会因旧实例仍在而让新版直接退出。
pub fn takeover_old_instance() {
    let args: Vec<String> = std::env::args().collect();
    let Some(pos) = args.iter().position(|a| a == "--old-pid") else { return };
    let Some(pid) = args.get(pos + 1).and_then(|s| s.parse::<u32>().ok()) else { return };
    if pid == 0 || pid == std::process::id() {
        return;
    }
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, 0, pid);
        if h == 0 {
            return; // 旧进程已不存在
        }
        // 先给旧实例 ~5s 优雅退出;仍在则强杀,再等其消失
        if WaitForSingleObject(h, 5000) != WAIT_OBJECT_0 {
            let _ = TerminateProcess(h, 0);
            WaitForSingleObject(h, 5000);
        }
        CloseHandle(h);
    }
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
