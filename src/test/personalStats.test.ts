import { describe, it, expect } from "vitest";
import { computePersonalMonthlyStats } from "@/lib/personalStats";
import { Booking } from "@/types/booking";

let seq = 0;
function makeBooking(over: Partial<Booking>): Booking {
  return {
    id: String(++seq),
    roomId: "floor-1-34",
    roomName: "1-й этаж, 34 м²",
    date: "2026-07-10",
    startTime: "10:00",
    endTime: "13:00", // 3 ч
    title: "Тест",
    description: "",
    userName: "Иван",
    userId: "user-1",
    status: "active",
    createdAt: "",
    isBackdated: false,
    ...over,
  };
}

describe("computePersonalMonthlyStats", () => {
  it("без броней возвращает пустой список", () => {
    expect(computePersonalMonthlyStats([], "user-1")).toEqual([]);
  });

  it("группирует по месяцу даты брони и сортирует по возрастанию", () => {
    const stats = computePersonalMonthlyStats(
      [
        makeBooking({ date: "2026-08-03" }),
        makeBooking({ date: "2026-06-15" }),
        makeBooking({ date: "2026-07-10" }),
      ],
      "user-1"
    );
    expect(stats.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("считает часы и количество броней месяца", () => {
    const stats = computePersonalMonthlyStats(
      [
        makeBooking({ date: "2026-07-01" }), // 3 ч
        makeBooking({ date: "2026-07-20", startTime: "14:00", endTime: "15:30" }), // 1.5 ч
      ],
      "user-1"
    );
    expect(stats).toHaveLength(1);
    expect(stats[0].count).toBe(2);
    expect(stats[0].minutes).toBe(180 + 90);
  });

  it("раскладывает месяц по помещениям, по убыванию часов", () => {
    const stats = computePersonalMonthlyStats(
      [
        makeBooking({ roomId: "floor-2-office-6", roomName: "кабинет 6 м²", startTime: "10:00", endTime: "11:00" }),
        makeBooking({ roomId: "floor-1-34", roomName: "1 этаж" }), // 3 ч
        makeBooking({ roomId: "floor-1-34", roomName: "1 этаж", startTime: "18:00", endTime: "19:00" }),
      ],
      "user-1"
    );
    expect(stats[0].byRoom).toEqual([
      { roomId: "floor-1-34", roomName: "1 этаж", count: 2, minutes: 240 },
      { roomId: "floor-2-office-6", roomName: "кабинет 6 м²", count: 1, minutes: 60 },
    ]);
  });

  it("брони других жителей игнорируются", () => {
    const stats = computePersonalMonthlyStats(
      [makeBooking({ userId: "user-1" }), makeBooking({ userId: "user-2" })],
      "user-1"
    );
    expect(stats[0].count).toBe(1);
    expect(stats[0].minutes).toBe(180);
  });

  it("отменённые брони не учитываются, а пустой месяц выпадает из списка", () => {
    const stats = computePersonalMonthlyStats(
      [
        makeBooking({ date: "2026-06-10", status: "cancelled" }),
        makeBooking({ date: "2026-07-10" }),
      ],
      "user-1"
    );
    expect(stats.map((m) => m.month)).toEqual(["2026-07"]);
  });

  it("бронь «Всего Терема» — отдельная строка, часы по комнатам не размазываются", () => {
    const stats = computePersonalMonthlyStats(
      [makeBooking({ roomId: "whole-house", roomName: "Весь Сказочный Терем" })],
      "user-1"
    );
    expect(stats[0].minutes).toBe(180);
    expect(stats[0].byRoom).toEqual([
      { roomId: "whole-house", roomName: "Весь Сказочный Терем", count: 1, minutes: 180 },
    ]);
  });

  it("брони без user_id (legacy) не попадают в личную статистику", () => {
    expect(computePersonalMonthlyStats([makeBooking({ userId: undefined })], "user-1")).toEqual([]);
  });
});
