import { describe, it, expect } from "vitest";
import { isStartBlocked, getAvailableEndSlots, TIME_SLOTS, END_TIME_SLOTS } from "@/lib/timeSlots";
import { Booking } from "@/types/booking";

function makeBooking(startTime: string, endTime: string): Booking {
  return {
    id: `${startTime}-${endTime}`,
    roomId: "floor-2-hall-20",
    roomName: "Зал",
    date: "2026-08-01",
    startTime,
    endTime,
    title: "Тест",
    description: "",
    userName: "Иван",
    status: "active",
    createdAt: "",
    isBackdated: false,
  };
}

describe("timeSlots: константы", () => {
  it("TIME_SLOTS содержит 24 часовых слота 00:00..23:00", () => {
    expect(TIME_SLOTS).toHaveLength(24);
    expect(TIME_SLOTS[0]).toBe("00:00");
    expect(TIME_SLOTS[23]).toBe("23:00");
  });

  it("END_TIME_SLOTS дополняет TIME_SLOTS слотом 24:00 для брони до полуночи", () => {
    expect(END_TIME_SLOTS).toHaveLength(25);
    expect(END_TIME_SLOTS.at(-1)).toBe("24:00");
  });
});

describe("isStartBlocked", () => {
  const bookings = [makeBooking("10:00", "12:00")];

  it("время внутри существующей брони заблокировано", () => {
    expect(isStartBlocked(bookings, "10:00")).toBe(true);
    expect(isStartBlocked(bookings, "11:00")).toBe(true);
  });

  it("время окончания брони (полуоткрытый интервал) уже свободно", () => {
    expect(isStartBlocked(bookings, "12:00")).toBe(false);
  });

  it("время до и после брони свободно", () => {
    expect(isStartBlocked(bookings, "09:00")).toBe(false);
    expect(isStartBlocked(bookings, "13:00")).toBe(false);
  });

  it("пустой список броней ничего не блокирует", () => {
    expect(isStartBlocked([], "10:00")).toBe(false);
  });
});

describe("getAvailableEndSlots", () => {
  it("без броней доступны все слоты после start", () => {
    const slots = getAvailableEndSlots([], "22:00");
    expect(slots).toEqual(["23:00", "24:00"]);
  });

  it("ограничивает доступные концы началом следующей брони — нельзя «перепрыгнуть» через неё одной бронью", () => {
    const bookings = [makeBooking("14:00", "16:00")];
    const slots = getAvailableEndSlots(bookings, "12:00");
    // Любой конец, попадающий внутрь брони или позже (включая далеко за 16:00),
    // даёт интервал [12:00, e), пересекающийся с [14:00, 16:00). Допустимые концы —
    // только до начала следующей брони включительно.
    expect(slots).toEqual(["13:00", "14:00"]);
  });

  it("бронь, начинающаяся ровно в start, блокирует вообще все концы", () => {
    const bookings = [makeBooking("10:00", "12:00")];
    const slots = getAvailableEndSlots(bookings, "10:00");
    // Любой e > 10:00 пересекается с бронью [10:00, 12:00). На практике UI не даёт
    // выбрать такой start — он уже отфильтрован isStartBlocked.
    expect(slots).toEqual([]);
  });

  it("несколько броней подряд: доступен только конец до самой ранней следующей брони", () => {
    const bookings = [makeBooking("10:00", "12:00"), makeBooking("14:00", "16:00")];
    const slots = getAvailableEndSlots(bookings, "09:00");
    // Первая же бронь (10:00) становится потолком для конца — вторая (14:00) уже не важна.
    expect(slots).toEqual(["10:00"]);
  });
});
