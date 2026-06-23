import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clipboard as ClipboardIcon,
  Copy,
  Download,
  Eraser,
  Eye,
  Images,
  NotebookPen,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { f, t } from "../../lib/i18n";
import { ipc, type ClipItem, type ClipTag } from "../../lib/tauri-ipc";
import { Popover, MenuItem, Portal } from "../ui/Popover";
import { confirm } from "../ui/ConfirmDialog";
import ColorDialog from "../dialogs/ColorDialog";

// 拖拽数据 type:剪贴项拖到标签上打标签(单独 type,与待办/分组排序互不干扰)
const CLIP_DRAG = "clip-item";

// 显示大小(持久化设置 clip_item_size):影响文本字号/行高与图片缩略图尺寸
type ClipSize = "sm" | "md" | "lg";
const SIZE_STYLE: Record<ClipSize, { row: string; text: string; thumb: string }> = {
  sm: { row: "py-1", text: "text-xs", thumb: "h-7 w-7" },
  md: { row: "py-2", text: "text-sm", thumb: "h-11 w-11" },
  lg: { row: "py-2.5", text: "text-base", thumb: "h-16 w-16" },
};

/** 本地日期 → YYYY-MM-DD(日期输入框/快捷范围用) */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 导出文件名时间戳:YYYYMMDD-HHmmss(避免同名覆盖) */
function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 剪贴项时间副标签:今天显示 HH:mm,否则 MM-DD HH:mm(created_at 为毫秒) */
function clipTimeLabel(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? hm : `${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
}

/** 图片预览灯箱:全屏暗底 + 居中原图,点任意处 / Esc 关闭 */
function ImageLightbox({
  src,
  fallback,
  onClose,
}: {
  src: string;
  /** 原图(asset 协议)加载失败时回退的内嵌缩略图,兜底极端环境仍能看图 */
  fallback?: string;
  onClose: () => void;
}) {
  const [curSrc, setCurSrc] = useState(src);
  useEffect(() => setCurSrc(src), [src]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portal 到 body:避免被祖先(如带 hover transform 的 .clip-lift 行)创建的包含块
  // 影响 position:fixed 定位,导致灯箱被裁到行内(图片预览「打不开」的根因)。
  return (
    <Portal>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-8"
        role="dialog"
        aria-label={t("S.X.ClipPreviewTitle")}
      >
        <img
          src={curSrc}
          alt={t("S.X.ClipPreviewTitle")}
          onClick={(e) => e.stopPropagation()}
          onError={() => {
            // 原图加载失败(极端环境 asset 仍受限)→ 回退内嵌缩略图,避免裂图
            if (fallback && curSrc !== fallback) setCurSrc(fallback);
          }}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl ring-1 ring-white/10"
        />
        <button
          title={t("S.Close")}
          onClick={onClose}
          className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <X size={18} />
        </button>
      </div>
    </Portal>
  );
}

/** 浏览模式:一次只看一条剪贴项,图片/文本铺满区域,滚轮 / 方向键翻看(相册式),Esc 退出 */
function ClipBrowser({
  clips,
  tags,
  index,
  setIndex,
  onExit,
}: {
  clips: ClipItem[];
  tags: ClipTag[];
  index: number;
  setIndex: React.Dispatch<React.SetStateAction<number>>;
  onExit: () => void;
}) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const total = clips.length;
  const clip = clips[index];
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState(false);

  // 左右翻看:index 0 = 最新 = 最左;往后(index+)= 更旧 = 往右。
  // 滚轮(纵向或横向皆可)与方向键映射到上一条/下一条,节流防跳。
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    let lock = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lock < 160) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (d === 0) return;
      lock = now;
      setIndex((i) => Math.min(total - 1, Math.max(0, i + (d > 0 ? 1 : -1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [total, setIndex]);

  // 方向键翻看(←上一条/新,→下一条/旧;上下作别名)+ Esc 退出
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setIndex((i) => Math.min(total - 1, i + 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total, setIndex, onExit]);

  if (total === 0 || !clip) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        {t("S.X.ClipEmpty")}
      </div>
    );
  }

  const fullImg =
    clip.kind === "image"
      ? (clip.image_path ? convertFileSrc(clip.image_path) : clip.thumbnail_b64) ?? undefined
      : undefined;

  return (
    <div ref={areaRef} className="relative flex min-h-0 flex-1 select-none flex-col">
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-12 py-4"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {clip.kind === "image" ? (
          fullImg ? (
            <img
              src={fullImg}
              alt="clip"
              className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
            />
          ) : (
            <span className="text-muted">[{t("S.X.ClipImage")}]</span>
          )
        ) : (
          <div className="h-full w-full overflow-auto rounded-lg border border-divider bg-card p-6 text-base leading-relaxed break-words whitespace-pre-wrap text-text-1">
            {(clip.text ?? "").trim() || "(空白)"}
          </div>
        )}
      </div>

      {/* 上一条(←,更新)/ 下一条(→,更旧)浮层按钮,贴左右边缘 */}
      <button
        title={t("S.X.ClipBrowsePrev")}
        disabled={index <= 0}
        onClick={() => setIndex((i) => Math.max(0, i - 1))}
        className="absolute top-1/2 left-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-text-2 shadow ring-1 ring-divider backdrop-blur hover:bg-card-hover disabled:opacity-30"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        title={t("S.X.ClipBrowseNext")}
        disabled={index >= total - 1}
        onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
        className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-text-2 shadow ring-1 ring-divider backdrop-blur hover:bg-card-hover disabled:opacity-30"
      >
        <ChevronRight size={18} />
      </button>

      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-divider/60 py-1.5 text-xs text-muted">
        <span className="text-text-2 tabular-nums">
          {index + 1} / {total}
        </span>
        <span>·</span>
        <span>{t("S.X.ClipBrowseHint")}</span>
      </div>

      {menu && (
        <ClipMenu
          clip={clip}
          tags={tags}
          at={menu}
          onClose={() => setMenu(null)}
          onPreview={() => setPreview(true)}
        />
      )}
      {preview && fullImg && (
        <ImageLightbox
          src={fullImg}
          fallback={clip.thumbnail_b64 ?? undefined}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

/** 剪贴项右键菜单(列表 & 浏览模式共用):预览/复制/编辑/另存为/加入待办·便签/分组/删除 */
function ClipMenu({
  clip,
  tags,
  at,
  onClose,
  onPreview,
}: {
  clip: ClipItem;
  tags: ClipTag[];
  at: { x: number; y: number };
  onClose: () => void;
  onPreview: () => void;
}) {
  const removeClip = useAppStore((s) => s.removeClip);
  const restoreClip = useAppStore((s) => s.restoreClip);
  const showUndoToast = useAppStore((s) => s.showUndoToast);
  const setClipItemTag = useAppStore((s) => s.setClipItemTag);
  const copyClip = useAppStore((s) => s.copyClip);
  const clipToTask = useAppStore((s) => s.clipToTask);
  const clipToNote = useAppStore((s) => s.clipToNote);
  const pushToast = useAppStore((s) => s.pushToast);
  // 标签二级菜单:打开时主菜单让位(组件保持挂载,故内部切换而非卸载)
  const [tagAt, setTagAt] = useState<{ x: number; y: number } | null>(null);
  const isText = clip.kind !== "image";

  const saveAsTxt = async () => {
    try {
      const path = await ipc.exportFile(`剪贴文本-${fileStamp()}.txt`, clip.text ?? "");
      pushToast(f("S.X.ClipSaved", path));
    } catch {
      pushToast(t("S.X.ClipSaveFailed"));
    }
  };
  const saveImage = async () => {
    if (!clip.image_path) return;
    try {
      const path = await ipc.saveClipImage(clip.image_path, `剪贴图片-${fileStamp()}.png`);
      pushToast(f("S.X.ClipSaved", path));
    } catch {
      pushToast(t("S.X.ClipSaveFailed"));
    }
  };

  if (tagAt) {
    return (
      <Popover at={tagAt} anchor={null} onClose={onClose} zIndex={200}>
        <div className="max-h-64 w-44 overflow-y-auto">
          <MenuItem
            onClick={() => {
              onClose();
              void setClipItemTag(clip.id, null);
            }}
          >
            <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-divider" />
            <span className="min-w-0 flex-1 break-words opacity-70">{t("S.X.ClipNoTag")}</span>
            {clip.tag_ids.length === 0 && <CheckSquare size={12} className="text-accent" />}
          </MenuItem>
          <div className="my-1 h-px bg-divider" />
          {tags.map((tg) => {
            const on = clip.tag_ids.includes(tg.id);
            return (
              <MenuItem
                key={tg.id}
                onClick={() => {
                  onClose();
                  void setClipItemTag(clip.id, tg.id);
                }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-1 ring-divider"
                  style={{ background: tg.color || "transparent" }}
                />
                <span className="min-w-0 flex-1 break-words">{tg.name}</span>
                {on && <CheckSquare size={12} className="text-accent" />}
              </MenuItem>
            );
          })}
        </div>
      </Popover>
    );
  }

  return (
    <Popover at={at} anchor={null} onClose={onClose} zIndex={200}>
      <div className="w-40">
        {clip.kind === "image" && (
          <MenuItem
            onClick={() => {
              onClose();
              onPreview();
            }}
          >
            <Eye size={13} />
            {t("S.X.ClipPreview")}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            onClose();
            void copyClip(clip);
          }}
        >
          <Copy size={13} />
          {t("S.X.ClipCopy")}
        </MenuItem>
        {isText && (
          <MenuItem
            onClick={() => {
              onClose();
              void ipc.openClipEditorWindow(clip.id);
            }}
          >
            <Pencil size={13} />
            {t("S.X.ClipEdit")}
          </MenuItem>
        )}
        {isText ? (
          <MenuItem
            onClick={() => {
              onClose();
              void saveAsTxt();
            }}
          >
            <Download size={13} />
            {t("S.X.ClipSaveAsTxt")}
          </MenuItem>
        ) : (
          clip.image_path && (
            <MenuItem
              onClick={() => {
                onClose();
                void saveImage();
              }}
            >
              <Download size={13} />
              {t("S.X.ClipSaveImage")}
            </MenuItem>
          )
        )}
        <div className="my-1 h-px bg-divider" />
        <MenuItem
          onClick={() => {
            onClose();
            void clipToTask(clip);
          }}
        >
          <CheckSquare size={13} />
          {t("S.X.ClipAddToTask")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            onClose();
            void clipToNote(clip);
          }}
        >
          <NotebookPen size={13} />
          {t("S.X.ClipAddToNote")}
        </MenuItem>
        {tags.length > 0 && (
          <MenuItem onClick={() => setTagAt({ x: at.x + 12, y: at.y + 12 })}>
            <Tag size={13} />
            {t("S.X.ClipTagsMenu")}
          </MenuItem>
        )}
        <div className="my-1 h-px bg-divider" />
        <MenuItem
          danger
          onClick={() => {
            onClose();
            void removeClip(clip.id);
            showUndoToast(t("S.X.UndoToast.ClipDeleted"), () => void restoreClip(clip.id));
          }}
        >
          <Trash2 size={13} />
          {t("S.X.Delete")}
        </MenuItem>
      </div>
    </Popover>
  );
}

/** 单行剪贴项:文本/图片缩略图 + 标签点 + 置顶/删除按钮 + 右键菜单 + 可拖到标签打标签 */
function ClipRow({ clip, tags, size }: { clip: ClipItem; tags: ClipTag[]; size: ClipSize }) {
  const removeClip = useAppStore((s) => s.removeClip);
  const restoreClip = useAppStore((s) => s.restoreClip);
  const showUndoToast = useAppStore((s) => s.showUndoToast);
  const toggleClipPin = useAppStore((s) => s.toggleClipPin);
  const settings = useAppStore((s) => s.settings);
  // 双击粘贴:默认开启(用户可在设置关闭)
  const pasteOnDoubleClick = settings["clip_paste_double_click"] !== "0";
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const sz = SIZE_STYLE[size] ?? SIZE_STYLE.md;
  // 预览/查看大图用原图(asset 协议),回退内嵌缩略图
  const fullImgSrc =
    clip.kind === "image"
      ? (clip.image_path ? convertFileSrc(clip.image_path) : clip.thumbnail_b64) ?? undefined
      : undefined;

  // 拖源:把该剪贴项拖到第二侧栏标签上 → 打该标签(单标签语义)
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: CLIP_DRAG, clipId: clip.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [clip.id]);

  // 缩略图优先用内嵌 base64(始终可渲染),回退 asset 协议读原图
  const imgSrc =
    clip.kind === "image"
      ? clip.thumbnail_b64 ?? (clip.image_path ? convertFileSrc(clip.image_path) : undefined)
      : undefined;
  const clipTags = tags.filter((tg) => clip.tag_ids.includes(tg.id));
  const isText = clip.kind !== "image";

  const primaryText = isText
    ? (clip.text ?? "").replace(/\s+/g, " ").trim() || "(空白)"
    : t("S.X.ClipImage");

  return (
    <div
      ref={rowRef}
      title={pasteOnDoubleClick ? t("S.X.ClipDblClickPaste") : undefined}
      onDoubleClick={() => {
        if (pasteOnDoubleClick) void ipc.pasteClipToPrevious(clip.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className={`clip-lift group relative flex items-center gap-2.5 rounded-lg border px-2.5 text-text-1 ${sz.row} ${sz.text} ${
        clip.pinned
          ? "border-accent/30 bg-accent/5"
          : "border-transparent hover:border-divider hover:bg-card-hover"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {clip.kind === "image" &&
        (imgSrc ? (
          <img
            src={imgSrc}
            alt="clip"
            title={t("S.X.ClipPreview")}
            onClick={(e) => {
              e.stopPropagation();
              setPreview(true);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`${sz.thumb} shrink-0 cursor-zoom-in rounded-md border border-divider object-cover`}
          />
        ) : (
          <span className="shrink-0 opacity-70">[{t("S.X.ClipImage")}]</span>
        ))}

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className={`truncate leading-tight ${isText ? "" : "opacity-70"}`}>{primaryText}</span>
        {size !== "sm" && (
          <span className="mt-0.5 truncate text-xs leading-tight text-muted">
            {clipTimeLabel(clip.created_at)}
          </span>
        )}
      </div>

      {clipTags.map((tg) => (
        <span
          key={tg.id}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px]"
          style={
            tg.color
              ? { background: `${tg.color}22`, color: tg.color }
              : { background: "var(--card-hover)", color: "var(--text-2)" }
          }
        >
          {tg.name}
        </span>
      ))}

      <button
        type="button"
        title={clip.pinned ? t("S.X.Unpin") : t("S.X.Pin")}
        onClick={() => void toggleClipPin(clip)}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
          clip.pinned
            ? "text-accent opacity-100 hover:bg-card-hover"
            : "text-muted opacity-0 hover:bg-card-hover group-hover:opacity-100"
        }`}
      >
        {clip.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button
        type="button"
        title={t("S.X.Delete")}
        onClick={() => {
          void removeClip(clip.id);
          showUndoToast(t("S.X.UndoToast.ClipDeleted"), () => void restoreClip(clip.id));
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-colors hover:bg-card-hover hover:text-overdue group-hover:opacity-100"
      >
        <X size={14} />
      </button>

      {menu && (
        <ClipMenu
          clip={clip}
          tags={tags}
          at={menu}
          onClose={() => setMenu(null)}
          onPreview={() => setPreview(true)}
        />
      )}
      {preview && fullImgSrc && (
        <ImageLightbox
          src={fullImgSrc}
          fallback={clip.thumbnail_b64 ?? undefined}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}

/** 第二侧栏里的剪切板标签行:点击过滤,右键改名/改色/删;作为剪贴项放置目标(拖到此打标签) */
function ClipTagRow({ tag, active }: { tag: ClipTag; active: boolean }) {
  const setClipFilterTag = useAppStore((s) => s.setClipFilterTag);
  const renameClipTag = useAppStore((s) => s.renameClipTag);
  const setClipTagColor = useAppStore((s) => s.setClipTagColor);
  const removeClipTag = useAppStore((s) => s.removeClipTag);
  const clearClipTagItems = useAppStore((s) => s.clearClipTagItems);
  const setClipItemTag = useAppStore((s) => s.setClipItemTag);
  // 该分组下的剪贴项数量(与「默认」分组的计数显示保持一致)
  const count = useAppStore((s) => s.clips.filter((c) => c.tag_ids.includes(tag.id)).length);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const dropRef = useRef<HTMLDivElement | null>(null);

  // 放置目标:剪贴项拖到此 → 打该标签(单标签)。canDrop 只认 clip-item,
  // 本行不参与排序、无其它 dropTarget,不存在重复注册问题。
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === CLIP_DRAG,
      onDragEnter: () => setDropOver(true),
      onDragLeave: () => setDropOver(false),
      onDrop: ({ source }) => {
        setDropOver(false);
        const clipId = source.data.clipId;
        if (typeof clipId === "number") void setClipItemTag(clipId, tag.id);
      },
    });
  }, [tag.id, setClipItemTag]);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== tag.name) void renameClipTag(tag.id, name);
    else setDraft(tag.name);
  };

  const confirmDelete = async () => {
    if (await confirm({ title: t("S.Tag.Delete"), message: f("S.X.ConfirmDeleteClipTag", tag.name) })) {
      void removeClipTag(tag.id);
    }
  };

  const confirmClear = async () => {
    if (await confirm({ title: t("S.X.Clear"), message: f("S.X.ConfirmClearClipTag", tag.name) })) {
      void clearClipTagItems(tag.id);
    }
  };

  return (
    <div className="group relative" ref={dropRef}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(tag.name);
              setEditing(false);
            }
          }}
          className="w-full rounded-md border border-accent bg-sidebar-hover px-2 py-1.5 text-sm text-sidebar-strong outline-none"
        />
      ) : (
        <div
          onClick={() => setClipFilterTag(tag.id)}
          onDoubleClick={() => {
            setDraft(tag.name);
            setEditing(true);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
          className={`nav-lift flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            dropOver
              ? "bg-sidebar-selected text-sidebar-selected-fg ring-1 ring-accent"
              : active
                ? "bg-sidebar-selected text-sidebar-selected-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
          }`}
        >
          <Tag size={14} className="shrink-0" style={tag.color ? { color: tag.color } : undefined} />
          <span className="min-w-0 flex-1 truncate">{tag.name}</span>
          <span className="text-xs text-sidebar-muted group-hover:hidden">{count}</span>
          <button
            title={t("S.Tag.Delete")}
            onClick={(e) => {
              e.stopPropagation();
              void confirmDelete();
            }}
            className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-overdue group-hover:flex"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-36">
            <MenuItem
              onClick={() => {
                setMenu(null);
                setDraft(tag.name);
                setEditing(true);
              }}
            >
              <Pencil size={13} />
              {t("S.Tag.Rename")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                setColorOpen(true);
              }}
            >
              <Palette size={13} />
              {t("S.Group.ChangeColor")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                void confirmClear();
              }}
            >
              <Eraser size={13} />
              {t("S.X.Clear")}
            </MenuItem>
            <div className="my-1 h-px bg-divider" />
            <MenuItem
              danger
              onClick={() => {
                setMenu(null);
                void confirmDelete();
              }}
            >
              <Trash2 size={13} />
              {t("S.Tag.Delete")}
            </MenuItem>
          </div>
        </Popover>
      )}
      {colorOpen && (
        <ColorDialog
          value={tag.color}
          onPick={(c) => void setClipTagColor(tag.id, c)}
          onClear={() => void setClipTagColor(tag.id, "")}
          onClose={() => setColorOpen(false)}
        />
      )}
    </div>
  );
}

export default function ClipboardView() {
  const clips = useAppStore((s) => s.clips);
  const clipTags = useAppStore((s) => s.clipTags);
  const clipFilterTagId = useAppStore((s) => s.clipFilterTagId);
  const setClipFilterTag = useAppStore((s) => s.setClipFilterTag);
  const addClipTag = useAppStore((s) => s.addClipTag);
  const setClipItemTag = useAppStore((s) => s.setClipItemTag);
  const clearUngroupedClips = useAppStore((s) => s.clearUngroupedClips);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);

  // 「默认」分组右键菜单(清空未分组剪贴项)
  const [defaultMenu, setDefaultMenu] = useState<{ x: number; y: number } | null>(null);
  const confirmClearDefault = async () => {
    if (
      await confirm({
        title: t("S.X.Clear"),
        message: f("S.X.ConfirmClearClipTag", t("S.X.ClipDefault")),
      })
    ) {
      void clearUngroupedClips();
    }
  };

  // 「默认」分组也作为放置目标:把剪贴项拖到「默认」= 移出当前分组(归回默认)
  const defaultDropRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = defaultDropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === CLIP_DRAG,
      onDrop: ({ source }) => {
        const clipId = source.data.clipId;
        if (typeof clipId === "number") void setClipItemTag(clipId, null);
      },
    });
  }, [setClipItemTag]);

  // 搜索关键词(仅前端过滤已加载列表,量小够用;参照 ShellPicker)
  const [query, setQuery] = useState("");
  // 类型筛选(全部/文字/图片)与日期范围筛选:临时态,与搜索一致(切视图重置)
  const [kindFilter, setKindFilter] = useState<"all" | "text" | "image">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // 筛选面板默认展开(新用户即见全部功能),可手动收起
  const [filtersOpen, setFiltersOpen] = useState(true);
  // 日期范围选择 Popover(快捷范围 + 自定义起止)
  const [dateMenu, setDateMenu] = useState<{ x: number; y: number } | null>(null);
  // 「重复内容移到最前」开关(与设置同一持久化键,工具栏内快捷切换)
  const clipDedup = settings["clip_dedup"] !== "0";
  // 浏览模式(持久化):一次铺满展示一条,滚轮翻看(相册式)
  const browseMode = settings["clip_browse_mode"] === "1";
  const [browseIndex, setBrowseIndex] = useState(0);
  // 快捷范围:近 N 天(含今天)
  const setLastDays = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDateFrom(ymd(from));
    setDateTo(ymd(to));
  };
  // 第二侧边栏宽度可拖动并持久化(默认 224,范围 60–460;下限按用户要求放到 60)
  const [navWidth, setNavWidth] = useState(() =>
    Math.min(460, Math.max(60, Number(settings["clip_sidebar_width"]) || 224)),
  );
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = navWidth;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(460, Math.max(60, startW + ev.clientX - startX));
      setNavWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveSetting("clip_sidebar_width", String(Math.round(w)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const collapsed = settings["clip_sidebar_collapsed"] === "1";
  const toggleCollapsed = () => saveSetting("clip_sidebar_collapsed", collapsed ? "0" : "1");

  // 过滤:分组筛选 + 文本搜索。null = 「默认」分组 = 未归入任何自定义分组的剪贴项;
  // 选中某分组 = 该分组下的剪贴项。剪贴项单分组,移到别的分组后即从「默认」消失。
  const q = query.trim().toLowerCase();
  // 日期范围 → 毫秒边界(含当天:起始取 00:00,结束取次日 00:00)
  const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toMs = dateTo ? new Date(`${dateTo}T00:00:00`).getTime() + 86_400_000 : null;
  const filtered = clips.filter((c) => {
    if (clipFilterTagId == null) {
      if (c.tag_ids.length > 0) return false; // 默认 = 未分组
    } else if (!c.tag_ids.includes(clipFilterTagId)) {
      return false;
    }
    if (kindFilter !== "all" && c.kind !== kindFilter) return false;
    if (fromMs != null && c.created_at < fromMs) return false;
    if (toMs != null && c.created_at >= toMs) return false;
    if (q && !(c.text ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
  const ungroupedCount = clips.filter((c) => c.tag_ids.length === 0).length;
  const filtersActive = kindFilter !== "all" || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setKindFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  // 浏览模式下:列表变化(过滤/删除)后把当前索引夹在有效范围内
  useEffect(() => {
    setBrowseIndex((i) => Math.min(Math.max(0, i), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  const browseIdx = Math.min(browseIndex, Math.max(0, filtered.length - 1));

  return (
    <div className="flex min-h-0 flex-1">
      {collapsed ? (
        <aside className="flex w-12 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div data-tauri-drag-region className="h-9 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1 pt-0">
            <button
              title={t("S.X.ClipDefault")}
              onClick={() => setClipFilterTag(null)}
              className={`nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                clipFilterTagId == null
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-strong hover:bg-sidebar-hover"
              }`}
            >
              <ClipboardIcon size={16} />
            </button>
            {clipTags.map((tg) => (
              <CollapsedTagButton key={tg.id} tag={tg} active={clipFilterTagId === tg.id} />
            ))}
          </div>
          <div className="shrink-0 p-1">
            <button
              title={t("S.X.ExpandSidebar")}
              onClick={toggleCollapsed}
              className="nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-strong hover:bg-sidebar-hover"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        </aside>
      ) : (
        <aside
          style={{ width: navWidth }}
          className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
        >
          <div
            onMouseDown={startResize}
            className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize transition-colors hover:bg-accent/40"
          />
          <div className="flex h-9 shrink-0 items-center justify-between pr-2 pl-3">
            <span className="text-xs font-semibold text-sidebar-strong">
              {t("S.X.ClipboardTags")}
            </span>
            <button
              title={t("S.X.NewClipTag")}
              onClick={() => void addClipTag(t("S.X.NewClipTag"))}
              className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-0">
            <button
              ref={defaultDropRef}
              onClick={() => setClipFilterTag(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setDefaultMenu({ x: e.clientX, y: e.clientY });
              }}
              className={`nav-lift flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium ${
                clipFilterTagId == null
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
              }`}
            >
              <ClipboardIcon size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.X.ClipDefault")}</span>
              <span className="text-xs text-sidebar-muted">{ungroupedCount}</span>
            </button>
            {defaultMenu && (
              <Popover at={defaultMenu} anchor={null} onClose={() => setDefaultMenu(null)} zIndex={200}>
                <div className="w-36">
                  <MenuItem
                    onClick={() => {
                      setDefaultMenu(null);
                      void confirmClearDefault();
                    }}
                  >
                    <Eraser size={13} />
                    {t("S.X.Clear")}
                  </MenuItem>
                </div>
              </Popover>
            )}
            {clipTags.map((tg) => (
              <ClipTagRow key={tg.id} tag={tg} active={clipFilterTagId === tg.id} />
            ))}
          </div>
          <div className="shrink-0 p-2 pt-1">
            <button
              title={t("S.X.CollapseSidebar")}
              onClick={toggleCollapsed}
              className="nav-lift flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <PanelLeftClose size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.X.CollapseSidebar")}</span>
            </button>
          </div>
        </aside>
      )}

      {/* 右侧:搜索/筛选工具栏 + 剪贴项列表 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 space-y-1.5 border-b border-divider/60 p-2">
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("S.X.ClipSearch")}
                className="w-full rounded-md border border-divider bg-card py-1.5 pr-7 pl-8 text-sm text-text-1 outline-none focus:border-accent"
              />
              {query && (
                <button
                  title={t("S.Clear")}
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-card-hover"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {/* 浏览模式:一次铺满展示一条,滚轮翻看(相册式) */}
            <button
              title={t("S.X.ClipBrowse")}
              onClick={() => saveSetting("clip_browse_mode", browseMode ? "0" : "1")}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                browseMode
                  ? "border-accent/30 bg-accent/15 text-accent"
                  : "border-divider text-muted hover:bg-card-hover"
              }`}
            >
              <Images size={14} />
              <span>{t("S.X.ClipBrowse")}</span>
            </button>
            {/* 筛选器开合;有激活筛选 / 展开时高亮(浅主题色填充) */}
            <button
              title={t("S.X.ClipFilters")}
              onClick={() => setFiltersOpen((v) => !v)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                filtersActive || filtersOpen
                  ? "border-accent/30 bg-accent/15 text-accent"
                  : "border-divider text-muted hover:bg-card-hover"
              }`}
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
          {filtersOpen && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* 类型筛选:分段控制器(与「大小」同款「浮起」式) */}
              <div className="flex items-center rounded-md bg-card-hover p-0.5">
                {(
                  [
                    ["all", t("S.X.ClipKindAll")],
                    ["text", t("S.X.ClipKindText")],
                    ["image", t("S.X.ClipKindImage")],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setKindFilter(k)}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      kindFilter === k
                        ? "bg-card text-text-1 shadow-sm ring-1 ring-divider"
                        : "text-muted hover:text-text-1"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <span className="h-4 w-px bg-divider" />

              {/* 日期范围:触发按钮 → Popover(快捷范围 + 自定义起止) */}
              <button
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setDateMenu({ x: r.left, y: r.bottom + 4 });
                }}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
                  dateFrom || dateTo
                    ? "border-accent/30 bg-accent/10 text-text-1"
                    : "border-divider bg-card text-muted hover:bg-card-hover"
                }`}
              >
                <CalendarDays size={13} className="shrink-0" />
                {dateFrom || dateTo ? (
                  <span>
                    {dateFrom || "…"} <span className="text-muted">→</span> {dateTo || "…"}
                  </span>
                ) : (
                  <span>{t("S.X.ClipDateRangePH")}</span>
                )}
              </button>

              <span className="h-4 w-px bg-divider" />

              {/* 去重开关:重复项置顶(与设置同一持久化键 clip_dedup) */}
              <button
                role="switch"
                aria-checked={clipDedup}
                onClick={() => saveSetting("clip_dedup", clipDedup ? "0" : "1")}
                className="group flex items-center gap-2"
              >
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    clipDedup ? "bg-accent" : "bg-divider"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      clipDedup ? "left-4.5" : "left-0.5"
                    }`}
                  />
                </span>
                <span className="text-muted group-hover:text-text-1">{t("S.X.ClipDedupShort")}</span>
              </button>

              {/* 把「清除」推到最右 */}
              <span className="flex-1" />
              {filtersActive && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-muted transition-colors hover:bg-overdue/10 hover:text-overdue"
                >
                  <X size={13} />
                  {t("S.X.ClipClearFilters")}
                </button>
              )}
            </div>
          )}
          {dateMenu && (
            <Popover at={dateMenu} anchor={null} onClose={() => setDateMenu(null)} zIndex={200}>
              <div className="w-60 space-y-2 p-2">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      [t("S.X.ClipDateToday"), () => { const d = ymd(new Date()); setDateFrom(d); setDateTo(d); }],
                      [t("S.X.ClipDateLast7"), () => setLastDays(7)],
                      [t("S.X.ClipDateLast1m"), () => setLastDays(30)],
                      [t("S.X.ClipDateLast3m"), () => setLastDays(90)],
                    ] as const
                  ).map(([label, fn]) => (
                    <button
                      key={label}
                      onClick={fn}
                      className="rounded-md border border-divider px-2 py-1 text-xs text-text-2 hover:bg-card-hover hover:text-text-1"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    title={t("S.X.ClipDateStart")}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-divider bg-card px-1.5 py-1 text-text-1 outline-none focus:border-accent"
                  />
                  <span className="text-muted">–</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    title={t("S.X.ClipDateEnd")}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-divider bg-card px-1.5 py-1 text-text-1 outline-none focus:border-accent"
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    onClick={() => { setDateFrom(""); setDateTo(""); }}
                    className="w-full rounded-md px-2 py-1 text-xs text-muted hover:bg-card-hover hover:text-text-1"
                  >
                    {t("S.X.ClipDateClearDates")}
                  </button>
                )}
              </div>
            </Popover>
          )}
        </div>
        {browseMode ? (
          <ClipBrowser
            clips={filtered}
            tags={clipTags}
            index={browseIdx}
            setIndex={setBrowseIndex}
            onExit={() => saveSetting("clip_browse_mode", "0")}
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            {t("S.X.ClipEmpty")}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {filtered.map((clip) => (
              <ClipRow key={clip.id} clip={clip} tags={clipTags} size="md" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 收起态的标签按钮:同样作为剪贴项放置目标(拖到此打标签) */
function CollapsedTagButton({ tag, active }: { tag: ClipTag; active: boolean }) {
  const setClipFilterTag = useAppStore((s) => s.setClipFilterTag);
  const setClipItemTag = useAppStore((s) => s.setClipItemTag);
  const [dropOver, setDropOver] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === CLIP_DRAG,
      onDragEnter: () => setDropOver(true),
      onDragLeave: () => setDropOver(false),
      onDrop: ({ source }) => {
        setDropOver(false);
        const clipId = source.data.clipId;
        if (typeof clipId === "number") void setClipItemTag(clipId, tag.id);
      },
    });
  }, [tag.id, setClipItemTag]);

  return (
    <button
      ref={ref}
      title={tag.name}
      onClick={() => setClipFilterTag(tag.id)}
      className={`nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
        dropOver
          ? "bg-sidebar-selected text-sidebar-selected-fg ring-1 ring-accent"
          : active
            ? "bg-sidebar-selected text-sidebar-selected-fg"
            : "text-sidebar-strong hover:bg-sidebar-hover"
      }`}
    >
      <Tag size={15} style={tag.color ? { color: tag.color } : undefined} />
    </button>
  );
}
