import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  Eraser,
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

/**
 * 把一个元素注册为「待办落入分组」的释放目标:拖待办(type==="task")到分组上 → 归入该分组。
 * 数据形如 { type:"task-tag", groupId },由 TagSidebar 的 monitor 统一处理(对齐看板的 task-col)。
 * 注:与排序拖拽(source.type==="group"/"task" 落到同 type 目标)的数据 type 不同,两套 DnD 靠 type 区分、互不干扰。
 */
function useTagDrop(ref: React.RefObject<HTMLElement | null>, groupId: string | null) {
  const [taskOver, setTaskOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      getData: () => ({ type: "task-tag", groupId: groupId ?? "" }),
      onDragEnter: () => setTaskOver(true),
      onDragLeave: () => setTaskOver(false),
      onDrop: () => setTaskOver(false),
    });
  }, [ref, groupId]);
  return taskOver;
}

/** 第二侧边栏里的标签行(原主侧栏 GroupRow 展开态):点击进该标签视图,右键改色/图标/改名/删除;可作为待办放置目标 */
function TagRow({ group, count, active }: { group: Group; count: number; active: boolean }) {
  const setView = useAppStore((s) => s.setView);
  const renameGroup = useAppStore((s) => s.renameGroup);
  const removeGroup = useAppStore((s) => s.removeGroup);
  const clearGroupTasks = useAppStore((s) => s.clearGroupTasks);
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>("group", group.id);
  // 「拖待办归类」的放置目标挂在内层独立元素上:pragmatic-dnd 同一元素只能注册一个 dropTarget,
  // 外层 ref 已被 useSortableItem 用于「分组重排」;放同一元素会被忽略(警告 + task-tag 失效)。
  // 内层目标 canDrop 只认 task,拖分组重排时它不接、自然冒泡到外层,两套互不干扰。
  const innerRef = useRef<HTMLDivElement | null>(null);
  const taskOver = useTagDrop(innerRef, group.id);
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

  const confirmClear = async () => {
    if (await confirm({ title: t("S.X.Clear"), message: f("S.X.ConfirmClearGroupTasks", group.name) })) {
      void clearGroupTasks(group.id);
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
      <div ref={innerRef}>
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
          className={`nav-lift flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
            taskOver
              ? "bg-sidebar-hover text-sidebar-strong ring-1 ring-inset ring-accent"
              : active
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
      </div>
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
      {colorOpen && <TagColorDialog group={group} onClose={() => setColorOpen(false)} />}
      {iconOpen && <IconPickerDialog group={group} onClose={() => setIconOpen(false)} />}
    </div>
  );
}

/** 折叠态的单个标签图标:同样作为待办放置目标(拖待办落上去归入该分组) */
function CollapsedTag({ group, active }: { group: Group; active: boolean }) {
  const setView = useAppStore((s) => s.setView);
  const ref = useRef<HTMLButtonElement | null>(null);
  const taskOver = useTagDrop(ref, group.id);
  return (
    <button
      ref={ref}
      title={group.name}
      onClick={() => setView({ kind: "group", groupId: group.id })}
      className={`nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
        taskOver
          ? "bg-sidebar-hover ring-1 ring-inset ring-accent"
          : active
            ? "bg-sidebar-selected text-sidebar-selected-fg"
            : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
      }`}
    >
      <TagIcon icon={group.icon} iconImage={group.icon_image} color={group.color} size={16} />
    </button>
  );
}

/**
 * 标签视图的第二侧边栏(参考便签):标签看板入口 + 标签列表,可拖动改宽/收起。
 * 在标签看板与具体标签视图中常驻;点标签进该标签任务,主侧栏「标签」入口回看板。
 * 支持把待办拖到某个标签上 → 该待办归入这个分组(monitor 统一处理 task→task-tag)。
 */
export default function TagSidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const groups = useAppStore((s) => s.groups);
  const tasks = useAppStore((s) => s.tasks);
  const addGroup = useAppStore((s) => s.addGroup);
  const reorderGroups = useAppStore((s) => s.reorderGroups);
  const patchTask = useAppStore((s) => s.patchTask);
  const settings = useAppStore((s) => s.settings);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

  // 宽度可拖动并持久化(默认 224,范围 60–460;下限按用户要求放到 60)
  const [navWidth, setNavWidth] = useState(() =>
    Math.min(460, Math.max(60, Number(settings["tags_sidebar_width"]) || 224)),
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
      saveSetting("tags_sidebar_width", String(Math.round(w)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // 标签拖拽重排 + 待办拖入分组改标签(两套 DnD 靠 source/target 的 type 区分,互不干扰)
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "group" || source.data.type === "task",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const state = useAppStore.getState();

        // —— 标签重排(source/target 同为 group)——
        if (source.data.type === "group") {
          if (target.data.type !== "group") return;
          const ids = reorderIds(
            state.groups.map((g) => g.id),
            source.data.id as string,
            target.data.id as string,
            extractClosestEdge(target.data),
          );
          void state.reorderGroups(ids);
          return;
        }

        // —— 待办拖到标签行/折叠图标(target 为 task-tag):归入该分组 ——
        // 待办落到任务行(target 为 task)的重排由 TaskList 的 monitor 负责,此处不处理。
        if (source.data.type === "task" && target.data.type === "task-tag") {
          const sourceId = source.data.id as string;
          const groupId = (target.data.groupId as string) ?? "";
          void state.patchTask({ id: sourceId, group_id: groupId });
        }
      },
    });
  }, [reorderGroups, patchTask]);

  // 第二侧边栏收起:收起后只剩一条窄边 + 展开按钮
  const collapsed = settings["tags_sidebar_collapsed"] === "1";
  const toggleCollapsed = () => saveSetting("tags_sidebar_collapsed", collapsed ? "0" : "1");

  if (collapsed) {
    // 收起态:对齐主侧栏,只剩一列图标(标签看板 + 各标签),底部展开按钮
    return (
      <aside className="flex w-12 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        {/* 顶部 h-9 占位,与主侧栏标题区等高,保证首图标纵向对齐 */}
        <div data-tauri-drag-region className="h-9 shrink-0" />
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-1 pt-0">
          <button
            title={t("S.X.TagBoardRoot")}
            onClick={() => setView({ kind: "tagboard" })}
            className={`nav-lift mx-auto flex h-9 w-9 items-center justify-center rounded-lg ${
              view.kind === "tagboard"
                ? "bg-sidebar-selected text-sidebar-selected-fg"
                : "text-sidebar-strong hover:bg-sidebar-hover"
            }`}
          >
            <Kanban size={16} />
          </button>
          {groups.map((g) => (
            <CollapsedTag
              key={g.id}
              group={g}
              active={view.kind === "group" && view.groupId === g.id}
            />
          ))}
        </div>
        {/* 折叠/展开按钮统一放底部 */}
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
      {/* 顶部:标题 + 新建标签按钮(对齐便签第二侧栏的 h-9 头部) */}
      <div className="flex h-9 shrink-0 items-center justify-between pr-2 pl-3">
        <span className="text-xs font-semibold text-sidebar-strong">{t("S.X.TagBoardRoot")}</span>
        <button
          title={t("S.Tag.New")}
          onClick={() => void addGroup(t("S.X.NewTagName"))}
          className="flex h-6 w-6 items-center justify-center rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong"
        >
          <Plus size={14} />
        </button>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-0">
        {/* 标签看板入口(全宽):进入标签默认选中 */}
        <button
          onClick={() => setView({ kind: "tagboard" })}
          className={`nav-lift flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium ${
            view.kind === "tagboard"
              ? "bg-sidebar-selected text-sidebar-selected-fg"
              : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-strong"
          }`}
        >
          <Kanban size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t("S.X.TagBoardRoot")}</span>
        </button>
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
      {/* 折叠按钮统一放底部(对齐主侧栏 / 便签第二侧栏) */}
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
  );
}
