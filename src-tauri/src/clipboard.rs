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
use std::sync::atomic::{AtomicI64, Ordering};
use tauri::{AppHandle, Emitter, Manager};

/// 自动粘贴时本应用主动写了系统剪贴板:在此截止时刻前的下一次变化不再入库,
/// 否则会把刚粘贴的内容当成新复制重复记录 / 打乱顺序。带超时自动失效,避免卡住后续真实复制。
static SKIP_RECORD_UNTIL_MS: AtomicI64 = AtomicI64::new(0);

/// 标记「忽略接下来一次剪贴板变化」(供自动粘贴前调用)。
pub fn skip_next_record() {
    SKIP_RECORD_UNTIL_MS.store(database::now_ms() + 1500, Ordering::SeqCst);
}

/// 图片捕获开关:已修复延迟渲染竞态(见 image_ready),默认开启,文本/图片都监听。
const IMAGE_CAPTURE_ENABLED: bool = true;

/// 可作为图片解析的文件扩展名(clipboard-rs 内置 image 在 Windows 支持 png/jpeg/bmp,
/// 其余尝试解码失败时回退为「路径文本」)。从资源管理器复制图片文件走 CF_HDROP,这里据此识别。
const IMAGE_FILE_EXTS: &[&str] = &["png", "jpg", "jpeg", "bmp", "gif", "webp", "tif", "tiff", "ico"];

fn is_image_path(path: &str) -> bool {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    matches!(ext, Some(e) if IMAGE_FILE_EXTS.contains(&e.as_str()))
}

