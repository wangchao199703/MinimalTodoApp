// 主题系统(对齐 todo-flow):6 套主题,CSS class 切换,变量定义在 index.css。
// light = :root 基线;dark/glass/warm/lumina 为根节点 class;system 跟随系统明暗。
import { ipc } from "./tauri-ipc";

export const VALID_THEMES = ["lumina", "light", "dark", "warm", "glass", "system"] as const;
export type Theme = (typeof VALID_THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  lumina: "Lumina",
  light: "Light",
  dark: "Dark",
  warm: "Warm",
  glass: "Glass",
  system: "System",
};

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** dark class 的解析结果(glass/warm 属深色基调,对齐 todo-flow) */
export function resolveIsDark(theme: Theme): boolean {
  switch (theme) {
    case "dark":
    case "glass":
    case "warm":
      return true;
    case "system":
      return systemPrefersDark();
    default:
      return false;
  }
}

let mq: MediaQueryList | null = null;
let mqHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = resolveIsDark(theme);
  root.classList.toggle("dark", dark);
  root.classList.toggle("glass", theme === "glass");
  root.classList.toggle("warm", theme === "warm");
  root.classList.toggle("lumina", theme === "lumina");
  root.style.colorScheme = dark ? "dark" : "light";

  // system:监听系统明暗变化实时跟随
  if (mq && mqHandler) {
    mq.removeEventListener("change", mqHandler);
    mq = null;
    mqHandler = null;
  }
  if (theme === "system") {
    mq = window.matchMedia("(prefers-color-scheme: dark)");
    mqHandler = (e) => {
      root.classList.toggle("dark", e.matches);
      root.style.colorScheme = e.matches ? "dark" : "light";
    };
    mq.addEventListener("change", mqHandler);
  }

  // Glass 主题启用原生亚克力(窗口本身透明,毛玻璃透出桌面)
  void ipc.setAcrylic(theme === "glass", true).catch(() => {});
}

/** 旧版主题键迁移:同名直接用,其余(旧 102 套)按名称含 dark 与否回退明/暗 */
export function migrateThemeKey(saved: string | undefined): Theme {
  const v = (saved ?? "light").toLowerCase();
  if ((VALID_THEMES as readonly string[]).includes(v)) return v as Theme;
  return v.includes("dark") || v.includes("graphite") || v.includes("slate") ? "dark" : "light";
}
