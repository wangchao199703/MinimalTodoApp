// 主题引擎:102 套内置主题(27 xaml 成品 + 72 锚点派生 + 3 磨砂)+ 用户自定义。
// 应用方式 = 把 18 个颜色键写入 documentElement 的 CSS 变量,全部控件实时换色。
import builtinData from "./themes-builtin.json";
import { t } from "./i18n";

export const COLOR_KEYS = [
  "WindowBg",
  "TitleBarBg",
  "SidebarBg",
  "ContentBg",
  "CardBg",
  "CardHoverBg",
  "InputBg",
  "PrimaryText",
  "SecondaryText",
  "MutedText",
  "Accent",
  "AccentText",
  "Divider",
  "SelectedItemBg",
  "OverdueText",
  "WarningText",
  "SuccessText",
  "PopupBg",
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemeColors = Record<string, string>;

export interface ThemeMeta {
  key: string;
  /** 分组键(S.ThemeGroup.* 本地化) */
  group: string;
  colors: ThemeColors;
  custom?: boolean;
  /** 自定义主题的显示名(内置主题用 S.Theme.<key> 本地化) */
  display?: string;
}

export const THEME_GROUP_ORDER = [
  "Favorites",
  "Classic",
  "Morandi",
  "Macaron",
  "Dunhuang",
  "Mondrian",
  "Memphis",
  "Rococo",
  "Matisse",
  "Transparent",
  "Custom",
];

// ============ 颜色工具(移植旧版 BuiltinThemes.cs) ============

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 8) h = h.slice(2); // 去掉 alpha
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
const hex2 = (v: number) => clamp(v).toString(16).padStart(2, "0");

/** sRGB 线性混合,t=0 取 a,t=1 取 b */
function mix(a: string, b: string, k: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return `#${hex2(ar + (br - ar) * k)}${hex2(ag + (bg - ag) * k)}${hex2(ab + (bb - ab) * k)}`;
}

