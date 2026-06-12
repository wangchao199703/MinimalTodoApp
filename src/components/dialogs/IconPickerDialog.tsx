import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { ICON_CATEGORIES, ICON_FONT } from "../../lib/groupIcons";
import { t } from "../../lib/i18n";
import type { Group } from "../../lib/tauri-ipc";
import Modal from "../ui/Modal";

/** 标签图标选择器:分类字形网格,点击即应用并关闭(对齐旧版 IconPickerDialog) */
export default function IconPickerDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const patchGroup = useAppStore((s) => s.patchGroup);
  const [cat, setCat] = useState(0);

  const pick = (glyph: string) => {
    // 选字形时清空自定义图片(对齐旧版 SetGroupIcon)
    void patchGroup({ id: group.id, icon: glyph, icon_image: "" });
    onClose();
  };

  return (
    <Modal title={t("S.IconPicker.Title")} onClose={onClose} width={340}>
      <div className="flex flex-wrap gap-1.5">
        {ICON_CATEGORIES.map((c, i) => (
          <button
            key={c.nameKey}
            onClick={() => setCat(i)}
            className={`rounded-md px-2.5 py-1 text-xs ring-1 ${
              cat === i
                ? "bg-selected text-text-1 ring-accent"
                : "bg-input text-text-2 ring-divider hover:text-text-1"
            }`}
          >
            {t(c.nameKey)}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {ICON_CATEGORIES[cat].glyphs.map((glyph, i) => (
          <button
            key={`${glyph}-${i}`}
            onClick={() => pick(glyph)}
            className={`flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-card-hover ${
              group.icon === glyph ? "bg-selected ring-1 ring-accent" : ""
            }`}
            style={{ fontFamily: ICON_FONT, color: group.color }}
          >
            {glyph}
          </button>
        ))}
      </div>
    </Modal>
  );
}
