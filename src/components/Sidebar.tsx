import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Inbox,
  Kanban,
  LayoutGrid,
  NotebookPen,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Shapes,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore, type View } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { reorderIds } from "../lib/dnd";
import { f, t } from "../lib/i18n";
import type { Group } from "../lib/tauri-ipc";
import { Popover, MenuItem } from "./ui/Popover";
import { confirm } from "./ui/ConfirmDialog";
import TagIcon from "./ui/TagIcon";
import TagColorDialog from "./dialogs/TagColorDialog";
import IconPickerDialog from "./dialogs/IconPickerDialog";

function viewKey(v: View): string {
  return v.kind === "group" ? `group:${v.groupId}` : v.kind;
}

function NavRow(props: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  if (props.collapsed) {
    // 折叠态:只剩图标,选中项用色块高亮
    return (
      <button
        title={props.label}
        onClick={props.onClick}
        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
          props.active
            ? "bg-sidebar-selected text-sidebar-selected-fg"
            : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
        }`}
      >
        {props.icon}
      </button>
    );
  }
  return (
    <button
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
        props.active
          ? "bg-sidebar-selected text-sidebar-selected-fg"
          : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
      }`}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.count !== undefined && props.count > 0 && (
        <span className="text-xs text-sidebar-muted">{props.count}</span>
      )}
    </button>
  );
}

