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
/// 拖到距屏幕边缘多少物理像素内算「贴边」
const SNAP_PX: i32 = 21;
/// 收起后留在屏幕内的可见条宽度(物理像素)
const REVEAL_PX: i32 = 4;

struct DockState {
    edge: AtomicI32,
    hidden: AtomicBool,
    /// 程序自己 set_position 引发的 Moved 事件要忽略
    moving: AtomicBool,
}

pub fn setup_dock(app: &AppHandle) {
    let Some(win) = main_window(app) else { return };
    let state = Arc::new(DockState {
        edge: AtomicI32::new(
            read_setting(app, "dock_edge").and_then(|v| v.parse().ok()).unwrap_or(EDGE_NONE),
        ),
        hidden: AtomicBool::new(false),
        moving: AtomicBool::new(false),
    });

    // 用户拖动窗口 → 检测是否贴近屏幕上/左/右边缘
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
            }
        });
    }

    // 轮询线程:负责收起与唤出
    {
        let app = app.clone();
        let state = state.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let edge = state.edge.load(Ordering::SeqCst);
            if edge == EDGE_NONE {
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

            // 余量:避免贴着边缘抖动。QQ 式:鼠标离开窗口即收起(不看键盘焦点)
            let over = cx >= pos.x - 8 && cx <= pos.x + w + 8 && cy >= pos.y - 8 && cy <= pos.y + h + 8;

            if !hidden && !over {
                // 收起:沿贴靠边只留一条可见
                let target = match edge {
                    EDGE_TOP => PhysicalPosition::new(pos.x, mp.y - h + REVEAL_PX),
                    EDGE_LEFT => PhysicalPosition::new(mp.x - w + REVEAL_PX, pos.y),
                    _ => PhysicalPosition::new(mp.x + ms.width as i32 - REVEAL_PX, pos.y),
                };
                state.moving.store(true, Ordering::SeqCst);
                let _ = win.set_position(target);
                state.moving.store(false, Ordering::SeqCst);
                state.hidden.store(true, Ordering::SeqCst);
            } else if hidden {
                // 唤出:鼠标顶到屏幕边缘且在窗口投影范围内
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
                    // 刚唤出给一点停留时间,避免立刻又收起
                    std::thread::sleep(std::time::Duration::from_millis(400));
                }
            }
        });
    }

    // 启动时若上次处于贴边状态,直接以收起姿态就位
    if state.edge.load(Ordering::SeqCst) != EDGE_NONE {
        let edge = state.edge.load(Ordering::SeqCst);
        if let (Ok(pos), Ok(size), Ok(Some(mon))) =
            (win.outer_position(), win.outer_size(), win.current_monitor())
        {
            let mp = mon.position();
            let ms = mon.size();
            let (w, h) = (size.width as i32, size.height as i32);
            let target = match edge {
                EDGE_TOP => PhysicalPosition::new(pos.x, mp.y - h + REVEAL_PX),
                EDGE_LEFT => PhysicalPosition::new(mp.x - w + REVEAL_PX, pos.y),
                _ => PhysicalPosition::new(mp.x + ms.width as i32 - REVEAL_PX, pos.y),
            };
            state.moving.store(true, Ordering::SeqCst);
            let _ = win.set_position(target);
            state.moving.store(false, Ordering::SeqCst);
            state.hidden.store(true, Ordering::SeqCst);
        }
    }
}
