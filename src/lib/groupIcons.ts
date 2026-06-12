/**
 * 标签图标:移植旧版 Infrastructure/GroupIcons.cs 的 Segoe Fluent Icons /
 * Segoe MDL2 Assets 字形分类(Windows 自带字体,WebView2 可直接渲染)。
 * 数据库 groups.icon 存的就是字形字符串(旧数据导入时原样保留)。
 */

export const ICON_FONT = '"Segoe Fluent Icons", "Segoe MDL2 Assets"';

const g = (code: number) => String.fromCodePoint(code);

export interface IconCategory {
  nameKey: string;
  glyphs: string[];
}

const glyphs = (...codes: number[]) => codes.map(g);

/** 与旧版 GroupIcons.Categories 一致的分类与码位 */
export const ICON_CATEGORIES: IconCategory[] = [
  {
    nameKey: "S.IconCat.Common",
    glyphs: glyphs(0xe8b7, 0xe734, 0xe735, 0xe7c1, 0xe8ec, 0xe718, 0xe787, 0xe8fd, 0xe930, 0xeb51, 0xe7ad, 0xe721),
  },
  {
    nameKey: "S.IconCat.Work",
    glyphs: glyphs(0xe821, 0xe715, 0xe717, 0xe716, 0xe77b, 0xe8a5, 0xe8f1, 0xe713, 0xe70f, 0xe8c8),
  },
  {
    nameKey: "S.IconCat.Study",
    glyphs: glyphs(0xe7be, 0xe70f, 0xe774, 0xe8a5, 0xe8fd, 0xe73e, 0xe713, 0xe721),
  },
  {
    nameKey: "S.IconCat.Life",
    glyphs: glyphs(0xe80f, 0xe719, 0xe7fc, 0xe722, 0xeb51, 0xe787, 0xe7ed, 0xe74d),
  },
  {
    nameKey: "S.IconCat.Travel",
    glyphs: glyphs(0xe84c, 0xe804, 0xe707, 0xe909, 0xe918, 0xe722, 0xec92, 0xe786),
  },
  {
    nameKey: "S.IconCat.Symbol",
    glyphs: glyphs(0xe734, 0xe735, 0xeb51, 0xe95e, 0xe7c1, 0xe8c9, 0xe946, 0xe945, 0xea80, 0xe790),
  },
];

/** 标签颜色预设(首个为默认蓝,即 groups.color 的 DB 默认值) */
export const TAG_COLORS = [
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#84CC16",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#64748B",
];
