import { useState } from "react";
import { t } from "../lib/i18n";
import { Popover } from "./ui/Popover";

/** 周期提醒间隔的人话表示:整周→周,整天→天,整时→时,否则分 */
export function formatInterval(minutes: number): string {
  if (minutes % 10080 === 0) return `${minutes / 10080}${t("S.X.U.Week")}`;
  if (minutes % 1440 === 0) return `${minutes / 1440}${t("S.X.U.Day")}`;
  if (minutes % 60 === 0) return `${minutes / 60}${t("S.X.U.Hour")}`;
  return `${minutes}${t("S.X.U.Min")}`;
}

const QUICK_MINUTES = [15, 30, 60, 120, 1440, 10080];

/** 周期提醒选择:快捷档 + 自定义值×单位 + 清除(对齐旧版新任务快捷提醒) */
export default function ReminderPicker(props: {
  anchor: HTMLElement | null;
  /** 当前间隔(分);0/未启用传 0 */
  current: number;
  onPick: (minutes: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(30);
  const [unit, setUnit] = useState(1); // 1=分 60=时 1440=天 10080=周

  return (
    <Popover anchor={props.anchor} onClose={props.onClose}>
      <div className="w-52 p-1.5">
        <div className="grid grid-cols-3 gap-1">
          {QUICK_MINUTES.map((m) => (
            <button
              key={m}
              onClick={() => {
                props.onPick(m);
                props.onClose();
              }}
              className={`rounded-md px-1 py-1 text-xs ring-1 ${
                props.current === m
                  ? "bg-selected text-accent ring-accent"
                  : "bg-input text-text-2 ring-divider hover:text-accent hover:ring-accent"
              }`}
            >
              {formatInterval(m)}
            </button>
          ))}
        </div>

        <div className="my-2 h-px bg-divider" />

        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
            className="w-14 min-w-0 rounded-md bg-input px-1.5 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(Number(e.target.value))}
            className="min-w-0 flex-1 rounded-md bg-input px-1 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
          >
            <option value={1}>{t("S.X.U.Min")}</option>
            <option value={60}>{t("S.X.U.Hour")}</option>
            <option value={1440}>{t("S.X.U.Day")}</option>
            <option value={10080}>{t("S.X.U.Week")}</option>
          </select>
          <button
            onClick={() => {
              props.onPick(value * unit);
              props.onClose();
            }}
            className="rounded-md bg-accent px-2 py-1 text-xs text-on-accent hover:opacity-90"
          >
            {t("S.Confirm")}
          </button>
        </div>

        {props.current > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => {
                props.onClear();
                props.onClose();
              }}
              className="rounded-md px-2 py-1 text-xs text-overdue hover:bg-card-hover"
            >
              {t("S.Clear")}
            </button>
          </div>
        )}
      </div>
    </Popover>
  );
}
