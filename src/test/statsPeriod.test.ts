import { describe, it, expect } from "vitest";
import {
  periodRange,
  isRangeInvalid,
  defaultCustomRange,
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
