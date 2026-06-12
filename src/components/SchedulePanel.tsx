import { useEffect, useRef, useState } from "react";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { holidaysOfYear, refreshHolidaysIfStale } from "../lib/holidays";
import { toDueText, parseDue } from "../lib/date";
import { t, f } from "../lib/i18n";
import type { Task } from "../lib/tauri-ipc";

function DayCell(props: {
  date: Date;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  holiday: string | undefined;
  count: number;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [hover, setHover] = useState(false);
  const key = toDueText(props.date, false);

  // 拖任务到日历格子 = 设截止日期
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === "task",
      getData: () => ({ type: "day-cell", date: key }),
      onDragEnter: () => setHover(true),
      onDragLeave: () => setHover(false),
      onDrop: () => setHover(false),
    });
  }, [key]);

  return (
    <button
      ref={ref}
      onClick={props.onSelect}
      className={`relative flex h-11 flex-col items-center rounded-md pt-1 text-xs transition-colors ${
        props.selected ? "bg-selected" : hover ? "bg-card-hover ring-1 ring-accent" : "hover:bg-card-hover"
      } ${props.inMonth ? "text-text-1" : "text-muted"}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full ${
          props.today ? "bg-accent text-on-accent" : ""
        }`}
      >
        {props.date.getDate()}
      </span>
      {props.holiday && (
        <span className="max-w-full truncate px-0.5 text-[9px] leading-tight text-overdue">
          {props.holiday}
        </span>
      )}
      {props.count > 0 && !props.holiday && (
        <span className="h-1 w-1 rounded-full bg-accent" />
      )}
    </button>
  );
}

export default function SchedulePanel() {
  const tasks = useAppStore((s) => s.tasks);
  const settings = useAppStore((s) => s.settings);
  const setDue = useAppStore((s) => s.setDue);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(() => toDueText(new Date(), false));

  useEffect(() => {
    void refreshHolidaysIfStale();
  }, []);

  // 拖放监听:任务落到日历格子 → 设截止
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.type === "task",
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (!target || target.data.type !== "day-cell") return;
        void setDue(source.data.id as string, target.data.date as string);
      },
    });
  }, [setDue]);

  const showHolidays = settings["show_holidays"] !== "0";
  const holidays = showHolidays ? holidaysOfYear(month.getFullYear()) : new Map<string, string>();
  // 跨年月视图补另一年的节假日
  if (showHolidays && month.getMonth() === 11) {
    for (const [k, v] of holidaysOfYear(month.getFullYear() + 1)) holidays.set(k, v);
  }

  const dueByDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.is_completed || !task.due_date) continue;
    const key = toDueText(parseDue(task.due_date), false);
    const list = dueByDay.get(key) ?? [];
    list.push(task);
    dueByDay.set(key, list);
  }

  // 周一开头的 6x7 网格
  const firstWeekday = (month.getDay() + 6) % 7;
  const cells: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(month);
    d.setDate(1 - firstWeekday + i);
    return d;
  });
  const todayKey = toDueText(new Date(), false);
  const weekdays = t("S.X.Weekdays").split(",");
  const dayTasks = dueByDay.get(selectedDay) ?? [];

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-divider bg-content">
      <div className="flex shrink-0 items-center px-3 pt-3 pb-1">
        <span className="text-sm font-semibold text-text-1">
          {f("S.X.MonthFmt", month.getFullYear(), month.getMonth() + 1)}
        </span>
        <span className="ml-auto flex gap-0.5">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className="flex h-6 w-6 items-center justify-center rounded text-text-2 hover:bg-card-hover"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setSelectedDay(todayKey);
            }}
            className="rounded px-1.5 text-xs text-text-2 hover:bg-card-hover"
          >
            {t("S.X.Today")}
          </button>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className="flex h-6 w-6 items-center justify-center rounded text-text-2 hover:bg-card-hover"
          >
            <ChevronRight size={14} />
          </button>
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-7 gap-0.5 px-2 pt-1">
        {weekdays.map((w) => (
          <span key={w} className="text-center text-[10px] text-muted">
            {w}
          </span>
        ))}
        {cells.map((d) => {
          const key = toDueText(d, false);
          return (
            <DayCell
              key={key}
              date={d}
              inMonth={d.getMonth() === month.getMonth()}
              today={key === todayKey}
              selected={key === selectedDay}
              holiday={holidays.get(key)}
              count={dueByDay.get(key)?.length ?? 0}
              onSelect={() => setSelectedDay(key)}
            />
          );
        })}
      </div>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto border-t border-divider p-2">
        {dayTasks.length === 0 ? (
          <p className="mt-4 text-center text-xs text-muted">{t("S.X.NoDayTasks")}</p>
        ) : (
          dayTasks.map((task) => (
            <div
              key={task.id}
              className="mb-1 flex items-center gap-2 rounded-md bg-card px-2 py-1.5"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    task.priority === 3
                      ? "var(--overdue-text)"
                      : task.priority === 2
                        ? "var(--warning-text)"
                        : "var(--success-text)",
                }}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-text-1">{task.title}</span>
              {task.due_date?.includes(" ") && (
                <span className="text-[10px] text-muted">{task.due_date.split(" ")[1]}</span>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
