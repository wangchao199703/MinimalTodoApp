//! 窗口外壳:系统托盘、贴边自动隐藏(QQ 式)、亚克力、开机自启。

use crate::database::Db;
use rusqlite::params;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// 显示主窗口并居中,同时强制 WebView2 重绘——既是托盘「显示并居中」动作,
/// 也是「拉大窗口后内容透出桌面」的一键恢复手段。
///
/// 透明窗口(transparent:true,为亚克力/圆角)在 Windows + WebView2 放大 resize 时,
/// 新暴露区域不会被重绘,于是透出桌面壁纸。可靠的修复办法是微调一次内层尺寸触发整窗重绘。
///
/// 居中走「带忽略标志的 set_position」路径:DockState.moving 置位期间,贴边监听器会
/// 跳过本次 Moved,避免居中产生的移动被误判为「用户拖动」而触发贴边收起/吸附。
/// (window.center() 内部也 set_position 但不走此标志,故不用它。)
pub fn show_main(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();

    // 居中:算出居中坐标,在 moving 忽略标志保护下 set_position(避免触发贴边)
    if let (Ok(size), Ok(Some(mon))) = (w.outer_size(), w.current_monitor()) {
        let mp = mon.position();
        let ms = mon.size();
        let cx = mp.x + (ms.width as i32 - size.width as i32) / 2;
        let cy = mp.y + (ms.height as i32 - size.height as i32) / 2;
        // 复用贴边自动隐藏的「忽略自身移动」标志:置位 → 移动 → 还原
        let dock = app.try_state::<Arc<DockState>>();
        if let Some(state) = &dock {
            state.moving.store(true, Ordering::SeqCst);
            // 居中即视为离开贴边:清掉贴边态与待收起,确保不被收边
            state.edge.store(EDGE_NONE, Ordering::SeqCst);
            state.hidden.store(false, Ordering::SeqCst);
            state.pending.store(false, Ordering::SeqCst);
            write_setting(app, "dock_edge", &EDGE_NONE.to_string());
        }
        let _ = w.set_position(PhysicalPosition::new(cx, cy));
        if let Some(state) = &dock {
            state.moving.store(false, Ordering::SeqCst);
        }
    }
    // 注:不再在此用 set_size 微调强制重绘——那是个无 moving 守卫的尺寸变更,
    // 会触发 Resized/Moved 干扰贴边轮询(贴边自动隐藏曾因此回归);
    // 透明窗口透出桌面的重绘改由前端 onResized 防抖 + 纯 DOM 重绘兜底(见 App.tsx),
    // 对最大化无副作用、也不与贴边逻辑互扰。
}

fn read_setting(app: &AppHandle, key: &str) -> Option<String> {
    let db = app.state::<Db>();
    let conn = db.0.lock().ok()?;
    conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
        .ok()
}

fn write_setting(app: &AppHandle, key: &str, value: &str) {
    let db = app.state::<Db>();
    let guard = db.0.lock();
    if let Ok(conn) = &guard {
        let _ = conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        );
    }
    drop(guard);
}

// ============ 全局快捷键(召唤窗口 + 切换视图) ============

/// 5 个快捷键:设置键 / 默认加速键 / 目标视图 key。
const HOTKEY_DEFS: [(&str, &str, &str); 5] = [
    ("hotkey_clipboard", "Alt+1", "clipboard"),
    ("hotkey_notes", "Alt+2", "notes"),
    ("hotkey_tagboard", "Alt+3", "tagboard"),
    ("hotkey_quadrant", "Alt+4", "quadrant"),
    ("hotkey_all", "Alt+5", "all"),
];

/// 已注册快捷键 → 目标视图 的映射(触发时反查)。
pub struct HotkeyMap(pub std::sync::Mutex<Vec<(tauri_plugin_global_shortcut::Shortcut, String)>>);

/// 召唤主窗口:从隐藏/最小化恢复并置前(浮到最上层一次),**不居中、不常驻置顶**。
/// 即:取消隐藏 + 若在其他窗口底层则浮到最前;之后点别处会正常退到后面(不锁定置顶)。
/// **贴边收起态**:先把窗口从屏幕外滑回完整可见 + 清 hidden + 给一段宽限(否则 show 只露细条、且立刻又被收起)。
pub fn summon_main(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    if let Some(state) = app.try_state::<Arc<DockState>>() {
        let edge = state.edge.load(Ordering::SeqCst);
        if edge != EDGE_NONE && state.hidden.load(Ordering::SeqCst) {
            reveal_docked(&w, &state, edge);
            // ≈2s @90ms 内不自动收起,给鼠标移过去的时间(对齐用户「唤出后别立刻又躲起来」)
            state.summon_grace.store(22, Ordering::SeqCst);
        }
    }
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
}

