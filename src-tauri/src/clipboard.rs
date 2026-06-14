//! 后台剪贴板监听(默认开启)。
//!
//! 移植自 ShellPicker 的 clipboard.rs:独立线程跑阻塞式 watcher,系统剪贴板一变化
//! 就读内容入库——文本直接存,图片存 PNG 文件 + 库里存绝对路径 + 内嵌缩略图。
//! 「与上一条相同则跳过」做连续复制去重;入库后 emit `clip-added` 让前端实时插入。

use crate::database::{self, Db};
use crate::models::NewClip;
use base64::Engine;
use clipboard_rs::common::RustImage;
use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext,
    ContentFormat,
};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

/// 启动剪贴板监听:在独立线程里运行阻塞式 watcher(主线程不受影响)。
pub fn start_watching(app: AppHandle) {
    std::thread::spawn(move || {
        let ctx = match ClipboardContext::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[clipboard] 创建剪贴板上下文失败:{e}");
                return;
            }
        };
        let mut watcher = match ClipboardWatcherContext::new() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[clipboard] 创建监听器失败:{e}");
                return;
            }
        };
        watcher.add_handler(ClipWatcher { app, ctx });
        watcher.start_watch();
    });
}

struct ClipWatcher {
    app: AppHandle,
    ctx: ClipboardContext,
}

impl ClipboardHandler for ClipWatcher {
    fn on_clipboard_change(&mut self) {
        if let Err(e) = self.handle() {
            eprintln!("[clipboard] 处理剪贴板变化出错:{e}");
        }
    }
}

impl ClipWatcher {
    fn handle(&self) -> anyhow::Result<()> {
        if self.ctx.has(ContentFormat::Image) {
            self.handle_image()
        } else if let Ok(text) = self.ctx.get_text() {
            if text.trim().is_empty() {
                return Ok(());
            }
            let hash = sha256(text.as_bytes());
            if self.is_duplicate(&hash) {
                return Ok(());
            }
            self.insert_and_emit(NewClip {
                kind: "text".into(),
                text: Some(text),
                image_path: None,
                thumbnail_b64: None,
                hash,
            })
        } else {
            Ok(())
        }
    }

    fn handle_image(&self) -> anyhow::Result<()> {
        let img = self.ctx.get_image().map_err(|e| anyhow::anyhow!("{e}"))?;
        let png = img.to_png().map_err(|e| anyhow::anyhow!("{e}"))?;
        let bytes = png.get_bytes();
        let hash = sha256(bytes);
        if self.is_duplicate(&hash) {
            return Ok(());
        }

        // 图片存到 clipboard-images/(从数据根目录推导),文件名用内容 hash 天然去重
        let dir = database::clipboard_images_dir();
        std::fs::create_dir_all(&dir)?;
        let path = dir.join(format!("{hash}.png"));
        std::fs::write(&path, bytes)?;

        // 内嵌缩略图:前端列表始终能渲染,不依赖 asset 协议作用域
        let thumbnail_b64 = img
            .thumbnail(160, 160)
            .ok()
            .and_then(|t| t.to_png().ok())
            .map(|b| {
                format!(
                    "data:image/png;base64,{}",
                    base64::engine::general_purpose::STANDARD.encode(b.get_bytes())
                )
            });

        self.insert_and_emit(NewClip {
            kind: "image".into(),
            text: None,
            image_path: Some(path.to_string_lossy().to_string()),
            thumbnail_b64,
            hash,
        })
    }

    /// 与最近一条记录 hash 相同则视为重复(连续复制同一内容只记一次)
    fn is_duplicate(&self, hash: &str) -> bool {
        let db = self.app.state::<Db>();
        let conn = db.0.lock().unwrap();
        database::clip_latest_hash(&conn).as_deref() == Some(hash)
    }

    fn insert_and_emit(&self, new: NewClip) -> anyhow::Result<()> {
        let item = {
            let db = self.app.state::<Db>();
            let conn = db.0.lock().unwrap();
            let id = database::clip_insert(&conn, &new).map_err(|e| anyhow::anyhow!("{e}"))?;
            crate::commands::get_clip_impl(&conn, id).map_err(|e| anyhow::anyhow!("{e}"))?
        };
        if let Some(item) = item {
            let _ = self.app.emit("clip-added", item);
        }
        Ok(())
    }
}

fn sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize().iter().map(|b| format!("{b:02x}")).collect()
}
