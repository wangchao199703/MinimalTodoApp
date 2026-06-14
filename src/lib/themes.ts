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
export const DESIGNS = [
  "linear",
  "apple",
  "cute",
  "notion",
  "fluent",
  "frost",
  "tinted",
  "panel",
  "brutal",
] as const;
export type Design = (typeof DESIGNS)[number];
export const DEFAULT_DESIGN: Design = "apple";

/** 版式标签 i18n 键(zh/en 在 i18n EXTRA) */
export const DESIGN_LABEL_KEY: Record<Design, string> = {
  apple: "S.X.Design.Apple",
  linear: "S.X.Design.Linear",
  cute: "S.X.Design.Cute",
  notion: "S.X.Design.Notion",
  fluent: "S.X.Design.Fluent",
  frost: "S.X.Design.Frost",
  tinted: "S.X.Design.Tinted",
  panel: "S.X.Design.Panel",
  brutal: "S.X.Design.Brutal",
};

/** 版式一句话描述 i18n 键(设置里展示) */
export const DESIGN_DESC_KEY: Record<Design, string> = {
  apple: "S.X.Design.AppleDesc",
  linear: "S.X.Design.LinearDesc",
  cute: "S.X.Design.CuteDesc",
  notion: "S.X.Design.NotionDesc",
  fluent: "S.X.Design.FluentDesc",
  frost: "S.X.Design.FrostDesc",
  tinted: "S.X.Design.TintedDesc",
  panel: "S.X.Design.PanelDesc",
  brutal: "S.X.Design.BrutalDesc",
};

export function applyDesign(design: Design) {
  const root = document.documentElement;
  for (const d of DESIGNS) root.classList.toggle(`design-${d}`, d === design);
}

export function migrateDesign(saved: string | undefined): Design {
  return (DESIGNS as readonly string[]).includes(saved ?? "") ? (saved as Design) : DEFAULT_DESIGN;
}

// ============ 自定义版式:在内置版式基础上改了勾选框就派生一个,记录基于哪套 ============
// 存于 settings.custom_designs(JSON 数组);active design 值可为内置键或 "custom:<id>"。
export interface CustomDesign {
  id: string;
  /** 基于哪个内置版式 */
  base: Design;
  /** 勾选框覆盖(空串=该维度跟随版式) */
  shape: string;
  size: string;
  width: string;
  /** 子任务进度显示:"" 跟随版式 / count 数字 / bar 直线 / ring 圆环 */
  progress: string;
}

/** 子任务进度显示模式(空串=跟随版式) */
export const PROGRESS_MODES = ["count", "bar", "ring"] as const;
export const PROGRESS_LABEL_KEY: Record<string, string> = {
  "": "S.X.Checkbox.FollowVersion",
  count: "S.X.Progress.Count",
  bar: "S.X.Progress.Bar",
  ring: "S.X.Progress.Ring",
};

/** 应用子任务进度模式:在 <html> 切 pg-* class(空=不切,跟随版式) */
export function applyProgress(mode: string) {
  const r = document.documentElement;
  r.classList.toggle("pg-count", mode === "count");
  r.classList.toggle("pg-bar", mode === "bar");
  r.classList.toggle("pg-ring", mode === "ring");
}

export function parseCustomDesigns(raw: string | undefined): CustomDesign[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (d) =>
          d &&
          typeof d.id === "string" &&
          (DESIGNS as readonly string[]).includes(d.base),
      )
      .map((d) => ({
        id: d.id,
        base: d.base as Design,
        shape: typeof d.shape === "string" ? d.shape : "",
        size: typeof d.size === "string" ? d.size : "",
        width: typeof d.width === "string" ? d.width : "",
        progress: typeof d.progress === "string" ? d.progress : "",
      }));
  } catch {
    return [];
  }
}

/** 解析 active design 值 → 基础版式 + 勾选框/进度覆盖(内置则无覆盖) */
export function resolveDesign(
  designValue: string,
  customs: CustomDesign[],
): { base: Design; shape: string; size: string; width: string; progress: string } {
  if (designValue.startsWith("custom:")) {
    const c = customs.find((x) => x.id === designValue.slice(7));
    if (c) {
      return { base: c.base, shape: c.shape, size: c.size, width: c.width, progress: c.progress };
    }
  }
  return { base: migrateDesign(designValue), shape: "", size: "", width: "", progress: "" };
}

/** 各内置版式勾选框是否圆形(与 index.css 的 .design-* .task-check border-radius 对应) */
const DESIGN_ROUND: Record<Design, boolean> = {
  linear: false,
  apple: true,
  cute: true,
  notion: false,
  fluent: true,
  frost: true,
  tinted: false,
  panel: false,
  brutal: false,
};

