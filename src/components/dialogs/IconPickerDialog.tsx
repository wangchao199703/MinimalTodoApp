import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { ICON_CATEGORIES, ICON_FONT } from "../../lib/groupIcons";
import { t } from "../../lib/i18n";
import { ipc, type Group } from "../../lib/tauri-ipc";
import Modal from "../ui/Modal";
import { ensureGroupIconDir, resolveGroupIcon } from "../ui/TagIcon";

const IMG_EXT = new Set(["png", "jpg", "jpeg", "ico", "bmp", "gif", "webp"]);

function extOf(file: File): string {
  const byName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMG_EXT.has(byName)) return byName;
  const byType = file.type.split("/").pop()?.toLowerCase() ?? "";
  return IMG_EXT.has(byType) ? byType : "png";
}

/**
 * 标签图标选择器:分类字形网格 + 「自定义」分类导入图片(对齐旧版 IconPickerDialog)。
 * 点击字形/图片即应用并关闭。
 */
export default function IconPickerDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const patchGroup = useAppStore((s) => s.patchGroup);
  // -1 = 自定义图片分类,0.. = 内置字形分类
  const [cat, setCat] = useState(0);
  const [customImages, setCustomImages] = useState<string[]>([]);

  // 进入自定义分类时拉取已导入图片列表
  useEffect(() => {
    if (cat !== -1) return;
    void ensureGroupIconDir();
    void ipc.listGroupIcons().then(setCustomImages);
  }, [cat]);

  const pickGlyph = (glyph: string) => {
    // 选字形时清空自定义图片(对齐旧版 SetGroupIcon)
    void patchGroup({ id: group.id, icon: glyph, icon_image: "" });
    onClose();
  };

  const pickImage = (name: string) => {
    // 选图片时清空字形(图片优先渲染,清字形保持数据干净)
    void patchGroup({ id: group.id, icon: "", icon_image: `groupicon://${name}` });
    onClose();
  };

  const importImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await ensureGroupIconDir();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = await ipc.saveGroupIcon(bytes, extOf(file));
      pickImage(name);
    };
    input.click();
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
        <button
          onClick={() => setCat(-1)}
          className={`rounded-md px-2.5 py-1 text-xs ring-1 ${
            cat === -1
              ? "bg-selected text-text-1 ring-accent"
              : "bg-input text-text-2 ring-divider hover:text-text-1"
          }`}
        >
          {t("S.IconCat.Custom")}
        </button>
      </div>

      {cat === -1 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          <button
            onClick={importImage}
            className="flex h-9 items-center justify-center rounded-md bg-input px-3 text-xs text-text-2 ring-1 ring-divider hover:text-text-1"
          >
            {t("S.IconPicker.Import")}
          </button>
          {customImages.map((name) => (
            <button
              key={name}
              onClick={() => pickImage(name)}
              className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-md hover:bg-card-hover ${
                group.icon_image === `groupicon://${name}` ? "bg-selected ring-1 ring-accent" : ""
              }`}
            >
              <img
                src={resolveGroupIcon(`groupicon://${name}`)}
                alt=""
                className="h-6 w-6 rounded-sm object-cover"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1">
          {ICON_CATEGORIES[cat].glyphs.map((glyph, i) => (
            <button
              key={`${glyph}-${i}`}
              onClick={() => pickGlyph(glyph)}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-card-hover ${
                group.icon === glyph && !group.icon_image ? "bg-selected ring-1 ring-accent" : ""
              }`}
              style={{ fontFamily: ICON_FONT, color: group.color }}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
