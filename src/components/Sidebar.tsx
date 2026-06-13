import { Fragment, useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FolderPlus,
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
import NotesTree from "./NotesTree";

function viewKey(v: View): string {
  return v.kind === "group" ? `group:${v.groupId}` : v.kind;
}

/** 可自由拖动排序的五个内置导航项(顺序持久化在 settings.sidebar_order) */
const NAV_KEYS = ["all", "quadrant", "tagboard", "notes", "completed"] as const;
type NavKey = (typeof NAV_KEYS)[number];

/** 解析持久化顺序:过滤未知键、去重,缺失的按内置默认顺序补全(向后兼容) */
function parseNavOrder(raw: string | undefined): NavKey[] {
  const known = new Set<string>(NAV_KEYS);
  const seen = new Set<string>();
  const result: NavKey[] = [];
  for (const k of (raw ?? "").split(",")) {
    if (known.has(k) && !seen.has(k)) {
      result.push(k as NavKey);
      seen.add(k);
    }
  }
  for (const k of NAV_KEYS) if (!seen.has(k)) result.push(k);
  return result;
}

/** 导航项拖拽外壳:整行作为拖拽源 + 释放目标,命中时高亮 closestEdge 指示线 */
function SortableNav({ navKey, children }: { navKey: NavKey; children: React.ReactNode }) {
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("nav", navKey);
  return (
    <div ref={ref} className={`relative ${isDragging ? "dragging" : ""}`}>
      {closestEdge && (
        <div
          className={`absolute inset-x-1 z-10 h-0.5 rounded bg-accent ${
            closestEdge === "top" ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      {children}
    </div>
  );
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
          <TagIcon icon={group.icon} iconImage={group.icon_image} color={group.color} size={15} />
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
      {overlays}
    </div>
  );
}

export default function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const groups = useAppStore((s) => s.groups);
  const tasks = useAppStore((s) => s.tasks);
  const notes = useAppStore((s) => s.notes);
  const addGroup = useAppStore((s) => s.addGroup);
  const addNote = useAppStore((s) => s.addNote);
  const addNoteGroup = useAppStore((s) => s.addNoteGroup);
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

  // 内置导航项拖拽重排(顺序落 settings.sidebar_order)
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "nav",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target || target.data.type !== "nav") return;
        const cur = parseNavOrder(useAppStore.getState().settings["sidebar_order"]);
        const ids = reorderIds(
          cur,
          source.data.id as string,
          target.data.id as string,
          extractClosestEdge(target.data),
        );
        saveSetting("sidebar_order", ids.join(","));
      },
    });
  }, [saveSetting]);

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

  // 「便签」节二级折叠,默认折叠(与标签节一致)
  const notesCollapsed = settings["notes_section_collapsed"] !== "0";
  const toggleNotes = () => saveSetting("notes_section_collapsed", notesCollapsed ? "0" : "1");

  // 内置导航项当前顺序(可拖动)
  const navOrder = parseNavOrder(settings["sidebar_order"]);

  // 单个导航项的「行本体」(拖拽外壳包裹的部分);标签/便签为带折叠的复合行
  const navHeader = (key: NavKey) => {
    switch (key) {
      case "all":
        return (
          <NavRow
            icon={<Inbox size={14} className="shrink-0" />}
            label={t("S.Group.AllUncompleted")}
            count={uncompleted.length}
            active={activeKey === "all"}
            collapsed={collapsed}
            onClick={() => setView({ kind: "all" })}
          />
        );
      case "quadrant":
        return (
          <NavRow
            icon={<LayoutGrid size={14} className="shrink-0" />}
            label={t("S.Group.Quadrant")}
            active={activeKey === "quadrant"}
            collapsed={collapsed}
            onClick={() => setView({ kind: "quadrant" })}
          />
        );
      case "completed":
        return (
          <NavRow
            icon={<CheckCircle2 size={14} className="shrink-0" />}
            label={t("S.Group.Completed")}
            active={activeKey === "completed"}
            collapsed={collapsed}
            onClick={() => setView({ kind: "completed" })}
          />
        );
      case "tagboard":
        // 「标签」(标签看板):行本体与 NavRow 同版式;折叠箭头/新建按钮悬停淡入,箭头展开旋转 90°
        return collapsed ? (
          <NavRow
            icon={<Kanban size={14} className="shrink-0" />}
            label={t("S.Group.TagBoard")}
            active={activeKey === "tagboard"}
            collapsed
            onClick={() => setView({ kind: "tagboard" })}
          />
        ) : (
          <div className="group/tags relative flex items-center">
            <button
              onClick={() => setView({ kind: "tagboard" })}
              className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                activeKey === "tagboard"
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
              }`}
            >
              <Kanban size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.Group.TagBoard")}</span>
              {groups.length > 0 && (
                <span className="text-xs text-sidebar-muted transition-opacity duration-150 group-hover/tags:opacity-0">
                  {groups.length}
                </span>
              )}
            </button>
            <span className="pointer-events-none absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/tags:pointer-events-auto group-hover/tags:opacity-100">
              <button
                title={tagsCollapsed ? t("S.X.ExpandSidebar") : t("S.X.CollapseSidebar")}
                onClick={toggleTags}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <ChevronRight
                  size={12}
                  className={`transition-transform duration-150 ${tagsCollapsed ? "" : "rotate-90"}`}
                />
              </button>
              <button
                title={t("S.Tag.New")}
                onClick={() => {
                  void addGroup(t("S.X.NewTagName"));
                  if (tagsCollapsed) saveSetting("tags_section_collapsed", "0"); // 新建后自动展开
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <Plus size={13} />
              </button>
            </span>
          </div>
        );
      case "notes":
        // 「便签」:与标签行同款——本体 NavRow 版式,悬停淡入 折叠箭头/新建便签/新建分组
        return collapsed ? (
          <NavRow
            icon={<NotebookPen size={14} className="shrink-0" />}
            label={t("S.X.Notes")}
            active={activeKey === "notes"}
            collapsed
            onClick={() => setView({ kind: "notes" })}
          />
        ) : (
          <div className="group/notes relative flex items-center">
            <button
              onClick={() => setView({ kind: "notes" })}
              className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                activeKey === "notes"
                  ? "bg-sidebar-selected text-sidebar-selected-fg"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
              }`}
            >
              <NotebookPen size={14} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t("S.X.Notes")}</span>
              {notes.length > 0 && (
                <span className="text-xs text-sidebar-muted transition-opacity duration-150 group-hover/notes:opacity-0">
                  {notes.length}
                </span>
              )}
            </button>
            <span className="pointer-events-none absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/notes:pointer-events-auto group-hover/notes:opacity-100">
              <button
                title={notesCollapsed ? t("S.X.ExpandSidebar") : t("S.X.CollapseSidebar")}
                onClick={toggleNotes}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <ChevronRight
                  size={12}
                  className={`transition-transform duration-150 ${notesCollapsed ? "" : "rotate-90"}`}
                />
              </button>
              <button
                title={t("S.X.NewNote")}
                onClick={() => {
                  void addNote();
                  setView({ kind: "notes" });
                  if (notesCollapsed) saveSetting("notes_section_collapsed", "0"); // 新建后自动展开
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <FilePlus2 size={12} />
              </button>
              <button
                title={t("S.X.NewNoteGroup")}
                onClick={() => {
                  void addNoteGroup(t("S.X.NewNoteGroup"));
                  if (notesCollapsed) saveSetting("notes_section_collapsed", "0");
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
              >
                <FolderPlus size={12} />
              </button>
            </span>
          </div>
        );
    }
  };

  // 导航项下挂的二级内容(标签→分组列表;便签→便签树),随父项一起移动
  const navChildren = (key: NavKey) => {
    if (key === "tagboard")
      return (
        !tagsCollapsed &&
        groups.map((g) => (
          <div key={g.id} className={collapsed ? "" : "pl-4"}>
            <GroupRow
              group={g}
              count={countByGroup.get(g.id) ?? 0}
              active={activeKey === `group:${g.id}`}
              collapsed={collapsed}
            />
          </div>
        ))
      );
    if (key === "notes") return !collapsed && !notesCollapsed && <NotesTree />;
    return null;
  };

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
        {/* 五个内置导航项按持久化顺序渲染,可拖动重排;标签/便签的二级内容随父项一起移动 */}
        {navOrder.map((key) => (
          <Fragment key={key}>
            <SortableNav navKey={key}>{navHeader(key)}</SortableNav>
            {navChildren(key)}
          </Fragment>
        ))}
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