/** 当前生效版式的勾选框是否圆形(供进度环按圆/方渲染);cb 形状覆盖优先 */
export function isRoundCheckbox(designValue: string, customs: CustomDesign[]): boolean {
  const r = resolveDesign(designValue, customs);
  if (r.shape === "round") return true;
  if (r.shape === "square") return false;
  return DESIGN_ROUND[r.base];
}

/** 各内置版式的默认子任务进度模式(「跟随版式」时采用):count 数字 / bar 直线 / ring 勾选框 */
const DESIGN_PROGRESS_DEFAULT: Record<Design, string> = {
  linear: "count",
  apple: "ring",
  cute: "ring",
  notion: "count",
  fluent: "ring",
  frost: "ring",
  tinted: "ring",
  panel: "bar",
  brutal: "bar",
};

/** 应用 active design:基础版式 class + 勾选框/进度覆盖(内置 → 清空覆盖) */
export function applyActiveDesign(designValue: string, customsRaw: string | undefined) {
  const r = resolveDesign(designValue, parseCustomDesigns(customsRaw));
  applyDesign(r.base);
  applyCheckbox(r.shape, r.size, r.width);
  // 进度覆盖为空(跟随版式)时,采用该版式的默认进度模式
  applyProgress(r.progress || DESIGN_PROGRESS_DEFAULT[r.base]);
}

// ============ 优先级展示(priority_style):与版式正交的「优先级怎么显示」轴 ============
// 在 <html> 挂 prio-<key>。apple=复选框圆环着色+高优先级 ! / linear=行左 gutter 竖线 /
// notion=标题文字着色+小圆点 / none=不展示。容器上的 data-pri / --pri 供 CSS 取用。
export const PRIORITY_STYLES = ["apple", "linear", "signal", "notion", "none"] as const;
export type PriorityStyle = (typeof PRIORITY_STYLES)[number];
export const DEFAULT_PRIORITY_STYLE: PriorityStyle = "notion";

export const PRIORITY_STYLE_LABEL_KEY: Record<PriorityStyle, string> = {
  apple: "S.X.Prio.Apple",
  linear: "S.X.Prio.Linear",
  signal: "S.X.Prio.Signal",
  notion: "S.X.Prio.Notion",
  none: "S.X.Prio.None",
};

export function applyPriorityStyle(style: PriorityStyle) {
  const root = document.documentElement;
  for (const p of PRIORITY_STYLES) root.classList.toggle(`prio-${p}`, p === style);
}

export function migratePriorityStyle(saved: string | undefined): PriorityStyle {
  return (PRIORITY_STYLES as readonly string[]).includes(saved ?? "")
    ? (saved as PriorityStyle)
    : DEFAULT_PRIORITY_STYLE;
}

// ============ 勾选框三项设置(形状/大小/粗细):空串=跟随版式,设了才覆盖版式默认 ============
// 在 <html> 按「是否设置」切 cb-* class + 写 CSS 变量;配合 index.css 的 html.cb-* .task-check 覆盖规则。
/** 各内置版式勾选框默认几何(px),与 index.css 的 .design-* .task-check 对应。
 *  用于设置里「跟随版式」(置灰)时显示真实值——设置窗口无任务卡,无法用 getComputedStyle。 */
export const DESIGN_CHECKBOX_DEFAULT: Record<Design, { size: number; width: number }> = {
  apple: { size: 19, width: 1.5 }, // 19px / 1.5px(经典)
  linear: { size: 16, width: 1 }, // 1rem / 1px
  cute: { size: 24, width: 2 }, // 1.5rem / 2px
  notion: { size: 17, width: 1 }, // 1.05rem≈16.8 / 1px
  fluent: { size: 20, width: 2 }, // 1.25rem / 继承 border-2
  frost: { size: 18, width: 1.5 }, // 1.125rem / 1.5px
  tinted: { size: 20, width: 1.5 }, // 1.25rem / 1.5px
  panel: { size: 22, width: 1 }, // 1.375rem / 1px
  brutal: { size: 20, width: 2 }, // 1.25rem / 2px
};

export function applyCheckbox(shape: string, size: string, width: string) {
  const r = document.documentElement;
  r.classList.toggle("cb-shape", !!shape);
  if (shape) r.style.setProperty("--check-radius", shape === "square" ? "0.25rem" : "9999px");
  r.classList.toggle("cb-size", !!size);
  if (size) r.style.setProperty("--check-size", `${size}px`);
  r.classList.toggle("cb-width", !!width);
  if (width) r.style.setProperty("--check-bw", `${width}px`);
}
