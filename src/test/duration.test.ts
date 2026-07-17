import { describe, it, expect } from "vitest";
import { timeToMinutes, durationMinutes, formatMinutes } from "@/lib/duration";

describe("duration", () => {
  it("timeToMinutes: обычное время и 24:00", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:05")).toBe(545);
    expect(timeToMinutes("24:00")).toBe(1440);
  });

  it("durationMinutes: поминутная длительность", () => {
    expect(durationMinutes("13:30", "15:15")).toBe(105);
    expect(durationMinutes("10:00", "12:00")).toBe(120);
    expect(durationMinutes("23:00", "24:00")).toBe(60);
  });

  it("formatMinutes: часы, минуты, знак", () => {
    expect(formatMinutes(105)).toBe("1 ч 45 мин");
    expect(formatMinutes(120)).toBe("2 ч");
    expect(formatMinutes(30)).toBe("30 мин");
    expect(formatMinutes(0)).toBe("0 ч");
    expect(formatMinutes(-105)).toBe("−1 ч 45 мин");
    expect(formatMinutes(-60)).toBe("−1 ч");
  });
});
