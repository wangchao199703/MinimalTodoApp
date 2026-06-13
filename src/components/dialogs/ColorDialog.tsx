import { useRef } from "react";
import { Ban, Check } from "lucide-react";
import { TAG_COLORS } from "../../lib/groupIcons";
import { t } from "../../lib/i18n";
import Modal from "../ui/Modal";

/**
 * 通用「修改颜色」对话框(与标签 TagColorDialog 同版式,但颜色值由调用方持有):
 * 预设色板点击即应用 + 自定义取色 + 「无色」清除。用于侧栏内置项 / 便签分组等无 color 字段的对象。
 */
export default function ColorDialog({
  value,
  onPick,
  onClear,
  onClose,
}: {
  value: string;
  onPick: (color: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const timer = useRef<number | null>(null);

  const apply = (color: string, close = true) => {
    onPick(color);
    if (close) onClose();
  };
  // 原生取色器拖动时 input 连发,防抖落库(不关闭弹窗)
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
            {value.toUpperCase() === c.toUpperCase() && (
              <Check size={14} strokeWidth={3} className="text-white" />
            )}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-2 hover:text-text-1">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3B82F6"}
            onChange={(e) => applyDebounced(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          {t("S.IconCat.Custom")}
        </label>
        <button
          onClick={() => {
            onClear();
            onClose();
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-2 hover:bg-card-hover hover:text-text-1"
        >
          <Ban size={13} />
          {t("S.X.NoColor")}
        </button>
      </div>
    </Modal>
  );
}
