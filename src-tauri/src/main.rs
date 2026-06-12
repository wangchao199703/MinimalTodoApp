// 阻止 Windows 发布版弹出控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    minimal_todo_lib::run()
}
