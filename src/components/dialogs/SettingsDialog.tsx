import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { ipc } from "../../lib/tauri-ipc";
import { t } from "../../lib/i18n";
import { applyFontSettings } from "../../lib/font";
import Modal from "../ui/Modal";

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

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    void ipc.getAutostart().then(setAutostart).catch(() => {});
  }, []);

  const flag = (key: string, def: boolean) =>
    settings[key] === undefined ? def : settings[key] === "1";
  const setFlag = (key: string) => (v: boolean) => saveSetting(key, v ? "1" : "0");

  const fontFamily = settings["font_family"] || "Microsoft YaHei UI, Segoe UI";
  const fontSize = Number(settings["font_size"] || "14");
  const lineSpacing = Number(settings["line_spacing"] || "1.1");

  const updateFont = (family: string, size: number, spacing: number) => {
    saveSetting("font_family", family);
    saveSetting("font_size", String(size));
    saveSetting("line_spacing", String(spacing));
    applyFontSettings(family, size, spacing);
  };

  return (
    <Modal title={t("S.Settings.Title")} onClose={onClose} width={440}>
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

      <div className="my-2 h-px bg-divider" />
      <p className="mb-1 text-sm text-text-1">{t("S.Settings.Font")}</p>
      <p className="mb-2 text-xs text-muted">{t("S.Settings.FontDesc")}</p>

      <label className="mb-2 flex items-center gap-2">
        <span className="w-12 shrink-0 text-xs text-text-2">{t("S.Settings.FontFamily")}</span>
        <select
          value={fontFamily.split(",")[0]}
          onChange={(e) => updateFont(e.target.value, fontSize, lineSpacing)}
          className="min-w-0 flex-1 rounded-md bg-input px-2 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
        >
          {!FONTS.includes(fontFamily.split(",")[0]) && (
            <option value={fontFamily.split(",")[0]}>{fontFamily.split(",")[0]}</option>
          )}
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
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
    </Modal>
  );
}
