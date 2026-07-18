import { describe, it, expect } from "vitest";
import { computeMonthUsage } from "@/lib/monthlyUsage";
import { MONTHLY_LIMITS_MINUTES } from "@/config/monthlyLimits";
import { Booking } from "@/types/booking";

let seq = 0;
function makeBooking(over: Partial<Booking>): Booking {
  return {
    id: String(++seq),
    roomId: "floor-1-34",
    roomName: "1-й этаж",
    date: "2026-07-10",
    startTime: "10:00",
    endTime: "13:00", // 3 ч
    title: "Тест",
    description: "",
    userName: "Иван",
    status: "active",
    createdAt: "",
    ...over,
  };
}

const usageFor = (bookings: Booking[], roomId: string) =>
  computeMonthUsage(bookings).find((u) => u.roomId === roomId)!;

describe("monthlyLimits: конфигурация", () => {
  it("лимиты соответствуют заданию", () => {
    expect(MONTHLY_LIMITS_MINUTES["floor-1-34"]).toBe(60 * 60);
    expect(MONTHLY_LIMITS_MINUTES["floor-2-office-6"]).toBe(120 * 60);
    expect(MONTHLY_LIMITS_MINUTES["floor-2-room-11"]).toBe(120 * 60);
    expect(MONTHLY_LIMITS_MINUTES["floor-2-hall-20"]).toBe(60 * 60);
    expect(MONTHLY_LIMITS_MINUTES["whole-house"]).toBeUndefined();
  });
});

describe("computeMonthUsage", () => {
  it("без броней остаток равен лимиту у всех помещений", () => {
    for (const u of computeMonthUsage([])) {
      expect(u.usedMinutes).toBe(0);
      expect(u.remainingMinutes).toBe(u.limitMinutes);
    }
  });

  it("бронь одного жителя уменьшает общий остаток помещения (пример из задания: 60 − 3 = 57)", () => {
    const u = usageFor([makeBooking({})], "floor-1-34"); // 3 часа
    expect(u.usedMinutes).toBe(180);
    expect(u.remainingMinutes).toBe(57 * 60);
  });

  it("брони разных жителей суммируются в общий расход", () => {
    const bookings = [
      makeBooking({ userName: "Иван" }),
      makeBooking({ userName: "Мария", startTime: "14:00", endTime: "15:30" }),
    ];
    const u = usageFor(bookings, "floor-1-34");
    expect(u.usedMinutes).toBe(180 + 90);
  });

  it("расход считается поминутно", () => {
    const u = usageFor([makeBooking({ startTime: "13:30", endTime: "15:15" })], "floor-1-34");
    expect(u.usedMinutes).toBe(105);
  });

  it("бронь другого помещения не влияет", () => {
    const u = usageFor([makeBooking({ roomId: "floor-2-hall-20" })], "floor-1-34");
    expect(u.usedMinutes).toBe(0);
  });

  it("бронь «Всего Терема» расходует лимит каждого помещения", () => {
    const bookings = [makeBooking({ roomId: "whole-house" })]; // 3 ч
    for (const u of computeMonthUsage(bookings)) {
      expect(u.usedMinutes).toBe(180);
    }
  });

  it("отменённые брони не расходуют лимит", () => {
    const u = usageFor([makeBooking({ status: "cancelled" })], "floor-1-34");
    expect(u.usedMinutes).toBe(0);
  });

  it("остаток может уходить в минус (лимит информационный)", () => {
    const bookings = [
      makeBooking({ startTime: "00:00", endTime: "24:00", date: "2026-07-01" }),
      makeBooking({ startTime: "00:00", endTime: "24:00", date: "2026-07-02" }),
      makeBooking({ startTime: "00:00", endTime: "24:00", date: "2026-07-03" }),
    ]; // 72 ч при лимите 60
    const u = usageFor(bookings, "floor-1-34");
    expect(u.remainingMinutes).toBe(-12 * 60);
  });
});
