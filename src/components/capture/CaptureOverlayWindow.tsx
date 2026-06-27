import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { ipc, type CaptureTarget } from "../../lib/tauri-ipc";
import { useAppStore } from "../../store/useAppStore";
import { t } from "../../lib/i18n";
import CaptureToolbar from "./CaptureToolbar";
import { exportSelection } from "./exportSelection";
import { ARROW_HEAD, STROKE, arrowHead, type Rect, type Shape, type Tool } from "./shapes";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_HIT = 12;
const MIN_SEL = 5;
const TOOLBAR_W = 372;
const TOOLBAR_H = 42;

type Drag =
  | { mode: "new"; startX: number; startY: number }
  | { mode: "move"; startX: number; startY: number; orig: Rect }
  | { mode: "resize"; handle: Handle; startX: number; startY: number; orig: Rect }
  | { mode: "draw" };

const norm = (ax: number, ay: number, bx: number, by: number): Rect => ({
  l: Math.min(ax, bx),
  t: Math.min(ay, by),
  w: Math.abs(bx - ax),
  h: Math.abs(by - ay),
});
const inside = (r: Rect, x: number, y: number) =>
  x >= r.l && x <= r.l + r.w && y >= r.t && y <= r.t + r.h;

/** 选区中某把手的中心坐标 */
function handleCenter(r: Rect, h: Handle): { x: number; y: number } {
  const cx = r.l + r.w / 2;
  const cy = r.t + r.h / 2;
  const x = h.includes("w") ? r.l : h.includes("e") ? r.l + r.w : cx;
  const y = h.includes("n") ? r.t : h.includes("s") ? r.t + r.h : cy;
  return { x, y };
}
function hitHandle(r: Rect, x: number, y: number): Handle | null {
  for (const h of HANDLES) {
    const c = handleCenter(r, h);
    if (Math.abs(c.x - x) <= HANDLE_HIT && Math.abs(c.y - y) <= HANDLE_HIT) return h;
  }
  return null;
}
// StrictMode 开发期会双调挂载副作用:冻结帧元数据是「取走即清空」,第二次取到 null 会误关窗口。
// 本窗口每次截图都是新建的独立页面,模块级标志即可保证只取一次(随窗口销毁自然失效)。
let captureTaken = false;

const cursorFor: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

/**
 * 截图遮罩窗口(label = "capture-overlay")。覆盖整个虚拟桌面:展示冻结帧 + 暗色遮罩,
 * 拖拽框选 + 8 把手调整 + 画笔/箭头/矩形标注,确认后复制 / 保存 / 钉到桌面。
 * 坐标统一用 overlay 视口 CSS 像素;sf(scaleFactor)负责换算到物理像素。
 */
