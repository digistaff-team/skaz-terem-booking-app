import { describe, it, expect } from "vitest";
import { computePersonalMonthUsage } from "@/lib/personalUsage";
import { PERSONAL_MONTHLY_LIMIT_MINUTES } from "@/config/personalLimits";
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
    userId: "user-1",
    status: "active",
    createdAt: "",
    isBackdated: false,
    ...over,
  };
}

describe("computePersonalMonthUsage", () => {
  it("без броней остаток равен лимиту", () => {
    const u = computePersonalMonthUsage([], "user-1");
    expect(u.usedMinutes).toBe(0);
    expect(u.limitMinutes).toBe(PERSONAL_MONTHLY_LIMIT_MINUTES);
    expect(u.remainingMinutes).toBe(PERSONAL_MONTHLY_LIMIT_MINUTES);
  });

  it("брони пользователя суммируются независимо от помещения", () => {
    const bookings = [
      makeBooking({ roomId: "floor-1-34" }), // 3 ч
      makeBooking({ roomId: "floor-2-hall-20", startTime: "14:00", endTime: "15:30" }), // 1.5 ч
    ];
    const u = computePersonalMonthUsage(bookings, "user-1");
    expect(u.usedMinutes).toBe(180 + 90);
  });

  it("брони других пользователей игнорируются", () => {
    const bookings = [
      makeBooking({ userId: "user-1" }),
      makeBooking({ userId: "user-2", startTime: "14:00", endTime: "20:00" }),
    ];
    const u = computePersonalMonthUsage(bookings, "user-1");
    expect(u.usedMinutes).toBe(180);
  });

  it("отменённые брони не учитываются", () => {
    const u = computePersonalMonthUsage(
      [makeBooking({ status: "cancelled" })],
      "user-1"
    );
    expect(u.usedMinutes).toBe(0);
  });

  it("бронь «Всего Терема» считается один раз обычной длительностью", () => {
    const u = computePersonalMonthUsage(
      [makeBooking({ roomId: "whole-house" })], // 3 ч
      "user-1"
    );
    expect(u.usedMinutes).toBe(180);
  });

  it("остаток может уходить в минус (лимит информационный)", () => {
    const bookings = [
      makeBooking({ date: "2026-07-01", startTime: "00:00", endTime: "24:00" }),
      makeBooking({ date: "2026-07-02", startTime: "00:00", endTime: "24:00" }),
    ]; // 48 ч при лимите 40
    const u = computePersonalMonthUsage(bookings, "user-1");
    expect(u.remainingMinutes).toBe(-8 * 60);
  });
});
