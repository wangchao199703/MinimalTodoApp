import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import SettingsWindow from "./components/SettingsWindow";
import { setupSettingsSync } from "./store/useAppStore";
import "./index.css";

// 跨窗口设置同步监听(模块层注册一次,两种窗口都需要)
setupSettingsSync();

// 按窗口 label 路由:label === "settings" 渲染独立设置窗口,否则渲染主应用
const isSettingsWindow = getCurrentWindow().label === "settings";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isSettingsWindow ? <SettingsWindow /> : <App />}</React.StrictMode>,
);
