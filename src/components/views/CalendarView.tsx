import { useEffect, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { holidaysOfYear, refreshHolidaysIfStale } from "../../lib/holidays";
import { toDueText, parseDue } from "../../lib/date";
import { t, f } from "../../lib/i18n";
import type { Task } from "../../lib/tauri-ipc";

const PRIO_COLOR: Record<number, string> = {
  1: "var(--success-text)",
  2: "var(--warning-text)",
  3: "var(--overdue-text)",
};

/** 待办块:按优先级着色,可拖到别的日期格(对齐旧版日历) */
function TaskChip({ task }: { task: Task }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "task", id: task.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [task.id]);

  const color = PRIO_COLOR[task.priority] ?? "var(--muted-text)";
  const time = task.due_date?.includes(" ") ? task.due_date.split(" ")[1] : null;

  return (
    <div
      ref={ref}
      title={task.title}
      className={`flex cursor-grab items-center gap-1 truncate rounded px-1 py-px text-[11px] leading-tight ${
        dragging ? "opacity-40" : ""
      }`}
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color: "var(--primary-text)",
        borderLeft: `2px solid ${color}`,
      }}
    >
      {time && <span className="shrink-0 text-muted">{time}</span>}
      <span className="truncate">{task.title}</span>
    </div>
  );
}

function DayCell(props: {
  date: Date;
  inMonth: boolean;
  today: boolean;
  holiday: string | undefined;
  tasks: Task[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);
  const key = toDueText(props.date, false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      getData: () => ({ type: "day-cell", date: key }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [key]);

  const shown = props.tasks.slice(0, 4);
  const extra = props.tasks.length - shown.length;

  return (
    <div
      ref={ref}
      className={`flex min-h-0 flex-col gap-0.5 overflow-hidden rounded-lg border p-1 transition-colors ${
        over ? "border-accent bg-card-hover" : "border-divider"
      } ${props.inMonth ? "bg-card" : "bg-transparent"}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-1 px-0.5">
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs ${
            props.today
              ? "bg-accent text-on-accent"
              : props.inMonth
                ? "text-text-1"
                : "text-muted"
          }`}
        >
          {props.date.getDate()}
        </span>
        {props.holiday && (
          <span className="truncate text-[10px] text-overdue">{props.holiday}</span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {shown.map((task) => (
          <TaskChip key={task.id} task={task} />
        ))}
        {extra > 0 && <span className="px-1 text-[10px] text-muted">+{extra}</span>}
      </div>
    </div>
  );
}

export default function CalendarView() {
  const tasks = useAppStore((s) => s.tasks);
  const settings = useAppStore((s) => s.settings);
  const setDue = useAppStore((s) => s.setDue);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    void refreshHolidaysIfStale();
  }, []);

  // 拖待办到日期格 → 设截止日期(保留原有时分)
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "task",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target || target.data.type !== "day-cell") return;
        const id = source.data.id as string;
        const date = target.data.date as string;
        const tk = useAppStore.getState().tasks.find((task) => task.id === id);
        const time = tk?.due_date?.includes(" ") ? tk.due_date.split(" ")[1] : null;
        void setDue(id, time ? `${date} ${time}` : date);
      },
    });
  }, [setDue]);

  const showHolidays = settings["show_holidays"] !== "0";
  const holidays = showHolidays ? holidaysOfYear(month.getFullYear()) : new Map<string, string>();
  if (showHolidays && month.getMonth() === 11) {
    for (const [k, v] of holidaysOfYear(month.getFullYear() + 1)) holidays.set(k, v);
  }

  // 按截止日聚合未完成任务,每天内按优先级降序、时间升序
  const dueByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.is_completed || !task.due_date) continue;
    const key = toDueText(parseDue(task.due_date), false);
    const list = dueByDay.get(key) ?? [];
    list.push(task);
    dueByDay.set(key, list);
  }
  for (const list of dueByDay.values()) {
    list.sort(
      (a, b) => b.priority - a.priority || (a.due_date ?? "").localeCompare(b.due_date ?? ""),
    );
  }

  // 周一开头网格;行数按当月实际需要(5 或 6 行),不展示纯属下月的多余行
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((firstWeekday + daysInMonth) / 7);
  const cells: Date[] = Array.from({ length: rows * 7 }, (_, i) => {
    const d = new Date(month);
    d.setDate(1 - firstWeekday + i);
    return d;
  });
  const todayKey = toDueText(new Date(), false);
  const weekdays = t("S.X.Weekdays").split(",");

  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex shrink-0 items-center pb-2">
        <h1 className="text-base font-semibold text-text-1">
          {f("S.X.MonthFmt", month.getFullYear(), month.getMonth() + 1)}
        </h1>
        <span className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className="rounded px-2 py-1 text-xs text-text-2 hover:bg-card-hover"
          >
            {t("S.X.Today")}
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
          >
            <ChevronRight size={16} />
          </button>
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-7 gap-1 pb-1">
        {weekdays.map((w) => (
          <span key={w} className="text-center text-xs text-muted">
            {w}
          </span>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7 gap-1"
        style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      >
        {cells.map((d) => {
          const key = toDueText(d, false);
          return (
            <DayCell
              key={key}
              date={d}
              inMonth={d.getMonth() === month.getMonth()}
              today={key === todayKey}
              holiday={holidays.get(key)}
              tasks={dueByDay.get(key) ?? []}
            />
          );
        })}
      </div>
    </div>
  );
}
