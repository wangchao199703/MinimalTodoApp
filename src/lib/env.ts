/**
 * 运行环境判定:同一套前端代码同时跑在 Tauri 桌面壳与纯浏览器(Web/PWA)里。
 * `__TAURI_INTERNALS__` 由 Tauri 在窗口加载时注入,浏览器里不存在——同步可读、不引依赖、
 * tree-shake 友好(刻意不用 @tauri-apps/api 的 isTauri(),那会把整个包拉进 Web 产物)。
 */
export const isTauri = "__TAURI_INTERNALS__" in window;
