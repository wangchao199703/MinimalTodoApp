import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { COLOR_KEYS, resolveTheme, type ThemeMeta } from "../../lib/themes";
import { t } from "../../lib/i18n";
import Modal from "../ui/Modal";

/** 颜色键的中文释义(编辑器内部说明,与 ColorKeys 一一对应) */
const KEY_LABEL: Record<string, { zh: string; en: string }> = {
  WindowBg: { zh: "窗口背景", en: "Window" },
  TitleBarBg: { zh: "标题栏", en: "Title bar" },
  SidebarBg: { zh: "侧栏", en: "Sidebar" },
  ContentBg: { zh: "内容区", en: "Content" },
  CardBg: { zh: "卡片", en: "Card" },
  CardHoverBg: { zh: "卡片悬停", en: "Card hover" },
  InputBg: { zh: "输入框", en: "Input" },
  PrimaryText: { zh: "主文字", en: "Text" },
  SecondaryText: { zh: "次级文字", en: "Secondary" },
  MutedText: { zh: "弱文字", en: "Muted" },
  Accent: { zh: "强调色", en: "Accent" },
  AccentText: { zh: "强调色文字", en: "On accent" },
  Divider: { zh: "分割线", en: "Divider" },
  SelectedItemBg: { zh: "选中背景", en: "Selected" },
  OverdueText: { zh: "逾期红", en: "Overdue" },
  WarningText: { zh: "警告黄", en: "Warning" },
  SuccessText: { zh: "成功绿", en: "Success" },
  PopupBg: { zh: "弹窗背景", en: "Popup" },
};

/** 仅支持 #RRGGBB 的取色器;含 alpha 的旧值取 RGB 部分 */
function toPickerHex(v: string): string {
  const h = v.replace("#", "");
  return "#" + (h.length === 8 ? h.slice(2) : h).toLowerCase();
}

export default function ThemeEditor(props: { existing?: ThemeMeta; onClose: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const customThemes = useAppStore((s) => s.customThemes);
  const language = useAppStore((s) => s.language);
  const saveCustomTheme = useAppStore((s) => s.saveCustomTheme);
  const setTheme = useAppStore((s) => s.setTheme);

  // 新建时以当前主题为底稿
  const base = props.existing
    ? { ...resolveTheme("Light", []), ...props.existing.colors }
    : resolveTheme(
        theme,
        customThemes.map((c) => ({ key: c.key, group: "Custom", colors: c.colors, custom: true })),
      );

  const [name, setName] = useState(
    props.existing?.display ?? (language === "en" ? "My theme" : "我的主题"),
  );
  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(COLOR_KEYS.map((k) => [k, toPickerHex(base[k] ?? "#ffffff")])),
  );

  const save = async () => {
    const key = props.existing?.key ?? `Custom_${Date.now().toString(36)}`;
    await saveCustomTheme({ key, display: name.trim() || key, colors });
    setTheme(key);
    props.onClose();
  };

  const zh = language !== "en";

  return (
    <Modal
      title={t("S.X.ThemeEditorTitle")}
      onClose={props.onClose}
      width={440}
      footer={
        <>
          <button
            onClick={props.onClose}
            className="rounded-md px-3 py-1.5 text-xs text-text-2 hover:bg-card-hover"
          >
            {t("S.Cancel")}
          </button>
          <button
            onClick={() => void save()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90"
          >
            {t("S.Save")}
          </button>
        </>
      }
    >
      <label className="mb-3 block">
        <span className="mb-1 block text-xs text-muted">{t("S.X.ThemeName")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md bg-input px-2 py-1.5 text-sm text-text-1 ring-1 ring-divider outline-none focus:ring-accent"
        />
      </label>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {COLOR_KEYS.map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="color"
              value={colors[k]}
              onChange={(e) => setColors((c) => ({ ...c, [k]: e.target.value }))}
              className="h-6 w-8 shrink-0 cursor-pointer rounded border border-divider bg-transparent"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-text-2">
              {zh ? KEY_LABEL[k].zh : KEY_LABEL[k].en}
            </span>
            <span className="font-mono text-[10px] text-muted">{colors[k]}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