/// 把贴边收起的窗口移回「完整可见」位置并清掉 hidden(供快捷键召唤用)。
fn reveal_docked(win: &WebviewWindow, state: &DockState, edge: i32) {
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { return };
    let w = size.width as i32;
    // 显示器几何:优先 current_monitor,回退缓存(收起态 current_monitor 可能取不到)
    let (mx, my, mw) = if let Ok(Some(mon)) = win.current_monitor() {
        let p = *mon.position();
        let s = *mon.size();
        (p.x, p.y, s.width as i32)
    } else {
        let cw = state.mon_w.load(Ordering::SeqCst);
        if cw <= 0 {
            return;
        }
        (state.mon_x.load(Ordering::SeqCst), state.mon_y.load(Ordering::SeqCst), cw)
    };
    let target = match edge {
        EDGE_TOP => PhysicalPosition::new(pos.x, my),
        EDGE_LEFT => PhysicalPosition::new(mx, pos.y),
        _ => PhysicalPosition::new(mx + mw - w, pos.y),
    };
    state.moving.store(true, Ordering::SeqCst);
    let _ = win.set_position(target);
    state.moving.store(false, Ordering::SeqCst);
    state.hidden.store(false, Ordering::SeqCst);
}

/// 按设置注册全局快捷键(默认 Alt+1..5);设置为「none」或解析失败则跳过该项。
/// 先全清再注册,可在设置改动后重复调用。
pub fn register_hotkeys(app: &AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut map: Vec<(tauri_plugin_global_shortcut::Shortcut, String)> = Vec::new();
    for (key, default, view) in HOTKEY_DEFS {
        let accel = read_setting(app, key)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| default.to_string());
        if accel.eq_ignore_ascii_case("none") {
            continue; // 用户清空 = 禁用该项
        }
        if let Ok(sc) = accel.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            if gs.register(sc).is_ok() {
                map.push((sc, view.to_string()));
            }
        }
    }
    if let Some(state) = app.try_state::<HotkeyMap>() {
        if let Ok(mut g) = state.0.lock() {
            *g = map;
        }
    }
}

/// 全局快捷键触发:查表得目标视图 → 召唤窗口 + emit「summon-view」让前端切换第一侧栏视图。
pub fn on_hotkey(app: &AppHandle, sc: &tauri_plugin_global_shortcut::Shortcut) {
    use tauri::Emitter;
    let view = app.try_state::<HotkeyMap>().and_then(|st| {
        st.0.lock().ok().and_then(|g| g.iter().find(|(s, _)| s == sc).map(|(_, v)| v.clone()))
    });
    if let Some(view) = view {
        summon_main(app);
        let _ = app.emit("summon-view", view);
    }
}

/// 前端改了快捷键设置后调用:按最新设置重新注册。
#[tauri::command]
pub fn update_hotkeys(app: AppHandle) {
    register_hotkeys(&app);
}

/// 录制快捷键期间暂时全部注销(否则按 Alt+1 会被系统全局热键吞掉、传不到设置窗口的输入框)。
/// 录制结束/取消后由前端再调 update_hotkeys 重新注册。
#[tauri::command]
pub fn pause_hotkeys(app: AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let _ = app.global_shortcut().unregister_all();
    if let Some(st) = app.try_state::<HotkeyMap>() {
        if let Ok(mut g) = st.0.lock() {
            g.clear();
        }
    }
}

// ============ 系统托盘 ============

/// 切语言后即时重建托盘菜单与提示(对齐旧版 LanguageChanged 重建)
#[tauri::command]
pub fn rebuild_tray(app: AppHandle, en: bool) -> Result<(), String> {
    let Some(tray) = app.tray_by_id("main") else { return Ok(()) };
    let capture_label = if en { "Screenshot" } else { "截图" };
    let show_label = if en { "Show & center" } else { "显示并居中" };
    let quit_label = if en { "Exit" } else { "退出" };
    let capture = MenuItem::with_id(&app, "capture", capture_label, true, None::<&str>).map_err(err)?;
    let show = MenuItem::with_id(&app, "show", show_label, true, None::<&str>).map_err(err)?;
    let quit = MenuItem::with_id(&app, "quit", quit_label, true, None::<&str>).map_err(err)?;
    let menu = Menu::with_items(&app, &[&capture, &show, &quit]).map_err(err)?;
    tray.set_menu(Some(menu)).map_err(err)?;
    tray.set_tooltip(Some(if en { "Todo" } else { "待办" })).map_err(err)?;
    Ok(())
}

