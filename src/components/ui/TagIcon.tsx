import { Tag } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ICON_FONT } from "../../lib/groupIcons";
import { ipc } from "../../lib/tauri-ipc";
import { isTauri } from "../../lib/env";
import { imageUrl } from "../../lib/backend/objectUrl";

/** 分组图标仓库目录(首次渲染自定义图标前由 IconPickerDialog/App 预取一次) */
let iconDir = "";
export async function ensureGroupIconDir(): Promise<void> {
  if (!iconDir) iconDir = await ipc.groupIconDir();
}

/**
 * 把 icon_image 解析为可渲染 URL:
 * - `groupicon://文件名` → 仓库目录 + 文件名(新数据)
 * - 旧版导入的绝对路径 → 直接经 asset 协议(文件仍在同目录 group-icons)
 */
export function resolveGroupIcon(src: string | null | undefined): string {
  if (!src) return "";
  if (src.startsWith("groupicon://")) {
    const name = src.slice("groupicon://".length);
    // Web:IndexedDB Blob 的 objectURL 缓存;桌面:asset 协议
    if (!isTauri) return imageUrl(name);
    return iconDir ? convertFileSrc(`${iconDir}\\${name}`) : "";
  }
  // 旧版绝对路径仅桌面有意义;Web 无法解析,返回空
  return isTauri ? convertFileSrc(src) : "";
}

/** 标签图标:优先自定义图片,其次自定义字形(Segoe Fluent Icons),否则回退 lucide Tag */
export default function TagIcon({
  icon,
  iconImage,
  color,
  size = 14,
}: {
  icon: string;
  /** 自定义图片:`groupicon://文件名` 或旧版绝对路径 */
  iconImage?: string;
  color: string;
  size?: number;
}) {
  if (iconImage) {
    return (
      <img
        src={resolveGroupIcon(iconImage)}
        alt=""
        className="shrink-0 rounded-sm object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
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
