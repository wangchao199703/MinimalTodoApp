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
    fn GlobalFree(mem: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
}
const PROCESS_TERMINATE: u32 = 0x0001;
const SYNCHRONIZE: u32 = 0x0010_0000;
const WAIT_OBJECT_0: u32 = 0x0000_0000;

// ---- Restart Manager:找出「正占用某文件的进程」,用于接管不配合的旧实例 ----
// (旧 exe 名任意、没留任何标记,但运行时一定锁着 todo.db。)结构体布局经本机实测 size=668。
#[repr(C)]
struct RmUniqueProcess {
    pid: u32,
    start_low: u32,
    start_high: u32,
}
#[repr(C)]
struct RmProcessInfo {
    process: RmUniqueProcess,
    app_name: [u16; 256],
    svc_name: [u16; 64],
    app_type: u32,
    app_status: u32,
    ts_session: u32,
    restartable: i32,
}
#[link(name = "rstrtmgr")]
extern "system" {
    fn RmStartSession(session: *mut u32, flags: u32, key: *mut u16) -> u32;
    fn RmEndSession(session: u32) -> u32;
    fn RmRegisterResources(
        session: u32,
        n_files: u32,
        files: *const *const u16,
        n_app: u32,
        apps: *const u8,
        n_svc: u32,
        svc: *const u8,
    ) -> u32;
    fn RmGetList(
        session: u32,
        needed: *mut u32,
        count: *mut u32,
        info: *mut RmProcessInfo,
        reboot: *mut u32,
    ) -> u32;
}

/// 用 Restart Manager 列出正占用 `file` 的进程 pid(失败/无占用返回空)。
fn pids_holding_file(file: &std::path::Path) -> Vec<u32> {
    use std::os::windows::ffi::OsStrExt;
    let mut out = Vec::new();
    unsafe {
        let mut session: u32 = 0;
        let mut key = [0u16; 33]; // CCH_RM_SESSION_KEY+1
        if RmStartSession(&mut session, 0, key.as_mut_ptr()) != 0 {
            return out;
        }
        let wpath: Vec<u16> = file.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
        let files = [wpath.as_ptr()];
        if RmRegisterResources(session, 1, files.as_ptr(), 0, std::ptr::null(), 0, std::ptr::null())
            == 0
        {
            let mut needed: u32 = 0;
            let mut count: u32 = 0;
            let mut reboot: u32 = 0;
            // 先探需要多少条
            RmGetList(session, &mut needed, &mut count, std::ptr::null_mut(), &mut reboot);
            if needed > 0 {
                let mut buf: Vec<RmProcessInfo> = (0..needed).map(|_| std::mem::zeroed()).collect();
                count = needed;
                if RmGetList(session, &mut needed, &mut count, buf.as_mut_ptr(), &mut reboot) == 0 {
                    for item in buf.iter().take(count as usize) {
                        if item.process.pid != 0 {
                            out.push(item.process.pid);
                        }
                    }
                }
            }
        }
        RmEndSession(session);
    }
    out
}

/// 启动时**接管已运行的旧实例**:杀掉正占用 `todo.db` 的其它进程(=正在运行的旧实例,
/// **不论其 exe 名、是否同版本、是否留过标记**——运行时一定锁着库)。**必须在注册单实例插件之前调用、
/// 且在打开数据库之前**(此刻本进程还没锁库,占用者只有旧实例)。
///
/// 解决:双击打开「新下载的 exe」时,旧实例仍占用旧文件、单实例又把新 exe 挡回 → 旧文件删不掉、看到的还是旧版。
/// 现在新 exe 启动即杀掉旧实例(旧文件随即解除占用、可删),自己成为活动实例。
pub fn takeover_running_instance() {
    let db = crate::database::data_dir().join("todo.db");
    let me = std::process::id();
    for pid in pids_holding_file(&db) {
        if pid == me {
            continue;
        }
        unsafe {
            let h = OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE, 0, pid);
            if h != 0 {
                let _ = TerminateProcess(h, 0);
                WaitForSingleObject(h, 5000); // 等其彻底退出,库与文件锁随之释放
                CloseHandle(h);
            }
        }
    }
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

    // 给前端收到返回的时间,然后退出旧进程(SQLite 已逐操作持久化,WAL 下硬退也不丢/不损)。
    // 先优雅退出;若没退干净(设置弹窗的 webview/在途 IPC 会卡住优雅关闭,导致旧进程及其
    // 设置弹窗残留在新版之上——正是用户所见),1.2s 兜底**硬退出**,确保旧进程及其所有窗口立即消失。
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        app.exit(0);
        std::thread::sleep(std::time::Duration::from_millis(1200));
        std::process::exit(0);
    });
    Ok(())
}

// ---- 系统代理探测(对齐 .NET HttpClient / 浏览器:走 WinINET/IE 代理设置)----
// reqwest 默认只认环境变量代理,不读 Windows 系统代理;而 clash/公司网等常只在系统代理(注册表)里设。
// 用 WinHttpGetIEProxyConfigForCurrentUser 取当前用户的 IE/系统代理(浏览器走的就是这套)。
#[repr(C)]
struct IeProxyConfig {
    f_auto_detect: i32,
    lpsz_auto_config_url: *mut u16,
    lpsz_proxy: *mut u16,
    lpsz_proxy_bypass: *mut u16,
}
#[link(name = "winhttp")]
extern "system" {
    fn WinHttpGetIEProxyConfigForCurrentUser(cfg: *mut IeProxyConfig) -> i32;
}

