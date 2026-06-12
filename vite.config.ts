import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri 开发模式固定端口 1420(与 tauri.conf.json 的 devUrl 对应)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // 不监视 Rust 侧目录,否则 cargo 编译产物会让 watcher EBUSY 崩溃
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "chrome105",
  },
});