/// 启动时按「过期时间」设置清理一次未置顶旧剪贴项(运行中由 commit 实时清理)。
pub fn purge_expired_on_startup(app: &AppHandle) {
    let orphans = {
        let db = app.state::<Db>();
        let conn = match db.0.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        match database::read_setting(&conn, "clip_expiry").and_then(|v| database::clip_expiry_ms(&v)) {
            Some(age) => {
                let cutoff = database::now_ms().saturating_sub(age);
                database::clip_purge_expired(&conn, cutoff).map(|(_, o)| o).unwrap_or_default()
            }
            None => Vec::new(),
        }
    };
    for p in orphans {
        let _ = std::fs::remove_file(p);
    }
}

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
        // 自动粘贴刚写过剪贴板:本次变化是自己造成的,跳过入库(超时窗口内只跳一次)
        if database::now_ms() < SKIP_RECORD_UNTIL_MS.swap(0, Ordering::SeqCst) {
            return Ok(());
        }
        // 先按「有文本即文本」:① 富文本复制(网页/Office 常同时带图)优先存文本,
        // 不把用户复制的文字误存成图;② 纯文本场景立即返回,不进图片轮询(否则每次复制都白等 ~200ms)。
        if let Ok(text) = self.ctx.get_text() {
            if !text.trim().is_empty() {
                let hash = sha256(text.as_bytes());
                // 去重关时沿用「与最近一条相同则跳过」;开时交给 commit 做「移到最前 + 删历史重复」
                if !self.dedup_enabled() && self.is_latest(&hash) {
                    return Ok(());
                }
                return self.commit(NewClip {
                    kind: "text".into(),
                    text: Some(text),
                    image_path: None,
                    thumbnail_b64: None,
                    hash,
                });
            }
        }
        // 从资源管理器复制文件(CF_HDROP,无文本/无位图,clipboard-rs 的 has(Image) 也为 false):
        // 对齐 Ditto 的 CF_HDropAggregator —— 读出文件路径,图片文件存成图片项(显示缩略图),
        // 其余文件把路径存成文本项。必须在图片轮询之前判定,否则白等 ~250ms。
        if let Ok(files) = self.ctx.get_files() {
            let files: Vec<String> = files.into_iter().filter(|f| !f.trim().is_empty()).collect();
            if !files.is_empty() {
                return self.handle_files(files);
            }
        }
        // 无文本/无文件 → 可能是纯位图。Windows 剪贴板「延迟渲染」:变化事件(WM_CLIPBOARDUPDATE)常在
        // 图片格式(CF_DIB/CF_PNG,尤其从 CF_BITMAP 合成的 DIB)真正落盘前就触发,故短时轮询
        // 探测图片是否到位(最多约 250ms),到位再入库,否则放弃。
        if IMAGE_CAPTURE_ENABLED && self.image_ready() {
            self.handle_image()
        } else {
            Ok(())
        }
    }

    /// 处理「复制的文件」(CF_HDROP):图片文件→图片项(读文件解码存 PNG + 缩略图);
    /// 非图片文件→把路径汇成一条文本项。对齐 Ditto:把剪贴板里实际有的内容如实记下。
    fn handle_files(&self, files: Vec<String>) -> anyhow::Result<()> {
        let mut others = Vec::new();
        for path in files {
            if is_image_path(&path) {
                match clipboard_rs::RustImageData::from_path(&path) {
                    Ok(img) => self.store_image(img)?,
                    Err(_) => others.push(path), // 解码失败(如 webp 无解码器)→ 退回路径文本
                }
            } else {
                others.push(path);
            }
        }
        if !others.is_empty() {
            let text = others.join("\n");
            let hash = sha256(text.as_bytes());
            if self.dedup_enabled() || !self.is_latest(&hash) {
                self.commit(NewClip {
                    kind: "text".into(),
                    text: Some(text),
                    image_path: None,
                    thumbnail_b64: None,
                    hash,
                })?;
            }
        }
        Ok(())
    }

    /// 短时轮询「剪贴板里是否已有可读图片」,化解延迟渲染竞态。
    /// 既看格式标志(has),也实际尝试取一次图——有的源 has 已为真但 DIB 仍在合成、
    /// get_image 会瞬时失败,故以「能成功取到图」为最终判据。最多约 250ms,失败即放弃(回退文本)。
    fn image_ready(&self) -> bool {
        for i in 0..5 {
            if self.ctx.has(ContentFormat::Image) && self.ctx.get_image().is_ok() {
                return true;
            }
            // 首轮不睡,后续每轮退避 50ms,给系统合成图片格式留时间
            if i + 1 < 5 {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
        false
    }

    fn handle_image(&self) -> anyhow::Result<()> {
        let img = self.ctx.get_image().map_err(|e| anyhow::anyhow!("{e}"))?;
        self.store_image(img)
    }

    /// 把一张图(位图复制或图片文件解码所得)存成图片项:转 PNG 落盘 + 内嵌缩略图 + 入库 emit。
    /// 位图监听与「复制图片文件」(CF_HDROP)共用此路径。
    fn store_image(&self, img: clipboard_rs::RustImageData) -> anyhow::Result<()> {
        let png = img.to_png().map_err(|e| anyhow::anyhow!("{e}"))?;
        let bytes = png.get_bytes();
        let hash = sha256(bytes);
        if !self.dedup_enabled() && self.is_latest(&hash) {
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

        self.commit(NewClip {
            kind: "image".into(),
            text: None,
            image_path: Some(path.to_string_lossy().to_string()),
            thumbnail_b64,
            hash,
        })
    }

    /// 与最近一条记录 hash 相同(连续复制同一内容,去重关时只记一次)
    fn is_latest(&self, hash: &str) -> bool {
        let db = self.app.state::<Db>();
        let conn = db.0.lock().unwrap();
        database::clip_latest_hash(&conn).as_deref() == Some(hash)
    }

    /// 「重复内容移到最前」开关:默认开(空/缺省视为开),用户可在设置关闭
    fn dedup_enabled(&self) -> bool {
        let db = self.app.state::<Db>();
        let conn = db.0.lock().unwrap();
        database::read_setting(&conn, "clip_dedup").as_deref() != Some("0")
    }

    /// 入库 + 收尾:去重(移到最前,保留原分组标签;已置顶同内容则跳过新增)→ 按设置清理过期 → emit。
    fn commit(&self, new: NewClip) -> anyhow::Result<()> {
        let dedup = self.dedup_enabled();
        let (removed, purged, orphans, item) = {
            let db = self.app.state::<Db>();
            let conn = db.0.lock().unwrap();

            // 去重探查:已有置顶同内容 → 直接跳过(置顶项已在最前,不再新增)
            let mut removed = Vec::new();
            let mut carry_tags = Vec::new();
            if dedup {
                let info =
                    database::clip_dup_info(&conn, &new.hash).map_err(|e| anyhow::anyhow!("{e}"))?;
                if info.has_pinned {
                    return Ok(());
                }
                database::clip_delete_rows(&conn, &info.unpinned_ids)
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
                removed = info.unpinned_ids;
                carry_tags = info.tag_ids;
            }

            let id = database::clip_insert(&conn, &new).map_err(|e| anyhow::anyhow!("{e}"))?;
            // 移到最前后保留原分组归属
            if !carry_tags.is_empty() {
                database::clip_attach_tags(&conn, id, &carry_tags)
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
            }

            // 按「过期时间」设置清理未置顶旧项(实时,不必等下次启动)
            let (purged, orphans) = match database::read_setting(&conn, "clip_expiry")
                .and_then(|v| database::clip_expiry_ms(&v))
            {
                Some(age) => {
                    let cutoff = database::now_ms().saturating_sub(age);
                    database::clip_purge_expired(&conn, cutoff).unwrap_or_default()
                }
                None => (0, Vec::new()),
            };
            let item = crate::commands::get_clip_impl(&conn, id).map_err(|e| anyhow::anyhow!("{e}"))?;
            (removed, purged, orphans, item)
        };
        // 删去重项后,通知前端把对应行移除
        for id in removed {
            let _ = self.app.emit("clip-removed", id);
        }
        for p in orphans {
            let _ = std::fs::remove_file(p);
        }
        // 仅当真的清理了过期项才让前端重拉(避免每次复制都无谓刷新整表)
        if purged > 0 {
            let _ = self.app.emit("clips-purged", ());
        }
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
