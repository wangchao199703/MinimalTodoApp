import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  builtinThemes,
  themeDisplay,
  toCssColor,
  THEME_GROUP_ORDER,
  type ThemeMeta,
} from "../../lib/themes";
import { t } from "../../lib/i18n";
import type { CustomTheme } from "../../lib/tauri-ipc";
import Modal from "../ui/Modal";
import ThemeEditor from "./ThemeEditor";

function Swatch({ meta }: { meta: ThemeMeta }) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const favorites = useAppStore((s) => s.favoriteThemes);
  const toggleFavorite = useAppStore((s) => s.toggleFavoriteTheme);
  const deleteCustomTheme = useAppStore((s) => s.deleteCustomTheme);
  const [editing, setEditing] = useState(false);

  const active = theme === meta.key;
  const fav = favorites.includes(meta.key);
  const bg = meta.colors["PopupBg"] ?? meta.colors["WindowBg"] ?? "#FFFFFF";
  const text = meta.colors["PrimaryText"] ?? "#111111";
  const accent = meta.colors["Accent"] ?? "#3B82F6";

  return (
    <div className="group/swatch relative">
      <button
        onClick={() => setTheme(meta.key)}
        title={themeDisplay(meta)}
        className={`flex h-14 w-full flex-col items-center justify-center rounded-lg border-2 transition-all ${
          active ? "border-accent" : "border-divider hover:border-muted"
        }`}
        style={{ background: toCssColor(bg) }}
      >
        <span className="text-sm font-semibold" style={{ color: toCssColor(text) }}>
          Aa
        </span>
        <span className="mt-0.5 h-1 w-6 rounded-full" style={{ background: toCssColor(accent) }} />
      </button>
      <p className="mt-0.5 truncate text-center text-[11px] text-text-2">{themeDisplay(meta)}</p>

      <button
        title={fav ? t("S.X.Unfavorite") : t("S.X.Favorite")}
        onClick={() => toggleFavorite(meta.key)}
        className={`absolute top-0.5 right-0.5 hidden h-5 w-5 items-center justify-center rounded group-hover/swatch:flex ${
          fav ? "flex text-warning" : "text-muted hover:text-warning"
        }`}
      >
        <Star size={11} fill={fav ? "currentColor" : "none"} />
      </button>

      {meta.custom && (
        <span className="absolute top-0.5 left-0.5 hidden gap-0.5 group-hover/swatch:flex">
          <button
            title={t("S.X.Edit")}
            onClick={() => setEditing(true)}
            className="flex h-5 w-5 items-center justify-center rounded bg-popup/70 text-muted hover:text-text-1"
          >
            <Pencil size={10} />
          </button>
          <button
            title={t("S.X.Delete")}
            onClick={() => void deleteCustomTheme(meta.key)}
            className="flex h-5 w-5 items-center justify-center rounded bg-popup/70 text-muted hover:text-overdue"
          >
            <Trash2 size={10} />
          </button>
        </span>
      )}

      {editing && <ThemeEditor existing={meta} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function ThemePicker({ onClose }: { onClose: () => void }) {
  const customThemes = useAppStore((s) => s.customThemes);
  const favorites = useAppStore((s) => s.favoriteThemes);
  const [creating, setCreating] = useState(false);

  const customs: ThemeMeta[] = customThemes.map((c: CustomTheme) => ({
    key: c.key,
    group: "Custom",
    colors: c.colors,
    custom: true,
    display: c.display,
  }));
  const all = [...builtinThemes(), ...customs];
  const byKey = new Map(all.map((m) => [m.key, m]));

  const sections: { group: string; metas: ThemeMeta[] }[] = [];
  for (const group of THEME_GROUP_ORDER) {
    let metas: ThemeMeta[];
    if (group === "Favorites") {
      metas = favorites.map((k) => byKey.get(k)).filter((m): m is ThemeMeta => !!m);
    } else if (group === "Custom") {
      metas = customs;
    } else {
      metas = builtinThemes().filter((m) => m.group === group);
    }
    if (metas.length > 0) sections.push({ group, metas });
  }

  return (
    <Modal title={t("S.MenuTheme")} onClose={onClose} width={520}>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs text-on-accent hover:opacity-90"
        >
          <Plus size={12} />
          {t("S.X.ThemeEditorTitle")}
        </button>
      </div>
      {sections.map((sec) => (
        <div key={sec.group} className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-muted">{t("S.ThemeGroup." + sec.group)}</p>
          <div className="grid grid-cols-5 gap-2">
            {sec.metas.map((m) => (
              <Swatch key={m.key} meta={m} />
            ))}
          </div>
        </div>
      ))}
      {creating && <ThemeEditor onClose={() => setCreating(false)} />}
    </Modal>
  );
}
