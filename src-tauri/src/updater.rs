//! 自动更新落地侧:版本检查由前端完成(api.github.com 允许跨域),
//! 但**资产下载必须走 Rust**——GitHub 资产 CDN(release-assets.githubusercontent.com)
//! 不返回 CORS 头,前端 fetch 会被 WebView2 拦截(下载立即失败、无任何进度)。
//! 本模块负责:Rust 侧流式下载新版 exe(带进度事件)→ 写盘 → bat 换壳重启
//! → 新版启动后回收旧 exe。保留旧版「便携单 exe」分发模型,不走安装包。

use tauri::{AppHandle, Emitter};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

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

/// 写 bat 并执行:等本进程(pid)退出后,删掉 `to_delete`(若有),启动 `launch`(可带参数),自删。
/// chcp 65001 防中文路径乱码;轮询等待旧进程退出再动手(规避运行中文件锁与单实例冲突)。
fn spawn_restart_bat(
    app: &AppHandle,
    launch: &std::path::Path,
    launch_args: &str,
    to_delete: Option<&std::path::Path>,
) -> Result<(), String> {
    let pid = std::process::id();
    let del_line = match to_delete {
        // 删旧版可能因句柄释放滞后而短暂失败,重试几次
        Some(p) => format!(
            "set i=0\r\n:del\r\ndel /f /q \"{p}\" >nul 2>nul\r\nif exist \"{p}\" if %i% lss 10 (set /a i+=1 & timeout /t 1 /nobreak >nul & goto del)\r\n",
            p = p.display()
        ),
        None => String::new(),
    };
    let bat = std::env::temp_dir().join("minimal-todo-update.bat");
    let script = format!(
        "@echo off\r\nchcp 65001 >nul\r\n:wait\r\ntasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul\r\nif not errorlevel 1 (\r\n  timeout /t 1 /nobreak >nul\r\n  goto wait\r\n)\r\n{del_line}start \"\" \"{launch}\"{args}\r\ndel \"%~f0\"\r\n",
        pid = pid,
        del_line = del_line,
        launch = launch.display(),
        args = launch_args,
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

/// 用新版 exe 字节替换当前运行的 exe,并重启。
///
/// **要点(经本机实测确认):正在运行的 exe 无法被覆盖/删除(os error 32/5),但可被改名。**
/// 故首选「就地替换」:把运行中的 exe 改名挪开 → 原路径写入新版 → bat 等旧进程退出后删掉挪开的旧文件并启动新版。
/// 这样新版与旧版同路径同名(便携模型不变),且不依赖资产文件名。
/// 若就地替换不可行(目录不可写等),回退到「写入 %LOCALAPPDATA% 并从那启动、用 --updated-from 回收旧 exe」。
fn swap_and_restart(app: &AppHandle, file_name: &str, bytes: &[u8]) -> Result<(), String> {
    let cur = std::env::current_exe().map_err(err)?;

    // ---- 方案 A:就地替换(改名挪开运行中的 exe → 原路径写新版)----
    let aside = cur.with_file_name(format!(
        "{}.old-{}",
        cur.file_name().and_then(|s| s.to_str()).unwrap_or("app.exe"),
        std::process::id()
    ));
    if std::fs::rename(&cur, &aside).is_ok() {
        match std::fs::write(&cur, bytes) {
            Ok(()) => return spawn_restart_bat(app, &cur, "", Some(&aside)),
            Err(_) => {
                // 写新版失败:务必把挪开的旧 exe 改回原位,绝不能让应用变成"缺文件"
                let _ = std::fs::rename(&aside, &cur);
            }
        }
    }

    // ---- 方案 B(兜底):写到 %LOCALAPPDATA% 并从那启动新版,--updated-from 回收旧 exe ----
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let dir = std::path::PathBuf::from(local).join("MinimalTodoApp");
    let _ = std::fs::create_dir_all(&dir);
    let new_exe = dir.join(file_name);
    std::fs::write(&new_exe, bytes).map_err(err)?;
    let args = format!(" --updated-from \"{}\"", cur.display());
    spawn_restart_bat(app, &new_exe, &args, None)
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
