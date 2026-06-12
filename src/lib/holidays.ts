// 国内法定节假日:holiday-cn 数据集(国务院公告),按年缓存于 settings,
// raw.githubusercontent.com 允许跨域,前端直接 fetch,失败静默回退缓存。
import { useAppStore } from "../store/useAppStore";
import { toDueText } from "./date";

const RAW_URL = (year: number) =>
  `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`;

interface HolidayDay {
  name: string;
  date: string;
  isOffDay: boolean;
}

/** 解析某年缓存 → "YYYY-MM-DD" → 节日名(仅放假日,不含调休补班) */
export function parseOffDays(json: string): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const doc = JSON.parse(json) as { days?: HolidayDay[] };
    for (const d of doc.days ?? []) {
      if (d.isOffDay && d.date) map.set(d.date, d.name ?? "");
    }
  } catch {
    // 损坏缓存:返回空
  }
  return map;
}

function readCache(): Record<string, string> {
  try {
    const raw = useAppStore.getState().settings["holiday_cache"];
    const v = JSON.parse(raw ?? "{}");
    return typeof v === "object" && v ? v : {};
  } catch {
    return {};
  }
}

export function holidaysOfYear(year: number): Map<string, string> {
  const cache = readCache();
  const json = cache[String(year)];
  return json ? parseOffDays(json) : new Map();
}

/** 每天最多联网刷新一次,补当前年与下一年的缓存 */
export async function refreshHolidaysIfStale(): Promise<void> {
  const s = useAppStore.getState();
  if (s.settings["show_holidays"] === "0") return;
  const today = toDueText(new Date(), false);
  if (s.settings["holiday_last_refresh"] === today) return;

  const cache = readCache();
  const year = new Date().getFullYear();
  for (const y of [year, year + 1]) {
    try {
      const resp = await fetch(RAW_URL(y));
      if (!resp.ok) continue;
      const text = await resp.text();
      if (parseOffDays(text).size > 0) cache[String(y)] = text;
    } catch {
      // 离线:保留旧缓存
    }
  }
  s.saveSetting("holiday_cache", JSON.stringify(cache));
  s.saveSetting("holiday_last_refresh", today);
}
