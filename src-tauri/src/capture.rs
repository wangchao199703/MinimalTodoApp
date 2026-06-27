//! 截图 + 桌面贴图(类 Flameshot)后端。
//!
//! 设计:Rust 只做「捕获 + 文件 + 窗口 + 剪贴板」,所有绘图/裁剪/标注在前端 canvas 完成。
//! 捕获用 **GDI BitBlt** 抓整个虚拟桌面(跨所有显示器),走原始 Win32 FFI
//! (对齐 window.rs / paste.rs 的 `#[link]` 风格),**零新依赖、零联网**;PNG 编码用已有的 image crate。

use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ============ GDI 捕获(原始 Win32 FFI) ============

#[link(name = "user32")]
extern "system" {
    fn GetDC(hwnd: isize) -> isize;
    fn ReleaseDC(hwnd: isize, hdc: isize) -> i32;
    fn GetSystemMetrics(index: i32) -> i32;
}
#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(hdc: isize) -> isize;
    fn CreateDIBSection(
        hdc: isize,
        pbmi: *const BitmapInfo,
        usage: u32,
        ppv_bits: *mut *mut c_void,
        h_section: isize,
        offset: u32,
    ) -> isize;
    fn SelectObject(hdc: isize, h: isize) -> isize;
    fn BitBlt(
        hdc_dest: isize,
        x: i32,
        y: i32,
        w: i32,
        h: i32,
        hdc_src: isize,
        x1: i32,
        y1: i32,
        rop: u32,
    ) -> i32;
    fn DeleteObject(h: isize) -> i32;
    fn DeleteDC(hdc: isize) -> i32;
}

const SM_XVIRTUALSCREEN: i32 = 76;
const SM_YVIRTUALSCREEN: i32 = 77;
const SM_CXVIRTUALSCREEN: i32 = 78;
const SM_CYVIRTUALSCREEN: i32 = 79;
const SRCCOPY: u32 = 0x00CC_0020;
/// 包含分层窗口(否则部分半透明窗口截不全)
const CAPTUREBLT: u32 = 0x4000_0000;
const BI_RGB: u32 = 0;
const DIB_RGB_COLORS: u32 = 0;

#[repr(C)]
struct BitmapInfoHeader {
    bi_size: u32,
    bi_width: i32,
    bi_height: i32,
    bi_planes: u16,
    bi_bit_count: u16,
    bi_compression: u32,
    bi_size_image: u32,
    bi_x_pels_per_meter: i32,
    bi_y_pels_per_meter: i32,
    bi_clr_used: u32,
    bi_clr_important: u32,
}
#[repr(C)]
struct BitmapInfo {
    bmi_header: BitmapInfoHeader,
    bmi_colors: [u32; 1],
}

/// 虚拟桌面矩形(物理像素)。x/y 可为负(副屏在主屏左/上)。
pub struct VirtualRect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// 截图临时目录(与 clipboard-images 同级,从数据根推导,跟随数据迁移)。
pub fn screenshots_dir() -> PathBuf {
    let dir = crate::database::data_dir().join("screenshots");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 抓取整个虚拟桌面 → 存临时 PNG(cap-*.png)→ 返回 (路径, 矩形)。
///
/// 进程为 PerMonitorV2 DPI 感知(Tauri 默认),`SM_*VIRTUALSCREEN` 即物理像素,
/// `GetDC(NULL)` 的 DC 覆盖整个虚拟桌面,一次 BitBlt 即抓全部显示器(物理分辨率)。
/// 混合 DPI 的副屏可能被 GDI 拉伸——属已知局限,见 release.md。
pub fn capture_virtual_desktop() -> Result<(PathBuf, VirtualRect), String> {
    unsafe {
        let (vx, vy) = (GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN));
        let (vw, vh) = (GetSystemMetrics(SM_CXVIRTUALSCREEN), GetSystemMetrics(SM_CYVIRTUALSCREEN));
        if vw <= 0 || vh <= 0 {
            return Err("无法获取虚拟桌面尺寸".into());
        }
        let screen_dc = GetDC(0);
        if screen_dc == 0 {
            return Err("GetDC 失败".into());
        }
        let mem_dc = CreateCompatibleDC(screen_dc);
        // 顶向下 DIB(负高度):像素行从上到下,免翻转;32bpp BGRA
        let bmi = BitmapInfo {
            bmi_header: BitmapInfoHeader {
                bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                bi_width: vw,
                bi_height: -vh,
                bi_planes: 1,
                bi_bit_count: 32,
                bi_compression: BI_RGB,
                bi_size_image: 0,
                bi_x_pels_per_meter: 0,
                bi_y_pels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            },
            bmi_colors: [0],
        };
        let mut bits: *mut c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(mem_dc, &bmi, DIB_RGB_COLORS, &mut bits, 0, 0);
        if dib == 0 || bits.is_null() {
            DeleteDC(mem_dc);
            ReleaseDC(0, screen_dc);
            return Err("CreateDIBSection 失败".into());
        }
        let old = SelectObject(mem_dc, dib);
        let ok = BitBlt(mem_dc, 0, 0, vw, vh, screen_dc, vx, vy, SRCCOPY | CAPTUREBLT);
        let n = (vw as usize) * (vh as usize) * 4;
        let mut buf = vec![0u8; n];
        if ok != 0 {
            std::ptr::copy_nonoverlapping(bits as *const u8, buf.as_mut_ptr(), n);
        }
        // 释放 GDI 资源(无论成败)
        SelectObject(mem_dc, old);
        DeleteObject(dib);
        DeleteDC(mem_dc);
        ReleaseDC(0, screen_dc);
        if ok == 0 {
            return Err("BitBlt 截屏失败".into());
        }
        // BGRA → RGBA,并强制不透明(桌面无 alpha,GDI 给的 alpha 不可靠)
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        let img = image::RgbaImage::from_raw(vw as u32, vh as u32, buf)
            .ok_or("构建图像缓冲失败")?;
        let path = screenshots_dir()
            .join(format!("cap-{}.png", chrono::Local::now().format("%Y%m%d-%H%M%S-%3f")));
        img.save(&path).map_err(|e| format!("保存截图失败:{e}"))?;
        Ok((path, VirtualRect { x: vx, y: vy, w: vw as u32, h: vh as u32 }))
    }
}

