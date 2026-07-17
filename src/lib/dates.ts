/**
 * Хелперы локальных дат.
 *
 * ВАЖНО: не используйте `new Date().toISOString().split("T")[0]` — toISOString()
 * возвращает дату в UTC. В России (UTC+3…+12) это даёт ВЧЕРАШНЮЮ дату до
 * 3 часов ночи и раньше, из-за чего «Сегодня» и фильтры активных броней врут.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

/** Локальная дата в формате YYYY-MM-DD. */
export function toLocalISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Локальная дата через N дней от сегодня, YYYY-MM-DD. */
export function localISODateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/** Текущее локальное время в формате HH:MM. */
export function currentTimeHHMM(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Парсит YYYY-MM-DD как локальную дату в полдень — избегает сдвига на день
 * из-за часового пояса, который даёт `new Date("YYYY-MM-DD")` (парсится как UTC-полночь). */
export function parseLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

/** Например: «суббота, 18 июля 2026 г.» */
export function formatDateLong(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Например: «18 июля, суббота» */
export function formatDateShort(isoDate: string): string {
  const d = parseLocalDate(isoDate);
  const dayMonth = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "long" });
  return `${dayMonth}, ${weekday}`;
}
