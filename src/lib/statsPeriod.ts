import { toLocalISODate, parseLocalDate } from "./dates";

export type Period = "all" | "thisMonth" | "prevMonth" | "30d" | "custom";

/** Произвольный диапазон из полей `<input type="date">`. Пустая строка = граница не задана. */
export interface CustomRange {
  from: string;
  to: string;
}

/** Границы фильтра по дате брони. undefined = граница не задана. */
export interface DateRange {
  from?: string;
  to?: string;
}

export const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "Всё время" },
  { key: "thisMonth", label: "Этот месяц" },
  { key: "prevMonth", label: "Прошлый месяц" },
  { key: "30d", label: "30 дней" },
  { key: "custom", label: "Свой период" },
];

/** Пресет + произвольный диапазон → границы фильтра.
 * `today` параметризован ради тестов; в приложении всегда дефолт. */
export function periodRange(period: Period, custom: CustomRange, today: Date = new Date()): DateRange {
  switch (period) {
    case "thisMonth":
      return { from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1)) };
    case "prevMonth":
      // День 0 следующего месяца = последний день предыдущего.
      return {
        from: toLocalISODate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "30d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return { from: toLocalISODate(d) };
    }
    case "custom":
      return { from: custom.from || undefined, to: custom.to || undefined };
    default:
      return {};
  }
}

/** true, только если заданы обе границы и нижняя позже верхней. */
export function isRangeInvalid(range: DateRange): boolean {
  return !!range.from && !!range.to && range.from > range.to;
}

/** Дефолт для «Свой период»: с 1-го числа текущего месяца по сегодня. */
export function defaultCustomRange(today: Date = new Date()): CustomRange {
  return {
    from: toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toLocalISODate(today),
  };
}

/** Выше этого числа дней дневной график превращается в частокол — рисуем месяцы. */
export const DAY_CHART_MAX_DAYS = 62;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** true, если диапазон укладывается в DAY_CHART_MAX_DAYS.
 * Длина включительная: from === to → 1 день.
 * Незаданные границы подставляются из min/max дат броней; если броней нет —
 * подставить нечего, отдаём false (рисуем месяцы). */
export function shouldUseDayChart(range: DateRange, bookingDates: string[]): boolean {
  let from = range.from;
  let to = range.to;

  if (!from || !to) {
    if (bookingDates.length === 0) return false;
    let min = bookingDates[0];
    let max = bookingDates[0];
    for (const d of bookingDates) {
      if (d < min) min = d;
      if (d > max) max = d;
    }
    from = from ?? min;
    to = to ?? max;
  }

  if (isRangeInvalid({ from, to })) return false;

  // parseLocalDate даёт локальный полдень, round добивает возможный сдвиг
  // на час при переводе времени.
  const days =
    Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / MS_PER_DAY) + 1;
  return days <= DAY_CHART_MAX_DAYS;
}
