/**
 * Ограничение горизонта бронирования — до какой даты (включительно) можно бронировать.
 *
 * Задайте ОДИН из режимов в DEFAULT_LIMIT:
 *   { mode: "days",  days: 90 }            — на N дней вперёд от сегодняшней даты
 *   { mode: "fixed", date: "2026-12-31" }  — до фиксированной даты включительно
 *
 * Значение можно переопределить через переменные окружения (имеют приоритет над DEFAULT_LIMIT):
 *   VITE_BOOKING_MAX_DATE=2026-12-31   — фиксированная дата (приоритетнее, чем MAX_DAYS)
 *   VITE_BOOKING_MAX_DAYS=90           — число дней вперёд
 */

export type BookingLimit =
  | { mode: "days"; days: number }
  | { mode: "fixed"; date: string };

// Значение по умолчанию. Измените здесь, если не используете переменные окружения.
const DEFAULT_LIMIT: BookingLimit = { mode: "fixed", date: "2026-07-12" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveLimit(): BookingLimit {
  const fixed = import.meta.env.VITE_BOOKING_MAX_DATE as string | undefined;
  if (fixed && DATE_RE.test(fixed)) {
    return { mode: "fixed", date: fixed };
  }
  const daysEnv = import.meta.env.VITE_BOOKING_MAX_DAYS as string | undefined;
  if (daysEnv !== undefined && daysEnv !== "" && Number.isFinite(Number(daysEnv))) {
    return { mode: "days", days: Number(daysEnv) };
  }
  return DEFAULT_LIMIT;
}

export const BOOKING_LIMIT = resolveLimit();

/** Крайняя доступная для бронирования дата в формате YYYY-MM-DD (включительно). */
export function getMaxBookingDate(): string {
  if (BOOKING_LIMIT.mode === "fixed") return BOOKING_LIMIT.date;
  const d = new Date();
  d.setDate(d.getDate() + BOOKING_LIMIT.days);
  return d.toISOString().split("T")[0];
}

/** Сообщение об ошибке при выборе даты за пределами доступного горизонта. */
export function getMaxDateErrorMessage(): string {
  const human = new Date(getMaxBookingDate() + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (BOOKING_LIMIT.mode === "fixed") {
    return `Бронирование доступно только до ${human} включительно. Пожалуйста, выберите более раннюю дату.`;
  }
  return `Бронирование открыто максимум на ${BOOKING_LIMIT.days} дней вперёд (до ${human} включительно). Пожалуйста, выберите более раннюю дату.`;
}
