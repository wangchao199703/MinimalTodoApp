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

type CalMode = "day" | "week" | "month";

const PRIO_COLOR: Record<number, string> = {
  1: "var(--success-text)",
  2: "var(--warning-text)",
  3: "var(--overdue-text)",
};

/** 待办块:按优先级着色,可拖到别的日期格 */
function TaskChip({ task, big = false }: { task: Task; big?: boolean }) {
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
      className={`flex cursor-grab items-center gap-1 truncate rounded leading-tight ${
        big ? "px-2 py-1 text-sm" : "px-1 py-px text-[11px]"
      } ${dragging ? "opacity-40" : ""}`}
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

/** 通用日期格的释放目标注册(拖待办到此日期 → 设截止) */
function useDayDrop(date: Date) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [over, setOver] = useState(false);
  const key = toDueText(date, false);
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
  return { ref, over };
}

// ---------- 月视图格子 ----------
function MonthCell(props: {
  date: Date;
  inMonth: boolean;
  today: boolean;
  holiday?: string;
  tasks: Task[];
}) {
  const { ref, over } = useDayDrop(props.date);
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
            props.today ? "bg-accent text-on-accent" : props.inMonth ? "text-text-1" : "text-muted"
          }`}
        >
          {props.date.getDate()}
        </span>
        {props.holiday && <span className="truncate text-[10px] text-overdue">{props.holiday}</span>}
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

// ---------- 周视图列 ----------
const WEEKDAY_NAMES = () => t("S.X.Weekdays").split(",");

function WeekColumn(props: { date: Date; today: boolean; holiday?: string; tasks: Task[] }) {
  const { ref, over } = useDayDrop(props.date);
  const wd = WEEKDAY_NAMES()[(props.date.getDay() + 6) % 7];
  return (
    <div
      ref={ref}
      className={`flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border transition-colors ${
        over ? "border-accent bg-card-hover" : "border-divider bg-card"
      }`}
    >
      <div className="flex shrink-0 flex-col items-center gap-0.5 border-b border-divider py-1.5">
        <span className="text-[11px] text-muted">{wd}</span>
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${
            props.today ? "bg-accent text-on-accent" : "text-text-1"
          }`}
        >
          {props.date.getDate()}
        </span>
        {props.holiday && <span className="truncate text-[10px] text-overdue">{props.holiday}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1">
        {props.tasks.map((task) => (
          <TaskChip key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

// ---------- 日视图 ----------
function DayPanel(props: { date: Date; today: boolean; holiday?: string; tasks: Task[] }) {
  const { ref, over } = useDayDrop(props.date);
  return (
    <div
      ref={ref}
      className={`flex min-h-0 flex-1 flex-col rounded-xl border transition-colors ${
        over ? "border-accent bg-card-hover" : "border-divider bg-card"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-divider px-4 py-2.5">
        <span
          className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-base ${
            props.today ? "bg-accent text-on-accent" : "text-text-1"
          }`}
        >
          {props.date.getDate()}
        </span>
        <span className="text-sm text-text-2">
          {WEEKDAY_NAMES()[(props.date.getDay() + 6) % 7]}
        </span>
        {props.holiday && <span className="text-xs text-overdue">{props.holiday}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
        {props.tasks.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">{t("S.X.NoDayTasks")}</p>
        ) : (
          props.tasks.map((task) => <TaskChip key={task.id} task={task} big />)
        )}
      </div>
    </div>
  );
}

export default function CalendarView() {
  const tasks = useAppStore((s) => s.tasks);
  const settings = useAppStore((s) => s.settings);
  const setDue = useAppStore((s) => s.setDue);
  const saveSetting = useAppStore((s) => s.saveSetting);

  const savedMode = settings["calendar_view"];
  const [mode, setMode] = useState<CalMode>(
    savedMode === "day" || savedMode === "week" ? savedMode : "month",
  );
  const [anchor, setAnchor] = useState(() => new Date());

  useEffect(() => {
    void refreshHolidaysIfStale();
  }, []);

  // 拖待办到日期格 → 设截止(保留原时分)
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

  // 切视图/今天 = IntroScaleFade,翻页 = FadeSlideIn(dx:±24)(对齐旧版 CalendarView 动画)
  const contentRef = useRef<HTMLDivElement | null>(null);
  const playAnim = (cls: string) => {
    const el = contentRef.current;
    if (!el) return;
    el.classList.remove("view-in", "cal-flip-prev", "cal-flip-next");
    void el.offsetWidth; // 强制 reflow,重新触发动画
    el.classList.add(cls);
  };

  const changeMode = (m: CalMode) => {
    setMode(m);
    saveSetting("calendar_view", m);
    playAnim("view-in");
  };
  const shift = (dir: number) => {
    const d = new Date(anchor);
    if (mode === "month") d.setMonth(d.getMonth() + dir);
    else if (mode === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setAnchor(d);
    playAnim(dir < 0 ? "cal-flip-prev" : "cal-flip-next");
  };

  // 节假日(覆盖当前及相邻年份)
  const showHolidays = settings["show_holidays"] !== "0";
  const holidays = showHolidays
    ? new Map([
        ...holidaysOfYear(anchor.getFullYear() - 1),
        ...holidaysOfYear(anchor.getFullYear()),
        ...holidaysOfYear(anchor.getFullYear() + 1),
      ])
    : new Map<string, string>();

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

  const todayKey = toDueText(new Date(), false);
  const weekdays = WEEKDAY_NAMES();

  // 周一开头:某日所在周的周一
  const mondayOf = (d: Date) => {
    const m = new Date(d);
    m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return m;
  };

  let title: string;
  if (mode === "month") title = f("S.X.MonthFmt", anchor.getFullYear(), anchor.getMonth() + 1);
  else if (mode === "week") {
    const mon = mondayOf(anchor);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    title = `${f("S.X.DayFmt", mon.getMonth() + 1, mon.getDate())} - ${f("S.X.DayFmt", sun.getMonth() + 1, sun.getDate())}`;
  } else title = f("S.X.DayFmt", anchor.getMonth() + 1, anchor.getDate());

  const MODE_BTN = (m: CalMode, label: string) => (
    <button
      onClick={() => changeMode(m)}
      className={`rounded px-2 py-0.5 text-xs ${
        mode === m ? "bg-accent text-on-accent" : "text-text-2 hover:bg-card-hover"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col p-3">
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <h1 className="text-base font-semibold text-text-1">{title}</h1>
        <button
          onClick={() => shift(-1)}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => {
            setAnchor(new Date());
            playAnim("view-in");
          }}
          className="rounded px-2 py-1 text-xs text-text-2 hover:bg-card-hover"
        >
          {t("S.X.Today")}
        </button>
        <button
          onClick={() => shift(1)}
          className="flex h-7 w-7 items-center justify-center rounded text-text-2 hover:bg-card-hover"
        >
          <ChevronRight size={16} />
        </button>
        {/* 日/周/月切换固定在最右侧 */}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md bg-input p-0.5">
          {MODE_BTN("day", t("S.X.ViewDay"))}
          {MODE_BTN("week", t("S.X.ViewWeek"))}
          {MODE_BTN("month", t("S.X.ViewMonth"))}
        </span>
      </div>

      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
        {mode === "month" && (
          <MonthView anchor={anchor} dueByDay={dueByDay} holidays={holidays} todayKey={todayKey} weekdays={weekdays} />
        )}
        {mode === "week" && (
          <div className="flex min-h-0 flex-1 gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(mondayOf(anchor));
              d.setDate(d.getDate() + i);
              const key = toDueText(d, false);
              return (
                <WeekColumn
                  key={key}
                  date={d}
                  today={key === todayKey}
                  holiday={holidays.get(key)}
                  tasks={dueByDay.get(key) ?? []}
                />
              );
            })}
          </div>
        )}
        {mode === "day" && (
          <DayPanel
            date={anchor}
            today={toDueText(anchor, false) === todayKey}
            holiday={holidays.get(toDueText(anchor, false))}
            tasks={dueByDay.get(toDueText(anchor, false)) ?? []}
          />
        )}
      </div>
    </div>
  );
}

// 月视图网格(行数自适应,不显示多余下月整行)
function MonthView(props: {
  anchor: Date;
  dueByDay: Map<string, Task[]>;
  holidays: Map<string, string>;
  todayKey: string;
  weekdays: string[];
}) {
  const month = new Date(props.anchor.getFullYear(), props.anchor.getMonth(), 1);
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((firstWeekday + daysInMonth) / 7);
  const cells: Date[] = Array.from({ length: rows * 7 }, (_, i) => {
    const d = new Date(month);
    d.setDate(1 - firstWeekday + i);
    return d;
  });

  return (
    <>
      <div className="grid shrink-0 grid-cols-7 gap-1 pb-1">
        {props.weekdays.map((w) => (
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
            <MonthCell
              key={key}
              date={d}
              inMonth={d.getMonth() === month.getMonth()}
              today={key === props.todayKey}
              holiday={props.holidays.get(key)}
              tasks={props.dueByDay.get(key) ?? []}
            />
          );
        })}
      </div>
    </>
  );
}
