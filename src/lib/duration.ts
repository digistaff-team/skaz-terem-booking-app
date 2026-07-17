/** Хелперы длительности броней и отображения баланса часов (поминутный учёт). */

/** 'HH:MM' → минуты от полуночи; '24:00' → 1440. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Длительность брони в минутах. */
export function durationMinutes(startTime: string, endTime: string): number {
  return timeToMinutes(endTime) - timeToMinutes(startTime);
}

/** −105 → «−1 ч 45 мин», 120 → «2 ч», 30 → «30 мин», 0 → «0 ч». */
export function formatMinutes(total: number): string {
  const sign = total < 0 ? "−" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${sign}${h} ч ${m} мин`;
  if (h) return `${sign}${h} ч`;
  if (m) return `${sign}${m} мин`;
  return "0 ч";
}
