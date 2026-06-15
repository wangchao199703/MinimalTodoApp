import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import App from "./App";
import SettingsWindow from "./components/SettingsWindow";
import ClipEditorWindow from "./components/ClipEditorWindow";
import { setupSettingsSync, useAppStore } from "./store/useAppStore";
import "./index.css";

// 跨窗口设置同步监听(模块层注册一次,各窗口都需要)
setupSettingsSync();

// 按窗口 label 路由(不用 URL query,会白屏):settings → 设置窗口;clip-editor → 剪贴项编辑窗口;否则主应用
const label = getCurrentWindow().label;

// 全局快捷键召唤:Rust 已置前窗口,这里只负责切换主视图(仅主窗口监听)
if (label !== "settings" && label !== "clip-editor") {
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
  ) : (
    <App />
  );

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{root}</React.StrictMode>,
);
