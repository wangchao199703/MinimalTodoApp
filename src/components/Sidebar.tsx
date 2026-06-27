import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  CheckCircle2,
  Clipboard,
  Inbox,
  Kanban,
  LayoutGrid,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
} from "lucide-react";
import { useAppStore, type View } from "../store/useAppStore";
import { useSortableItem } from "../hooks/useSortableItem";
import { reorderIds } from "../lib/dnd";
import { t } from "../lib/i18n";
import { isTauri } from "../lib/env";
import { Popover, MenuItem } from "./ui/Popover";
import ColorDialog from "./dialogs/ColorDialog";

function viewKey(v: View): string {
  return v.kind === "group" ? `group:${v.groupId}` : v.kind;
}

/**
 * 可自由拖动排序的内置导航项(顺序持久化在 settings.sidebar_order)。
 * DEFAULT_ORDER 即新用户的默认顺序:所有待办、已完成、标签、四象限、剪切板、便签。
 * NAV_KEYS 仅作「合法键集合」用(成员与 DEFAULT_ORDER 相同,顺序不参与默认值)。
 */
const DEFAULT_ORDER = ["all", "completed", "tagboard", "quadrant", "clipboard", "notes"] as const;
const NAV_KEYS = DEFAULT_ORDER;
type NavKey = (typeof NAV_KEYS)[number];

/** 内置项图标颜色默认无色(单色),由用户右键自定义,持久化在 settings.nav_color_<key> */

/**
 * 解析持久化顺序:过滤未知键、去重;缺失的键(如老用户没有「剪切板」)按 DEFAULT_ORDER
 * 的相对位置「补位」回去——即把缺失键插到「其在默认顺序里的后继键」之前,
 * 没有后继则追加末尾。这样新增的剪切板会落在四象限之后、便签之前,而非粗暴塞到最后。
 */
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
  // 按默认顺序补全缺失键,插到其默认「后继且已存在」的键之前(保留老用户既有相对顺序)
  for (let i = 0; i < DEFAULT_ORDER.length; i++) {
    const k = DEFAULT_ORDER[i];
    if (seen.has(k)) continue;
    let insertAt = result.length;
    for (let j = i + 1; j < DEFAULT_ORDER.length; j++) {
      const idx = result.indexOf(DEFAULT_ORDER[j]);
      if (idx !== -1) {
        insertAt = idx;
        break;
      }
    }
    result.splice(insertAt, 0, k);
    seen.add(k);
  }
  // Web 无系统剪贴板监听:隐藏剪切板入口
  return isTauri ? result : result.filter((k) => k !== "clipboard");
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
  color?: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  // 彩色图标:包一层并设 color,lucide 走 currentColor 即上色(选中态也保持彩色,对齐标签图标)
  const iconEl = props.color ? (
    <span className="flex shrink-0" style={{ color: props.color }}>
      {props.icon}
    </span>
  ) : (
    props.icon
  );
  if (props.collapsed) {
    // 折叠态:只剩图标,选中项用色块高亮
    return (
      <button
        title={props.label}
        onClick={props.onClick}
        onContextMenu={props.onContextMenu}
        className={`nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
          props.active
            ? "bg-sidebar-selected text-sidebar-selected-fg"
            : "text-sidebar-strong hover:bg-sidebar-hover"
        }`}
      >
        {iconEl}
      </button>
    );
  }
  return (
    <button
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      className={`nav-lift flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
        props.active
          ? "bg-sidebar-selected text-sidebar-selected-fg"
          : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
      }`}
    >
      {iconEl}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.count !== undefined && props.count > 0 && (
        <span className="text-xs text-sidebar-muted">{props.count}</span>
      )}
    </button>
  );
}

