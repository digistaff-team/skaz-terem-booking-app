import { describe, it, expect } from "vitest";
import { toLocalISODate, localISODateInDays, currentTimeHHMM } from "@/lib/dates";

describe("dates: локальные, а не UTC", () => {
  it("toLocalISODate возвращает локальную дату (не UTC)", () => {
    // 00:30 местного времени 15 марта: в UTC+3 это ещё 14 марта по UTC —
    // toISOString() вернула бы вчерашнюю дату
    const d = new Date(2026, 2, 15, 0, 30);
    expect(toLocalISODate(d)).toBe("2026-03-15");
  });

  it("дополняет месяц и день нулями", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("localISODateInDays сдвигает от сегодняшней локальной даты", () => {
    const today = new Date();
    const expected = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    expect(localISODateInDays(3)).toBe(toLocalISODate(expected));
    expect(localISODateInDays(0)).toBe(toLocalISODate(today));
  });

  it("currentTimeHHMM даёт HH:MM с нулями", () => {
    expect(currentTimeHHMM(new Date(2026, 2, 15, 9, 5))).toBe("09:05");
    expect(currentTimeHHMM(new Date(2026, 2, 15, 23, 59))).toBe("23:59");
  });
});
