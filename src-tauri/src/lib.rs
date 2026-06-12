mod commands;
mod database;
mod import;
mod models;

pub fn run() {
    let conn = database::init().expect("数据库初始化失败");

    // 首启迁移:旧版 data.json → SQLite(失败不阻塞启动,从空库开始)
    match import::maybe_import(&conn) {
        Ok(true) => eprintln!("已从旧版 data.json 导入数据"),
        Ok(false) => {}
        Err(e) => eprintln!("data.json 导入失败,跳过:{e}"),
    }

    tauri::Builder::default()
        .manage(database::Db(std::sync::Mutex::new(conn)))
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
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
