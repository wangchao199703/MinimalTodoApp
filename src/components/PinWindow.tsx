import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { RotateCw, X } from "lucide-react";
import { ipc, type PinTarget } from "../lib/tauri-ipc";
import { useAppStore } from "../store/useAppStore";
import { t } from "../lib/i18n";

/** 阴影留白(物理像素),须与 Rust 端 PIN_SHADOW_MARGIN 一致 */
const MARGIN = 28;
const MIN_PHYS = 60;
const MAX_SCALE = 6;

// 同 CaptureOverlayWindow:StrictMode 双调挂载时,贴图元数据「取走即清空」,第二次取到 null 会误关窗口。
// 每个贴图窗都是独立页面,模块级标志保证只取一次。
let pinTaken = false;

/**
 * 桌面贴图悬浮窗(label = "pin-N")。无边框 + 透明 + 置顶;展示一张截图,
 * 可拖动移动、悬停右上角关闭、滚轮缩放、按钮旋转 90°、Ctrl+滚轮调透明度。
 * 图片元数据(路径 + 物理尺寸)经后端按 label 暂存,挂载后取走。
 */
export default function PinWindow() {
  useAppStore((s) => s.language); // 订阅语言:加载完成后触发重渲染,让 t() 取到正确语种
  const [target, setTarget] = useState<PinTarget | null>(null);
  const [scale, setScale] = useState(1);
  const [rot, setRot] = useState(0); // 0..3,每档 90°
  const [opacity, setOpacity] = useState(1);
  const sfRef = useRef(1);
  const labelRef = useRef(getCurrentWindow().label);

  useEffect(() => {
    if (pinTaken) return;
    pinTaken = true;
    void useAppStore.getState().initSettingsWindow();
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    void (async () => {
      sfRef.current = await getCurrentWindow().scaleFactor();
      const meta = await ipc.takePinTarget(labelRef.current);
      if (!meta) {
        await getCurrentWindow().close();
        return;
      }
      setTarget(meta);
    })();
  }, []);

  /** 缩放/旋转后,按新包围盒重设窗口大小并保持中心不动 */
  const applyGeometry = async (physW: number, physH: number, rotated: boolean) => {
    const boundW = rotated ? physH : physW;
    const boundH = rotated ? physW : physH;
    const newW = Math.round(boundW) + MARGIN * 2;
    const newH = Math.round(boundH) + MARGIN * 2;
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const cx = pos.x + size.width / 2;
    const cy = pos.y + size.height / 2;
    await win.setSize(new PhysicalSize(newW, newH));
    await win.setPosition(
      new PhysicalPosition(Math.round(cx - newW / 2), Math.round(cy - newH / 2)),
    );
  };

  const close = async () => {
    if (target) await ipc.unregisterPin(labelRef.current, target.path);
    await getCurrentWindow().close();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!target) return;
    if (e.ctrlKey) {
      setOpacity((o) => Math.min(1, Math.max(0.2, o + (e.deltaY < 0 ? 0.08 : -0.08))));
      return;
    }
    const next = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_PHYS / Math.min(target.phys_w, target.phys_h),
        scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1),
      ),
    );
    setScale(next);
    void applyGeometry(target.phys_w * next, target.phys_h * next, rot % 2 === 1);
  };

  const rotate = () => {
    if (!target) return;
    const next = (rot + 1) % 4;
    setRot(next);
    void applyGeometry(target.phys_w * scale, target.phys_h * scale, next % 2 === 1);
  };

  if (!target) return <div className="fixed inset-0" style={{ background: "transparent" }} />;

  const sf = sfRef.current;
  const cssW = (target.phys_w * scale) / sf;
  const cssH = (target.phys_h * scale) / sf;

  return (
    <div
      className="group fixed inset-0 flex items-center justify-center overflow-hidden select-none"
      style={{ background: "transparent" }}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img
        src={convertFileSrc(target.path)}
        alt=""
        data-tauri-drag-region
        draggable={false}
        className="rounded-sm shadow-2xl"
        style={{
          width: cssW,
          height: cssH,
          opacity,
          transform: `rotate(${rot * 90}deg)`,
        }}
      />

      {/* 悬停控件:旋转 + 关闭 */}
      <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          title={t("S.X.PinRotate")}
          onClick={rotate}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900/85 text-zinc-100 hover:bg-zinc-800"
        >
          <RotateCw size={13} />
        </button>
        <button
          title={t("S.X.PinClose")}
          onClick={() => void close()}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900/85 text-zinc-100 hover:bg-red-500 hover:text-white"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
