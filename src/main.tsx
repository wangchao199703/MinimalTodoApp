import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import SettingsWindow from "./components/SettingsWindow";
import ClipEditorWindow from "./components/ClipEditorWindow";
import { setupSettingsSync } from "./store/useAppStore";
import "./index.css";

// 跨窗口设置同步监听(模块层注册一次,各窗口都需要)
setupSettingsSync();

// 按窗口 label 路由(不用 URL query,会白屏):settings → 设置窗口;clip-editor → 剪贴项编辑窗口;否则主应用
const label = getCurrentWindow().label;
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
