import type { Task } from "./tauri-ipc";
import { parseDue } from "./date";

/** 6 种排序模式,对齐旧版 SortMode 枚举 */
export type SortMode = "custom" | "due" | "priority" | "completed" | "created" | "title";

export const SORT_OPTIONS: { mode: SortMode; labelKey: string }[] = [
  { mode: "custom", labelKey: "S.Sort.Custom" },
  { mode: "due", labelKey: "S.Sort.DueDate" },
  { mode: "priority", labelKey: "S.Sort.Priority" },
  { mode: "completed", labelKey: "S.Sort.Completed" },
  { mode: "created", labelKey: "S.Sort.Created" },
  { mode: "title", labelKey: "S.Sort.Title" },
];

function comparator(mode: SortMode): (a: Task, b: Task) => number {
  switch (mode) {
    case "custom":
      return (a, b) => a.order_index - b.order_index;
    case "due":
      // 无截止的排最后
      return (a, b) => {
        if (!a.due_date && !b.due_date) return a.order_index - b.order_index;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return parseDue(a.due_date).getTime() - parseDue(b.due_date).getTime();
      };
    case "priority":
      return (a, b) => b.priority - a.priority || a.order_index - b.order_index;
    case "completed":
      return (a, b) =>
        Number(a.is_completed) - Number(b.is_completed) || a.order_index - b.order_index;
    case "created":
      return (a, b) => b.created_at.localeCompare(a.created_at);
    case "title":
      return (a, b) => a.title.localeCompare(b.title, "zh-CN");
  }
}

/**
 * 树形排序:顶层任务按排序模式(置顶优先),子任务始终跟在父任务后按 order_index;
 * 折叠的父任务隐藏其全部子孙。返回展平后的渲染顺序。
 */
export function sortTree(tasks: Task[], mode: SortMode): Task[] {
  const byParent = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parent_id) {
      const list = byParent.get(t.parent_id) ?? [];
      list.push(t);
      byParent.set(t.parent_id, list);
    }
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order_index - b.order_index);
  }

  const cmp = comparator(mode);
  const tops = tasks
    .filter((t) => !t.parent_id)
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || cmp(a, b));

  const out: Task[] = [];
  const walk = (t: Task) => {
    out.push(t);
    if (t.is_collapsed) return;
    for (const c of byParent.get(t.id) ?? []) walk(c);
  };
  for (const t of tops) walk(t);
  return out;
}

/** 直接子任务统计:[已完成数, 总数] */
export function childStats(tasks: Task[], parentId: string): [number, number] {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.parent_id === parentId) {
      total++;
      if (t.is_completed) done++;
    }
  }
  return [done, total];
}

/** 收集某任务的全部子孙 id(删除/整族完成用) */
export function descendantIds(tasks: Task[], rootId: string): string[] {
  const out: string[] = [];
  const collect = (pid: string) => {
    for (const t of tasks) {
      if (t.parent_id === pid) {
        out.push(t.id);
        collect(t.id);
      }
    }
  };
  collect(rootId);
  return out;
}
