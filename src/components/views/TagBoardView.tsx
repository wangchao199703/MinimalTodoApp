import { useEffect, useRef } from "react";
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

function colKey(id: string | null): string {
  return id ?? UNTAGGED_KEY;
}

function BoardColumn({ col, tasks, now }: { col: Column; tasks: Task[]; now: Date }) {
  const { ref, isDragging, closestEdge } = useSortableItem<HTMLDivElement>(
    "tagcol",
    colKey(col.id),
    "horizontal",
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

  // 列空白区作为跨列释放目标
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
      className={`relative flex w-56 shrink-0 flex-col rounded-xl bg-card p-2 ${
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
      <div ref={ref} className="mb-1.5 flex cursor-grab items-center gap-1.5 px-1">
        <Tag size={12} style={{ color: col.color }} />
        <span className="truncate text-xs font-medium text-text-2">{col.name}</span>
        <span className="ml-auto text-xs text-muted">{tasks.length}</span>
      </div>
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} now={now} />
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

  // 列 = 各标签 + 「无标签」;无标签列位置可拖动调整并持久化(-1 = 末位)
  const untaggedCol: Column = { id: null, name: t("S.Tag.Untagged"), color: "var(--muted-text)" };
  const cols: Column[] = groups.map((g) => ({ id: g.id, name: g.name, color: g.color }));
  const savedIdx = Number(settings["untagged_column_index"] ?? "-1");
  if (savedIdx >= 0 && savedIdx <= cols.length) cols.splice(savedIdx, 0, untaggedCol);
  else cols.push(untaggedCol);

  const tops = tasks
    .filter((t) => !t.is_completed && !t.parent_id)
    .sort((a, b) => a.order_index - b.order_index);
  const byCol = new Map<string, Task[]>();
  for (const c of cols) byCol.set(colKey(c.id), []);
  for (const t of tops) {
    const key = t.group_id && byCol.has(t.group_id) ? t.group_id : UNTAGGED_KEY;
    byCol.get(key)?.push(t);
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

        // —— 任务拖拽:同列重排 / 跨列改标签 ——
        if (source.data.type !== "task") return;
        const sourceId = source.data.id as string;
        const sourceTask = state.tasks.find((t) => t.id === sourceId);
        if (!sourceTask) return;

        if (target.data.type === "task-col") {
          // 拖到列空白处:改标签
          const colId = target.data.colId as string;
          void patchTask({ id: sourceId, group_id: colId === UNTAGGED_KEY ? "" : colId });
          return;
        }
        const targetTask = state.tasks.find((t) => t.id === target.data.id);
        if (!targetTask) return;
        const all = [...state.tasks].sort((a, b) => a.order_index - b.order_index);
        const ids = reorderIds(
          all.map((t) => t.id),
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
    <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3">
      {cols.map((c) => (
        <BoardColumn key={colKey(c.id)} col={c} tasks={byCol.get(colKey(c.id)) ?? []} now={now} />
      ))}
    </div>
  );
}
