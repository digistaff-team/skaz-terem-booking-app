import { describe, it, expect } from "vitest";
import { computeStats, formatMonthLabel } from "@/lib/stats";
import { Booking } from "@/types/booking";

let seq = 0;
function makeBooking(over: Partial<Booking>): Booking {
  return {
    id: String(++seq),
    roomId: "floor-1-34",
    roomName: "1-й этаж",
    date: "2026-06-15", // понедельник
    startTime: "10:00",
    endTime: "12:00",
    title: "Тест",
    description: "",
    userName: "Иван",
    status: "active",
    createdAt: "",
    ...over,
  };
}

describe("computeStats", () => {
  it("пустой список даёт нули", () => {
    const s = computeStats([]);
    expect(s.total).toBe(0);
    expect(s.avgMinutes).toBe(0);
    expect(s.byMonth).toEqual([]);
    expect(s.byWeekday).toEqual(new Array(7).fill(0));
  });

  it("отменённые считаются в total/cancelled, но не в часах и графиках", () => {
    const s = computeStats([
      makeBooking({}),
      makeBooking({ status: "cancelled", startTime: "10:00", endTime: "20:00" }),
    ]);
    expect(s.total).toBe(2);
    expect(s.active).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.totalMinutes).toBe(120);
    expect(s.byMonth[0].count).toBe(1);
  });

  it("минуты считаются точно, средняя — по активным", () => {
    const s = computeStats([
      makeBooking({ startTime: "13:30", endTime: "15:15" }), // 105
      makeBooking({ startTime: "23:00", endTime: "24:00" }), // 60
    ]);
    expect(s.totalMinutes).toBe(165);
    expect(s.avgMinutes).toBe(83); // round(82.5)
  });

  it("группирует по месяцам в хронологическом порядке", () => {
    const s = computeStats([
      makeBooking({ date: "2026-06-01" }),
      makeBooking({ date: "2026-04-20" }),
      makeBooking({ date: "2026-06-10" }),
    ]);
    expect(s.byMonth.map((m) => m.month)).toEqual(["2026-04", "2026-06"]);
    expect(s.byMonth[1].count).toBe(2);
  });

  it("сортирует помещения и пользователей по минутам, убыв.", () => {
    const s = computeStats([
      makeBooking({ roomId: "a", roomName: "A", startTime: "10:00", endTime: "11:00", userName: "Петя" }),
      makeBooking({ roomId: "b", roomName: "B", startTime: "10:00", endTime: "14:00", userName: "Вася" }),
    ]);
    expect(s.byRoom.map((r) => r.roomId)).toEqual(["b", "a"]);
    expect(s.topUsers.map((u) => u.userName)).toEqual(["Вася", "Петя"]);
  });

  it("день недели: понедельник — индекс 0, воскресенье — 6", () => {
    const s = computeStats([
      makeBooking({ date: "2026-06-15" }), // пн
      makeBooking({ date: "2026-06-21" }), // вс
    ]);
    expect(s.byWeekday[0]).toBe(1);
    expect(s.byWeekday[6]).toBe(1);
  });

  it("час начала попадает в свой слот", () => {
    const s = computeStats([makeBooking({ startTime: "09:30", endTime: "10:00" })]);
    expect(s.byStartHour[9]).toBe(1);
  });

  it("уникальные пользователи считаются по всем броням, включая отменённые", () => {
    const s = computeStats([
      makeBooking({ userName: "Иван" }),
      makeBooking({ userName: "Мария", status: "cancelled" }),
    ]);
    expect(s.uniqueUsers).toBe(2);
  });
});

describe("formatMonthLabel", () => {
  it("текущий год — без года, чужой — с годом", () => {
    expect(formatMonthLabel("2026-06", 2026)).toBe("июн");
    expect(formatMonthLabel("2025-12", 2026)).toBe("дек 25");
  });
});
