// 主题系统:两个家族 —— Glass 玻璃拟态(6)/ 精选纯色(浅 2 + 深 2)。
// 基线::root(浅)与 .dark(深)是 CSS 底座,各主题为变体 class(class 名 = 主题键)叠在其上;
// 玻璃系共用 .glassy 面板体系,渐变底在 App.tsx 的 BACKDROPS。默认 light-classic。

export const GLASS_THEMES = [
  "glass",
  "glass-ocean",
  "glass-forest",
  "glass-sunset",
  "glass-light", // Frost:浅色玻璃
  "glass-dark", // Noir:中性深黑玻璃
] as const;
export const LIGHT_THEMES = [
  "light-classic", // Classic:纯白克莱因蓝
  "light-grove", // Grove:暖绿灰护眼浅色
  "light-notion", // Notion:高级暖灰
  "light-things", // Things:macOS 冷白通透
  "light-ticktick", // TickTick:柔和靛蓝
] as const;
export const DARK_THEMES = [
  "dark-onyx", // Onyx:近黑高对比
  "dark-dusk", // Dusk:现代蓝调深色
  "dark-oled", // OLED:纯黑赛博青
  "dark-linear", // Linear:紫灰深底紫罗兰
] as const;

export const VALID_THEMES = [...GLASS_THEMES, ...LIGHT_THEMES, ...DARK_THEMES] as const;
export type Theme = (typeof VALID_THEMES)[number];

/** 默认主题 */
export const DEFAULT_THEME: Theme = "light-classic";

export const THEME_LABELS: Record<Theme, string> = {
  glass: "Glass",
  "glass-ocean": "Ocean",
  "glass-forest": "Forest",
  "glass-sunset": "Sunset",
  "glass-light": "Frost",
  "glass-dark": "Noir",
  "light-classic": "Classic",
  "light-grove": "Grove",
  "light-notion": "Notion",
  "light-things": "Things",
  "light-ticktick": "TickTick",
  "dark-onyx": "Onyx",
  "dark-dusk": "Dusk",
  "dark-oled": "OLED",
  "dark-linear": "Linear",
};

/** 菜单色板预览:底色 | 强调色(对角分割小药丸) */
export const THEME_PREVIEW: Record<Theme, { bg: string; accent: string }> = {
  "light-classic": { bg: "#f3f4f6", accent: "#2563eb" },
  "light-grove": { bg: "#ebece5", accent: "#4d7c0f" },
  "light-notion": { bg: "#f7f6f3", accent: "#2383e2" },
  "light-things": { bg: "#f4f5f5", accent: "#1183fe" },
  "light-ticktick": { bg: "#f8f9fa", accent: "#5c7cfa" },
  "dark-onyx": { bg: "#121212", accent: "#60a5fa" },
  "dark-dusk": { bg: "#0f172a", accent: "#38bdf8" },
  "dark-oled": { bg: "#000000", accent: "#06b6d4" },
  "dark-linear": { bg: "#151618", accent: "#5e6ad2" },
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
  // 变体 class:class 名即主题键(叠在 :root / .dark 基线之上)
  for (const k of VALID_THEMES) {
    root.classList.toggle(k, theme === k);
  }
  root.style.colorScheme = dark ? "dark" : "light";
}

/** 旧主题键迁移:仍有效的保留,其余(含未设置/已删除的旧主题)一律回到默认 */
export function migrateThemeKey(saved: string | undefined): Theme {
  const v = (saved ?? DEFAULT_THEME).toLowerCase();
  return (VALID_THEMES as readonly string[]).includes(v) ? (v as Theme) : DEFAULT_THEME;
}

// ============ 界面版式(design):与配色主题正交的「布局/质感」轴 ============
// 在 <html> 挂 design-<key>,统一 DOM + CSS 变量换肤(参考 Gemini 三套方案)。
// 多数视图复用 TaskItem,一处定义即覆盖 列表 / 四象限 / 标签看板。在「设置」里切换。
export const DESIGNS = ["classic", "apple", "linear", "cute"] as const;
export type Design = (typeof DESIGNS)[number];
export const DEFAULT_DESIGN: Design = "classic";

/** 版式标签 i18n 键(zh/en 在 i18n EXTRA) */
export const DESIGN_LABEL_KEY: Record<Design, string> = {
  classic: "S.X.Design.Classic",
  apple: "S.X.Design.Apple",
  linear: "S.X.Design.Linear",
  cute: "S.X.Design.Cute",
};

/** 版式一句话描述 i18n 键(设置里展示) */
export const DESIGN_DESC_KEY: Record<Design, string> = {
  classic: "S.X.Design.ClassicDesc",
  apple: "S.X.Design.AppleDesc",
  linear: "S.X.Design.LinearDesc",
  cute: "S.X.Design.CuteDesc",
};

export function applyDesign(design: Design) {
  const root = document.documentElement;
  for (const d of DESIGNS) root.classList.toggle(`design-${d}`, d === design);
}

export function migrateDesign(saved: string | undefined): Design {
  return (DESIGNS as readonly string[]).includes(saved ?? "") ? (saved as Design) : DEFAULT_DESIGN;
}
