import { useEffect, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { useAppStore } from "../../store/useAppStore";
import { quadrantOf, QUADRANT_META, type Quadrant } from "../../lib/quadrant";
import { reorderIds } from "../../lib/dnd";
import TaskItem from "../TaskItem";
import { useNowTick } from "../TaskList";
import { useRef } from "react";
import { Archive, CalendarClock, Flame, Users } from "lucide-react";
import type { Task } from "../../lib/tauri-ipc";

import { t } from "../../lib/i18n";

/** 象限图标(对齐旧版头部徽章的角色) */
const QUADRANT_ICONS: Record<Quadrant, typeof Flame> = {
  1: Flame,
  2: CalendarClock,
  3: Users,
  4: Archive,
};

function Cell({ q, tasks, now }: { q: Quadrant; tasks: Task[]; now: Date }) {
  const meta = QUADRANT_META[q];
  const Icon = QUADRANT_ICONS[q];
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 150 });
  // 象限内「+ 添加」:回车以本象限建一条待办(对齐标签看板每列底部输入)
  const addTaskToQuadrant = useAppStore((s) => s.addTaskToQuadrant);
  const [newText, setNewText] = useState("");
  const submitNew = () => {
    const title = newText.trim();
    if (!title) return;
    void addTaskToQuadrant(title, q);
    setNewText("");
  };

  // 单元格空白区也可作为释放目标(拖到空象限)
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      getData: () => ({ type: "task-cell", quadrant: q }),
    });
  }, [q]);

  return (
    <div
      ref={bodyRef}
      className="flex min-h-0 flex-col rounded-xl border border-divider bg-card p-2.5"
    >
      {/* 头部:彩色淡底图标徽章 + 标题/描述 + 彩色计数(对齐旧版) */}
      <div className="mb-2 flex shrink-0 items-center gap-2 px-0.5">
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
          style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
        >
          <Icon size={14} style={{ color: meta.color }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-semibold text-text-1">
            {t(meta.titleKey)}
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted">
            {t(meta.descKey)}
          </span>
        </span>
        <span className="text-[13px] font-semibold" style={{ color: meta.color }}>
          {tasks.length}
        </span>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} now={now} />
        ))}
      </div>
      {/* 象限内底部「+ 添加」输入(对齐标签看板每列底部);回车以本象限建待办 */}
      <input
        value={newText}
        onChange={(e) => setNewText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submitNew();
        }}
        placeholder={t("S.Tag.AddPlaceholder")}
        className="mt-2 w-full shrink-0 rounded-md border border-divider bg-input px-2 py-1 text-[13px] text-text-1 outline-none placeholder:text-muted focus:border-accent"
      />
    </div>
  );
}

export default function QuadrantView() {
  const tasks = useAppStore((s) => s.tasks);
  const settings = useAppStore((s) => s.settings);
  const reorderTasks = useAppStore((s) => s.reorderTasks);
  const patchTask = useAppStore((s) => s.patchTask);
  const now = useNowTick();

  const opts = {
    importantHighOnly: settings["quadrant_important_high_only"] === "1",
    urgentIncludeSoon: settings["quadrant_urgent_include_soon"] === "1",
  };

  // 顶层未完成任务按象限分组
  const tops = tasks
    .filter((t) => !t.is_completed && !t.parent_id)
    .sort((a, b) => a.order_index - b.order_index);
  const cells: Record<Quadrant, Task[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const t of tops) cells[quadrantOf(t, opts, now)].push(t);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "task",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const state = useAppStore.getState();
        const sourceId = source.data.id as string;
        const sourceTask = state.tasks.find((t) => t.id === sourceId);
        if (!sourceTask) return;

        const o = {
          importantHighOnly: state.settings["quadrant_important_high_only"] === "1",
          urgentIncludeSoon: state.settings["quadrant_urgent_include_soon"] === "1",
        };

        if (target.data.type === "task-cell") {
          // 拖到象限空白处:改象限(手动覆盖)
          void patchTask({ id: sourceId, quadrant_override: target.data.quadrant as number });
          return;
        }
        // 拖到某个任务上:重排 + 若跨象限则改覆盖
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
        const from = quadrantOf(sourceTask, o);
        const to = quadrantOf(targetTask, o);
        if (from !== to) void patchTask({ id: sourceId, quadrant_override: to });
      },
    });
  }, [reorderTasks, patchTask]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2 p-3">
      {([1, 2, 3, 4] as Quadrant[]).map((q) => (
        <Cell key={q} q={q} tasks={cells[q]} now={now} />
      ))}
    </div>
  );
}
