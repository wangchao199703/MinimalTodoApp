import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  CheckSquare,
  Clipboard as ClipboardIcon,
  NotebookPen,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { f, t } from "../../lib/i18n";
import type { ClipItem, ClipTag } from "../../lib/tauri-ipc";
import { Popover, MenuItem } from "../ui/Popover";
import { confirm } from "../ui/ConfirmDialog";
import ColorDialog from "../dialogs/ColorDialog";

// 剪贴板视图 = 第二侧边栏(剪切板标签,可过滤/改色/改名/删)+ 剪贴项列表(右键加入待办/便签、打标签)

/** 单行剪贴项:文本/图片缩略图 + 标签点 + 置顶/删除按钮 + 右键菜单 */
function ClipRow({ clip, tags }: { clip: ClipItem; tags: ClipTag[] }) {
  const removeClip = useAppStore((s) => s.removeClip);
  const toggleClipPin = useAppStore((s) => s.toggleClipPin);
  const toggleClipItemTag = useAppStore((s) => s.toggleClipItemTag);
  const clipToTask = useAppStore((s) => s.clipToTask);
  const clipToNote = useAppStore((s) => s.clipToNote);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [tagMenu, setTagMenu] = useState<{ x: number; y: number } | null>(null);

  // 缩略图优先用内嵌 base64(始终可渲染),回退 asset 协议读原图
  const imgSrc =
    clip.kind === "image"
      ? clip.thumbnail_b64 ?? (clip.image_path ? convertFileSrc(clip.image_path) : undefined)
      : undefined;
  const clipTags = tags.filter((tg) => clip.tag_ids.includes(tg.id));

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className="group flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-1 hover:bg-card-hover"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {clip.kind === "image" ? (
          <>
            {imgSrc ? (
              <img
                src={imgSrc}
                alt="clip"
                className="h-10 w-10 shrink-0 rounded border border-divider object-cover"
              />
            ) : (
              <span className="opacity-70">[{t("S.X.ClipImage")}]</span>
            )}
            <span className="truncate opacity-70">{t("S.X.ClipImage")}</span>
          </>
        ) : (
          <span className="truncate">
            {(clip.text ?? "").replace(/\s+/g, " ").trim() || "(空白)"}
          </span>
        )}
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
      </div>

      <button
        type="button"
        title={clip.pinned ? t("S.X.Unpin") : t("S.X.Pin")}
        onClick={() => void toggleClipPin(clip)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-card-hover ${
          clip.pinned ? "opacity-100 text-accent" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {clip.pinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>
      <button
        type="button"
        title={t("S.X.Delete")}
        onClick={() => void removeClip(clip.id)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 hover:bg-card-hover hover:text-overdue group-hover:opacity-100"
      >
        <X size={13} />
      </button>

      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-40">
            <MenuItem
              onClick={() => {
                setMenu(null);
                void clipToTask(clip);
              }}
            >
              <CheckSquare size={13} />
              {t("S.X.ClipAddToTask")}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenu(null);
                void clipToNote(clip);
              }}
            >
              <NotebookPen size={13} />
              {t("S.X.ClipAddToNote")}
            </MenuItem>
            {tags.length > 0 && (
              <MenuItem
                onClick={() => {
                  const at = menu;
                  setMenu(null);
                  // 二级标签菜单在主菜单原位稍右下展开
                  setTagMenu({ x: at.x + 12, y: at.y + 12 });
                }}
              >
                <Tag size={13} />
                {t("S.X.ClipTagsMenu")}
              </MenuItem>
            )}
            <div className="my-1 h-px bg-divider" />
            <MenuItem
              danger
              onClick={() => {
                setMenu(null);
                void removeClip(clip.id);
              }}
            >
              <Trash2 size={13} />
              {t("S.X.Delete")}
            </MenuItem>
          </div>
        </Popover>
      )}
      {tagMenu && (
        <Popover at={tagMenu} anchor={null} onClose={() => setTagMenu(null)} zIndex={200}>
          <div className="max-h-64 w-44 overflow-y-auto">
            {tags.map((tg) => {
              const on = clip.tag_ids.includes(tg.id);
              return (
                <MenuItem key={tg.id} onClick={() => void toggleClipItemTag(clip.id, tg.id)}>
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-divider"
                    style={{ background: tg.color || "transparent" }}
                  />
                  <span className="min-w-0 flex-1 truncate">{tg.name}</span>
                  {on && <CheckSquare size={12} className="text-accent" />}
                </MenuItem>
              );
            })}
          </div>
        </Popover>
      )}
    </div>
  );
}