export default function CaptureOverlayWindow() {
  useAppStore((s) => s.language); // 订阅语言:加载完成后触发重渲染,让 t() 取到正确语种
  const [cap, setCap] = useState<CaptureTarget | null>(null);
  const [imgError, setImgError] = useState(false);
  const [sel, setSel] = useState<Rect | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#ef4444");

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const sfRef = useRef(1);
  const vp = useRef({ w: window.innerWidth, h: window.innerHeight });

  // 用 ref 让键盘监听读到最新状态
  const stateRef = useRef({ sel, shapes, cap });
  stateRef.current = { sel, shapes, cap };

  useEffect(() => {
    if (captureTaken) return;
    captureTaken = true;
    void useAppStore.getState().initSettingsWindow();
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    void (async () => {
      const win = getCurrentWindow();
      const target = await ipc.takeCaptureTarget();
      if (!target) {
        await win.close();
        return;
      }
      sfRef.current = await win.scaleFactor();
      setCap(target);
      // 抢键盘焦点:透明置顶窗未必自动获焦,否则 Esc/Ctrl+C/S/Z 收不到
      await win.setFocus();
    })();
  }, []);

  const closeOverlay = async () => {
    const c = stateRef.current.cap;
    if (c) await ipc.discardCapture(c.path);
    await getCurrentWindow().close();
  };

  // ---- 确认动作:复制 / 保存 / 钉图 ----
  const exportBlob = async (): Promise<{ blob: Blob; sel: Rect } | null> => {
    const s = stateRef.current.sel;
    const img = imgRef.current;
    if (!s || s.w < MIN_SEL || s.h < MIN_SEL || !img || !img.naturalWidth) return null;
    const blob = await exportSelection(img, s, stateRef.current.shapes, sfRef.current);
    return { blob, sel: s };
  };
  const writeTemp = async (blob: Blob): Promise<string> =>
    ipc.saveCapturePng(new Uint8Array(await blob.arrayBuffer()));

  const doCopy = async () => {
    const r = await exportBlob();
    if (!r) return;
    const path = await writeTemp(r.blob);
    await ipc.copyCaptureToClipboard(path);
    await ipc.discardCapture(path);
    await closeOverlay();
  };
  const doSave = async () => {
    const r = await exportBlob();
    if (!r) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const dest = await save({
      title: t("S.X.CaptureSaveTitle"),
      defaultPath: `screenshot-${stamp}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (!dest) return; // 取消保存:遮罩保留,可继续编辑
    const path = await writeTemp(r.blob);
    await ipc.saveCaptureAs(path, dest);
    await ipc.discardCapture(path);
    await closeOverlay();
  };
  const doPin = async () => {
    const r = await exportBlob();
    if (!r || !cap) return;
    const sf = sfRef.current;
    const path = await writeTemp(r.blob);
    await ipc.openPinWindow(
      path,
      cap.vx + Math.round(r.sel.l * sf),
      cap.vy + Math.round(r.sel.t * sf),
      Math.round(r.sel.w * sf),
      Math.round(r.sel.h * sf),
    );
    await closeOverlay();
  };

  // ---- 键盘 ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void closeOverlay();
      } else if (e.key === "Enter") {
        if (stateRef.current.sel) void doPin();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void doCopy();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void doSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setShapes((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 指针:框选 / 移动 / 调整 / 标注 ----
  const clampMove = (orig: Rect, dx: number, dy: number): Rect => ({
    l: Math.max(0, Math.min(orig.l + dx, vp.current.w - orig.w)),
    t: Math.max(0, Math.min(orig.t + dy, vp.current.h - orig.h)),
    w: orig.w,
    h: orig.h,
  });
  const resizeRect = (orig: Rect, h: Handle, dx: number, dy: number): Rect => {
    let l = orig.l;
    let t2 = orig.t;
    let right = orig.l + orig.w;
    let bottom = orig.t + orig.h;
    if (h.includes("w")) l = orig.l + dx;
    if (h.includes("e")) right = orig.l + orig.w + dx;
    if (h.includes("n")) t2 = orig.t + dy;
    if (h.includes("s")) bottom = orig.t + orig.h + dy;
    return norm(l, t2, right, bottom);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!cap) return;
    const x = e.clientX;
    const y = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool !== "select" && sel && inside(sel, x, y)) {
      const base = { color, w: STROKE };
      const shape: Shape =
        tool === "pen"
          ? { kind: "pen", ...base, points: [{ x, y }] }
          : { kind: tool, ...base, x1: x, y1: y, x2: x, y2: y };
      setShapes((prev) => [...prev, shape]);
      dragRef.current = { mode: "draw" };
      return;
    }
    if (sel) {
      const h = hitHandle(sel, x, y);
      if (h) {
        dragRef.current = { mode: "resize", handle: h, startX: x, startY: y, orig: sel };
        return;
      }
      if (tool === "select" && inside(sel, x, y)) {
        dragRef.current = { mode: "move", startX: x, startY: y, orig: sel };
        return;
      }
    }
    setSel({ l: x, t: y, w: 0, h: 0 });
    dragRef.current = { mode: "new", startX: x, startY: y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const x = e.clientX;
    const y = e.clientY;
    if (d.mode === "new") setSel(norm(d.startX, d.startY, x, y));
    else if (d.mode === "move") setSel(clampMove(d.orig, x - d.startX, y - d.startY));
    else if (d.mode === "resize") setSel(resizeRect(d.orig, d.handle, x - d.startX, y - d.startY));
    else if (d.mode === "draw")
      setShapes((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const upd: Shape =
          last.kind === "pen"
            ? { ...last, points: [...last.points, { x, y }] }
            : { ...last, x2: x, y2: y };
        return [...prev.slice(0, -1), upd];
      });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.mode === "new") {
      setSel((s) => (s && (s.w < MIN_SEL || s.h < MIN_SEL) ? null : s));
    }
  };

  // 元数据未就绪(takeCaptureTarget 进行中):渲染可见暗背景 + 右键关闭兜底,绝不出现「透明无法关闭」窗
  if (!cap) {
    return (
      <div
        className="fixed inset-0 bg-black/30"
        onContextMenu={(e) => {
          e.preventDefault();
          void closeOverlay();
        }}
      />
    );
  }

  const assetUrl = convertFileSrc(cap.path);

  // 工具栏定位:选区下方,空间不足则上方;水平贴选区左缘并夹在视口内
  const tbTop =
    sel && sel.t + sel.h + 8 + TOOLBAR_H <= vp.current.h
      ? sel.t + sel.h + 8
      : sel
        ? Math.max(8, sel.t - TOOLBAR_H - 8)
        : 0;
  const tbLeft = sel
    ? Math.max(8, Math.min(sel.l, vp.current.w - TOOLBAR_W - 8))
    : 0;

  const rootCursor = tool === "select" ? "crosshair" : "crosshair";

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ cursor: rootCursor, background: "transparent" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        void closeOverlay();
      }}
    >
      {/* 冻结帧底图(若 asset 加载失败,标红记录,仍可框选/关闭——导出时再兜底) */}
      <img
        ref={imgRef}
        src={assetUrl}
        alt=""
        className="absolute inset-0 h-full w-full"
        draggable={false}
        onError={() => {
          console.error("截图底图加载失败(asset 协议):", assetUrl);
          setImgError(true);
        }}
      />
      {imgError && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-red-600/90 px-2 py-1 text-xs text-white">
          底图加载失败
        </div>
      )}

      {/* 暗色遮罩:无选区时整块;有选区时四块环绕(选区透亮) */}
      {!sel ? (
        <div className="absolute inset-0 bg-black/45" />
      ) : (
        <>
          <div className="absolute left-0 top-0 w-full bg-black/45" style={{ height: sel.t }} />
          <div
            className="absolute left-0 w-full bg-black/45"
            style={{ top: sel.t + sel.h, height: vp.current.h - sel.t - sel.h }}
          />
          <div
            className="absolute bg-black/45"
            style={{ left: 0, top: sel.t, width: sel.l, height: sel.h }}
          />
          <div
            className="absolute bg-black/45"
            style={{ left: sel.l + sel.w, top: sel.t, width: vp.current.w - sel.l - sel.w, height: sel.h }}
          />
        </>
      )}

      {/* 标注层(实时预览;不拦指针,交给根容器) */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {shapes.map((s, i) =>
          s.kind === "pen" ? (
            <polyline
              key={i}
              points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={s.w}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : s.kind === "rect" ? (
            <rect
              key={i}
              x={Math.min(s.x1, s.x2)}
              y={Math.min(s.y1, s.y2)}
              width={Math.abs(s.x2 - s.x1)}
              height={Math.abs(s.y2 - s.y1)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.w}
            />
          ) : (
            <g key={i}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={s.w} strokeLinecap="round" />
              <polygon
                points={arrowHead(s.x1, s.y1, s.x2, s.y2, ARROW_HEAD).map((p) => `${p.x},${p.y}`).join(" ")}
                fill={s.color}
              />
            </g>
          ),
        )}
      </svg>

      {/* 选区边框 + 尺寸标签 + 8 把手 */}
      {sel && (
        <>
          <div
            className="pointer-events-none absolute border border-blue-400"
            style={{ left: sel.l, top: sel.t, width: sel.w, height: sel.h }}
          />
          <div
            className="pointer-events-none absolute rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white"
            style={{
              left: sel.l,
              top: sel.t >= 22 ? sel.t - 20 : sel.t + 4,
            }}
          >
            {Math.round(sel.w * sfRef.current)} × {Math.round(sel.h * sfRef.current)}
          </div>
          {HANDLES.map((h) => {
            const c = handleCenter(sel, h);
            return (
              <div
                key={h}
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-blue-400"
                style={{ left: c.x, top: c.y, cursor: cursorFor[h] }}
              />
            );
          })}
        </>
      )}

      {/* 起始提示 */}
      {!sel && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-black/70 px-4 py-2 text-sm text-white">
          {t("S.X.CaptureHint")}
        </div>
      )}

      {/* 工具栏(选区确定后出现) */}
      {sel && sel.w >= MIN_SEL && sel.h >= MIN_SEL && (
        <CaptureToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={setColor}
          canUndo={shapes.length > 0}
          onUndo={() => setShapes((prev) => prev.slice(0, -1))}
          onCopy={() => void doCopy()}
          onSave={() => void doSave()}
          onPin={() => void doPin()}
          onCancel={() => void closeOverlay()}
          left={tbLeft}
          top={tbTop}
        />
      )}
    </div>
  );
}
