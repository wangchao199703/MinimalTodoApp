import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../../store/useAppStore";
import { ipc } from "../../lib/tauri-ipc";
import { t } from "../../lib/i18n";
import { applyFontSettings } from "../../lib/font";
import {
  DESIGNS,
  DESIGN_LABEL_KEY,
  DESIGN_DESC_KEY,
  migrateDesign,
  PRIORITY_STYLES,
  PRIORITY_STYLE_LABEL_KEY,
  migratePriorityStyle,
} from "../../lib/themes";
import { confirm } from "../ui/ConfirmDialog";

function Toggle(props: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-text-1">{props.label}</span>
        {props.desc && <span className="mt-0.5 block text-xs text-muted">{props.desc}</span>}
      </span>
      <button
        role="switch"
        aria-checked={props.checked}
        onClick={(e) => {
          e.preventDefault();
          props.onChange(!props.checked);
        }}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          props.checked ? "bg-accent" : "bg-divider"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            props.checked ? "left-4.5" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

const FONTS = [
  "Microsoft YaHei UI",
  "Segoe UI",
  "宋体",
  "楷体",
  "微软雅黑",
  "Consolas",
  "system-ui",
];

/** 分组键(对齐旧版 S.Settings.Nav.*,收集箱在新版叫便签;字体已并入通用) */
type Section = "general" | "todo" | "notes" | "about";

const SECTIONS: { key: Section; labelKey: string }[] = [
  { key: "general", labelKey: "S.Settings.Nav.General" },
  { key: "todo", labelKey: "S.Settings.Nav.Todo" },
  { key: "notes", labelKey: "S.X.Notes" },
  { key: "about", labelKey: "S.Settings.Nav.About" },
];

/** 设置面板主体(原 SettingsDialog 内容,抽出复用:既可装进独立设置窗口,也可内嵌) */
export default function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const [section, setSection] = useState<Section>("general");
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void ipc.getAutostart().then(setAutostart).catch(() => {});
    void getVersion().then(setVersion).catch(() => {});
  }, []);

  const flag = (key: string, def: boolean) =>
    settings[key] === undefined ? def : settings[key] === "1";
  const setFlag = (key: string) => (v: boolean) => saveSetting(key, v ? "1" : "0");

  // 全局字体
  const fontFamily = settings["font_family"] || "Microsoft YaHei UI, Segoe UI";
  const fontSize = Number(settings["font_size"] || "14");
  const lineSpacing = Number(settings["line_spacing"] || "1.1");
  const updateFont = (family: string, size: number, spacing: number) => {
    saveSetting("font_family", family);
    saveSetting("font_size", String(size));
    saveSetting("line_spacing", String(spacing));
    applyFontSettings(family, size, spacing);
  };

  // 便签独立字体(空/0 = 继承全局)
  const noteFont = settings["note_font_family"] || "";
  const noteSize = Number(settings["note_font_size"] || "0");
  const noteSpacing = Number(settings["note_line_spacing"] || "0");
  // 字号、行距各自独立继承全局(各自 0 即继承);关闭继承时落到明确默认值好让滑块可调
  const noteSizeInherit = noteSize <= 0;
  const noteSpacingInherit = noteSpacing <= 0;
  const setNoteSizeInherit = (v: boolean) =>
    saveSetting("note_font_size", v ? "0" : "14");
  const setNoteSpacingInherit = (v: boolean) =>
    saveSetting("note_line_spacing", v ? "0" : "1.1");

  const fontSelect = (value: string, onChange: (v: string) => void, inheritOption?: boolean) => (
    <select
      value={value.split(",")[0]}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-md bg-input px-2 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
    >
      {inheritOption && <option value="">{t("S.X.InheritGlobal")}</option>}
      {value && !FONTS.includes(value.split(",")[0]) && (
        <option value={value.split(",")[0]}>{value.split(",")[0]}</option>
      )}
      {FONTS.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex gap-4">
      {/* 左侧分组导航(对齐旧版) */}
      <nav className="flex w-24 shrink-0 flex-col gap-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
              section === s.key ? "bg-selected text-text-1" : "text-text-2 hover:bg-card-hover"
            }`}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </nav>

      <div className="min-h-[320px] min-w-0 flex-1">
        {section === "todo" && (
          <>
            <Toggle
              label={t("S.Settings.Effects")}
              desc={t("S.Settings.EffectsDesc")}
              checked={flag("effects_enabled", true)}
              onChange={setFlag("effects_enabled")}
            />
            <Toggle
              label={t("S.Settings.Sound")}
              desc={t("S.Settings.SoundDesc")}
              checked={flag("sound_enabled", false)}
              onChange={setFlag("sound_enabled")}
            />
            <Toggle
              label={t("S.Settings.ReminderSound")}
              desc={t("S.Settings.ReminderSoundDesc")}
              checked={flag("reminder_sound_enabled", true)}
              onChange={setFlag("reminder_sound_enabled")}
            />
            <div className="my-1 h-px bg-divider" />
            <Toggle
              label={t("S.X.QuadrantHighOnly")}
              checked={flag("quadrant_important_high_only", false)}
              onChange={setFlag("quadrant_important_high_only")}
            />
            <Toggle
              label={t("S.X.QuadrantSoon")}
              checked={flag("quadrant_urgent_include_soon", false)}
              onChange={setFlag("quadrant_urgent_include_soon")}
            />
          </>
        )}

        {section === "notes" && (
          <>
            <p className="mb-1 text-sm text-text-1">{t("S.Settings.NoteFont")}</p>
            <p className="mb-3 text-xs text-muted">{t("S.Settings.NoteFontDesc")}</p>
            <label className="mb-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-text-2">{t("S.Settings.FontFamily")}</span>
              {fontSelect(noteFont, (v) => saveSetting("note_font_family", v), true)}
            </label>
            {/* 字号:独立继承开关;继承时滑块显示全局值并置灰禁用 */}
            <Toggle
              label={t("S.X.NoteInheritSize")}
              checked={noteSizeInherit}
              onChange={setNoteSizeInherit}
            />
            <label
              className={`mt-1 mb-2 flex items-center gap-2 ${noteSizeInherit ? "opacity-50" : ""}`}
            >
              <span className="w-12 shrink-0 text-xs text-text-2">{t("S.Settings.FontSize")}</span>
              <input
                type="range"
                min={10}
                max={22}
                step={1}
                disabled={noteSizeInherit}
                value={noteSizeInherit ? fontSize : noteSize || 14}
                onChange={(e) => saveSetting("note_font_size", e.target.value)}
                className="min-w-0 flex-1 accent-(--accent) disabled:cursor-not-allowed"
              />
              <span className="w-8 text-right text-xs text-muted">
                {noteSizeInherit ? fontSize : noteSize || 14}
              </span>
            </label>
            {/* 行距:独立继承开关;继承时滑块显示全局值并置灰禁用 */}
            <Toggle
              label={t("S.X.NoteInheritLineSpacing")}
              checked={noteSpacingInherit}
              onChange={setNoteSpacingInherit}
            />
            <label
              className={`mt-1 flex items-center gap-2 ${noteSpacingInherit ? "opacity-50" : ""}`}
            >
              <span className="w-12 shrink-0 text-xs text-text-2">
                {t("S.Settings.LineSpacing")}
              </span>
              <input
                type="range"
                min={0.9}
                max={1.6}
                step={0.05}
                disabled={noteSpacingInherit}
                value={noteSpacingInherit ? lineSpacing : noteSpacing || 1.1}
                onChange={(e) => saveSetting("note_line_spacing", e.target.value)}
                className="min-w-0 flex-1 accent-(--accent) disabled:cursor-not-allowed"
              />
              <span className="w-8 text-right text-xs text-muted">
                {(noteSpacingInherit ? lineSpacing : noteSpacing || 1.1).toFixed(2)}
              </span>
            </label>
          </>
        )}

        {section === "general" && (
          <>
            {/* 界面版式:4 套换肤,选中即广播给主窗口实时切换 */}
            <p className="mb-2 text-sm text-text-1">{t("S.X.Design.Title")}</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {DESIGNS.map((d) => {
                const active = migrateDesign(settings["design"]) === d;
                return (
                  <button
                    key={d}
                    onClick={() => saveSetting("design", d)}
                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-accent bg-selected"
                        : "border-divider hover:bg-card-hover"
                    }`}
                  >
                    <span className="text-sm text-text-1">{t(DESIGN_LABEL_KEY[d])}</span>
                    <span className="text-[11px] leading-tight text-muted">
                      {t(DESIGN_DESC_KEY[d])}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* 优先级展示:与版式正交,选 苹果/极客/文档/无 */}
            <p className="mb-2 text-sm text-text-1">{t("S.X.Prio.Title")}</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {PRIORITY_STYLES.map((p) => {
                const active = migratePriorityStyle(settings["priority_style"]) === p;
                return (
                  <button
                    key={p}
                    onClick={() => saveSetting("priority_style", p)}
                    className={`rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
                      active
                        ? "border-accent bg-selected text-text-1"
                        : "border-divider text-text-2 hover:bg-card-hover"
                    }`}
                  >
                    {t(PRIORITY_STYLE_LABEL_KEY[p])}
                  </button>
                );
              })}
            </div>
            <div className="my-2 h-px bg-divider" />
            <Toggle
              label={t("S.Settings.AutoStart")}
              desc={t("S.Settings.AutoStartDesc")}
              checked={autostart}
              onChange={(v) => {
                setAutostart(v);
                void ipc.setAutostart(v).catch(() => setAutostart(!v));
              }}
            />
            <Toggle
              label={t("S.Settings.Holidays")}
              desc={t("S.Settings.HolidaysDesc")}
              checked={flag("show_holidays", true)}
              onChange={setFlag("show_holidays")}
            />
            <div className="my-2 h-px bg-divider" />
            {/* 字体(原独立「字体」页并入通用) */}
            <p className="mb-1 text-sm text-text-1">{t("S.Settings.Font")}</p>
            <p className="mb-3 text-xs text-muted">{t("S.Settings.FontDesc")}</p>
            <label className="mb-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-text-2">{t("S.Settings.FontFamily")}</span>
              {fontSelect(fontFamily, (v) => updateFont(v, fontSize, lineSpacing))}
            </label>
            <label className="mb-2 flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-text-2">{t("S.Settings.FontSize")}</span>
              <input
                type="range"
                min={10}
                max={22}
                step={1}
                value={fontSize}
                onChange={(e) => updateFont(fontFamily, Number(e.target.value), lineSpacing)}
                className="min-w-0 flex-1 accent-(--accent)"
              />
              <span className="w-8 text-right text-xs text-muted">{fontSize}</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-text-2">{t("S.Settings.LineSpacing")}</span>
              <input
                type="range"
                min={0.9}
                max={1.6}
                step={0.05}
                value={lineSpacing}
                onChange={(e) => updateFont(fontFamily, fontSize, Number(e.target.value))}
                className="min-w-0 flex-1 accent-(--accent)"
              />
              <span className="w-8 text-right text-xs text-muted">{lineSpacing.toFixed(2)}</span>
            </label>
            <div className="my-2 h-px bg-divider" />
            <div className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.X.ResetDefaults")}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t("S.X.ResetDefaultsDesc")}
                </span>
              </span>
              <button
                onClick={async () => {
                  if (
                    await confirm({
                      title: t("S.X.ResetDefaults"),
                      message: t("S.X.ResetDefaultsConfirm"),
                    })
                  )
                    void resetSettings();
                }}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs text-overdue ring-1 ring-divider hover:bg-card-hover"
              >
                {t("S.X.ResetDefaults")}
              </button>
            </div>
          </>
        )}

        {section === "about" && (
          <>
            <p className="py-1 text-sm text-text-1">
              {t("S.AppName")} <span className="text-muted">v{version}</span>
            </p>
            <Toggle
              label={t("S.Settings.AutoUpdate")}
              desc={t("S.Settings.AutoUpdateDesc")}
              checked={flag("auto_update_enabled", true)}
              onChange={setFlag("auto_update_enabled")}
            />
          </>
        )}
      </div>
    </div>
  );
}