/** 第二侧栏里的剪切板标签行:点击过滤,右键改名/改色/删 */
function ClipTagRow({ tag, active }: { tag: ClipTag; active: boolean }) {
  const setClipFilterTag = useAppStore((s) => s.setClipFilterTag);
  const renameClipTag = useAppStore((s) => s.renameClipTag);
  const setClipTagColor = useAppStore((s) => s.setClipTagColor);
  const removeClipTag = useAppStore((s) => s.removeClipTag);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.name);
  const [colorOpen, setColorOpen] = useState(false);

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

  return (
    <div className="group relative">
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
          className={`flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            active
              ? "bg-sidebar-selected text-sidebar-selected-fg"
              : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
          }`}
        >
          <Tag size={14} className="shrink-0" style={tag.color ? { color: tag.color } : undefined} />
          <span className="min-w-0 flex-1 truncate">{tag.name}</span>
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
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);

  // 第二侧边栏宽度可拖动并持久化(对齐便签/标签第二侧栏:默认 224,范围 160–460)
  const [navWidth, setNavWidth] = useState(() =>
    Math.min(460, Math.max(160, Number(settings["clip_sidebar_width"]) || 224)),
  );
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = navWidth;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(460, Math.max(160, startW + ev.clientX - startX));
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

  const filtered =
    clipFilterTagId == null ? clips : clips.filter((c) => c.tag_ids.includes(clipFilterTagId));

  return (
    <div className="flex min-h-0 flex-1">
      {collapsed ? (
        <aside className="flex w-12 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div data-tauri-drag-region className="h-9 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1 pt-0">
            <button
              title={t("S.X.ClipAll")}
              onClick={() => setClipFilterTag(null)}
              className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                clipFilterTagId == null
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-strong hover:bg-sidebar-hover"
              }`}
            >
              <ClipboardIcon size={16} />
            </button>
            {clipTags.map((tg) => (
              <button
                key={tg.id}
                title={tg.name}
                onClick={() => setClipFilterTag(tg.id)}
                className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                  clipFilterTagId === tg.id
                    ? "bg-sidebar-selected text-sidebar-selected-fg"
                    : "text-sidebar-strong hover:bg-sidebar-hover"
                }`}
              >
                <Tag size={15} style={tg.color ? { color: tg.color } : undefined} />
              </button>
            ))}
          </div>
          <div className="shrink-0 p-1">
            <button
              title={t("S.X.ExpandSidebar")}
              onClick={toggleCollapsed}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-strong hover:bg-sidebar-hover"
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
            className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40"
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
              onClick={() => setClipFilterTag(null)}
              className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium ${
                clipFilterTagId == null
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
              }`}
            >
              <ClipboardIcon size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.X.ClipAll")}</span>
              <span className="text-xs text-sidebar-muted">{clips.length}</span>
            </button>
            {clipTags.map((tg) => (
              <ClipTagRow key={tg.id} tag={tg} active={clipFilterTagId === tg.id} />
            ))}
          </div>
          <div className="shrink-0 p-2 pt-1">
            <button
              title={t("S.X.CollapseSidebar")}
              onClick={toggleCollapsed}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <PanelLeftClose size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.X.CollapseSidebar")}</span>
            </button>
          </div>
        </aside>
      )}

      {/* 右侧:剪贴项列表 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {filtered.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            {t("S.X.ClipEmpty")}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {filtered.map((clip) => (
              <ClipRow key={clip.id} clip={clip} tags={clipTags} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