/// 前端弹层开/关时调用:开时置位 hold,贴边窗口在编辑期间不自动收起;全关后解除。
#[tauri::command]
pub fn set_dock_hold(app: AppHandle, hold: bool) {
    if let Some(state) = app.try_state::<Arc<DockState>>() {
        state.hold.store(hold, Ordering::SeqCst);
    }
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    // 托盘菜单按启动时语言构建,切语言时经 rebuild_tray 即时重建
    let en = read_setting(app, "language").as_deref() == Some("en");
    let capture_label = if en { "Screenshot" } else { "截图" };
    let show_label = if en { "Show & center" } else { "显示并居中" };
    let quit_label = if en { "Exit" } else { "退出" };

    let capture = MenuItem::with_id(app, "capture", capture_label, true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&capture, &show, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("缺少应用图标").clone())
        .tooltip(if en { "Todo" } else { "待办" })
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "capture" => crate::capture::start_capture(app),
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // 左键单击 = 截图(用户指定:点最小化的托盘图标即触发截图)。
            // 恢复主窗口改走右键菜单「显示并居中」或全局快捷键 Alt+1~5,二者刻意区分。
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                crate::capture::start_capture(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

// ============ 亚克力(透明系主题) ============

#[tauri::command]
pub fn set_acrylic(window: WebviewWindow, enabled: bool, dark: bool) -> Result<(), String> {
    if enabled {
        let tint = if dark { (28, 30, 36, 140) } else { (250, 250, 252, 140) };
        window_vibrancy::apply_acrylic(&window, Some(tint)).map_err(err)
    } else {
        window_vibrancy::clear_acrylic(&window).map_err(err)
    }
}

// ============ 开机自启 ============

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled { m.enable() } else { m.disable() }.map_err(err)
}

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(err)
}

// ============ 独立设置窗口(可拖出主窗口) ============

/// 打开/聚焦「设置」独立原生窗口:自绘无边框、不透明、可拖到屏幕任意位置(含主窗口外)。
/// 加载同一前端但带 ?window=settings 标记,由 main.tsx 路由到 SettingsWindow。
/// 注意必须是 async:同步命令在主线程执行,而 WebviewWindowBuilder::build()
/// 在 Windows 需要主线程消息循环来完成 webview 创建——主线程被命令阻塞会死锁。
/// async 命令跑在异步运行时线程上,build() 把建窗代理回(此时空闲的)主线程,避免卡死。
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    // 加载同一前端,前端按窗口 label("settings")路由到 SettingsWindow
    tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("设置")
    .inner_size(600.0, 540.0)
    .min_inner_size(460.0, 420.0)
    .decorations(false)
    .resizable(true)
    .center()
    .build()
    .map_err(err)?;
    Ok(())
}

// ============ 独立剪贴项编辑窗口(便签式文本编辑器) ============

/// 待编辑的剪贴项 id。open_clip_editor_window 写入,编辑窗口挂载后 take_clip_editor_target 取走。
/// 用「后端暂存 + 前端拉取」而不是 URL query 传参:多窗口前端按窗口 label 路由,
/// query 不作为路由会白屏(见 CLAUDE.md 多窗口坑)。
pub struct ClipEditorTarget(pub std::sync::Mutex<Option<i64>>);

