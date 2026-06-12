import { Tag } from "lucide-react";
import { ICON_FONT } from "../../lib/groupIcons";

/** 标签图标:有自定义字形(Segoe Fluent Icons)用字形,否则回退 lucide Tag */
export default function TagIcon({
  icon,
  color,
  size = 14,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  if (icon) {
    return (
      <span
        className="flex shrink-0 items-center justify-center leading-none"
        style={{ fontFamily: ICON_FONT, color, fontSize: size, width: size, height: size }}
      >
        {icon}
      </span>
    );
  }
  return <Tag size={size} className="shrink-0" style={{ color }} />;
}
