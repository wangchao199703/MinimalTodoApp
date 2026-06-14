import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { Eye, Pencil, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ipc } from "../lib/tauri-ipc";
import { t } from "../lib/i18n";
import { renderMarkdown } from "../lib/markdown";
import ResizeBorders from "./ResizeBorders";

/**
 * 独立「剪贴项编辑」窗口(label = "clip-editor",由 main.tsx 按窗口 label 路由)。
 * 便签式 Markdown 文本编辑器:可切换编辑/预览,**手动点保存才落库**;
 * 有未保存改动时关闭弹「保存 / 不保存 / 取消」三选确认(拦截窗口关闭请求)。
 * 待编辑的剪贴项 id 经后端暂存(open 时写入)+ 本窗口挂载后 takeClipEditorTarget 取走;
 * 窗口复用(再编辑别的项)经 `clip-editor-target` 事件切换。保存后经 `clip-updated` 通知主窗口刷新。
 */
export default function ClipEditorWindow() {
  const language = useAppStore((s) => s.language);
  const loaded = useAppStore((s) => s.loaded);

  const [clipId, setClipId] = useState<number | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  // 保存基线:与当前 text 不一致即「有未保存改动」
  const baselineRef = useRef("");
  const [dirty, setDirty] = useState(false);
  // 关闭确认弹层
  const [askClose, setAskClose] = useState(false);

  // 用 ref 让窗口关闭回调(模块层注册一次)读到最新状态,避免闭包过期
  const dirtyRef = useRef(false);
  const textRef = useRef("");
  const clipIdRef = useRef<number | null>(null);
  const isImageRef = useRef(false);
  dirtyRef.current = dirty;
  textRef.current = text;
  clipIdRef.current = clipId;
  isImageRef.current = isImage;

  // 主题/字体/语言:与设置窗口同套轻量初始化
  useEffect(() => {
    void useAppStore.getState().initSettingsWindow();
    const block = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest("input, textarea, select")) return;
      ev.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, []);

  // 载入某条剪贴项(无单条命令:拉全量按 id 找,量小可接受)
  const loadClip = async (id: number) => {
    const clips = await ipc.getClips();
    const clip = clips.find((c) => c.id === id);
    const body = clip?.kind === "image" ? "" : (clip?.text ?? "");
    setClipId(id);
    setIsImage(clip?.kind === "image");
    setText(body);
    baselineRef.current = body;
    setDirty(false);
    setPreview(false);
    setAskClose(false);
  };

  // 挂载:取走待编辑目标;并监听后续「再编辑别的项」切换
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      const id = await ipc.takeClipEditorTarget();
      if (id != null) await loadClip(id);
      unlisten = await listen<number>("clip-editor-target", (e) => {
        void loadClip(e.payload);
      });
    })();
    return () => unlisten?.();
  }, []);

  const onChange = (v: string) => {
    setText(v);
    setDirty(v !== baselineRef.current);
  };

  const save = async () => {
    const id = clipIdRef.current;
    if (id == null || isImageRef.current) return;
    const body = textRef.current;
    await ipc.updateClipText(id, body);
    baselineRef.current = body;
    setDirty(false);
    // 通知主窗口同步该项文本
    void emit("clip-updated", { id, text: body });
  };

  // 拦截窗口关闭:有未保存改动则弹三选确认(模块层注册一次,用 ref 读最新值)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await getCurrentWindow().onCloseRequested((ev) => {
        if (!dirtyRef.current) return; // 无改动直接放行
        ev.preventDefault();
        setAskClose(true);
      });
    })();
    return () => unlisten?.();
  }, []);

  // 三选:保存并关 / 不保存关 / 取消(destroy 绕过 onCloseRequested,不再二次拦截)
  const doSaveAndClose = async () => {
    await save();
    await getCurrentWindow().destroy();
  };
  const doDiscardClose = async () => {
    await getCurrentWindow().destroy();
  };

  if (!loaded) return null;

  return (
    <div key={language} className="flex h-screen flex-col overflow-hidden bg-popup text-text-1">
      <ResizeBorders />
      <div
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center justify-between border-b border-divider px-3 select-none"
      >
        <span data-tauri-drag-region className="flex items-center gap-2 text-sm font-semibold">
          {t("S.X.ClipEditTitle")}
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
        </span>
        <div className="flex items-center gap-1">
          {!isImage && (
            <button
              title={preview ? t("S.X.ClipEdit") : t("S.X.ClipPreview")}
              onClick={() => setPreview((p) => !p)}
              className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
            >
              {preview ? <Pencil size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button
            title={t("S.Close")}
            onClick={() => void getCurrentWindow().close()}
            className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-red-500 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {isImage ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            {t("S.X.ClipEditImageHint")}
          </div>
        ) : preview ? (
          <div
            className="h-full overflow-y-auto rounded-md border border-divider bg-card p-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
          />
        ) : (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => onChange(e.target.value)}
            className="h-full w-full resize-none rounded-md border border-divider bg-card p-3 font-mono text-sm leading-relaxed text-text-1 outline-none focus:border-accent"
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-divider px-3 py-2">
        <button
          disabled={isImage || !dirty}
          onClick={() => void save()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90 disabled:opacity-40"
        >
          {t("S.X.Save")}
        </button>
      </div>

      {/* 未保存关闭:三选确认 */}
      {askClose && (
        <>
          <div
            className="backdrop-in fixed inset-0 z-[290] bg-black/40"
            onClick={() => setAskClose(false)}
          />
          <div className="modal-in fixed top-1/2 left-1/2 z-[300] w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-divider bg-popup p-5 shadow-2xl">
            <p className="text-sm font-semibold text-text-1">{t("S.X.ClipUnsavedTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-text-2">{t("S.X.ClipUnsavedMsg")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAskClose(false)}
                className="rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover"
              >
                {t("S.Cancel")}
              </button>
              <button
                onClick={() => void doDiscardClose()}
                className="rounded-md px-3 py-1.5 text-xs text-text-2 ring-1 ring-divider hover:bg-card-hover"
              >
                {t("S.X.DiscardClose")}
              </button>
              <button
                autoFocus
                onClick={() => void doSaveAndClose()}
                className="rounded-md bg-accent px-3 py-1.5 text-xs text-on-accent hover:opacity-90"
              >
                {t("S.X.SaveAndClose")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
