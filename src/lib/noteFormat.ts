/**
 * 便签格式单一数据源:默认值表(紧凑模式)+ default 映射机制。
 *
 * **default 映射核心**:每个格式设置项在数据库里的值有三态——
 *  - 空串 `""` 或字面量 `"default"`:**跟随默认**(用本表 DEFAULTS 当前值)。
 *    => 以后调整默认值(改本表),所有「没动过」的用户自动跟随。
 *  - 具体数字字符串:**用户自定义**,保留不变。
 *    => 调整默认值不影响「动过」的用户。
 *
 * 故所有便签格式设置默认**不写库**(留空=default);用户拖动滑块才写入具体值,
 * 点「恢复默认」即把该键清空(写空串)回到 default。
 */

/** 便签格式参数键 */
export type NoteFormatKey =
  | "note_font_size"
  | "note_code_font_size"
  | "note_h1_size"
  | "note_h2_size"
  | "note_h3_size"
  | "note_line_height"
  | "note_heading_line_height"
  | "note_code_line_height"
  | "note_padding_side"
  | "note_paragraph_spacing"
  | "note_list_indent";

/** 默认值(紧凑模式):正文 14px / 行距 1.45 / 段距 1em / 内边距 16px 等 */
export const NOTE_FORMAT_DEFAULTS: Record<NoteFormatKey, number> = {
  note_font_size: 14, // 正文字号 px
  note_code_font_size: 13, // 代码块字号 px
  note_h1_size: 22, // H1 字号 px
  note_h2_size: 18, // H2 字号 px
  note_h3_size: 16, // H3 字号 px
  note_line_height: 1.45, // 正文行距
  note_heading_line_height: 1.15, // 标题行距
  note_code_line_height: 1.4, // 代码块行距
  note_padding_side: 16, // 左右内边距 px
  note_paragraph_spacing: 1, // 段落间距 em
  note_list_indent: 24, // 列表缩进 px
};

/** 各参数滑块范围(min/max/step),供设置面板渲染 */
export const NOTE_FORMAT_RANGES: Record<NoteFormatKey, { min: number; max: number; step: number }> = {
  note_font_size: { min: 10, max: 22, step: 1 },
  note_code_font_size: { min: 9, max: 20, step: 1 },
  note_h1_size: { min: 16, max: 34, step: 1 },
  note_h2_size: { min: 14, max: 28, step: 1 },
  note_h3_size: { min: 12, max: 24, step: 1 },
  note_line_height: { min: 1.0, max: 2.0, step: 0.05 },
  note_heading_line_height: { min: 1.0, max: 1.6, step: 0.05 },
  note_code_line_height: { min: 1.0, max: 1.8, step: 0.05 },
  note_padding_side: { min: 8, max: 48, step: 2 },
  note_paragraph_spacing: { min: 0.2, max: 2.0, step: 0.1 },
  note_list_indent: { min: 12, max: 48, step: 2 },
};

/** 是否为「跟随默认」态(空串或 "default") */
export function isDefaultValue(raw: string | undefined): boolean {
  return raw === undefined || raw === "" || raw === "default";
}

/**
 * 解析单个格式参数:跟随默认态返回 DEFAULTS,否则返回用户自定义数值。
 * 自定义值非法(NaN)时也回退默认,避免脏数据破坏渲染。
 */
export function resolveNoteFormat(
  key: NoteFormatKey,
  settings: Record<string, string>,
): number {
  const raw = settings[key];
  if (isDefaultValue(raw)) return NOTE_FORMAT_DEFAULTS[key];
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : NOTE_FORMAT_DEFAULTS[key];
}

/** 把全部便签格式参数解析成 CSS 变量对象,下发到 .note-editor 容器 */
export function noteFormatCssVars(settings: Record<string, string>): Record<string, string> {
  const r = (k: NoteFormatKey) => resolveNoteFormat(k, settings);
  return {
    "--note-font-size": `${r("note_font_size")}px`,
    "--note-code-font-size": `${r("note_code_font_size")}px`,
    "--note-h1-size": `${r("note_h1_size")}px`,
    "--note-h2-size": `${r("note_h2_size")}px`,
    "--note-h3-size": `${r("note_h3_size")}px`,
    "--note-line-height": String(r("note_line_height")),
    "--note-heading-line-height": String(r("note_heading_line_height")),
    "--note-code-line-height": String(r("note_code_line_height")),
    "--note-padding-side": `${r("note_padding_side")}px`,
    "--note-paragraph-spacing": `${r("note_paragraph_spacing")}em`,
    "--note-list-indent": `${r("note_list_indent")}px`,
  };
}
