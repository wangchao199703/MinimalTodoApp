mod clipboard;
mod commands;
mod database;
mod import;
mod models;
mod storage;
mod updater;
mod window;

pub fn run() {
    // 更新重启:新版先接管旧实例(等/强杀 --old-pid 指定的旧进程)。
    // 必须在注册单实例插件之前,否则旧实例还在会让本新版被单实例直接退出。
    updater::takeover_old_instance();
    // 更新换壳后回收旧 exe(无 --updated-from 参数时为空操作)
    updater::cleanup_after_update();

    // 数据迁移完成后:清理上一处旧数据根(此时指针已指向新位置、旧库无人占用)。
    // 必须在 database::init 打开新位置的库之前执行。
    storage::cleanup_pending_old_root();

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
        // 系统通知:周期提醒在 app 最小化/隐藏时也能弹右下角 OS 通知
        .plugin(tauri_plugin_notification::init())
        // 目录选择对话框:数据存储位置「选择新位置」用
        .plugin(tauri_plugin_dialog::init())
        .manage(database::Db(std::sync::Mutex::new(conn)))
        // 剪贴项编辑窗口的「待编辑目标」:open 时存 clip_id,编辑窗口挂载后 take 走(见 window.rs)
        .manage(window::ClipEditorTarget(std::sync::Mutex::new(None)))
        .setup(|app| {
            window::setup_tray(app.handle())?;
            window::setup_dock(app.handle());
            // 后台剪贴板监听(默认开启):独立线程跑阻塞式 watcher,变化即入库 + emit
            clipboard::start_watching(app.handle().clone());
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
            commands::reset_settings,
            commands::note_image_dir,
            commands::save_note_image,
            commands::group_icon_dir,
            commands::save_group_icon,
            commands::list_group_icons,
            commands::export_file,
            commands::get_data_dir,
            commands::migrate_data_dir,
            commands::restart_app,
            commands::get_clips,
            commands::delete_clip,
            commands::pin_clip,
            commands::get_clip_tags,
            commands::create_clip_tag,
            commands::rename_clip_tag,
            commands::set_clip_tag_color,
            commands::delete_clip_tag,
            commands::add_clip_tag,
            commands::remove_clip_tag,
            commands::set_clip_item_tag,
            commands::update_clip_text,
            commands::copy_clip,
            window::open_clip_editor_window,
            window::take_clip_editor_target,
            window::set_acrylic,
            window::set_autostart,
            window::get_autostart,
            window::open_settings_window,
            window::rebuild_tray,
            updater::apply_update,
            updater::download_update,
            updater::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("应用启动失败");
}
