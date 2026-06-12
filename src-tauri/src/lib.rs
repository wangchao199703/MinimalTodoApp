mod commands;
mod database;
mod models;

pub fn run() {
    let conn = database::init().expect("数据库初始化失败");

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
            commands::get_settings,
            commands::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
