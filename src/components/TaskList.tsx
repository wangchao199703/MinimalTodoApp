import { useEffect } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { useAppStore, selectVisibleTasks } from "../store/useAppStore";
import { reorderIds } from "../lib/dnd";
import TaskItem from "./TaskItem";

export default function TaskList() {
  const view = useAppStore((s) => s.view);
  const tasks = useAppStore((s) => s.tasks);
  const groups = useAppStore((s) => s.groups);
  const reorderTasks = useAppStore((s) => s.reorderTasks);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });

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

  const visible = selectVisibleTasks({ tasks, view });
  const title =
    view.kind === "all"
      ? "全部待办"
      : view.kind === "completed"
        ? "已完成"
        : (groups.find((g) => g.id === view.groupId)?.name ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <h1 className="text-base font-semibold text-text-1">{title}</h1>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-2">
        {visible.map((t) => (
          <TaskItem key={t.id} task={t} />
        ))}
        {visible.length === 0 && (
          <p className="mt-12 text-center text-sm text-muted">
            {view.kind === "completed" ? "还没有已完成的任务" : "没有待办,享受当下 ☕"}
          </p>
        )}
      </div>
    </div>
  );
}
