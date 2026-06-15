import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { Palette, Pencil, Shapes, Trash2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useSortableItem } from "../../hooks/useSortableItem";
import { reorderIds } from "../../lib/dnd";
import TaskItem from "../TaskItem";
import { useNowTick } from "../TaskList";
import { f, t } from "../../lib/i18n";
import type { Task } from "../../lib/tauri-ipc";
import { Popover, MenuItem } from "../ui/Popover";
import { confirm } from "../ui/ConfirmDialog";
import TagIcon from "../ui/TagIcon";
import TagColorDialog from "../dialogs/TagColorDialog";
import IconPickerDialog from "../dialogs/IconPickerDialog";

interface Column {
  /** null = 无标签列 */
  id: string | null;
  name: string;
  color: string;
}

const UNTAGGED_KEY = "__untagged__";
/** 瀑布流目标列宽(对齐旧版 MasonryPanel.ColumnWidth 思路,自适应列数) */
const MASONRY_COL_W = 248;
const GAP = 12;

function colKey(id: string | null): string {
  return id ?? UNTAGGED_KEY;
}

/** 单个标签卡片:高度随内容自适应(瀑布流单元) */
function BoardCard({ col, tasks, now }: { col: Column; tasks: Task[]; now: Date }) {
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>(
    "tagcol",
    colKey(col.id),
    "horizontal",
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

  // 真实标签(非「无标签」列)的右键菜单与外观编辑(对齐旧版标签容器右键)
  const group = useAppStore((s) => s.groups.find((g) => g.id === col.id));
  const renameGroup = useAppStore((s) => s.renameGroup);
  const removeGroup = useAppStore((s) => s.removeGroup);
  const addTask = useAppStore((s) => s.addTask);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(col.name);
  // 容器内「+ 添加」:回车以本列标签建一条待办(对齐旧版 AddTaskToTag;无标签列 → 不归组)
  const [newText, setNewText] = useState("");
  const submitNew = () => {
    const title = newText.trim();
    if (!title) return;
    void addTask(title, { group_id: col.id ?? undefined });
    setNewText("");
  };

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (group && name && name !== group.name) void renameGroup(group.id, name);
    else setDraft(col.name);
  };

  const confirmDelete = async () => {
    if (!group) return;
    if (
      await confirm({
        title: t("S.Tag.Delete"),
        message: f("S.X.ConfirmDeleteTag", group.name),
      })
    ) {
      void removeGroup(group.id);
    }
  };

  // 卡片空白区作为跨列释放目标
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      getData: () => ({ type: "task-col", colId: colKey(col.id) }),
    });
  }, [col.id]);

  return (
    <div
      className={`relative flex flex-col rounded-xl border border-divider bg-card p-2.5 ${
        isDragging ? "dragging" : ""
      }`}
    >
      {closestEdge && (
        <div
          className={`absolute inset-y-1 z-10 w-0.5 rounded bg-accent ${
            closestEdge === "left" ? "-left-1.5" : "-right-1.5"
          }`}
        />
      )}
      {/* 头部:标签色淡底徽章 + 名称 + 彩色计数(对齐旧版容器头);真实标签可右键编辑 */}
      <div
        ref={ref}
        onContextMenu={(e) => {
          if (!group) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className="mb-2 flex cursor-grab items-center gap-2 px-0.5"
      >
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
          style={{ background: `color-mix(in srgb, ${col.color} 12%, transparent)` }}
        >
          <TagIcon icon={group?.icon ?? ""} iconImage={group?.icon_image} color={col.color} size={13} />
        </span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraft(col.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-accent bg-input px-1 py-0.5 text-[13px] font-semibold text-text-1 outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-1">
            {col.name}
          </span>
        )}
        <span className="text-[13px] font-semibold" style={{ color: col.color }}>
          {tasks.length}
        </span>
      </div>
      <div ref={bodyRef} className="flex min-h-6 flex-col">
        <div ref={listRef} className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} now={now} />
          ))}
        </div>
      </div>
      {/* 容器内「+ 添加」输入(对齐 WPF 标签看板:每个容器底部自带);回车以本列标签建待办 */}
      <input
        value={newText}
        onChange={(e) => setNewText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitNew();
        }}
        placeholder={t("S.Tag.AddPlaceholder")}
        className="mt-2 w-full rounded-md border border-divider bg-input px-2 py-1 text-[13px] text-text-1 outline-none placeholder:text-muted focus:border-accent"
      />

      {menu && group && (
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
      {colorOpen && group && <TagColorDialog group={group} onClose={() => setColorOpen(false)} />}
      {iconOpen && group && <IconPickerDialog group={group} onClose={() => setIconOpen(false)} />}
    </div>
  );
}

