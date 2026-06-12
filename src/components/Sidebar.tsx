import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  CheckCircle2,
  Inbox,
  Kanban,
  LayoutGrid,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Tag,
  X,
} from "lucide-react";
import { useAppStore, type View } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { reorderIds } from "../lib/dnd";
import { t } from "../lib/i18n";
import type { Group } from "../lib/tauri-ipc";

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

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== group.name) void renameGroup(group.id, name);
    else setDraft(group.name);
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
          className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
            active ? "bg-sidebar-selected" : "hover:bg-sidebar-hover"
          }`}
        >
          <Tag size={15} style={{ color: group.color }} />
        </button>
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
          className={`flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            active
              ? "bg-sidebar-selected text-sidebar-selected-fg"
              : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
          }`}
        >
          <Tag size={14} className="shrink-0" style={{ color: group.color }} />
          <span className="min-w-0 flex-1 truncate">{group.name}</span>
          {count > 0 && <span className="text-xs text-sidebar-muted">{count}</span>}
          <button
            title={t("S.Tag.Delete")}
            onClick={(e) => {
              e.stopPropagation();
              void removeGroup(group.id);
            }}
            className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-overdue group-hover:flex"
          >
            <X size={12} />
          </button>
        </div>
      )}
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
      <nav className="flex flex-col gap-0.5 p-2 pt-0">
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
        <NavRow
          icon={<Kanban size={14} className="shrink-0" />}
          label={t("S.Group.TagBoard")}
          active={activeKey === "tagboard"}
          collapsed={collapsed}
          onClick={() => setView({ kind: "tagboard" })}
        />
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
      </nav>

      {collapsed ? (
        <div className="mx-2 my-1 h-px shrink-0 bg-sidebar-border" />
      ) : (
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-xs font-medium text-sidebar-muted">{t("S.Tag.Label")}</span>
          <button
            title={t("S.Tag.New")}
            onClick={() => void addGroup(t("S.X.NewTagName"))}
            className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
          >
            <Plus size={13} />
          </button>
        </div>
      )}

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-0">
        {groups.map((g) => (
          <GroupRow
            key={g.id}
            group={g}
            count={countByGroup.get(g.id) ?? 0}
            active={activeKey === `group:${g.id}`}
            collapsed={collapsed}
          />
        ))}
      </div>

      {/* 底部:折叠/展开开关 */}
      <div className="shrink-0 p-2">
        <button
          title={collapsed ? t("S.X.ExpandSidebar") : t("S.X.CollapseSidebar")}
          onClick={toggleCollapsed}
          className="flex h-8 w-full items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>
    </aside>
  );
}