// ============ 状态(Tauri 托管) ============

/// 本次截图的冻结帧元数据:overlay 挂载后 take 走。
#[derive(Clone, serde::Serialize)]
pub struct CapturePayload {
    pub path: String,
    pub vx: i32,
    pub vy: i32,
    pub vw: u32,
    pub vh: u32,
}
pub struct CaptureTarget(pub Mutex<Option<CapturePayload>>);
impl CaptureTarget {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

/// 单个贴图窗的图片元数据:贴图窗挂载后按 label take 走。
#[derive(Clone, serde::Serialize)]
pub struct PinPayload {
    pub path: String,
    pub phys_w: u32,
    pub phys_h: u32,
}
pub struct PinTargets(pub Mutex<HashMap<String, PinPayload>>);
impl PinTargets {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}
/// 活跃贴图窗 label 集合(供「关闭所有贴图」);各贴图窗自治,主窗口不持有。
pub struct ActivePins(pub Mutex<HashSet<String>>);
impl ActivePins {
    pub fn new() -> Self {
        Self(Mutex::new(HashSet::new()))
    }
}
static PIN_SEQ: AtomicU64 = AtomicU64::new(0);

/// 贴图窗给阴影(shadow-2xl)留的物理像素边距(四周)。
const PIN_SHADOW_MARGIN: i32 = 28;

// ============ 触发 + 遮罩窗口 ============

/// 触发截图(托盘左键 / 右键菜单「截图」)。先查重防叠层,再异步捕获 + 开遮罩窗。
/// 同步 fn 以适配托盘回调签名;捕获(同步 GDI)与建窗(须主线程消息循环)都放进
/// async_runtime::spawn,既不阻塞主线程也不死锁(对齐 open_settings_window 的 async 理由)。
pub fn start_capture(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("capture-overlay") {
        let _ = w.set_focus();
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match capture_virtual_desktop() {
            Ok((path, vr)) => {
                if let Some(state) = app.try_state::<CaptureTarget>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(CapturePayload {
                            path: path.to_string_lossy().into_owned(),
                            vx: vr.x,
                            vy: vr.y,
                            vw: vr.w,
                            vh: vr.h,
                        });
                    }
                }
                if let Err(e) = build_overlay(&app, &vr) {
                    eprintln!("截图遮罩窗口创建失败:{e}");
                    let _ = std::fs::remove_file(&path);
                }
            }
            Err(e) => eprintln!("截图捕获失败:{e}"),
        }
    });
}

/// 建覆盖整个虚拟桌面的遮罩窗(label = capture-overlay):无边框 + 透明 + 置顶 + 不在任务栏。
/// 先隐藏建窗,再用物理像素精确定位/铺满,最后 show + 抢焦点(收 Esc/Enter)。
fn build_overlay(app: &AppHandle, vr: &VirtualRect) -> Result<(), String> {
    // 防御:销毁可能残留的同名窗(异常退出/旧实例留下的僵尸窗会让新建报「already exists」)
    if let Some(stale) = app.get_webview_window("capture-overlay") {
        let _ = stale.destroy();
    }
    let win = WebviewWindowBuilder::new(app, "capture-overlay", WebviewUrl::App("index.html".into()))
        .title("截图")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(err)?;
    win.set_position(PhysicalPosition::new(vr.x, vr.y)).map_err(err)?;
    win.set_size(PhysicalSize::new(vr.w, vr.h)).map_err(err)?;
    win.show().map_err(err)?;
    let _ = win.set_focus();
    Ok(())
}

/// overlay 挂载后取走冻结帧元数据(并清空)。
#[tauri::command]
pub fn take_capture_target(state: State<CaptureTarget>) -> Result<Option<CapturePayload>, String> {
    Ok(state.0.lock().map_err(err)?.take())
}