unsafe fn wstr(p: *const u16) -> Option<String> {
    if p.is_null() {
        return None;
    }
    let mut len = 0usize;
    while *p.add(len) != 0 {
        len += 1;
    }
    if len == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(std::slice::from_raw_parts(p, len)))
}

/// 把 IE 代理串解析成 reqwest 能用的代理 URL。
/// 形如 "host:port"(全协议同代理)或 "http=h:p;https=h:p;...";优先取 https=,否则 http=,否则整串。
fn parse_proxy(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    let hostport: Option<&str> = if raw.contains('=') {
        let mut http_only: Option<&str> = None;
        let mut found: Option<&str> = None;
        for part in raw.split(';') {
            let part = part.trim();
            if let Some(rest) = part.strip_prefix("https=") {
                found = Some(rest);
                break;
            }
            if http_only.is_none() {
                if let Some(rest) = part.strip_prefix("http=") {
                    http_only = Some(rest);
                }
            }
        }
        found.or(http_only)
    } else {
        Some(raw)
    };
    let hp = hostport?.trim();
    if hp.is_empty() {
        return None;
    }
    if hp.starts_with("http://") || hp.starts_with("https://") {
        Some(hp.to_string())
    } else {
        Some(format!("http://{hp}"))
    }
}

/// 当前用户的系统代理(无则 None)。PAC / 自动检测暂不解析(退回直连 + 环境变量代理)。
fn system_proxy() -> Option<String> {
    unsafe {
        let mut cfg = IeProxyConfig {
            f_auto_detect: 0,
            lpsz_auto_config_url: std::ptr::null_mut(),
            lpsz_proxy: std::ptr::null_mut(),
            lpsz_proxy_bypass: std::ptr::null_mut(),
        };
        if WinHttpGetIEProxyConfigForCurrentUser(&mut cfg) == 0 {
            return None;
        }
        let proxy = wstr(cfg.lpsz_proxy);
        for p in [cfg.lpsz_auto_config_url, cfg.lpsz_proxy, cfg.lpsz_proxy_bypass] {
            if !p.is_null() {
                GlobalFree(p as *mut core::ffi::c_void);
            }
        }
        proxy.and_then(|s| parse_proxy(&s))
    }
}

/// 构建下载用 reqwest 客户端:对齐 WPF/.NET 的稳健性——连接超时 + 读空闲超时 + 系统代理。
fn build_update_client() -> Result<reqwest::Client, String> {
    let mut b = reqwest::Client::builder()
        .user_agent("MinimalTodoApp-update")
        // 连不上 CDN 不再无限卡 0%:30s 连接超时;读到一半断流 60s 无数据即失败(再由上层重试)。
        .connect_timeout(std::time::Duration::from_secs(30))
        .read_timeout(std::time::Duration::from_secs(60));
    // 走系统代理(对齐浏览器/WPF);没有就保持默认(直连 + 环境变量代理)。
    if let Some(p) = system_proxy() {
        if let Ok(proxy) = reqwest::Proxy::all(&p) {
            b = b.proxy(proxy);
            eprintln!("[update] 使用系统代理:{p}");
        }
    }
    b.build().map_err(err)
}

/// 单次下载:发请求 + 边下边 emit 进度,成功返回字节,失败返回错误(供上层重试)。
async fn download_once(client: &reqwest::Client, app: &AppHandle, url: &str) -> Result<Vec<u8>, String> {
    let mut resp = client.get(url).send().await.map_err(err)?;
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
            if ratio - last_emit >= 0.01 || ratio >= 1.0 {
                last_emit = ratio;
                let _ = app.emit("update-progress", ratio);
            }
        }
    }
    Ok(buf)
}

/// 流式下载新版 exe 并换壳重启:从 `url`(GitHub 资产直链,会 302 到无 CORS 的 CDN,
/// 故必须在 Rust 侧下载)读取字节,边下边 emit `update-progress`(0~1),完成后写盘 + 重启。
/// **检查更新与重新安装共用此命令**。稳健性对齐 WPF:超时 + 系统代理 + 失败重试,避免无限卡 0%。
#[tauri::command]
pub async fn download_update(app: AppHandle, url: String, file_name: String) -> Result<(), String> {
    let client = build_update_client()?;
    let mut last_err = String::new();
    // 最多 3 次:撞上 schannel 抖动 / 瞬断时重试(每次重试把进度复位到 0)。
    for attempt in 0..3u32 {
        match download_once(&client, &app, &url).await {
            Ok(buf) => {
                let _ = app.emit("update-progress", 1.0_f64);
                return start_new_and_exit(&app, &file_name, &buf);
            }
            Err(e) => {
                last_err = e;
                eprintln!("[update] 下载第 {} 次失败:{last_err}", attempt + 1);
                let _ = app.emit("update-progress", 0.0_f64);
                if attempt + 1 < 3 {
                    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
                }
            }
        }
    }
    Err(format!("下载失败(已重试 3 次):{last_err}"))
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