export default function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const tasks = useAppStore((s) => s.tasks);
  const notes = useAppStore((s) => s.notes);
  const clips = useAppStore((s) => s.clips);
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

  // 全部 / 四象限 / 已完成统一口径:只数顶层父任务(不含子待办)
  const topLevelUncompleted = tasks.filter((t) => !t.is_completed && !t.parent_id).length;
  const completedCount = tasks.filter((t) => t.is_completed && !t.parent_id).length;
  const activeKey = viewKey(view);

  const collapsed = settings["sidebar_collapsed"] === "1";
  const toggleCollapsed = () => saveSetting("sidebar_collapsed", collapsed ? "0" : "1");

  // 内置项图标颜色:默认无色,右键菜单「修改颜色」自定义(持久化 nav_color_<key>)
  const [menu, setMenu] = useState<{ key: NavKey; x: number; y: number } | null>(null);
  const [colorKey, setColorKey] = useState<NavKey | null>(null);
  const navColor = (key: NavKey) => settings[`nav_color_${key}`] || undefined;
  const openMenu = (e: React.MouseEvent, key: NavKey) => {
    e.preventDefault();
    setMenu({ key, x: e.clientX, y: e.clientY });
  };

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
            count={topLevelUncompleted}
            active={activeKey === "all"}
            collapsed={collapsed}
            color={navColor("all")}
            onContextMenu={(e) => openMenu(e, "all")}
            onClick={() => setView({ kind: "all" })}
          />
        );
      case "quadrant":
        return (
          <NavRow
            icon={<LayoutGrid size={14} className="shrink-0" />}
            label={t("S.Group.Quadrant")}
            count={topLevelUncompleted}
            active={activeKey === "quadrant"}
            collapsed={collapsed}
            color={navColor("quadrant")}
            onContextMenu={(e) => openMenu(e, "quadrant")}
            onClick={() => setView({ kind: "quadrant" })}
          />
        );
      case "completed":
        return (
          <NavRow
            icon={<CheckCircle2 size={14} className="shrink-0" />}
            label={t("S.Group.Completed")}
            count={completedCount}
            active={activeKey === "completed"}
            collapsed={collapsed}
            color={navColor("completed")}
            onContextMenu={(e) => openMenu(e, "completed")}
            onClick={() => setView({ kind: "completed" })}
          />
        );
      case "tagboard":
        // 「标签」:点击进标签看板视图,该视图展开第二侧边栏(标签看板入口 + 各标签);
        // 进入具体标签(group 视图)时主入口仍保持选中态(第二侧栏才区分具体标签)
        return (
          <NavRow
            icon={<Kanban size={14} className="shrink-0" />}
            label={t("S.Group.TagBoard")}
            count={topLevelUncompleted}
            active={activeKey === "tagboard" || view.kind === "group"}
            collapsed={collapsed}
            color={navColor("tagboard")}
            onContextMenu={(e) => openMenu(e, "tagboard")}
            onClick={() => setView({ kind: "tagboard" })}
          />
        );
      case "clipboard":
        // 「剪切板」:切到剪贴板视图,该视图展开第二侧边栏(剪切板标签)+ 剪贴项列表
        return (
          <NavRow
            icon={<Clipboard size={14} className="shrink-0" />}
            label={t("S.X.Clipboard")}
            count={clips.length}
            active={activeKey === "clipboard"}
            collapsed={collapsed}
            color={navColor("clipboard")}
            onContextMenu={(e) => openMenu(e, "clipboard")}
            onClick={() => setView({ kind: "clipboard" })}
          />
        );
      case "notes":
        // 「便签」:普通导航行,只切到便签视图;新建/分组在便签视图的第二侧边栏里
        return (
          <NavRow
            icon={<NotebookPen size={14} className="shrink-0" />}
            label={t("S.X.Notes")}
            count={notes.length}
            active={activeKey === "notes"}
            collapsed={collapsed}
            color={navColor("notes")}
            onContextMenu={(e) => openMenu(e, "notes")}
            onClick={() => setView({ kind: "notes" })}
          />
        );
    }
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
        {/* 五个内置导航项按持久化顺序渲染,可拖动重排(标签/便签的列表已移入各自第二侧边栏) */}
        {navOrder.map((key) => (
          <SortableNav key={key} navKey={key}>
            {navHeader(key)}
          </SortableNav>
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

      {/* 右键菜单(与标签同款):「修改颜色」→ 打开调色对话框 */}
      {menu && (
        <Popover at={menu} anchor={null} onClose={() => setMenu(null)} zIndex={200}>
          <div className="w-32">
            <MenuItem
              onClick={() => {
                const k = menu.key;
                setMenu(null);
                setColorKey(k);
              }}
            >
              <Palette size={13} />
              {t("S.Group.ChangeColor")}
            </MenuItem>
          </div>
        </Popover>
      )}
      {colorKey && (
        <ColorDialog
          value={settings[`nav_color_${colorKey}`] || ""}
          onPick={(c) => saveSetting(`nav_color_${colorKey}`, c)}
          onClear={() => saveSetting(`nav_color_${colorKey}`, "")}
          onClose={() => setColorKey(null)}
        />
      )}
    </aside>
  );
}