// ============ 导出:写盘 / 复制 / 保存 ============

/// 写一张 PNG 到截图临时目录(前端 canvas 导出的「选区+标注」字节),返回绝对路径。
/// 钉图前先落地成 shot-*.png(贴图窗按路径加载),复用 save_note_image 的 raw IPC 模式。
#[tauri::command]
pub fn save_capture_png(request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw body".into());
    };
    let name = format!("shot-{}.png", uuid::Uuid::new_v4().simple());
    let path = screenshots_dir().join(&name);
    std::fs::write(&path, bytes).map_err(err)?;
    Ok(path.to_string_lossy().into_owned())
}

/// 把截图 PNG 写入系统剪贴板(复用剪贴板写图公共函数)。
#[tauri::command(rename_all = "snake_case")]
pub fn copy_capture_to_clipboard(png_path: String) -> Result<(), String> {
    crate::commands::set_clipboard_image_from_path(&png_path)
}

/// 另存:把截图临时 PNG 复制到用户在「保存对话框」选定的目标路径(UTF-8 路径走普通参数,免 header 编码坑)。
#[tauri::command(rename_all = "snake_case")]
pub fn save_capture_as(src_path: String, dest_path: String) -> Result<(), String> {
    std::fs::copy(&src_path, &dest_path).map_err(err)?;
    Ok(())
}

/// 删除截图临时文件(overlay 取消/确认后清 cap-*.png)。仅允许删截图目录内文件,防越权。
#[tauri::command]
pub fn discard_capture(path: String) {
    let dir = screenshots_dir();
    if std::path::Path::new(&path).starts_with(&dir) {
        let _ = std::fs::remove_file(&path);
    }
}

/// 启动时清理上次遗留的冻结帧 cap-*.png(崩溃/异常退出留下的孤儿;shot-*.png 由贴图窗关闭时清)。
pub fn cleanup_orphan_captures() {
    let dir = screenshots_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("cap-") && name.ends_with(".png") {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

// ============ 桌面贴图悬浮窗 ============

/// 开一个贴图悬浮窗(label = pin-N):无边框 + 透明 + 置顶 + 不在任务栏。
/// 必须 async:Windows 下主线程建 webview 需消息循环,同步命令阻塞主线程即死锁
/// (同 open_settings_window)。窗口比图大出四周 PIN_SHADOW_MARGIN 物理像素,给 shadow-2xl 留位。
#[tauri::command(rename_all = "snake_case")]
pub async fn open_pin_window(
    app: AppHandle,
    png_path: String,
    phys_x: i32,
    phys_y: i32,
    phys_w: u32,
    phys_h: u32,
) -> Result<(), String> {
    let label = format!("pin-{}", PIN_SEQ.fetch_add(1, Ordering::SeqCst));
    if let Some(state) = app.try_state::<PinTargets>() {
        state
            .0
            .lock()
            .map_err(err)?
            .insert(label.clone(), PinPayload { path: png_path, phys_w, phys_h });
    }
    if let Some(state) = app.try_state::<ActivePins>() {
        state.0.lock().map_err(err)?.insert(label.clone());
    }
    let margin = PIN_SHADOW_MARGIN;
    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("贴图")
        .decorations(false)
        .transparent(true)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .build()
        .map_err(err)?;
    win.set_position(PhysicalPosition::new(phys_x - margin, phys_y - margin)).map_err(err)?;
    win.set_size(PhysicalSize::new(phys_w + margin as u32 * 2, phys_h + margin as u32 * 2))
        .map_err(err)?;
    win.show().map_err(err)?;
    // 建好不强制 set_focus:避免每钉一张就抢走当前窗口焦点、反复打断
    Ok(())
}

/// 贴图窗挂载后按 label 取走图片元数据(并清空)。
#[tauri::command(rename_all = "snake_case")]
pub fn take_pin_target(app: AppHandle, label: String) -> Option<PinPayload> {
    app.try_state::<PinTargets>()?.0.lock().ok()?.remove(&label)
}

/// 贴图窗关闭前:出活跃集合 + 删其临时 PNG(shot-*.png)。
#[tauri::command(rename_all = "snake_case")]
pub fn unregister_pin(app: AppHandle, label: String, png_path: String) {
    if let Some(state) = app.try_state::<ActivePins>() {
        if let Ok(mut guard) = state.0.lock() {
            guard.remove(&label);
        }
    }
    let dir = screenshots_dir();
    if std::path::Path::new(&png_path).starts_with(&dir) {
        let _ = std::fs::remove_file(&png_path);
    }
}

/// 关闭所有贴图窗(供托盘右键「关闭所有贴图」)。
#[tauri::command]
pub fn close_all_pins(app: AppHandle) {
    let labels: Vec<String> = app
        .try_state::<ActivePins>()
        .and_then(|s| s.0.lock().ok().map(|g| g.iter().cloned().collect()))
        .unwrap_or_default();
    for label in labels {
        if let Some(w) = app.get_webview_window(&label) {
            let _ = w.close();
        }
    }
}