function GroupRow({
  group,
  count,
  active,
  collapsed,
}: {
  group: Group;
  count: number;
  active: boolean;
  collapsed: boolean;
}) {
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
    if (
      await confirm({
        title: t("S.Tag.Delete"),
        message: f("S.X.ConfirmDeleteTag", group.name),
      })
    ) {
      void removeGroup(group.id);
    }
  };

  // 右键菜单 + 颜色/图标对话框:折叠/展开两种形态共用
  const overlays = (
    <>
      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-36">
            {/* 折叠态没有内联编辑框,不提供重命名 */}
            {!collapsed && (
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
            )}
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
    </>
  );

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  if (collapsed) {
    // 折叠态:只剩彩色标签图标,选中项色块高亮
    return (
      <div ref={ref} className={`relative ${isDragging ? "dragging" : ""}`}>
        {closestEdge && (
          <div
            className={`absolute inset-x-1 h-0.5 rounded bg-accent ${
              closestEdge === "top" ? "-top-px" : "-bottom-px"
            }`}
          />
        )}
        <button
          title={group.name}
          onClick={() => setView({ kind: "group", groupId: group.id })}
          onContextMenu={onContextMenu}
          className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
            active ? "bg-sidebar-selected" : "hover:bg-sidebar-hover"
          }`}
        >
          <TagIcon icon={group.icon} color={group.color} size={15} />
        </button>
        {overlays}
      </div>
    );
  }

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
          onContextMenu={onContextMenu}
          className={`flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            active
              ? "bg-sidebar-selected text-sidebar-selected-fg"
              : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
          }`}
        >
          <TagIcon icon={group.icon} color={group.color} size={14} />
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
      {overlays}
    </div>
  );
}

export default function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const groups = useAppStore((s) => s.groups);
  const tasks = useAppStore((s) => s.tasks);
  const addGroup = useAppStore((s) => s.addGroup);
  const reorderGroups = useAppStore((s) => s.reorderGroups);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

  // 侧栏宽度可拖动并持久化(对齐旧版 SidebarWidth)
  const [width, setWidth] = useState(() =>
    Math.min(320, Math.max(110, Number(settings["sidebar_width"]) || 160)),
  );
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.min(320, Math.max(110, startW + ev.clientX - startX));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveSetting("sidebar_width", String(w));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 标签列表拖拽重排
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "group",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
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

  const uncompleted = tasks.filter((t) => !t.is_completed);
  const countByGroup = new Map<string | null, number>();
  for (const t of uncompleted) {
    countByGroup.set(t.group_id, (countByGroup.get(t.group_id) ?? 0) + 1);
  }
  const activeKey = viewKey(view);

  const collapsed = settings["sidebar_collapsed"] === "1";
  const toggleCollapsed = () => saveSetting("sidebar_collapsed", collapsed ? "0" : "1");

  // 「标签」分组二级折叠,默认折叠(未设置即折叠)
  const tagsCollapsed = settings["tags_section_collapsed"] !== "0";
  const toggleTags = () => saveSetting("tags_section_collapsed", tagsCollapsed ? "0" : "1");

  return (
    <aside
      style={{ width: collapsed ? 48 : width }}
      className="relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      {!collapsed && (
        <div
          onMouseDown={startResize}
          className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40"
        />
      )}
      {/* 侧栏顶部:应用名 + 窗口拖动热区(侧栏整列直通顶部,对齐 todo-flow) */}
      <div
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center px-3 text-xs font-semibold text-sidebar-strong"
      >
        {!collapsed && t("S.AppName")}
      </div>
      <div
        ref={listRef}
        className={`flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto pt-0 ${
          collapsed ? "p-1" : "p-2"
        }`}
      >
        <NavRow
          icon={<Inbox size={14} className="shrink-0" />}
          label={t("S.Group.AllUncompleted")}
          count={uncompleted.length}
          active={activeKey === "all"}
          collapsed={collapsed}
          onClick={() => setView({ kind: "all" })}
        />
        <NavRow
          icon={<LayoutGrid size={14} className="shrink-0" />}
          label={t("S.Group.Quadrant")}
          active={activeKey === "quadrant"}
          collapsed={collapsed}
          onClick={() => setView({ kind: "quadrant" })}
        />

        {/* 「标签」(标签看板):点文字进视图,点箭头折叠/展开下属标签;标签为其二级项 */}
        {collapsed ? (
          <NavRow
            icon={<Kanban size={14} className="shrink-0" />}
            label={t("S.Group.TagBoard")}
            active={activeKey === "tagboard"}
            collapsed
            onClick={() => setView({ kind: "tagboard" })}
          />
        ) : (
          <div className="flex items-center gap-0.5">
            <button
              title={tagsCollapsed ? t("S.X.ExpandSidebar") : t("S.X.CollapseSidebar")}
              onClick={toggleTags}
              className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:text-sidebar-strong"
            >
              {tagsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
            <button
              onClick={() => setView({ kind: "tagboard" })}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm ${
                activeKey === "tagboard"
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
              }`}
            >
              <Kanban size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.Group.TagBoard")}</span>
              {groups.length > 0 && (
                <span className="text-xs text-sidebar-muted">{groups.length}</span>
              )}
            </button>
            <button
              title={t("S.Tag.New")}
              onClick={() => {
                void addGroup(t("S.X.NewTagName"));
                if (tagsCollapsed) saveSetting("tags_section_collapsed", "0"); // 新建后自动展开
              }}
              className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
            >
              <Plus size={13} />
            </button>
          </div>
        )}

        {/* 标签:作为二级项缩进展示;折叠状态(tags_section_collapsed)在图标态同样生效 */}
        {!tagsCollapsed &&
          groups.map((g) => (
            <div key={g.id} className={collapsed ? "" : "pl-4"}>
              <GroupRow
                group={g}
                count={countByGroup.get(g.id) ?? 0}
                active={activeKey === `group:${g.id}`}
                collapsed={collapsed}
              />
            </div>
          ))}

        <NavRow
          icon={<NotebookPen size={14} className="shrink-0" />}
          label={t("S.X.Notes")}
          active={activeKey === "notes"}
          collapsed={collapsed}
          onClick={() => setView({ kind: "notes" })}
        />
        <NavRow
          icon={<CheckCircle2 size={14} className="shrink-0" />}
          label={t("S.Group.Completed")}
          active={activeKey === "completed"}
          collapsed={collapsed}
          onClick={() => setView({ kind: "completed" })}
        />
      </div>

      {/* 底部:折叠/展开开关(与上方导航行同款:图标 + 文字,折叠态只剩图标) */}
      <div className={`shrink-0 ${collapsed ? "p-1" : "p-2"}`}>
        <NavRow
          icon={
            collapsed ? (
              <PanelLeftOpen size={14} className="shrink-0" />
            ) : (
              <PanelLeftClose size={14} className="shrink-0" />
            )
          }
          label={collapsed ? t("S.X.ExpandSidebar") : t("S.X.CollapseSidebar")}
          active={false}
          collapsed={collapsed}
          onClick={toggleCollapsed}
        />
      </div>
    </aside>
  );
}
