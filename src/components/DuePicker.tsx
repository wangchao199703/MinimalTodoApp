import { useState } from "react";
import { QUICK_TIMES, quickTimeToDue, parseDue, toDueText } from "../lib/date";
import { Popover } from "./ui/Popover";

/** 截止时间选择:快捷时间 5m~1w + 自定义日期时分 + 清除 */
export default function DuePicker(props: {
  anchor: HTMLElement | null;
  current: string | null;
  onPick: (due: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const cur = props.current ? parseDue(props.current) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [date, setDate] = useState(
    cur
      ? `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`
      : toDueText(new Date(), false),
  );
  const [hour, setHour] = useState(cur ? cur.getHours() : 18);
  const [minute, setMinute] = useState(cur ? cur.getMinutes() : 0);

  return (
    <Popover anchor={props.anchor} onClose={props.onClose}>
      <div className="w-56 p-1.5">
        <div className="grid grid-cols-5 gap-1">
          {QUICK_TIMES.map((q) => (
            <button
              key={q.label}
              onClick={() => {
                props.onPick(quickTimeToDue(q.minutes));
                props.onClose();
              }}
              className="rounded-md bg-input px-1 py-1 text-xs text-text-2 ring-1 ring-divider hover:text-accent hover:ring-accent"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="my-2 h-px bg-divider" />

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-input px-1.5 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
          />
          <select
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="rounded-md bg-input px-1 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>
                {pad(i)}
              </option>
            ))}
          </select>
          :
          <select
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="rounded-md bg-input px-1 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
          >
            {Array.from({ length: 60 }, (_, i) => (
              <option key={i} value={i}>
                {pad(i)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex justify-end gap-1.5">
          {props.current && (
            <button
              onClick={() => {
                props.onClear();
                props.onClose();
              }}
              className="rounded-md px-2 py-1 text-xs text-overdue hover:bg-card-hover"
            >
              清除
            </button>
          )}
          <button
            onClick={() => {
              if (!date) return;
              props.onPick(`${date} ${pad(hour)}:${pad(minute)}`);
              props.onClose();
            }}
            className="rounded-md bg-accent px-2.5 py-1 text-xs text-on-accent hover:opacity-90"
          >
            确定
          </button>
        </div>
      </div>
    </Popover>
  );
}
