import { useEffect, useState } from "react";
import { X, Volume2 } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../../store/useAppStore";
import { ipc } from "../../lib/tauri-ipc";
import { t, f } from "../../lib/i18n";
import { applyFontSettings } from "../../lib/font";
import {
  DESIGNS,
  DESIGN_LABEL_KEY,
  DESIGN_DESC_KEY,
  DESIGN_CHECKBOX_DEFAULT,
  PRIORITY_STYLES,
  PRIORITY_STYLE_LABEL_KEY,
  migratePriorityStyle,
} from "../../lib/themes";
import { confirm } from "../ui/ConfirmDialog";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import UpdateDialog from "./UpdateDialog";
import {
  checkForUpdate,
  fetchReinstallInfo,
  openDownloadUrl,
  LATEST_RELEASE_PAGE,
  type UpdateInfo,
} from "../../lib/updater";
import {
  SOUND_STYLES,
  normalizeSoundStyle,
  playComplete,
  playReminder,
} from "../../lib/effects";

// 提示音风格 → i18n 文案键
const SOUND_STYLE_LABEL_KEY: Record<string, string> = {
  minimal: "S.Settings.SoundStyle.Minimal",
  game: "S.Settings.SoundStyle.Game",
  zen: "S.Settings.SoundStyle.Zen",
  cute: "S.Settings.SoundStyle.Cute",
};

// 浏览器 KeyboardEvent.code → 加速键键名(与 Rust Shortcut::from_str 接受的写法一致)
function codeToToken(code: string): string | null {
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === "Space") return "Space";
  return null; // 修饰键本身或不支持的键
}

/** 单个快捷键录制按钮:点一下进入录制 → 按下「修饰键+键」即保存并重注册;Esc/失焦取消 */
function HotkeyRecorder({ label, settingKey, def }: { label: string; settingKey: string; def: string }) {
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [recording, setRecording] = useState(false);
  const current = settings[settingKey] ?? def;

  const start = () => {
    setRecording(true);
    void ipc.pauseHotkeys(); // 录制期间放开全局热键,按键才能传到这里
  };
  const stop = () => {
    setRecording(false);
    void ipc.updateHotkeys(); // 重新按设置注册
  };
  const onKey = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      stop();
      return;
    }
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Control");
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");
    if (e.metaKey) mods.push("Super");
    const token = codeToToken(e.code);
    if (!token || mods.length === 0) return; // 需「至少一个修饰键 + 一个键」
    const accel = [...mods, token].join("+");
    setRecording(false);
    void (async () => {
      saveSetting(settingKey, accel); // 本地即时 + 跨窗口同步
      await ipc.setSetting(settingKey, accel); // 确保库已落盘(saveSetting 内是异步,会与下面重注册抢)
      await ipc.updateHotkeys(); // 按新设置重注册全局热键
    })();
  };

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-text-1">{label}</span>
      <button
        onClick={start}
        onKeyDown={recording ? onKey : undefined}
        onBlur={() => recording && stop()}
        className={`min-w-[88px] rounded-md px-3 py-1.5 text-center text-xs ring-1 ${
          recording
            ? "text-accent ring-accent"
            : "text-text-2 ring-divider hover:bg-card-hover"
        }`}
      >
        {recording ? t("S.X.HotkeyRecording") : current}
      </button>
    </div>
  );
}

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

/** 分组键(通用 / 外观(界面样式+字体)/ 待办 / 便签 / 剪切板 / 关于) */
type Section = "general" | "appearance" | "todo" | "notes" | "clipboard" | "about";

const SECTIONS: { key: Section; labelKey: string }[] = [
  { key: "general", labelKey: "S.Settings.Nav.General" },
  { key: "appearance", labelKey: "S.X.Appearance" },
  { key: "todo", labelKey: "S.Settings.Nav.Todo" },
  { key: "notes", labelKey: "S.X.Notes" },
  { key: "clipboard", labelKey: "S.X.ClipSettings" },
  { key: "about", labelKey: "S.Settings.Nav.About" },
];

