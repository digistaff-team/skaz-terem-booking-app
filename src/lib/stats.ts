import { Booking } from "@/types/booking";
import { durationMinutes } from "./duration";
import { parseLocalDate } from "./dates";

export interface MonthStat {
  month: string; // YYYY-MM
  count: number;
  minutes: number;
}

export interface RoomStat {
  roomId: string;
  roomName: string;
  count: number;
  minutes: number;
}

export interface UserStat {
  userName: string;
  count: number;
  minutes: number;
}

export interface BookingStats {
  total: number;
  active: number;
  cancelled: number;
  /** Суммарные минуты активных броней. */
  totalMinutes: number;
  /** Средняя длительность активной брони в минутах. */
  avgMinutes: number;
  uniqueUsers: number;
  byMonth: MonthStat[]; // отсортировано по месяцу
  byRoom: RoomStat[]; // отсортировано по минутам, убыв.
  /** Счётчик активных броней по дням недели: индекс 0 = понедельник … 6 = воскресенье. */
  byWeekday: number[];
  /** Счётчик активных броней по часу начала: индекс 0 = 00:xx … 23 = 23:xx. */
  byStartHour: number[];
  topUsers: UserStat[]; // топ по минутам, убыв.
}

/** Агрегаты по списку броней. Часы/графики считаются по активным броням;
 * отменённые участвуют только в счётчиках total/cancelled. */
export function computeStats(bookings: Booking[], topUsersLimit = 10): BookingStats {
  const active = bookings.filter((b) => b.status === "active");
  const cancelled = bookings.length - active.length;

  const totalMinutes = active.reduce((s, b) => s + durationMinutes(b.startTime, b.endTime), 0);

  const byMonth = new Map<string, MonthStat>();
  const byRoom = new Map<string, RoomStat>();
  const byUser = new Map<string, UserStat>();
  const byWeekday = new Array(7).fill(0);
  const byStartHour = new Array(24).fill(0);

  for (const b of active) {
    const minutes = durationMinutes(b.startTime, b.endTime);

    const month = b.date.slice(0, 7);
    const m = byMonth.get(month) ?? { month, count: 0, minutes: 0 };
    m.count++;
    m.minutes += minutes;
    byMonth.set(month, m);

    const r = byRoom.get(b.roomId) ?? { roomId: b.roomId, roomName: b.roomName, count: 0, minutes: 0 };
    r.count++;
    r.minutes += minutes;
    byRoom.set(b.roomId, r);

    const u = byUser.get(b.userName) ?? { userName: b.userName, count: 0, minutes: 0 };
    u.count++;
    u.minutes += minutes;
    byUser.set(b.userName, u);

    // getDay(): 0 = воскресенье → переводим в 0 = понедельник
    byWeekday[(parseLocalDate(b.date).getDay() + 6) % 7]++;
    byStartHour[parseInt(b.startTime.slice(0, 2), 10)]++;
  }

  return {
    total: bookings.length,
    active: active.length,
    cancelled,
    totalMinutes,
    avgMinutes: active.length ? Math.round(totalMinutes / active.length) : 0,
    uniqueUsers: new Set(bookings.map((b) => b.userName)).size,
    byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    byRoom: [...byRoom.values()].sort((a, b) => b.minutes - a.minutes),
    byWeekday,
    byStartHour,
    topUsers: [...byUser.values()].sort((a, b) => b.minutes - a.minutes).slice(0, topUsersLimit),
  };
}

const MONTH_NAMES = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

/** '2026-06' → 'июн' (с годом, если он отличается от текущего). */
export function formatMonthLabel(month: string, currentYear = new Date().getFullYear()): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTH_NAMES[m - 1] ?? month;
  return y === currentYear ? name : `${name} ${String(y).slice(2)}`;
}

export const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
