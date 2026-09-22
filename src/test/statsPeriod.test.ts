import { describe, it, expect } from "vitest";
import {
  periodRange,
  isRangeInvalid,
  defaultCustomRange,
  shouldUseDayChart,
  DAY_CHART_MAX_DAYS,
  PERIODS,
  type CustomRange,
} from "@/lib/statsPeriod";

const EMPTY: CustomRange = { from: "", to: "" };
// 22 сентября 2026, среда. Фиксированная дата — иначе тесты сломаются завтра.
const TODAY = new Date(2026, 8, 22);

describe("periodRange", () => {
  it("«всё время» — без границ", () => {
    expect(periodRange("all", EMPTY, TODAY)).toEqual({});
  });

  it("«этот месяц» — с 1-го числа, без верхней границы", () => {
    expect(periodRange("thisMonth", EMPTY, TODAY)).toEqual({ from: "2026-09-01" });
  });

  it("«прошлый месяц» — весь август включительно", () => {
    expect(periodRange("prevMonth", EMPTY, TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("«30 дней» — от даты 30 дней назад, без верхней границы", () => {
    expect(periodRange("30d", EMPTY, TODAY)).toEqual({ from: "2026-08-23" });
  });

  it("прошлый месяц в январе уходит в декабрь прошлого года", () => {
    expect(periodRange("prevMonth", EMPTY, new Date(2027, 0, 15))).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("произвольный диапазон отдаёт свои границы", () => {
    expect(periodRange("custom", { from: "2026-08-01", to: "2026-08-15" }, TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-08-15",
    });
  });

  it("пустое поле произвольного диапазона = граница не задана", () => {
    expect(periodRange("custom", { from: "2026-08-01", to: "" }, TODAY)).toEqual({
      from: "2026-08-01",
      to: undefined,
    });
    expect(periodRange("custom", EMPTY, TODAY)).toEqual({ from: undefined, to: undefined });
  });
});

describe("isRangeInvalid", () => {
  it("from позже to — невалидно", () => {
    expect(isRangeInvalid({ from: "2026-08-15", to: "2026-08-01" })).toBe(true);
  });

  it("равные даты валидны", () => {
    expect(isRangeInvalid({ from: "2026-08-01", to: "2026-08-01" })).toBe(false);
  });

  it("односторонние и пустые границы валидны", () => {
    expect(isRangeInvalid({ from: "2026-08-01" })).toBe(false);
    expect(isRangeInvalid({ to: "2026-08-01" })).toBe(false);
    expect(isRangeInvalid({})).toBe(false);
  });
});

describe("defaultCustomRange", () => {
  it("с 1-го числа текущего месяца по сегодня", () => {
    expect(defaultCustomRange(TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-22" });
  });
});

describe("PERIODS", () => {
  it("пять пресетов, последний — произвольный", () => {
    expect(PERIODS).toHaveLength(5);
    expect(PERIODS[4]).toEqual({ key: "custom", label: "Свой период" });
  });
});

describe("shouldUseDayChart", () => {
  const DATES = ["2026-06-01", "2026-08-01", "2026-08-15"];

  it("порог — 62 дня", () => {
    expect(DAY_CHART_MAX_DAYS).toBe(62);
  });

  it("обе границы заданы, длина в пределах порога — дни", () => {
    expect(shouldUseDayChart({ from: "2026-08-01", to: "2026-08-15" }, DATES)).toBe(true);
  });

  it("один день — дни", () => {
    expect(shouldUseDayChart({ from: "2026-08-01", to: "2026-08-01" }, DATES)).toBe(true);
  });

  it("ровно DAY_CHART_MAX_DAYS дней включительно — ещё дни", () => {
    // 62 дня от 01.08 включительно → 01.10
    expect(shouldUseDayChart({ from: "2026-08-01", to: "2026-10-01" }, DATES)).toBe(true);
  });

  it("на день больше порога — месяцы", () => {
    expect(shouldUseDayChart({ from: "2026-08-01", to: "2026-10-02" }, DATES)).toBe(false);
  });

  it("незаданные границы берутся из дат броней", () => {
    // min = 2026-06-01, max = 2026-08-15 → больше 62 дней
    expect(shouldUseDayChart({}, DATES)).toBe(false);
    // нижняя граница есть, верхняя подставляется из max = 2026-08-15 → 15 дней
    expect(shouldUseDayChart({ from: "2026-08-01" }, DATES)).toBe(true);
    // верхняя граница есть, нижняя подставляется из min = 2026-06-01 → больше 62 дней
    expect(shouldUseDayChart({ to: "2026-08-15" }, DATES)).toBe(false);
  });

  it("нет броней и незаданная граница — месяцы, без падения", () => {
    expect(shouldUseDayChart({}, [])).toBe(false);
    expect(shouldUseDayChart({ from: "2026-08-01" }, [])).toBe(false);
  });

  it("невалидный диапазон — месяцы", () => {
    expect(shouldUseDayChart({ from: "2026-08-15", to: "2026-08-01" }, DATES)).toBe(false);
  });

  it("трёхдневный диапазон — дни", () => {
    // Math.round в счёте дней страхует от сдвига на час при переводе часов,
    // но в российской зоне (без DST с 2014) тест этот сценарий не воспроизводит.
    expect(shouldUseDayChart({ from: "2026-10-24", to: "2026-10-26" }, DATES)).toBe(true);
  });
});