/** 设置面板主体(原 SettingsDialog 内容,抽出复用:既可装进独立设置窗口,也可内嵌) */
export default function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const design = useAppStore((s) => s.design);
  const customDesigns = useAppStore((s) => s.customDesigns);
  const setDesign = useAppStore((s) => s.setDesign);
  const editCheckbox = useAppStore((s) => s.editCheckbox);
  const deleteCustomDesign = useAppStore((s) => s.deleteCustomDesign);
  const [section, setSection] = useState<Section>("general");
  const [autostart, setAutostart] = useState(false);
  const [version, setVersion] = useState("");
  // 「重新安装当前版本」:拉取同 tag Release → 复用更新对话框走下载+换壳重启
  const [reinstallInfo, setReinstallInfo] = useState<UpdateInfo | null>(null);
  const [reinstallBusy, setReinstallBusy] = useState(false);
  // 「检查更新」:三态状态行(检查中/已是最新/检查失败)+ 有新版弹更新对话框(对齐 WPF SettingsDialog)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkStatus, setCheckStatus] = useState<"" | "checking" | "latest" | "failed">("");
  const pushToast = useAppStore((s) => s.pushToast);
  // 数据存储位置:当前数据根目录 + 迁移中状态
  const [dataDir, setDataDir] = useState("");
  const [migrating, setMigrating] = useState(false);

  // 选择新数据位置 → 确认(说明会移动数据并需重启)→ 迁移 → 提示重启
  const changeDataLocation = async () => {
    if (migrating) return;
    const picked = await openDialog({ directory: true, multiple: false, title: t("S.X.DataLocationPick") });
    if (typeof picked !== "string" || !picked) return;
    if (picked === dataDir) {
      pushToast(t("S.X.DataLocationSame"));
      return;
    }
    if (
      !(await confirm({
        title: t("S.X.DataLocation"),
        message: f("S.X.DataLocationConfirm", picked),
      }))
    )
      return;
    setMigrating(true);
    pushToast(t("S.X.DataLocationMigrating"));
    try {
      await ipc.migrateDataDir(picked);
      // 迁移成功:必须重启让库在新位置重新打开
      if (
        await confirm({
          title: t("S.X.DataLocationDone"),
          message: t("S.X.DataLocationRestart"),
        })
      ) {
        await ipc.restartApp();
      } else {
        setDataDir(picked);
      }
    } catch (e) {
      // 失败:旧数据原封不动,弹出原因
      pushToast(f("S.X.DataLocationFailed", String(e)));
    } finally {
      setMigrating(false);
    }
  };

  // 手动检查更新:三态契约(info=有新版 / null=已是最新 / 抛错=检查失败),状态行就地持久显示
  const startCheckUpdate = async () => {
    if (checkBusy) return;
    setCheckBusy(true);
    setCheckStatus("checking");
    try {
      const info = await checkForUpdate(true);
      if (info) {
        setCheckStatus("");
        setUpdateInfo(info);
      } else {
        setCheckStatus("latest");
      }
    } catch {
      setCheckStatus("failed");
    } finally {
      setCheckBusy(false);
    }
  };

  // 重装地址由命名约定直接拼出(不调接口、瞬时),直接弹对话框,无需「检查更新」提示
  const startReinstall = async () => {
    if (reinstallBusy) return;
    setReinstallBusy(true);
    try {
      const info = await fetchReinstallInfo();
      if (info) setReinstallInfo(info);
    } finally {
      setReinstallBusy(false);
    }
  };

  useEffect(() => {
    void ipc.getAutostart().then(setAutostart).catch(() => {});
    void getVersion().then(setVersion).catch(() => {});
    void ipc.getDataDir().then(setDataDir).catch(() => {});
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
              label={t("S.Settings.UndoToast")}
              desc={t("S.Settings.UndoToastDesc")}
              checked={flag("undo_toast_enabled", true)}
              onChange={setFlag("undo_toast_enabled")}
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
              checked={flag("sound_enabled", true)}
              onChange={setFlag("sound_enabled")}
            />
            <Toggle
              label={t("S.Settings.ReminderSound")}
              desc={t("S.Settings.ReminderSoundDesc")}
              checked={flag("reminder_sound_enabled", true)}
              onChange={setFlag("reminder_sound_enabled")}
            />
            <Toggle
              label={t("S.X.QuickAddPopup")}
              desc={t("S.X.QuickAddPopupDesc")}
              checked={flag("quick_add_popup", false)}
              onChange={setFlag("quick_add_popup")}
            />
            {/* 完成提示音 / 周期提醒音:各自独立选择(4 套任选,自由组合),每项可试听 */}
            {(() => {
              const renderPicker = (
                key: string,
                titleKey: string,
                preview: (s: (typeof SOUND_STYLES)[number]) => void,
                def: (typeof SOUND_STYLES)[number],
              ) => {
                const cur = normalizeSoundStyle(settings[key] || settings["sound_style"] || def);
                return (
                  <div className="mt-1 mb-1">
                    <p className="mb-2 text-sm text-text-1">{t(titleKey)}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {SOUND_STYLES.map((sty) => (
                        <div
                          key={sty}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
                            cur === sty
                              ? "border-accent bg-selected"
                              : "border-divider hover:bg-card-hover"
                          }`}
                        >
                          <button
                            onClick={() => saveSetting(key, sty)}
                            className="flex-1 text-left text-sm text-text-1"
                          >
                            {t(SOUND_STYLE_LABEL_KEY[sty])}
                          </button>
                          <button
                            onClick={() => preview(sty)}
                            title={t("S.Settings.SoundStyle.Preview")}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-2 ring-1 ring-divider hover:bg-card-hover"
                          >
                            <Volume2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              };
              return (
                <>
                  {renderPicker(
                    "complete_sound_style",
                    "S.Settings.SoundStyle.CompleteTitle",
                    playComplete,
                    "cute",
                  )}
                  {renderPicker(
                    "reminder_sound_style",
                    "S.Settings.SoundStyle.ReminderTitle",
                    playReminder,
                    "game",
                  )}
                </>
              );
            })()}
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

        {section === "appearance" && (
          <>
            {/* 界面版式:内置 7 套 + 自定义版式(改了勾选框自动派生),选中即广播给主窗口 */}
            <p className="mb-2 text-sm text-text-1">{t("S.X.Design.Title")}</p>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {DESIGNS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDesign(d)}
                  className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                    design === d ? "border-accent bg-selected" : "border-divider hover:bg-card-hover"
                  }`}
                >
                  <span className="text-sm text-text-1">{t(DESIGN_LABEL_KEY[d])}</span>
                  <span className="text-[11px] leading-tight text-muted">
                    {t(DESIGN_DESC_KEY[d])}
                  </span>
                </button>
              ))}
              {/* 自定义版式:右上角 × 删除;描述展示基于哪套 + 勾选框覆盖摘要 */}
              {customDesigns.map((c) => {
                const val = `custom:${c.id}`;
                const parts = [
                  c.shape && (c.shape === "square" ? t("S.X.Checkbox.Square") : t("S.X.Checkbox.Round")),
                  c.size && `${c.size}px`,
                  c.width && `${c.width}px`,
                  c.progress &&
                    t(
                      { count: "S.X.Progress.Count", bar: "S.X.Progress.Bar", ring: "S.X.Progress.Ring" }[
                        c.progress
                      ] ?? "",
                    ),
                ].filter(Boolean);
                return (
                  <div
                    key={c.id}
                    className={`relative flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 ${
                      design === val ? "border-accent bg-selected" : "border-divider hover:bg-card-hover"
                    }`}
                  >
                    <button onClick={() => setDesign(val)} className="min-w-0 pr-4 text-left">
                      <span className="block truncate text-sm text-text-1">
                        {t("S.X.Design.Custom")} · {t(DESIGN_LABEL_KEY[c.base])}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-muted">
                        {parts.join(" · ") || t("S.X.Checkbox.FollowVersion")}
                      </span>
                    </button>
                    <button
                      title={t("S.X.Delete")}
                      onClick={() => deleteCustomDesign(c.id)}
                      className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded text-muted hover:text-overdue"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 勾选框:在当前版式上改任意一项即派生「自定义版式」(不影响内置版式) */}
            <p className="mb-2 text-sm text-text-1">{t("S.X.Checkbox.Title")}</p>
            {(() => {
              const ac = design.startsWith("custom:")
                ? customDesigns.find((c) => c.id === design.slice(7))
                : null;
              const cbShape = ac?.shape ?? "";
              const cbSize = ac?.size ?? "";
              const cbWidth = ac?.width ?? "";
              const cbProgress = ac?.progress ?? "";
              // 当前生效版式的基础版式 → 取其勾选框真实默认值,用于「跟随版式」时显示
              const baseKey = ac ? ac.base : design;
              const defs =
                (DESIGN_CHECKBOX_DEFAULT as Record<string, { size: number; width: number }>)[
                  baseKey
                ] ?? DESIGN_CHECKBOX_DEFAULT.linear;
              const shapeOpts: { v: string; key: string }[] = [
                { v: "", key: "S.X.Checkbox.FollowVersion" },
                { v: "round", key: "S.X.Checkbox.Round" },
                { v: "square", key: "S.X.Checkbox.Square" },
              ];
              const progressOpts: { v: string; key: string }[] = [
                { v: "", key: "S.X.Checkbox.FollowVersion" },
                { v: "count", key: "S.X.Progress.Count" },
                { v: "bar", key: "S.X.Progress.Bar" },
                { v: "ring", key: "S.X.Progress.Ring" },
              ];
              return (
                <div className="mb-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-text-2">{t("S.X.Checkbox.Shape")}</span>
                    <div className="flex flex-1 gap-1.5">
                      {shapeOpts.map((o) => (
                        <button
                          key={o.v}
                          onClick={() => editCheckbox("shape", o.v)}
                          className={`flex-1 rounded-md border px-1 py-1 text-xs transition-colors ${
                            cbShape === o.v
                              ? "border-accent bg-selected text-text-1"
                              : "border-divider text-text-2 hover:bg-card-hover"
                          }`}
                        >
                          {t(o.key)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 大小:跟随版式开关 + 滑块(14–28) */}
                  <Toggle
                    label={`${t("S.X.Checkbox.Size")} · ${t("S.X.Checkbox.FollowVersion")}`}
                    checked={cbSize === ""}
                    onChange={(v) => editCheckbox("size", v ? "" : String(defs.size))}
                  />
                  <label className={`mt-1 mb-2 flex items-center gap-2 ${cbSize === "" ? "opacity-50" : ""}`}>
                    <span className="w-12 shrink-0 text-xs text-text-2">{t("S.X.Checkbox.Size")}</span>
                    <input
                      type="range"
                      min={14}
                      max={28}
                      step={1}
                      disabled={cbSize === ""}
                      value={cbSize || defs.size}
                      onChange={(e) => editCheckbox("size", e.target.value)}
                      className="min-w-0 flex-1 accent-(--accent) disabled:cursor-not-allowed"
                    />
                    <span className="w-10 text-right text-xs text-muted">{cbSize || defs.size}</span>
                  </label>
                  {/* 粗细:跟随版式开关 + 滑块(1–4) */}
                  <Toggle
                    label={`${t("S.X.Checkbox.Width")} · ${t("S.X.Checkbox.FollowVersion")}`}
                    checked={cbWidth === ""}
                    onChange={(v) => editCheckbox("width", v ? "" : String(defs.width))}
                  />
                  <label className={`mt-1 flex items-center gap-2 ${cbWidth === "" ? "opacity-50" : ""}`}>
                    <span className="w-12 shrink-0 text-xs text-text-2">{t("S.X.Checkbox.Width")}</span>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={0.5}
                      disabled={cbWidth === ""}
                      value={cbWidth || defs.width}
                      onChange={(e) => editCheckbox("width", e.target.value)}
                      className="min-w-0 flex-1 accent-(--accent) disabled:cursor-not-allowed"
                    />
                    <span className="w-10 text-right text-xs text-muted">{cbWidth || defs.width}</span>
                  </label>
                  {/* 子任务进度显示:数字 / 直线 / 圆环(改即派生自定义版式) */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-12 shrink-0 text-xs text-text-2">
                      {t("S.X.Progress.Title")}
                    </span>
                    <div className="flex flex-1 gap-1.5">
                      {progressOpts.map((o) => (
                        <button
                          key={o.v}
                          onClick={() => editCheckbox("progress", o.v)}
                          className={`flex-1 rounded-md border px-1 py-1 text-xs transition-colors ${
                            cbProgress === o.v
                              ? "border-accent bg-selected text-text-1"
                              : "border-divider text-text-2 hover:bg-card-hover"
                          }`}
                        >
                          {t(o.key)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

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
            {/* 字体(并入外观) */}
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
          </>
        )}

        {section === "general" && (
          <>
            <Toggle
              label={t("S.Settings.AutoStart")}
              desc={t("S.Settings.AutoStartDesc")}
              checked={autostart}
              onChange={(v) => {
                setAutostart(v);
                void ipc.setAutostart(v).catch(() => setAutostart(!v));
                // 记录用户手动选择:关闭→标记 disabled(启动不再自动开);开启→清除标记
                saveSetting("autostart_disabled", v ? "0" : "1");
              }}
            />
            <Toggle
              label={t("S.Settings.Holidays")}
              desc={t("S.Settings.HolidaysDesc")}
              checked={flag("show_holidays", true)}
              onChange={setFlag("show_holidays")}
            />
            <div className="my-2 h-px bg-divider" />
            {/* 全局快捷键:召唤窗口 + 切换视图(可改) */}
            <div className="py-1">
              <span className="block text-sm text-text-1">{t("S.X.Hotkeys")}</span>
              <span className="mt-0.5 mb-1 block text-xs text-muted">{t("S.X.HotkeysDesc")}</span>
              <HotkeyRecorder label={t("S.X.HotkeyClipboard")} settingKey="hotkey_clipboard" def="Alt+1" />
              <HotkeyRecorder label={t("S.X.HotkeyNotes")} settingKey="hotkey_notes" def="Alt+2" />
              <HotkeyRecorder label={t("S.X.HotkeyTagboard")} settingKey="hotkey_tagboard" def="Alt+3" />
              <HotkeyRecorder label={t("S.X.HotkeyQuadrant")} settingKey="hotkey_quadrant" def="Alt+4" />
              <HotkeyRecorder label={t("S.X.HotkeyAll")} settingKey="hotkey_all" def="Alt+5" />
            </div>
            <div className="my-2 h-px bg-divider" />
            {/* 数据存储位置:显示当前位置 + 选择新位置(迁移全部数据,需重启) */}
            <div className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.X.DataLocation")}</span>
                <span className="mt-0.5 block text-xs text-muted">{t("S.X.DataLocationDesc")}</span>
                <span className="mt-1 block break-all text-xs text-text-2" title={dataDir}>
                  {dataDir || "—"}
                </span>
              </span>
              <button
                onClick={() => void changeDataLocation()}
                disabled={migrating}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover disabled:opacity-50"
              >
                {migrating ? t("S.X.DataLocationMigrating") : t("S.X.DataLocationPick")}
              </button>
            </div>
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

        {section === "clipboard" && (
          <>
            {/* 剪切板:过期清理时长 + 重复内容移到最前(独立分组) */}
            <label className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.X.ClipExpiry")}</span>
                <span className="mt-0.5 block text-xs text-muted">{t("S.X.ClipExpiryDesc")}</span>
              </span>
              <select
                value={settings["clip_expiry"] || "never"}
                onChange={(e) => saveSetting("clip_expiry", e.target.value)}
                className="mt-0.5 shrink-0 rounded-md border border-divider bg-input px-2 py-1 text-xs text-text-1 outline-none focus:border-accent"
              >
                <option value="never">{t("S.X.ClipExpiryNever")}</option>
                <option value="7d">{t("S.X.ClipExpiry7d")}</option>
                <option value="1m">{t("S.X.ClipExpiry1m")}</option>
                <option value="3m">{t("S.X.ClipExpiry3m")}</option>
                <option value="1y">{t("S.X.ClipExpiry1y")}</option>
              </select>
            </label>
            <div className="my-2 h-px bg-divider" />
            <Toggle
              label={t("S.X.ClipDedup")}
              desc={t("S.X.ClipDedupDesc")}
              checked={flag("clip_dedup", true)}
              onChange={setFlag("clip_dedup")}
            />
            <Toggle
              label={t("S.Settings.ClipPasteDblClick")}
              desc={t("S.Settings.ClipPasteDblClickDesc")}
              checked={flag("clip_paste_double_click", true)}
              onChange={setFlag("clip_paste_double_click")}
            />
            <label className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.Settings.ClipPasteKeys")}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t("S.Settings.ClipPasteKeysDesc")}
                </span>
              </span>
              <select
                value={settings["clip_paste_keys"] || "ctrl_v"}
                onChange={(e) => saveSetting("clip_paste_keys", e.target.value)}
                className="mt-0.5 shrink-0 rounded-md border border-divider bg-input px-2 py-1 text-xs text-text-1 outline-none focus:border-accent"
              >
                <option value="ctrl_v">Ctrl+V</option>
                <option value="shift_insert">Shift+Insert</option>
              </select>
            </label>
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
            {/* 手动检查更新:三态状态行(检查中/已是最新/检查失败),有新版弹更新对话框 */}
            <div className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.Settings.CheckUpdate")}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t("S.Settings.CheckUpdateDesc")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {checkStatus === "checking" && (
                  <span className="text-xs text-muted">{t("S.Update.Checking")}</span>
                )}
                {checkStatus === "latest" && (
                  <span className="text-xs text-text-2">{t("S.Update.UpToDate")}</span>
                )}
                {checkStatus === "failed" && (
                  <span className="text-xs text-red-500">{t("S.Update.CheckFailed")}</span>
                )}
                <button
                  onClick={() => void startCheckUpdate()}
                  disabled={checkBusy}
                  className="rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover disabled:opacity-50"
                >
                  {t("S.Settings.CheckUpdate")}
                </button>
              </span>
            </div>
            {/* 重新安装/修复当前版本:按当前版本 tag 重新下载同一发布并换壳重启 */}
            <div className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.Settings.Reinstall")}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t("S.Settings.ReinstallDesc")}
                </span>
              </span>
              <button
                onClick={() => void startReinstall()}
                disabled={reinstallBusy}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover disabled:opacity-50"
              >
                {t("S.Settings.ReinstallBtn")}
              </button>
            </div>
            {/* 手动下载:用默认浏览器打开最新发布页,手动下载最新版(应用内更新/重装失败时的兜底入口) */}
            <div className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text-1">{t("S.Update.ManualDownload")}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t("S.Settings.ManualDownloadDesc")}
                </span>
              </span>
              <button
                onClick={() => void openDownloadUrl(LATEST_RELEASE_PAGE)}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover"
              >
                {t("S.Update.ManualDownload")}
              </button>
            </div>
          </>
        )}
      </div>
      {reinstallInfo && (
        <UpdateDialog info={reinstallInfo} onClose={() => setReinstallInfo(null)} />
      )}
      {updateInfo && (
        <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />
      )}
    </div>
  );
}
