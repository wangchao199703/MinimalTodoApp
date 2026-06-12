// 主题系统:三个家族 —— Glass 玻璃拟态(4)/ 浅色系(4)/ 深色系(4)。
// 基线:light = :root,dark = .dark;其余变体 class 只覆盖少量 token;
// 玻璃系共用 .glassy 面板体系,渐变底在 App.tsx 的 BACKDROPS。

export const GLASS_THEMES = ["glass", "glass-ocean", "glass-forest", "glass-sunset"] as const;
export const LIGHT_THEMES = [
  "light",
  "light-lavender",
  "light-mint",
  "light-sand",
  // 以下四套移植自旧 WPF 版同名主题(legacy/MinimalTodoApp/Themes/*.xaml 原始色值)
  "light-rose",
  "light-sage",
  "light-haze",
  "light-clay",
] as const;
export const DARK_THEMES = ["dark", "dark-midnight", "dark-mocha", "dark-emerald"] as const;

export const VALID_THEMES = [...GLASS_THEMES, ...LIGHT_THEMES, ...DARK_THEMES] as const;
export type Theme = (typeof VALID_THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  glass: "Glass",
  "glass-ocean": "Ocean",
  "glass-forest": "Forest",
  "glass-sunset": "Sunset",
  light: "Light",
  "light-lavender": "Lavender",
  "light-mint": "Mint",
  "light-sand": "Sand",
  "light-rose": "Rose",
  "light-sage": "Sage",
  "light-haze": "Haze",
  "light-clay": "Clay",
  dark: "Dark",
  "dark-midnight": "Midnight",
  "dark-mocha": "Mocha",
  "dark-emerald": "Emerald",
};

export function isGlassTheme(theme: Theme): boolean {
  return (GLASS_THEMES as readonly string[]).includes(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const glassy = isGlassTheme(theme);
  const dark = !(LIGHT_THEMES as readonly string[]).includes(theme);

  root.classList.toggle("dark", dark);
  root.classList.toggle("glassy", glassy);
  // 变体 class:除两个基线(light/dark)外,class 名即主题键
  for (const k of VALID_THEMES) {
    if (k === "light" || k === "dark") continue;
    root.classList.toggle(k, theme === k);
  }
  root.style.colorScheme = dark ? "dark" : "light";
}

/** 旧主题键迁移:仍有效的保留,其余一律回到 glass */
export function migrateThemeKey(saved: string | undefined): Theme {
  const v = (saved ?? "glass").toLowerCase();
  return (VALID_THEMES as readonly string[]).includes(v) ? (v as Theme) : "glass";
}
