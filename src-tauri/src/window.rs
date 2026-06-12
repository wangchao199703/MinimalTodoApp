//! 窗口外壳:系统托盘、贴边自动隐藏(QQ 式)、亚克力、开机自启。

use crate::database::Db;
use rusqlite::params;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
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

// ============ 系统托盘 ============

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    // 托盘菜单按启动时语言构建(对齐旧版:切语言后重启生效)
    let en = read_setting(app, "language").as_deref() == Some("en");
    let show_label = if en { "Show window" } else { "显示主界面" };
    let quit_label = if en { "Exit" } else { "退出" };

    let show = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().expect("缺少应用图标").clone())
        .tooltip(if en { "Todo" } else { "待办" })
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                show_main(tray.app_handle());
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
/// 鼠标连续离开 N 个 tick(约 450ms)才再次收起(旧版 OutsideTickThreshold)
const OUTSIDE_TICKS: i32 = 3;

struct DockState {
    edge: AtomicI32,
    hidden: AtomicBool,
    /// 程序自己 set_position 引发的 Moved 事件要忽略
    moving: AtomicBool,
    /// 刚贴边(拖拽中/启动恢复),等左键松开后立即对齐收起(对齐旧版 DockTo→HideToEdge)
    pending: AtomicBool,
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
    });

    // 用户拖动窗口 → 检测是否贴近屏幕上/左/右边缘(对齐旧版 TryDockAfterDrag 阈值)
    {
        let app = app.clone();
        let win2 = win.clone();
        let state = state.clone();
        win.on_window_event(move |event| {
            let tauri::WindowEvent::Moved(pos) = event else { return };
            if state.moving.load(Ordering::SeqCst) || state.hidden.load(Ordering::SeqCst) {
                return;
            }
            let Ok(Some(mon)) = win2.current_monitor() else { return };
            let mp = mon.position();
            let ms = mon.size();
            let Ok(size) = win2.outer_size() else { return };

            let edge = if pos.y <= mp.y + SNAP_PX {
                EDGE_TOP
            } else if pos.x <= mp.x + SNAP_PX {
                EDGE_LEFT
            } else if pos.x + size.width as i32 >= mp.x + ms.width as i32 - SNAP_PX {
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

    // 轮询线程:对齐旧版探针定时器(收起/唤出/再收起)
    {
        let app = app.clone();
        let state = state.clone();
        std::thread::spawn(move || {
            // 显示态下鼠标连续在窗口外的 tick 数(再收起需达到 OUTSIDE_TICKS)
            let mut outside_ticks: i32 = 0;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(150));
                let edge = state.edge.load(Ordering::SeqCst);
                if edge == EDGE_NONE {
                    outside_ticks = 0;
                    continue;
                }
                let Some(win) = main_window(&app) else { continue };
                let (Ok(cursor), Ok(pos), Ok(size), Ok(Some(mon))) = (
                    app.cursor_position(),
                    win.outer_position(),
                    win.outer_size(),
                    win.current_monitor(),
                ) else {
                    continue;
                };
                let (cx, cy) = (cursor.x as i32, cursor.y as i32);
                let (w, h) = (size.width as i32, size.height as i32);
                let mp = mon.position();
                let ms = mon.size();
                let hidden = state.hidden.load(Ordering::SeqCst);

                let hide_to = |x: i32, y: i32| {
                    let target = match edge {
                        EDGE_TOP => PhysicalPosition::new(x, mp.y - h + REVEAL_PX),
                        EDGE_LEFT => PhysicalPosition::new(mp.x - w + REVEAL_PX, y),
                        _ => PhysicalPosition::new(mp.x + ms.width as i32 - REVEAL_PX, y),
                    };
                    state.moving.store(true, Ordering::SeqCst);
                    let _ = win.set_position(target);
                    state.moving.store(false, Ordering::SeqCst);
                    state.hidden.store(true, Ordering::SeqCst);
                };

                if !hidden && state.pending.load(Ordering::SeqCst) {
                    // 刚贴边:等左键松开(拖拽结束)→ 先对齐到边的完整可见位置,再立即收起
                    // (旧版 DockTo:不等鼠标离开窗口)
                    if lbutton_down() {
                        continue;
                    }
                    state.pending.store(false, Ordering::SeqCst);
                    let (ax, ay) = match edge {
                        EDGE_TOP => (
                            pos.x.clamp(mp.x, mp.x + ms.width as i32 - w),
                            mp.y,
                        ),
                        EDGE_LEFT => (mp.x, pos.y.max(mp.y)),
                        _ => (mp.x + ms.width as i32 - w, pos.y.max(mp.y)),
                    };
                    hide_to(ax, ay);
                    outside_ticks = 0;
                } else if !hidden {
                    // 显示态(唤出后):鼠标带缓冲连续离开窗口若干拍才再次收起(旧版探针)
                    let over = cx >= pos.x - HIDE_BUFFER_PX
                        && cx <= pos.x + w + HIDE_BUFFER_PX
                        && cy >= pos.y - HIDE_BUFFER_PX
                        && cy <= pos.y + h + HIDE_BUFFER_PX;
                    if over || lbutton_down() {
                        outside_ticks = 0;
                    } else {
                        outside_ticks += 1;
                        if outside_ticks >= OUTSIDE_TICKS {
                            hide_to(pos.x, pos.y);
                            outside_ticks = 0;
                        }
                    }
                } else {
                    // 收起态:鼠标顶到屏幕边缘且在窗口投影范围内 → 滑出唤醒
                    let at_edge = match edge {
                        EDGE_TOP => cy <= mp.y + 2 && cx >= pos.x && cx <= pos.x + w,
                        EDGE_LEFT => cx <= mp.x + 2 && cy >= pos.y && cy <= pos.y + h,
                        _ => cx >= mp.x + ms.width as i32 - 3 && cy >= pos.y && cy <= pos.y + h,
                    };
                    if at_edge {
                        let target = match edge {
                            EDGE_TOP => PhysicalPosition::new(pos.x, mp.y),
                            EDGE_LEFT => PhysicalPosition::new(mp.x, pos.y),
                            _ => PhysicalPosition::new(mp.x + ms.width as i32 - w, pos.y),
                        };
                        state.moving.store(true, Ordering::SeqCst);
                        let _ = win.set_position(target);
                        state.moving.store(false, Ordering::SeqCst);
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
