import { useEffect, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { Tag } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useSortableItem } from "../../hooks/useSortableItem";
import { reorderIds } from "../../lib/dnd";
import TaskItem from "../TaskItem";
import { useNowTick } from "../TaskList";
import { t } from "../../lib/i18n";
import type { Task } from "../../lib/tauri-ipc";

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
      {/* 头部:标签色淡底徽章 + 名称 + 彩色计数(对齐旧版容器头) */}
      <div ref={ref} className="mb-2 flex cursor-grab items-center gap-2 px-0.5">
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
          style={{ background: `color-mix(in srgb, ${col.color} 12%, transparent)` }}
        >
          <Tag size={13} style={{ color: col.color }} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text-1">
          {col.name}
        </span>
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
