mod commands;
mod database;
mod import;
mod models;
mod updater;
mod window;

pub fn run() {
    // 更新换壳后回收旧 exe(无 --updated-from 参数时为空操作)
    updater::cleanup_after_update();

    let conn = database::init().expect("数据库初始化失败");

    // 首启迁移:旧版 data.json → SQLite(失败不阻塞启动,从空库开始)
    match import::maybe_import(&conn) {
        Ok(true) => eprintln!("已从旧版 data.json 导入数据"),
        Ok(false) => {}
        Err(e) => eprintln!("data.json 导入失败,跳过:{e}"),
    }

    // 收集箱实体化:无分组的便签归入「收集箱」实体分组(幂等自愈,覆盖老库与导入数据)
    if let Err(e) = database::ensure_notes_grouped(&conn, true) {
        eprintln!("便签分组自愈失败:{e}");
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
            commands::get_notes,
            commands::create_note,
            commands::update_note,
            commands::delete_note,
            commands::reorder_notes,
            commands::get_note_groups,
            commands::create_note_group,
            commands::update_note_group,
            commands::delete_note_group,
            commands::get_custom_themes,
            commands::save_custom_theme,
            commands::delete_custom_theme,
            commands::get_settings,
            commands::set_setting,
            commands::note_image_dir,
            commands::save_note_image,
            commands::export_file,
            window::set_acrylic,
            window::set_autostart,
            window::get_autostart,
            window::rebuild_tray,
            updater::apply_update,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
