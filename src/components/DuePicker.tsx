import { useRef, useState } from "react";
import { quickTimes, quickTimeToDue, parseDue, toDueText } from "../lib/date";
import { t } from "../lib/i18n";
import { Popover } from "./ui/Popover";
import PopoverTitle from "./ui/PopoverTitle";

const FIVE_MIN_STEPS = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) => i);

// 12 个相对快捷项分三段:短周期 / 常规 / 长周期(quickTimes 顺序即此分组,各 4 个)
const DUE_GROUP_LABELS = ["S.X.Period.Short", "S.X.Period.Regular", "S.X.Period.Long"];

/** 截止时间选择:相对快捷 + 定点锚点 + 自定义日期时分(分钟默认 5 步,可切精准逐分) */
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
  // 当前分钟非 5 的整数倍则默认开启「精准」,否则用 5 分钟步长(12 项)
  const [precise, setPrecise] = useState(cur ? cur.getMinutes() % 5 !== 0 : false);
  // 选完日期后把焦点移到小时(原生 select 无法用代码强行展开,故只聚焦)
  const hourRef = useRef<HTMLSelectElement>(null);

  const quick = quickTimes();
  const dueGroups = DUE_GROUP_LABELS.map((label, i) => ({
    label,
    items: quick.slice(i * 4, i * 4 + 4),
  }));
  const minuteOptions = precise ? ALL_MINUTES : FIVE_MIN_STEPS;

  return (
    <Popover anchor={props.anchor} onClose={props.onClose}>
      <div className="w-60">
        <PopoverTitle>{t("S.Label.DueTime")}</PopoverTitle>
        <div className="p-1.5">
          {dueGroups.map((group) => (
            <div key={group.label} className="mb-1.5">
              <p className="mb-1 px-0.5 text-[11px] text-muted">{t(group.label)}</p>
              <div className="grid grid-cols-4 gap-1">
                {group.items.map((q) => (
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
            </div>
          ))}

          <div className="my-2 h-px bg-divider" />

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                hourRef.current?.focus();
              }}
              className="min-w-0 flex-1 rounded-md bg-input px-1.5 py-1 text-xs text-text-1 ring-1 ring-divider outline-none"
            />
            <select
              ref={hourRef}
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
              {minuteOptions.map((m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </select>
            <button
              onClick={() => setPrecise((p) => !p)}
              title={t("S.X.Due.PreciseHint")}
              className={`shrink-0 rounded-md px-1.5 py-1 text-[11px] ring-1 ${
                precise
                  ? "bg-selected text-accent ring-accent"
                  : "bg-input text-muted ring-divider hover:text-accent hover:ring-accent"
              }`}
            >
              {t("S.X.Due.Precise")}
            </button>
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
                {t("S.Clear")}
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
              {t("S.Confirm")}
            </button>
          </div>
        </div>
      </div>
    </Popover>
  );
}
