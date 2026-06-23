import { useState } from "react";
import { f, t } from "../lib/i18n";
import { Popover } from "./ui/Popover";
import PopoverTitle from "./ui/PopoverTitle";

/** 周期提醒间隔的人话表示:整周→周,整天→天,整时→时,否则分 */
export function formatInterval(minutes: number): string {
  if (minutes % 10080 === 0) return `${minutes / 10080}${t("S.X.U.Week")}`;
  if (minutes % 1440 === 0) return `${minutes / 1440}${t("S.X.U.Day")}`;
  if (minutes % 60 === 0) return `${minutes / 60}${t("S.X.U.Hour")}`;
  return `${minutes}${t("S.X.U.Min")}`;
}

// 12 档分三段:短周期 / 常规 / 长周期(对齐旧版 1m~4w,分组提升可读性)
const REMINDER_GROUPS: { label: string; items: number[] }[] = [
  { label: "S.X.Period.Short", items: [1, 10, 30, 60] },
  { label: "S.X.Period.Regular", items: [120, 300, 1440, 2880] },
  { label: "S.X.Period.Long", items: [7200, 10080, 20160, 40320] },
];

/** 周期提醒选择:三段式快捷档 + 自定义值×单位(带人话预览) */
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
      <div className="w-56">
        <PopoverTitle>{t("S.ChooseReminder")}</PopoverTitle>
        <div className="p-1.5">
          {REMINDER_GROUPS.map((group) => (
            <div key={group.label} className="mb-1.5">
              <p className="mb-1 px-0.5 text-[11px] text-muted">{t(group.label)}</p>
              <div className="grid grid-cols-4 gap-1">
                {group.items.map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      props.onPick(m);
                      props.onClose();
                    }}
                    className={`rounded-md px-1 py-1 text-xs ring-1 transition-colors ${
                      props.current === m
                        ? "bg-accent text-on-accent ring-accent"
                        : "bg-input text-text-2 ring-divider hover:text-accent hover:ring-accent"
                    }`}
                  >
                    {formatInterval(m)}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="my-2 h-px bg-divider" />

          <p className="mb-1 px-0.5 text-[11px] text-muted">
            {f("S.X.Reminder.Preview", formatInterval(value * unit))}
          </p>
          <div className="flex items-center gap-1.5">
            {/* 数值 + 单位做成一体胶囊,一眼看出是同一个逻辑单元 */}
            <div className="flex min-w-0 flex-1 items-center rounded-md bg-input ring-1 ring-divider focus-within:ring-accent">
              <input
                type="number"
                min={1}
                value={value}
                onChange={(e) => setValue(Math.max(1, Number(e.target.value) || 1))}
                className="w-12 min-w-0 bg-transparent px-1.5 py-1 text-xs text-text-1 outline-none"
              />
              <div className="h-4 w-px bg-divider" />
              <select
                value={unit}
                onChange={(e) => setUnit(Number(e.target.value))}
                className="min-w-0 flex-1 bg-transparent px-1 py-1 text-xs text-text-1 outline-none"
              >
                <option value={1}>{t("S.X.U.Min")}</option>
                <option value={60}>{t("S.X.U.Hour")}</option>
                <option value={1440}>{t("S.X.U.Day")}</option>
                <option value={10080}>{t("S.X.U.Week")}</option>
              </select>
            </div>
            <button
              onClick={() => {
                props.onPick(value * unit);
                props.onClose();
              }}
              className="shrink-0 rounded-md bg-accent px-2 py-1 text-xs text-on-accent hover:opacity-90"
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
      </div>
    </Popover>
  );
}
