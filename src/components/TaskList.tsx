import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { ArrowUpDown, Check } from "lucide-react";
import { useAppStore, selectVisibleTasks } from "../store/useAppStore";
import { reorderIds } from "../lib/dnd";
import { SORT_OPTIONS } from "../lib/sort";
import TaskItem from "./TaskItem";
import { Popover, MenuItem } from "./ui/Popover";

/** 倒计时刷新节拍:30 秒(对齐旧版定时器) */
export function useNowTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function TaskList() {
  const view = useAppStore((s) => s.view);
  const tasks = useAppStore((s) => s.tasks);
  const groups = useAppStore((s) => s.groups);
  const sortMode = useAppStore((s) => s.sortMode);
  const setSortMode = useAppStore((s) => s.setSortMode);
  const reorderTasks = useAppStore((s) => s.reorderTasks);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const now = useNowTick();

  // 任务拖拽重排:把可见列表的移动映射回全局 order_index 顺序
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "task",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const all = [...useAppStore.getState().tasks].sort(
          (a, b) => a.order_index - b.order_index,
        );
        const ids = reorderIds(
          all.map((t) => t.id),
          source.data.id as string,
          target.data.id as string,
          extractClosestEdge(target.data),
        );
        void reorderTasks(ids);
      },
    });
  }, [reorderTasks]);

  const visible = selectVisibleTasks({ tasks, view, sortMode });
  const title =
    view.kind === "all"
      ? "全部待办"
      : view.kind === "completed"
        ? "已完成"
        : view.kind === "group"
          ? (groups.find((g) => g.id === view.groupId)?.name ?? "")
          : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-4 pt-3 pb-2">
        <h1 className="text-base font-semibold text-text-1">{title}</h1>
        <button
          title="排序方式"
          onClick={(e) => setSortAnchor(e.currentTarget)}
          className="ml-auto flex h-6 items-center gap-1 rounded px-1.5 text-xs text-text-2 hover:bg-card-hover"
        >
          <ArrowUpDown size={12} />
          {SORT_OPTIONS.find((o) => o.mode === sortMode)?.label}
        </button>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-2">
        {visible.map((t) => (
          <TaskItem key={t.id} task={t} now={now} />
        ))}
        {visible.length === 0 && (
          <p className="mt-12 text-center text-sm text-muted">
            {view.kind === "completed" ? "还没有已完成的任务" : "没有待办,享受当下 ☕"}
          </p>
        )}
      </div>

      {sortAnchor && (
        <Popover anchor={sortAnchor} onClose={() => setSortAnchor(null)}>
          <div className="w-36">
            {SORT_OPTIONS.map((o) => (
              <MenuItem
                key={o.mode}
                onClick={() => {
                  setSortMode(o.mode);
                  setSortAnchor(null);
                }}
              >
                {o.label}
                {sortMode === o.mode && <Check size={12} className="ml-auto text-accent" />}
              </MenuItem>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