export default function TagBoardView() {
  const tasks = useAppStore((s) => s.tasks);
  const groups = useAppStore((s) => s.groups);
  const settings = useAppStore((s) => s.settings);
  const reorderTasks = useAppStore((s) => s.reorderTasks);
  const reorderGroups = useAppStore((s) => s.reorderGroups);
  const patchTask = useAppStore((s) => s.patchTask);
  const saveSetting = useAppStore((s) => s.saveSetting);
  const now = useNowTick();

  // 容器宽度自适应列数(对齐旧版 MasonryPanel:floor(width / colW),至少 1 列)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [colCount, setColCount] = useState(2);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 24; // 去掉左右 padding
      setColCount(Math.max(1, Math.floor((w + GAP) / (MASONRY_COL_W + GAP))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 列 = 各标签 + 「无标签」;无标签列位置可拖动调整并持久化(-1 = 末位)
  const untaggedCol: Column = { id: null, name: t("S.Tag.Untagged"), color: "var(--muted-text)" };
  const cols: Column[] = groups.map((g) => ({ id: g.id, name: g.name, color: g.color }));
  const savedIdx = Number(settings["untagged_column_index"] ?? "-1");
  if (savedIdx >= 0 && savedIdx <= cols.length) cols.splice(savedIdx, 0, untaggedCol);
  else cols.push(untaggedCol);

  const tops = tasks
    .filter((task) => !task.is_completed && !task.parent_id)
    .sort((a, b) => a.order_index - b.order_index);
  const byCol = new Map<string, Task[]>();
  for (const c of cols) byCol.set(colKey(c.id), []);
  for (const task of tops) {
    const key = task.group_id && byCol.has(task.group_id) ? task.group_id : UNTAGGED_KEY;
    byCol.get(key)?.push(task);
  }

  // 空标签不上看板(含空的「无标签」卡)
  const visibleCols = cols.filter((c) => (byCol.get(colKey(c.id))?.length ?? 0) > 0);

  // 瀑布流分配:按顺序把每张卡片放进当前最短的列(高度按任务数估算)
  const lanes: Column[][] = Array.from({ length: colCount }, () => []);
  const laneHeights = new Array(colCount).fill(0);
  for (const c of visibleCols) {
    const shortest = laneHeights.indexOf(Math.min(...laneHeights));
    lanes[shortest].push(c);
    laneHeights[shortest] += 56 + (byCol.get(colKey(c.id))?.length ?? 0) * 48;
  }

  useEffect(() => {
    return monitorForElements({
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const state = useAppStore.getState();

        // —— 看板列重排 ——
        if (source.data.type === "tagcol") {
          if (target.data.type !== "tagcol") return;
          const current: string[] = [];
          {
            // 与渲染一致地重建列顺序
            const idx = Number(state.settings["untagged_column_index"] ?? "-1");
            const ids = state.groups.map((g) => g.id);
            if (idx >= 0 && idx <= ids.length) ids.splice(idx, 0, UNTAGGED_KEY);
            else ids.push(UNTAGGED_KEY);
            current.push(...ids);
          }
          const next = reorderIds(
            current,
            source.data.id as string,
            target.data.id as string,
            extractClosestEdge(target.data),
          );
          const untaggedIdx = next.indexOf(UNTAGGED_KEY);
          saveSetting(
            "untagged_column_index",
            String(untaggedIdx === next.length - 1 ? -1 : untaggedIdx),
          );
          void reorderGroups(next.filter((id) => id !== UNTAGGED_KEY));
          return;
        }

        // —— 任务拖拽:同卡重排 / 跨卡改标签 ——
        if (source.data.type !== "task") return;
        const sourceId = source.data.id as string;
        const sourceTask = state.tasks.find((task) => task.id === sourceId);
        if (!sourceTask) return;

        if (target.data.type === "task-col") {
          // 拖到卡片空白处:改标签
          const colId = target.data.colId as string;
          void patchTask({ id: sourceId, group_id: colId === UNTAGGED_KEY ? "" : colId });
          return;
        }
        const targetTask = state.tasks.find((task) => task.id === target.data.id);
        if (!targetTask) return;
        const all = [...state.tasks].sort((a, b) => a.order_index - b.order_index);
        const ids = reorderIds(
          all.map((task) => task.id),
          sourceId,
          targetTask.id,
          extractClosestEdge(target.data),
        );
        void reorderTasks(ids);
        if ((sourceTask.group_id ?? null) !== (targetTask.group_id ?? null)) {
          void patchTask({ id: sourceId, group_id: targetTask.group_id ?? "" });
        }
      },
    });
  }, [reorderTasks, reorderGroups, patchTask, saveSetting]);

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="flex items-start gap-3">
        {lanes.map((lane, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
            {lane.map((c) => (
              <BoardCard key={colKey(c.id)} col={c} tasks={byCol.get(colKey(c.id)) ?? []} now={now} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