/// 打开/聚焦「剪贴项编辑」独立原生窗口(label = "clip-editor",复用单窗口)。
/// 必须 async:同步命令在主线程跑,WebviewWindowBuilder::build() 在 Windows 需主线程消息循环建 webview,
/// 主线程被命令阻塞即死锁(同 open_settings_window 的理由)。
/// 窗口已存在(再次编辑别的项)→ 更新目标 + emit `clip-editor-target` 让前端切换到新项 + 聚焦。
#[tauri::command(rename_all = "snake_case")]
pub async fn open_clip_editor_window(app: AppHandle, clip_id: i64) -> Result<(), String> {
    use tauri::Emitter;
    if let Some(state) = app.try_state::<ClipEditorTarget>() {
        *state.0.lock().map_err(err)? = Some(clip_id);
    }
    if let Some(w) = app.get_webview_window("clip-editor") {
        let _ = app.emit_to("clip-editor", "clip-editor-target", clip_id);
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    // 加载同一前端,前端按窗口 label("clip-editor")路由到 ClipEditorWindow
    tauri::WebviewWindowBuilder::new(
        &app,
        "clip-editor",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("编辑剪贴项")
    .inner_size(520.0, 460.0)
    .min_inner_size(360.0, 280.0)
    .decorations(false)
    .resizable(true)
    .center()
    .build()
    .map_err(err)?;
    Ok(())
}

/// 编辑窗口挂载后调用:取走当前待编辑的剪贴项 id(并清空,避免下次误用)。
/// 返回 None 表示无目标(理论上不会发生,窗口总是带目标打开)。
#[tauri::command]
pub fn take_clip_editor_target(state: tauri::State<ClipEditorTarget>) -> Result<Option<i64>, String> {
    let mut guard = state.0.lock().map_err(err)?;
    Ok(guard.take())
}

// ============ 贴边自动隐藏 ============

const EDGE_NONE: i32 = 0;
const EDGE_TOP: i32 = 1;
const EDGE_LEFT: i32 = 2;
const EDGE_RIGHT: i32 = 3;
/// 拖到距屏幕边缘多少物理像素内算「贴边」(旧版 14 DIP ≈ 21 物理 @150%)
const SNAP_PX: i32 = 21;
/// 收起后留在屏幕内的可见条宽度(物理像素)
const REVEAL_PX: i32 = 4;
/// 显示态下「鼠标在窗口外」判定缓冲(旧版 HideBufferPx=40 DIP)
const HIDE_BUFFER_PX: i32 = 60;
/// 探针节拍(对齐旧版 DispatcherTimer 90ms)
const TICK_MS: u64 = 90;
/// 鼠标连续离开 N 个 tick(90ms×5≈450ms)才再次收起(旧版 OutsideTickThreshold)
const OUTSIDE_TICKS: i32 = 5;
/// 滑入/滑出动画时长(对齐旧版 DoubleAnimation 220ms)
const SLIDE_MS: u64 = 220;

struct DockState {
    edge: AtomicI32,
    hidden: AtomicBool,
    /// 程序自己 set_position 引发的 Moved 事件要忽略(含滑动动画全程)
    moving: AtomicBool,
    /// 刚贴边(拖拽中/启动恢复),等左键松开后立即对齐收起(对齐旧版 DockTo→HideToEdge)
    pending: AtomicBool,
    /// 上次成功读到的显示器几何(x,y,w,h)。w=0 表示尚无缓存。
    /// current_monitor() 在窗口收起(大部分移出屏幕)时偶发返回 None,直接 continue 会让整拍
    /// 被跳过、reveal/hide 不响应 → 贴边隐藏「间歇失灵」。成功即缓存、失败用缓存,消除漏拍。
    mon_x: AtomicI32,
    mon_y: AtomicI32,
    mon_w: AtomicI32,
    mon_h: AtomicI32,
    /// 快捷键召唤后,这么多拍内不自动收起(给鼠标移过去的时间)。>0 时轮询不累计「鼠标在外」。
    summon_grace: AtomicI32,
    /// 有弹层(截止/提醒等上拉框)打开时置位:编辑期间不自动收起,避免点原生下拉/日历
    /// (OS 级弹出层在窗口矩形外)被误判「鼠标在外」而中途收起。全关后由鼠标移开正常收起。
    hold: AtomicBool,
}

/// 旧版 CubicEase EaseInOut(收起用)
fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 { 4.0 * t * t * t } else { 1.0 - (-2.0 * t + 2.0).powi(3) / 2.0 }
}

/// 旧版 CubicEase EaseOut(唤出用)
fn ease_out(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

/// 把窗口从 from 平滑滑到 to(阻塞探针线程 ≈220ms,等效旧版"动画期间探针不响应")
fn slide_window(
    win: &WebviewWindow,
    state: &DockState,
    from: PhysicalPosition<i32>,
    to: PhysicalPosition<i32>,
    ease: fn(f64) -> f64,
) {
    state.moving.store(true, Ordering::SeqCst);
    let start = std::time::Instant::now();
    loop {
        let t = start.elapsed().as_millis() as f64 / SLIDE_MS as f64;
        if t >= 1.0 {
            break;
        }
        let k = ease(t);
        let x = from.x + ((to.x - from.x) as f64 * k).round() as i32;
        let y = from.y + ((to.y - from.y) as f64 * k).round() as i32;
        let _ = win.set_position(PhysicalPosition::new(x, y));
        std::thread::sleep(std::time::Duration::from_millis(12));
    }
    let _ = win.set_position(to);
    state.moving.store(false, Ordering::SeqCst);
}

// 左键是否按下(判定拖拽是否结束;user32 直链,免新增依赖)
#[link(name = "user32")]
extern "system" {
    fn GetAsyncKeyState(v_key: i32) -> i16;
}
fn lbutton_down() -> bool {
    unsafe { (GetAsyncKeyState(0x01) as u16) & 0x8000 != 0 }
}

pub fn setup_dock(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let saved_edge: i32 =
        read_setting(app, "dock_edge").and_then(|v| v.parse().ok()).unwrap_or(EDGE_NONE);
    let state = Arc::new(DockState {
        edge: AtomicI32::new(saved_edge),
        hidden: AtomicBool::new(false),
        moving: AtomicBool::new(false),
        // 启动时若上次处于贴边状态:标记 pending,由轮询线程首拍对齐并收起
        // (setup 时 current_monitor 常不可用,不能在此直接定位)
        pending: AtomicBool::new(saved_edge != EDGE_NONE),
        mon_x: AtomicI32::new(0),
        mon_y: AtomicI32::new(0),
        mon_w: AtomicI32::new(0),
        mon_h: AtomicI32::new(0),
        summon_grace: AtomicI32::new(0),
        hold: AtomicBool::new(false),
    });
    // 注册为 Tauri 托管状态,供 show_main(托盘「显示并居中」)复用同一忽略标志居中
    app.manage(state.clone());
    // 启动恢复的首次收起不播动画(对齐旧版 HideToEdge(animate:false))
    let boot_restore = Arc::new(AtomicBool::new(saved_edge != EDGE_NONE));

    // 用户拖动窗口 → 检测是否贴近屏幕上/左/右边缘(对齐旧版 TryDockAfterDrag 阈值)
    {
        let app = app.clone();
        let win2 = win.clone();
        let state = state.clone();
        win.on_window_event(move |event| {
            let tauri::WindowEvent::Moved(pos) = event else { return };
            // 对齐 WPF:贴边检测只在「用户按住左键拖动窗口」时进行(WPF 是 DragMove 结束后才 TryDockAfterDrag)。
            // 程序自身的对齐/滑入滑出 set_position 都发生在左键松开状态,据此天然排除——否则收起动画
            // 尾随的自移动 Moved 会漏过 moving/hidden 守卫(置 false 与置 hidden 之间有缝)被误判为用户拖动、
            // 把 edge 改错;多隐藏几次累积 → 贴边卡死(显示并居中重置 edge/hidden 才恢复,正是用户所见)。
            if !lbutton_down() || state.moving.load(Ordering::SeqCst) || state.hidden.load(Ordering::SeqCst)
            {
                return;
            }
            let Ok(Some(mon)) = win2.current_monitor() else { return };
            let mp = mon.position();
            let ms = mon.size();
            let Ok(size) = win2.outer_size() else { return };
            let (w2, h2) = (size.width as i32, size.height as i32);

            // 多屏:若某条边的「外侧」紧挨着另一块显示器(屏间共享边界),禁止贴到这条边。
            // 否则收起会把窗口滑到邻屏上(那不是真正的屏幕外沿),收起/唤出几何全乱
            // (用户实测:双屏「左屏的右边 / 右屏的左边」贴边出问题)。只允许贴到桌面外沿。
            let monitors = win2.available_monitors().unwrap_or_default();
            let on_other_screen = |x: i32, y: i32| {
                monitors.iter().any(|m| {
                    let p = m.position();
                    let s = m.size();
                    x >= p.x && x < p.x + s.width as i32 && y >= p.y && y < p.y + s.height as i32
                })
            };
            let vy = pos.y + h2 / 2; // 窗口纵向中点:探测左右边外侧是否压着邻屏
            let hx = pos.x + w2 / 2; // 窗口横向中点:探测上边外侧是否压着邻屏

            let edge = if pos.y <= mp.y + SNAP_PX && !on_other_screen(hx, mp.y - 2) {
                EDGE_TOP
            } else if pos.x <= mp.x + SNAP_PX && !on_other_screen(mp.x - 2, vy) {
                EDGE_LEFT
            } else if pos.x + w2 >= mp.x + ms.width as i32 - SNAP_PX
                && !on_other_screen(mp.x + ms.width as i32 + 2, vy)
            {
                EDGE_RIGHT
            } else {
                EDGE_NONE
            };
            let prev = state.edge.swap(edge, Ordering::SeqCst);
            if prev != edge {
                write_setting(&app, "dock_edge", &edge.to_string());
                // 拖入贴边区:松开左键后立即对齐收起(旧版 DockTo→HideToEdge 语义);
                // 拖离贴边区:取消待收起
                state.pending.store(edge != EDGE_NONE, Ordering::SeqCst);
            }
        });
    }

    // 轮询线程:对齐旧版探针定时器(收起/唤出/再收起);滑动动画在本线程内
    // 阻塞执行,天然等效旧版"动画期间探针不响应"
    {
        let app = app.clone();
        let state = state.clone();
        std::thread::spawn(move || {
            // 显示态下鼠标连续在窗口外的 tick 数(再收起需达到 OUTSIDE_TICKS)
            let mut outside_ticks: i32 = 0;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(TICK_MS));
                let edge = state.edge.load(Ordering::SeqCst);
                if edge == EDGE_NONE {
                    outside_ticks = 0;
                    continue;
                }
                let Some(win) = main_window(&app) else { continue };
                let (Ok(cursor), Ok(pos), Ok(size)) =
                    (app.cursor_position(), win.outer_position(), win.outer_size())
                else {
                    continue;
                };
                // 显示器几何:current_monitor() 在窗口收起时偶发 None。成功即缓存,失败用缓存,
                // 绝不因此跳过整拍(否则 reveal/hide 漏拍 = 贴边隐藏间歇失灵)。
                let (mp, ms) = if let Ok(Some(mon)) = win.current_monitor() {
                    let p = *mon.position();
                    let s = *mon.size();
                    state.mon_x.store(p.x, Ordering::SeqCst);
                    state.mon_y.store(p.y, Ordering::SeqCst);
                    state.mon_w.store(s.width as i32, Ordering::SeqCst);
                    state.mon_h.store(s.height as i32, Ordering::SeqCst);
                    (p, s)
                } else {
                    let cw = state.mon_w.load(Ordering::SeqCst);
                    if cw <= 0 {
                        continue; // 还没成功读过任何显示器(刚启动、窗口尚未定位)
                    }
                    (
                        PhysicalPosition::new(
                            state.mon_x.load(Ordering::SeqCst),
                            state.mon_y.load(Ordering::SeqCst),
                        ),
                        PhysicalSize::new(cw as u32, state.mon_h.load(Ordering::SeqCst) as u32),
                    )
                };
                let (cx, cy) = (cursor.x as i32, cursor.y as i32);
                let (w, h) = (size.width as i32, size.height as i32);
                let hidden = state.hidden.load(Ordering::SeqCst);

                // 从 (x,y) 向贴附边滑出隐藏(旧版 HideToEdge:220ms CubicEase EaseInOut)
                let hide_to = |x: i32, y: i32, animate: bool| {
                    let target = match edge {
                        EDGE_TOP => PhysicalPosition::new(x, mp.y - h + REVEAL_PX),
                        EDGE_LEFT => PhysicalPosition::new(mp.x - w + REVEAL_PX, y),
                        _ => PhysicalPosition::new(mp.x + ms.width as i32 - REVEAL_PX, y),
                    };
                    if animate {
                        slide_window(&win, &state, PhysicalPosition::new(x, y), target, ease_in_out);
                    } else {
                        state.moving.store(true, Ordering::SeqCst);
                        let _ = win.set_position(target);
                        state.moving.store(false, Ordering::SeqCst);
                    }
                    state.hidden.store(true, Ordering::SeqCst);
                };

                if !hidden && state.pending.load(Ordering::SeqCst) {
                    // 刚贴边:等左键松开(拖拽结束)→ 先对齐到边的完整可见位置,再滑出收起
                    // (旧版 DockTo:不等鼠标离开窗口;启动恢复不播动画)
                    if lbutton_down() {
                        continue;
                    }
                    state.pending.store(false, Ordering::SeqCst);
                    let animate = !boot_restore.swap(false, Ordering::SeqCst);
                    let (ax, ay) = match edge {
                        EDGE_TOP => {
                            // 上限须 ≥ 下限:窗口比工作区还宽时(窄副屏/DPI 异常)直接钉到左边,
                            // 否则 clamp(min, max) 在 min>max 时会 panic(贴边线程崩、自动隐藏失灵)。
                            let hi = (mp.x + ms.width as i32 - w).max(mp.x);
                            (pos.x.clamp(mp.x, hi), mp.y)
                        }
                        EDGE_LEFT => (mp.x, pos.y.max(mp.y)),
                        // 右贴边:窗口比工作区宽时,起点钉在本屏左缘(.max),不落到左邻屏
                        _ => ((mp.x + ms.width as i32 - w).max(mp.x), pos.y.max(mp.y)),
                    };
                    // 先瞬时对齐到边的完整可见位置(旧版 DockTo 先归位再动画,避免斜向飞跃)
                    state.moving.store(true, Ordering::SeqCst);
                    let _ = win.set_position(PhysicalPosition::new(ax, ay));
                    state.moving.store(false, Ordering::SeqCst);
                    hide_to(ax, ay, animate);
                    outside_ticks = 0;
                } else if !hidden {
                    // 显示态(唤出后):鼠标带缓冲连续离开窗口若干拍才再次收起(旧版探针)
                    // 召唤宽限内(快捷键刚唤出)不收起,给鼠标移过去的时间。
                    let grace = state.summon_grace.load(Ordering::SeqCst);
                    if grace > 0 {
                        state.summon_grace.store(grace - 1, Ordering::SeqCst);
                    }
                    let over = cx >= pos.x - HIDE_BUFFER_PX
                        && cx <= pos.x + w + HIDE_BUFFER_PX
                        && cy >= pos.y - HIDE_BUFFER_PX
                        && cy <= pos.y + h + HIDE_BUFFER_PX;
                    // hold:有弹层打开,编辑中不收起(点原生下拉/日历鼠标会移出窗口矩形)
                    if over || lbutton_down() || grace > 0 || state.hold.load(Ordering::SeqCst) {
                        outside_ticks = 0;
                    } else {
                        outside_ticks += 1;
                        if outside_ticks >= OUTSIDE_TICKS {
                            hide_to(pos.x, pos.y, true);
                            outside_ticks = 0;
                        }
                    }
                } else {
                    // 收起态:鼠标进入「贴附边的可见条」且在窗口投影范围内 → 滑出唤醒
                    // (旧版 ShowFromEdge:220ms CubicEase EaseOut)。触发带 = 可见条宽 REVEAL_PX,
                    // 比原来的硬边缘 2~3px 更宽容:鼠标停在露出的细条上即唤出,不必精确顶到屏幕边
                    // (双屏共享边等"软边界"处鼠标会越界到邻屏、顶不住边,原阈值会偶发唤不出)。
                    let at_edge = match edge {
                        EDGE_TOP => cy <= mp.y + REVEAL_PX && cx >= pos.x && cx <= pos.x + w,
                        EDGE_LEFT => cx <= mp.x + REVEAL_PX && cy >= pos.y && cy <= pos.y + h,
                        _ => {
                            cx >= mp.x + ms.width as i32 - REVEAL_PX
                                && cy >= pos.y
                                && cy <= pos.y + h
                        }
                    };
                    if at_edge {
                        let target = match edge {
                            EDGE_TOP => PhysicalPosition::new(pos.x, mp.y),
                            EDGE_LEFT => PhysicalPosition::new(mp.x, pos.y),
                            // 右贴边唤出目标同样钉在本屏左缘(窗口宽过工作区时)
                            _ => PhysicalPosition::new((mp.x + ms.width as i32 - w).max(mp.x), pos.y),
                        };
                        slide_window(&win, &state, PhysicalPosition::new(pos.x, pos.y), target, ease_out);
                        state.hidden.store(false, Ordering::SeqCst);
                        let _ = win.set_focus();
                        outside_ticks = 0;
                        // 刚唤出给一点停留时间,避免立刻又收起
                        std::thread::sleep(std::time::Duration::from_millis(400));
                    }
                }
            }
        });
    }
}
