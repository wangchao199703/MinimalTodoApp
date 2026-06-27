import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import App from "./App";
import SettingsWindow from "./components/SettingsWindow";
import ClipEditorWindow from "./components/ClipEditorWindow";
import CaptureOverlayWindow from "./components/capture/CaptureOverlayWindow";
import PinWindow from "./components/PinWindow";
import { setupSettingsSync, useAppStore } from "./store/useAppStore";
import { isTauri } from "./lib/env";
import { ensurePersistentStorage } from "./lib/persist";
import { initInstallCapture } from "./lib/pwaInstall";
import "./index.css";

const rootEl = document.getElementById("root")!;
const render = (node: React.ReactNode) =>
  ReactDOM.createRoot(rootEl).render(<React.StrictMode>{node}</React.StrictMode>);

if (!isTauri) {
  // ===== Web / PWA 入口:无 Tauri 多窗口,直接渲染主应用 =====
  void ensurePersistentStorage(); // 申请持久化存储(不阻塞首屏)
  initInstallCapture(); // 尽早注册 beforeinstallprompt 捕获(供安装引导用)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
  render(<App />);
} else {
  // ===== Tauri 桌面入口:按窗口 label 路由(原逻辑) =====
  // 跨窗口设置同步监听(模块层注册一次,各窗口都需要)
  setupSettingsSync();

  // settings → 设置窗口;clip-editor → 剪贴项编辑窗口;capture-overlay → 截图遮罩;pin-* → 桌面贴图;否则主应用
  const label = getCurrentWindow().label;
  const isCaptureWindow = label === "capture-overlay" || label.startsWith("pin-");

  // 全局快捷键召唤:Rust 已置前窗口,这里只负责切换主视图(仅主窗口监听)
  if (label !== "settings" && label !== "clip-editor" && !isCaptureWindow) {
    const sv = (k: string) => {
      const setView = useAppStore.getState().setView;
      const map: Record<string, () => void> = {
        notes: () => setView({ kind: "notes" }),
        clipboard: () => setView({ kind: "clipboard" }),
        tagboard: () => setView({ kind: "tagboard" }),
        quadrant: () => setView({ kind: "quadrant" }),
        all: () => setView({ kind: "all" }),
      };
      map[k]?.();
    };
    void listen<string>("summon-view", (e) => sv(e.payload));
  }

  const root =
    label === "settings" ? (
      <SettingsWindow />
    ) : label === "clip-editor" ? (
      <ClipEditorWindow />
    ) : label === "capture-overlay" ? (
      <CaptureOverlayWindow />
    ) : label.startsWith("pin-") ? (
      <PinWindow />
    ) : (
      <App />
    );

  render(root);
}
