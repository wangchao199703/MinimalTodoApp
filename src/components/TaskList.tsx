import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { ArrowUpDown, Check, Trash2 } from "lucide-react";
import { useAppStore, selectVisibleTasks } from "../store/useAppStore";
import { SORT_OPTIONS } from "../lib/sort";
import { t } from "../lib/i18n";
import TaskItem from "./TaskItem";
import { Popover, MenuItem } from "./ui/Popover";
import { confirm } from "./ui/ConfirmDialog";

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
  const moveTask = useAppStore((s) => s.moveTask);
  const clearCompleted = useAppStore((s) => s.clearCompleted);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const now = useNowTick();

  // 任务拖拽:重排 + 改父级(落点「下面那条」待办决定新层级)
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "task",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const edge = extractClosestEdge(target.data);
        void moveTask(
          source.data.id as string,
          target.data.id as string,
          edge === "top" ? "top" : "bottom",
        );
      },
    });
  }, [moveTask]);

  const visible = selectVisibleTasks({ tasks, view, sortMode });
  const title =
    view.kind === "all"
      ? t("S.Group.AllUncompleted")
      : view.kind === "completed"
        ? t("S.Group.Completed")
        : view.kind === "group"
          ? (groups.find((g) => g.id === view.groupId)?.name ?? "")
          : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center px-4 pt-3 pb-2">
        <h1 className="text-base font-semibold text-text-1">{title}</h1>
        {/* 已完成视图:一键清空(对齐旧版 S.Group.ClearCompleted) */}
        {view.kind === "completed" && visible.length > 0 && (
          <button
            onClick={() => {
              void (async () => {
                if (
                  await confirm({
                    title: t("S.Group.ClearCompleted"),
                    message: t("S.X.ConfirmClearCompleted"),
                  })
                ) {
                  void clearCompleted();
                }
              })();
            }}
            className="ml-auto flex h-6 items-center gap-1 rounded px-1.5 text-xs text-text-2 hover:bg-card-hover hover:text-overdue"
          >
            <Trash2 size={12} />
            {t("S.Group.ClearCompleted")}
          </button>
        )}
        <button
          title={t("S.X.SortBy")}
          onClick={(e) => setSortAnchor(e.currentTarget)}
          className={`flex h-6 items-center gap-1 rounded px-1.5 text-xs text-text-2 hover:bg-card-hover ${
            view.kind === "completed" && visible.length > 0 ? "ml-1" : "ml-auto"
          }`}
        >
          <ArrowUpDown size={12} />
          {t(SORT_OPTIONS.find((o) => o.mode === sortMode)?.labelKey ?? "")}
        </button>
      </div>

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-2">
        {visible.map((task) => (
          <TaskItem key={task.id} task={task} now={now} />
        ))}
        {visible.length === 0 && (
          <p className="mt-12 text-center text-sm text-muted">
            {view.kind === "completed" ? t("S.X.EmptyCompleted") : t("S.X.EmptyList")}
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
                {t(o.labelKey)}
                {sortMode === o.mode && <Check size={12} className="ml-auto text-accent" />}
              </MenuItem>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
