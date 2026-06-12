mod commands;
mod database;
mod import;
mod models;
mod window;

pub fn run() {
    let conn = database::init().expect("数据库初始化失败");

    // 首启迁移:旧版 data.json → SQLite(失败不阻塞启动,从空库开始)
    match import::maybe_import(&conn) {
        Ok(true) => eprintln!("已从旧版 data.json 导入数据"),
        Ok(false) => {}
        Err(e) => eprintln!("data.json 导入失败,跳过:{e}"),
    }

    tauri::Builder::default()
        // 单实例必须最先注册:第二个实例启动时唤起已运行的主窗口
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(database::Db(std::sync::Mutex::new(conn)))
        .setup(|app| {
            window::setup_tray(app.handle())?;
            window::setup_dock(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_groups,
            commands::create_group,
            commands::update_group,
            commands::delete_group,
            commands::reorder_groups,
            commands::get_tasks,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::reorder_tasks,
            commands::get_custom_themes,
            commands::save_custom_theme,
            commands::delete_custom_theme,
            commands::get_settings,
            commands::set_setting,
            window::set_acrylic,
            window::set_autostart,
            window::get_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
