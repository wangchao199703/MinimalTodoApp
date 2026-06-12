import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CalendarDays,
  Check,
  Leaf,
  Menu,
  Minus,
  Moon,
  Palette,
  Pin,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  Sun,
  Sunset,
  Waves,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { t } from "../lib/i18n";
import { THEME_LABELS, type Theme } from "../lib/themes";
import { checkForUpdate, type UpdateInfo } from "../lib/updater";
import { Popover, MenuItem } from "./ui/Popover";
import SettingsDialog from "./dialogs/SettingsDialog";
import UpdateDialog from "./dialogs/UpdateDialog";

/** 玻璃系四色 + 经典浅色/深色 */
const THEME_OPTIONS: { key: Theme; icon: typeof Sun }[] = [
  { key: "glass", icon: Sparkles },
  { key: "glass-ocean", icon: Waves },
  { key: "glass-forest", icon: Leaf },
  { key: "glass-sunset", icon: Sunset },
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
];

const win = getCurrentWindow();

export default function TitleBar() {
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const pushToast = useAppStore((s) => s.pushToast);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<HTMLElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const manualCheck = () => {
    pushToast(t("S.Update.Checking"));
    void checkForUpdate(true).then((info) => {
      if (info) setUpdateInfo(info);
    });
  };

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
          title={`${t("S.MenuTheme")}: ${THEME_LABELS[theme]}`}
          onClick={(e) => setThemeAnchor(e.currentTarget)}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          {(() => {
            const Icon = THEME_OPTIONS.find((o) => o.key === theme)?.icon ?? Palette;
            return <Icon size={14} />;
          })()}
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
                manualCheck();
                setMenuAnchor(null);
              }}
            >
              <RefreshCw size={13} />
              {t("S.Settings.CheckUpdate")}
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

      {themeAnchor && (
        <Popover anchor={themeAnchor} onClose={() => setThemeAnchor(null)}>
          <div className="w-36">
            {THEME_OPTIONS.map(({ key, icon: Icon }) => (
              <MenuItem
                key={key}
                onClick={() => {
                  setTheme(key);
                  setThemeAnchor(null);
                }}
              >
                <Icon size={13} />
                {THEME_LABELS[key]}
                {theme === key && <Check size={12} className="ml-auto text-accent" />}
              </MenuItem>
            ))}
          </div>
        </Popover>
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {updateInfo && <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />}
    </header>
  );
}
