import { ArrowUpRight, Copy, Download, Pencil, Pin, Square, Undo2, X } from "lucide-react";
import type { Tool } from "./shapes";
import { t } from "../../lib/i18n";

/** 标注可选颜色 */
const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff", "#111111"];

interface Props {
  tool: Tool;
  onTool: (tool: Tool) => void;
  color: string;
  onColor: (color: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onCopy: () => void;
  onSave: () => void;
  onPin: () => void;
  onCancel: () => void;
  left: number;
  top: number;
}

/** 选区工具栏:固定深色样式(浮在任意截图内容上,不随应用主题),跟随选区定位。 */
export default function CaptureToolbar(props: Props) {
  const { tool, onTool, color, onColor } = props;

  const toolBtn = (kind: Tool, icon: React.ReactNode, label: string) => (
    <button
      title={label}
      onClick={() => onTool(tool === kind ? "select" : kind)}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        tool === kind ? "bg-blue-500 text-white" : "text-zinc-200 hover:bg-white/15"
      }`}
    >
      {icon}
    </button>
  );

  const actionBtn = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-zinc-200 transition-colors ${
        danger ? "hover:bg-red-500 hover:text-white" : "hover:bg-white/15"
      }`}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="pointer-events-auto fixed z-[400] flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900/95 px-1.5 py-1 shadow-2xl backdrop-blur"
      style={{ left: props.left, top: props.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {toolBtn("pen", <Pencil size={16} />, t("S.X.CapturePen"))}
      {toolBtn("arrow", <ArrowUpRight size={16} />, t("S.X.CaptureArrow"))}
      {toolBtn("rect", <Square size={16} />, t("S.X.CaptureRect"))}

      <span className="mx-0.5 h-5 w-px bg-white/15" />

      {COLORS.map((c) => (
        <button
          key={c}
          title={c}
          onClick={() => onColor(c)}
          className={`h-5 w-5 rounded-full border transition-transform hover:scale-110 ${
            color === c ? "border-white ring-2 ring-blue-400" : "border-white/30"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}

      <span className="mx-0.5 h-5 w-px bg-white/15" />

      {actionBtn(<Undo2 size={16} className={props.canUndo ? "" : "opacity-30"} />, t("S.X.CaptureUndo"), props.onUndo)}
      {actionBtn(<Copy size={16} />, t("S.X.CaptureCopy"), props.onCopy)}
      {actionBtn(<Download size={16} />, t("S.X.CaptureSave"), props.onSave)}
      {actionBtn(<Pin size={16} />, t("S.X.CapturePin"), props.onPin)}
      {actionBtn(<X size={16} />, t("S.X.CaptureCancel"), props.onCancel, true)}
    </div>
  );
}
