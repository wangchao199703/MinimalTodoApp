// 主题系统:Glass 玻璃拟态家族(4 色)+ 经典浅色/深色。
// 玻璃系共用 .glassy 面板体系(index.css),各变体只换强调色与渐变底(App 的 ThemeBackdrop)。

export const VALID_THEMES = [
  "glass",
  "glass-ocean",
  "glass-forest",
  "glass-sunset",
  "light",
  "dark",
] as const;
export type Theme = (typeof VALID_THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  glass: "Glass",
  "glass-ocean": "Ocean",
  "glass-forest": "Forest",
  "glass-sunset": "Sunset",
  light: "Light",
  dark: "Dark",
};

export const GLASS_THEMES: Theme[] = ["glass", "glass-ocean", "glass-forest", "glass-sunset"];

export function isGlassTheme(theme: Theme): boolean {
  return GLASS_THEMES.includes(theme);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const glassy = isGlassTheme(theme);
  const dark = theme !== "light";

  root.classList.toggle("dark", dark);
  root.classList.toggle("glassy", glassy);
  for (const g of GLASS_THEMES) {
    root.classList.toggle(g, theme === g);
  }
  root.style.colorScheme = dark ? "dark" : "light";
}

/** 旧主题键迁移:light/dark 保留,其余(含旧 102 套与 lumina/warm/system)一律回到 glass */
export function migrateThemeKey(saved: string | undefined): Theme {
  const v = (saved ?? "glass").toLowerCase();
  if ((VALID_THEMES as readonly string[]).includes(v)) return v as Theme;
  return "glass";
}
