// 主题系统:三个家族 —— Glass 玻璃拟态(4)/ 浅色系(4)/ 深色系(4)。
// 基线:light = :root,dark = .dark;其余变体 class 只覆盖少量 token;
// 玻璃系共用 .glassy 面板体系,渐变底在 App.tsx 的 BACKDROPS。

export const GLASS_THEMES = [
  "glass",
  "glass-ocean",
  "glass-forest",
  "glass-sunset",
  "glass-light", // Frost:浅色玻璃
  "glass-dark", // Noir:中性深黑玻璃
] as const;
export const LIGHT_THEMES = [
  "light",
  "light-lavender",
  "light-mint",
  "light-sand",
  // 以下移植自旧 WPF 版主题(legacy/MinimalTodoApp/Themes/*.xaml 原始色值)
  "light-rose",
  "light-sage",
  "light-haze",
  "light-clay",
  "light-meadow", // 旧版 Forest(改名避免与玻璃 Forest 撞名)
] as const;
export const DARK_THEMES = [
  "dark",
  "dark-midnight",
  "dark-mocha",
  "dark-emerald",
  // 以下移植自旧 WPF 版
  "dark-nord",
  "dark-slate",
  "dark-graphite",
  "dark-teal", // 旧版 Ocean(改名避免与玻璃 Ocean 撞名)
] as const;

export const VALID_THEMES = [...GLASS_THEMES, ...LIGHT_THEMES, ...DARK_THEMES] as const;
export type Theme = (typeof VALID_THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  glass: "Glass",
  "glass-ocean": "Ocean",
  "glass-forest": "Forest",
  "glass-sunset": "Sunset",
  "glass-light": "Frost",
  "glass-dark": "Noir",
  light: "Light",
  "light-lavender": "Lavender",
  "light-mint": "Mint",
  "light-sand": "Sand",
  "light-rose": "Rose",
  "light-sage": "Sage",
  "light-haze": "Haze",
  "light-clay": "Clay",
  "light-meadow": "Meadow",
  dark: "Dark",
  "dark-midnight": "Midnight",
  "dark-mocha": "Mocha",
  "dark-emerald": "Emerald",
  "dark-nord": "Nord",
  "dark-slate": "Slate",
  "dark-graphite": "Graphite",
  "dark-teal": "Teal",
};

/** 菜单色板预览:底色 | 强调色(对角分割小药丸) */
export const THEME_PREVIEW: Record<Theme, { bg: string; accent: string }> = {
  light: { bg: "#f5f5fa", accent: "#7765f4" },
  "light-lavender": { bg: "#f3f0fb", accent: "#8b5ce8" },
  "light-mint": { bg: "#f2faf6", accent: "#1c9c75" },
  "light-sand": { bg: "#f7f2e8", accent: "#d36b17" },
  "light-rose": { bg: "#fff5f7", accent: "#e11d74" },
  "light-sage": { bg: "#eef1ec", accent: "#7c9a78" },
  "light-haze": { bg: "#f0f2f5", accent: "#6e8ca8" },
  "light-clay": { bg: "#f3eeea", accent: "#b08968" },
  "light-meadow": { bg: "#f4f6f0", accent: "#4d7c2f" },
  dark: { bg: "#101117", accent: "#8170f7" },
  "dark-midnight": { bg: "#121212", accent: "#5598f8" },
  "dark-mocha": { bg: "#171311", accent: "#d1a047" },
  "dark-emerald": { bg: "#0f1513", accent: "#34d399" },
  "dark-nord": { bg: "#2e3440", accent: "#88c0d0" },
  "dark-slate": { bg: "#282d33", accent: "#8aa0b6" },
  "dark-graphite": { bg: "#2a2c2e", accent: "#8fa1ae" },
  "dark-teal": { bg: "#0f2027", accent: "#2dd4bf" },
  glass: { bg: "#16213e", accent: "#7c72f6" },
  "glass-ocean": { bg: "#15323e", accent: "#38bdf8" },
  "glass-forest": { bg: "#123026", accent: "#34d399" },
  "glass-sunset": { bg: "#3c1a2c", accent: "#fb7159" },
  "glass-light": { bg: "#e8ecf9", accent: "#6d5ef5" },
  "glass-dark": { bg: "#131316", accent: "#c8cdd6" },
};

export function isGlassTheme(theme: Theme): boolean {
  return (GLASS_THEMES as readonly string[]).includes(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const glassy = isGlassTheme(theme);
  // Frost(glass-light)虽属玻璃家族但是浅色基调
  const dark = !(LIGHT_THEMES as readonly string[]).includes(theme) && theme !== "glass-light";

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
