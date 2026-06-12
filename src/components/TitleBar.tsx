import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CalendarDays, Check, Menu, Minus, Palette, Pin, Settings, Square, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { t } from "../lib/i18n";
import { Popover, MenuItem } from "./ui/Popover";
import ThemePicker from "./dialogs/ThemePicker";
import SettingsDialog from "./dialogs/SettingsDialog";

const win = getCurrentWindow();

export default function TitleBar() {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const scheduleOpen = useAppStore((s) => s.scheduleOpen);
  const setScheduleOpen = useAppStore((s) => s.setScheduleOpen);
  const onTop = settings["always_on_top"] === "1";
  const toggleOnTop = () => {
    void win.setAlwaysOnTop(!onTop);
    saveSetting("always_on_top", onTop ? "0" : "1");
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center border-b border-divider bg-titlebar px-2"
    >
      <button
        title={t("S.Tip.Menu")}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
      >
        <Menu size={14} />
      </button>
      <span data-tauri-drag-region className="ml-1 text-xs font-medium text-text-2">
        {t("S.AppName")}
      </span>

      <div className="ml-auto flex items-center gap-0.5">
        <button
          title={t("S.X.Schedule")}
          onClick={() => setScheduleOpen(!scheduleOpen)}
          className={`flex h-7 w-7 items-center justify-center rounded hover:bg-card-hover ${
            scheduleOpen ? "text-accent" : "text-text-2"
          }`}
        >
          <CalendarDays size={13} />
        </button>
        <button
          title={t("S.AlwaysOnTop")}
          onClick={toggleOnTop}
          className={`flex h-7 w-7 items-center justify-center rounded hover:bg-card-hover ${
            onTop ? "text-accent" : "text-text-2"
          }`}
        >
          <Pin size={13} fill={onTop ? "currentColor" : "none"} />
        </button>
        <button
          title={t("S.MenuTheme")}
          onClick={() => setPickerOpen(true)}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <Palette size={14} />
        </button>
        <button
          title={t("S.X.Minimize")}
          onClick={() => void win.minimize()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <Minus size={14} />
        </button>
        <button
          title={t("S.X.ToggleMax")}
          onClick={() => void win.toggleMaximize()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <Square size={11} />
        </button>
        <button
          title={t("S.Close")}
          onClick={() => void win.close()}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-red-500 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {menuAnchor && (
        <Popover anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="w-44">
            <MenuItem
              onClick={() => {
                setSettingsOpen(true);
                setMenuAnchor(null);
              }}
            >
              <Settings size={13} />
              {t("S.MenuSettings")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setPickerOpen(true);
                setMenuAnchor(null);
              }}
            >
              <Palette size={13} />
              {t("S.MenuTheme")}
            </MenuItem>
            <div className="my-1 h-px bg-divider" />
            <div className="px-2.5 py-1 text-xs text-muted">{t("S.MenuLanguage")}</div>
            <MenuItem
              onClick={() => {
                setLanguage("zh-CN");
                setMenuAnchor(null);
              }}
            >
              中文
              {language === "zh-CN" && <Check size={12} className="ml-auto text-accent" />}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setLanguage("en");
                setMenuAnchor(null);
              }}
            >
              English
              {language === "en" && <Check size={12} className="ml-auto text-accent" />}
            </MenuItem>
          </div>
        </Popover>
      )}

      {pickerOpen && <ThemePicker onClose={() => setPickerOpen(false)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