function lum(c: string): number {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const WHITE = "#FFFFFF";
const BLACK = "#000000";

/** 由 4 个锚点色派生完整 18 键调色板(与旧版 Build 完全一致) */
export function buildPalette(
  dark: boolean,
  bg: string,
  card: string,
  text: string,
  accent: string,
): ThemeColors {
  return {
    WindowBg: bg,
    TitleBarBg: dark ? mix(bg, BLACK, 0.28) : mix(bg, BLACK, 0.05),
    SidebarBg: dark ? mix(bg, BLACK, 0.2) : mix(bg, BLACK, 0.03),
    ContentBg: bg,
    CardBg: card,
    CardHoverBg: dark ? mix(card, WHITE, 0.07) : mix(card, BLACK, 0.05),
    InputBg: dark ? mix(bg, WHITE, 0.07) : mix(bg, BLACK, 0.05),
    PrimaryText: text,
    SecondaryText: mix(text, bg, 0.32),
    MutedText: mix(text, bg, 0.55),
    Accent: accent,
    AccentText: lum(accent) > 0.62 ? "#1F2329" : "#FFFFFF",
    Divider: dark ? mix(bg, WHITE, 0.12) : mix(bg, BLACK, 0.1),
    SelectedItemBg: dark ? mix(accent, bg, 0.68) : mix(accent, bg, 0.8),
    OverdueText: dark ? "#FF6B6B" : "#E5484D",
    WarningText: dark ? "#F0A741" : "#D9820B",
    SuccessText: dark ? "#4ADE80" : "#16A34A",
    PopupBg: dark ? mix(card, WHITE, 0.03) : card,
  };
}

/** 半透明磨砂主题(颜色含 alpha,直接指定不走派生;与旧版 Frosted 工厂一致) */
function frosted(
  key: string,
  text: string,
  c: {
    bg: string;
    title: string;
    sidebar: string;
    content: string;
    card: string;
    hover: string;
    input: string;
    accent: string;
    divider: string;
    selected: string;
    popup: string;
  },
): ThemeMeta {
  const colors: ThemeColors = {
    WindowBg: c.bg,
    TitleBarBg: c.title,
    SidebarBg: c.sidebar,
    ContentBg: c.content,
    CardBg: c.card,
    CardHoverBg: c.hover,
    InputBg: c.input,
    PrimaryText: text,
    SecondaryText: mix(text, "#808080", 0.3),
    MutedText: mix(text, "#808080", 0.55),
    Accent: c.accent,
    AccentText: lum(c.accent) > 0.62 ? "#1F2329" : "#FFFFFF",
    Divider: c.divider,
    SelectedItemBg: c.selected,
    OverdueText: lum(text) > 0.5 ? "#FF8A8A" : "#D32F2F",
    WarningText: lum(text) > 0.5 ? "#FFC04D" : "#B26A00",
    SuccessText: lum(text) > 0.5 ? "#6EE7A0" : "#15803D",
    PopupBg: c.popup,
  };
  return { key, group: "Transparent", colors };
}

const FROSTED: ThemeMeta[] = [
  frosted("FrostLight", "#15181C", {
    bg: "#B8FFFFFF", title: "#40FFFFFF", sidebar: "#2EFFFFFF", content: "#00FFFFFF",
    card: "#9CFFFFFF", hover: "#C0FFFFFF", input: "#7AFFFFFF",
    accent: "#3B82F6", divider: "#33000000", selected: "#553B82F6", popup: "#F0FFFFFF",
  }),
  frosted("FrostDark", "#F2F5F8", {
    bg: "#B0202428", title: "#33000000", sidebar: "#2A000000", content: "#00000000",
    card: "#8C2B3036", hover: "#A8343A42", input: "#6622272C",
    accent: "#5B9DFF", divider: "#33FFFFFF", selected: "#66416A9E", popup: "#F0262B30",
  }),
  frosted("Mist", "#1A2030", {
    bg: "#BEE8EEF6", title: "#3CFFFFFF", sidebar: "#2AFFFFFF", content: "#00FFFFFF",
    card: "#A6F2F6FB", hover: "#CCE3EBF5", input: "#80EDF1F7",
    accent: "#5C7CFA", divider: "#2A2A3A55", selected: "#555C7CFA", popup: "#F2F4F7FC",
  }),
];

// ============ 主题注册表 ============

interface BuiltinJson {
  xaml: Record<string, { group: string; colors: ThemeColors }>;
  palettes: {
    key: string;
    dark: boolean;
    group: string;
    bg: string;
    card: string;
    text: string;
    accent: string;
  }[];
}

const data = builtinData as BuiltinJson;

let cache: ThemeMeta[] | null = null;

export function builtinThemes(): ThemeMeta[] {
  if (cache) return cache;
  const list: ThemeMeta[] = [];
  for (const [key, v] of Object.entries(data.xaml)) {
    list.push({ key, group: v.group, colors: v.colors });
  }
  for (const p of data.palettes) {
    list.push({ key: p.key, group: p.group, colors: buildPalette(p.dark, p.bg, p.card, p.text, p.accent) });
  }
  list.push(...FROSTED);
  cache = list;
  return list;
}

/** 内置主题的风格分组;自定义/未知主题返回 null */
export function themeGroup(key: string): string | null {
  return builtinThemes().find((m) => m.key === key)?.group ?? null;
}

/** 深色主题判定:正文文字偏亮即认为是深色底 */
export function isDarkColors(colors: ThemeColors): boolean {
  return lum(colors["PrimaryText"] ?? "#000000") > 0.5;
}

export function themeDisplay(meta: ThemeMeta): string {
  return meta.custom ? (meta.display ?? meta.key) : t("S.Theme." + meta.key);
}

/** 解析主题键 → 完整颜色(自定义缺键用 Light 兜底;未知键回退 Light) */
export function resolveTheme(key: string, customs: ThemeMeta[]): ThemeColors {
  const light = builtinThemes().find((m) => m.key === "Light")!.colors;
  const custom = customs.find((m) => m.key === key);
  if (custom) return { ...light, ...custom.colors };
  const builtin = builtinThemes().find((m) => m.key === key);
  return builtin ? builtin.colors : light;
}

// ============ 应用到 DOM ============

/** #RRGGBB / #AARRGGBB(WPF) → CSS 颜色 */
export function toCssColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length === 8) {
    const a = parseInt(h.slice(0, 2), 16) / 255;
    const [r, g, b] = rgb("#" + h.slice(2));
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }
  return hex;
}

const VAR_NAME: Record<string, string> = {
  WindowBg: "--window-bg",
  TitleBarBg: "--titlebar-bg",
  SidebarBg: "--sidebar-bg",
  ContentBg: "--content-bg",
  CardBg: "--card-bg",
  CardHoverBg: "--card-hover-bg",
  InputBg: "--input-bg",
  PrimaryText: "--primary-text",
  SecondaryText: "--secondary-text",
  MutedText: "--muted-text",
  Accent: "--accent",
  AccentText: "--accent-text",
  Divider: "--divider",
  SelectedItemBg: "--selected-item-bg",
  OverdueText: "--overdue-text",
  WarningText: "--warning-text",
  SuccessText: "--success-text",
  PopupBg: "--popup-bg",
};

export function applyThemeColors(colors: ThemeColors) {
  const el = document.documentElement;
  for (const key of COLOR_KEYS) {
    const v = colors[key];
    if (v) el.style.setProperty(VAR_NAME[key], toCssColor(v));
  }
  // 原生控件(滚动条/日期选择)跟随明暗
  el.style.colorScheme = lum(colors["WindowBg"] ?? "#FFFFFF") < 0.5 ? "dark" : "light";
}
