import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Aperture,
  CalendarDays,
  Check,
  CircleDot,
  CircleHelp,
  Droplets,
  FileText,
  FileUp,
  Hexagon,
  Leaf,
  ListChecks,
  Menu,
  Minus,
  Palette,
  Pin,
  RefreshCw,
  Settings,
  Sparkle,
  Sparkles,
  Square,
  SunMedium,
  Sunset,
  Trees,
  Triangle,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ipc } from "../lib/tauri-ipc";
import { t } from "../lib/i18n";
import { THEME_LABELS, THEME_PREVIEW, type Theme } from "../lib/themes";
import { checkForUpdate, type UpdateInfo } from "../lib/updater";
import { Popover, MenuItem } from "./ui/Popover";
import UpdateDialog from "./dialogs/UpdateDialog";
import HelpDialog from "./dialogs/HelpDialog";
import ImportExportDialog from "./dialogs/ImportExportDialog";
import Modal from "./ui/Modal";
import SettingsPanel from "./dialogs/SettingsPanel";
import { isTauri } from "../lib/env";

/** 两个家族,排序:浅色 → 深色 → 渐变玻璃(分组间插分隔线) */
const THEME_OPTIONS: { key: Theme; icon: typeof Palette; divider?: boolean }[] = [
  { key: "light-classic", icon: SunMedium },
  { key: "light-grove", icon: Trees },
  { key: "light-notion", icon: FileText },
  { key: "light-things", icon: Sparkle },
  { key: "light-ticktick", icon: ListChecks },
  { key: "dark-onyx", icon: Hexagon, divider: true },
  { key: "dark-dusk", icon: Aperture },
  { key: "dark-oled", icon: Zap },
  { key: "dark-linear", icon: Triangle },
  { key: "glass", icon: Sparkles, divider: true },
  { key: "glass-ocean", icon: Waves },
  { key: "glass-forest", icon: Leaf },
  { key: "glass-sunset", icon: Sunset },
  { key: "glass-light", icon: Droplets },
  { key: "glass-dark", icon: CircleDot },
];

export default function TitleBar() {
  // 延迟到组件内取窗口句柄(Web 无 Tauri,模块加载期调 getCurrentWindow() 会抛)
  const win = isTauri ? getCurrentWindow() : null;
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const pushToast = useAppStore((s) => s.pushToast);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [themeAnchor, setThemeAnchor] = useState<HTMLElement | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const manualCheck = () => {
    pushToast(t("S.Update.Checking"));
    // 三态反馈:有新版弹对话框;已是最新 / 检查失败各给明确 Toast(对齐 WPF 手动检查)
    void checkForUpdate(true)
      .then((info) => {
        if (info) setUpdateInfo(info);
        else pushToast(t("S.Update.UpToDate"));
      })
      .catch(() => pushToast(t("S.Update.CheckFailed")));
  };

  const scheduleOpen = useAppStore((s) => s.scheduleOpen);
  const setScheduleOpen = useAppStore((s) => s.setScheduleOpen);
  const onTop = settings["always_on_top"] === "1";
  const toggleOnTop = () => {
    void win?.setAlwaysOnTop(!onTop);
    saveSetting("always_on_top", onTop ? "0" : "1");
  };

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center border-b border-divider bg-titlebar px-2"
    >
      <div className="ml-auto flex items-center gap-0.5">
        <button
          title={t("S.X.Calendar")}
          onClick={() => {
            // 打开前同步读取待办列当前宽度并锁定(此刻 main 仍是全宽,日历尚未渲染)
            if (!scheduleOpen) {
              const w = (document.querySelector("main") as HTMLElement | null)?.offsetWidth;
              if (w) useAppStore.setState({ lockedTaskWidth: w });
            }
            setScheduleOpen(!scheduleOpen);
          }}
          className={`flex h-7 w-7 items-center justify-center rounded hover:bg-card-hover ${
            scheduleOpen ? "text-accent" : "text-text-2"
          }`}
        >
          <CalendarDays size={13} />
        </button>
        {isTauri && (
          <button
            title={t("S.AlwaysOnTop")}
            onClick={toggleOnTop}
            className={`flex h-7 w-7 items-center justify-center rounded hover:bg-card-hover ${
              onTop ? "text-accent" : "text-text-2"
            }`}
          >
            <Pin size={13} fill={onTop ? "currentColor" : "none"} />
          </button>
        )}
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
          title={t("S.Tip.Menu")}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <Menu size={14} />
        </button>
        {isTauri && (
          <>
            <button
              title={t("S.X.Minimize")}
              onClick={() => void win?.hide()}
              className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
            >
              <Minus size={14} />
            </button>
            <button
              title={t("S.X.ToggleMax")}
              onClick={() => void win?.toggleMaximize()}
              className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
            >
              <Square size={11} />
            </button>
            <button
              title={t("S.Close")}
              onClick={() => void win?.hide()}
              className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-red-500 hover:text-white"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {menuAnchor && (
        <Popover anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="w-44">
            <MenuItem
              onClick={() => {
                // 桌面:独立设置窗口;Web:内联模态(单窗口环境)
                if (isTauri) void ipc.openSettingsWindow();
                else setSettingsOpen(true);
                setMenuAnchor(null);
              }}
            >
              <Settings size={13} />
              {t("S.MenuSettings")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setIoOpen(true);
                setMenuAnchor(null);
              }}
            >
              <FileUp size={13} />
              {t("S.ImportExport")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setHelpOpen(true);
                setMenuAnchor(null);
              }}
            >
              <CircleHelp size={13} />
              {t("S.Help.Title")}
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
          <div className="max-h-[70vh] w-44 overflow-y-auto">
            {THEME_OPTIONS.map(({ key, icon: Icon, divider }) => (
              <div key={key}>
                {divider && <div className="my-1 h-px bg-divider" />}
                <MenuItem
                  onClick={() => {
                    setTheme(key);
                    setThemeAnchor(null);
                  }}
                >
                  <Icon size={13} />
                  {THEME_LABELS[key]}
                  <span className="ml-auto flex items-center gap-1.5">
                    {theme === key && <Check size={12} className="text-accent" />}
                    {/* 色系预览:底色 | 强调色 */}
                    <span
                      className="h-3.5 w-7 shrink-0 rounded-full ring-1 ring-divider"
                      style={{
                        background: `linear-gradient(115deg, ${THEME_PREVIEW[key].bg} 55%, ${THEME_PREVIEW[key].accent} 55%)`,
                      }}
                    />
                  </span>
                </MenuItem>
              </div>
            ))}
          </div>
        </Popover>
      )}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {ioOpen && <ImportExportDialog onClose={() => setIoOpen(false)} />}
      {updateInfo && <UpdateDialog info={updateInfo} onClose={() => setUpdateInfo(null)} />}
      {settingsOpen && (
        <Modal title={t("S.MenuSettings")} onClose={() => setSettingsOpen(false)} width={640}>
          <SettingsPanel />
        </Modal>
      )}
    </header>
  );
}
