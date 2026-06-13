import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  Kanban,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Shapes,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { reorderIds } from "../lib/dnd";
import { f, t } from "../lib/i18n";
import type { Group } from "../lib/tauri-ipc";
import { Popover, MenuItem } from "./ui/Popover";
import { confirm } from "./ui/ConfirmDialog";
import TagIcon from "./ui/TagIcon";
import TagColorDialog from "./dialogs/TagColorDialog";
import IconPickerDialog from "./dialogs/IconPickerDialog";

/** 第二侧边栏里的标签行(原主侧栏 GroupRow 展开态):点击进该标签视图,右键改色/图标/改名/删除 */
function TagRow({ group, count, active }: { group: Group; count: number; active: boolean }) {
  const setView = useAppStore((s) => s.setView);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const removeGroup = useAppStore((s) => s.removeGroup);
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("group", group.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== group.name) void renameGroup(group.id, name);
    else setDraft(group.name);
  };

  const confirmDelete = async () => {
    if (await confirm({ title: t("S.Tag.Delete"), message: f("S.X.ConfirmDeleteTag", group.name) })) {
      void removeGroup(group.id);
    }
  };

  return (
    <div ref={ref} className={`group relative ${isDragging ? "dragging" : ""}`}>
      {closestEdge && (
        <div
          className={`absolute inset-x-1 h-0.5 rounded bg-accent ${
            closestEdge === "top" ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(group.name);
              setEditing(false);
            }
          }}
          className="w-full rounded-md border border-accent bg-sidebar-hover px-2 py-1.5 text-sm text-sidebar-strong outline-none"
        />
      ) : (
        <div
          onClick={() => setView({ kind: "group", groupId: group.id })}
          onDoubleClick={() => {
            setDraft(group.name);
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
          <TagIcon icon={group.icon} iconImage={group.icon_image} color={group.color} size={14} />
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          {count > 0 && <span className="text-xs text-sidebar-muted">{count}</span>}
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
                setDraft(group.name);
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
                setIconOpen(true);
              }}
            >
              <Shapes size={13} />
              {t("S.Group.ChangeIcon")}
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
      {colorOpen && <TagColorDialog group={group} onClose={() => setColorOpen(false)} />}
      {iconOpen && <IconPickerDialog group={group} onClose={() => setIconOpen(false)} />}
    </div>
  );
}

/**
 * 标签视图的第二侧边栏(参考便签):标签列表 + 顶部新建按钮,可拖动改宽。
 * 在标签看板与具体标签视图中常驻;点标签进该标签任务,主侧栏「标签」入口回看板。
 */
export default function TagSidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const groups = useAppStore((s) => s.groups);
  const tasks = useAppStore((s) => s.tasks);
  const addGroup = useAppStore((s) => s.addGroup);
  const reorderGroups = useAppStore((s) => s.reorderGroups);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

  // 宽度可拖动并持久化(默认 224,范围 160–460)
  const [navWidth, setNavWidth] = useState(() =>
    Math.min(460, Math.max(160, Number(settings["tags_sidebar_width"]) || 224)),
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
      saveSetting("tags_sidebar_width", String(Math.round(w)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 标签拖拽重排
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "group",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target || target.data.type !== "group") return;
        const ids = reorderIds(
          useAppStore.getState().groups.map((g) => g.id),
          source.data.id as string,
          target.data.id as string,
          extractClosestEdge(target.data),
        );
        void reorderGroups(ids);
      },
    });
  }, [reorderGroups]);

  // 第二侧边栏收起:收起后只剩一条窄边 + 展开按钮
  const collapsed = settings["tags_sidebar_collapsed"] === "1";
  const toggleCollapsed = () =>
    saveSetting("tags_sidebar_collapsed", collapsed ? "0" : "1");

  if (collapsed) {
    // 收起态:对齐主侧栏,只剩一列图标(标签看板 + 各标签),底部展开按钮
    return (
      <aside className="flex w-12 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="shrink-0 p-1 pt-2">
          <button
            title={t("S.X.ExpandSidebar")}
            onClick={toggleCollapsed}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1">
          <button
            title={t("S.X.TagBoardRoot")}
            onClick={() => setView({ kind: "tagboard" })}
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
              view.kind === "tagboard"
                ? "bg-sidebar-selected text-sidebar-selected-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
            }`}
          >
            <Kanban size={16} />
          </button>
          {groups.map((g) => {
            const active = view.kind === "group" && view.groupId === g.id;
            return (
              <button
                key={g.id}
                title={g.name}
                onClick={() => setView({ kind: "group", groupId: g.id })}
                className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
                  active
                    ? "bg-sidebar-selected text-sidebar-selected-fg"
                    : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
                }`}
              >
                <TagIcon icon={g.icon} iconImage={g.icon_image} color={g.color} size={16} />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  const countByGroup = new Map<string | null, number>();
  for (const tk of tasks) {
    if (!tk.is_completed) countByGroup.set(tk.group_id, (countByGroup.get(tk.group_id) ?? 0) + 1);
  }

  return (
    <aside
      style={{ width: navWidth }}
      className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      <div
        onMouseDown={startResize}
        className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40"
      />
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {/* 父级:标签看板(进入标签默认选中)+ 新建标签按钮 */}
        <div className="group/board relative flex items-center">
          <button
            onClick={() => setView({ kind: "tagboard" })}
            className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium ${
              view.kind === "tagboard"
                ? "bg-sidebar-selected text-sidebar-selected-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
            }`}
          >
            <Kanban size={14} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{t("S.X.TagBoardRoot")}</span>
          </button>
          <span className="absolute right-1 flex items-center gap-0.5">
            <button
              title={t("S.Tag.New")}
              onClick={() => void addGroup(t("S.X.NewTagName"))}
              className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <Plus size={14} />
            </button>
            <button
              title={t("S.X.CollapseSidebar")}
              onClick={toggleCollapsed}
              className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <PanelLeftClose size={13} />
            </button>
          </span>
        </div>
        {/* 标签:与「标签看板」同级平铺(无缩进层级) */}
        {groups.map((g) => (
          <TagRow
            key={g.id}
            group={g}
            count={countByGroup.get(g.id) ?? 0}
            active={view.kind === "group" && view.groupId === g.id}
          />
        ))}
      </div>
    </aside>
  );
}
