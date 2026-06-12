import { useRef } from "react";
import { Check } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { TAG_COLORS } from "../../lib/groupIcons";
import { t } from "../../lib/i18n";
import type { Group } from "../../lib/tauri-ipc";
import Modal from "../ui/Modal";

/** 标签颜色选择:预设色板点击即应用 + 自定义取色(对齐旧版「修改颜色」) */
export default function TagColorDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const patchGroup = useAppStore((s) => s.patchGroup);
  const timer = useRef<number | null>(null);

  const apply = (color: string, close = true) => {
    void patchGroup({ id: group.id, color });
    if (close) onClose();
  };

  // 原生取色器拖动时 input 事件连发,防抖落库
  const applyDebounced = (color: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => apply(color, false), 200);
  };

  return (
    <Modal title={t("S.Group.ChangeColor")} onClose={onClose} width={280}>
      <div className="grid grid-cols-6 gap-2">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => apply(c)}
            className="flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-divider hover:scale-110"
            style={{ background: c }}
          >
            {group.color.toUpperCase() === c.toUpperCase() && (
              <Check size={14} strokeWidth={3} className="text-white" />
            )}
          </button>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-text-2 hover:text-text-1">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(group.color) ? group.color : "#3B82F6"}
          onChange={(e) => applyDebounced(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        {t("S.IconCat.Custom")}
      </label>
    </Modal>
  );
}
