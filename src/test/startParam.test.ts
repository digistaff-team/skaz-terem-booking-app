import { describe, it, expect } from "vitest";
import {
  parseStartParamPayload,
  buildStartParamPayload,
  buildDeepLink,
} from "@/lib/startParam";
import { localISODateInDays } from "@/lib/dates";

// Горизонт бронирования по умолчанию — 90 дней, поэтому даты для тестов
// берём относительные (завтра), а не фиксированные.
const validFuture = localISODateInDays(1);

describe("parseStartParamPayload", () => {
  it("парсит payload с комнатой и датой", () => {
    expect(parseStartParamPayload(`room_floor-1-34_${validFuture}`)).toEqual({
      roomId: "floor-1-34",
      date: validFuture,
    });
  });

  it("парсит payload только с комнатой", () => {
    expect(parseStartParamPayload("room_whole-house")).toEqual({
      roomId: "whole-house",
      date: undefined,
    });
  });

  it("игнорирует неизвестную комнату", () => {
    expect(parseStartParamPayload("room_nope-123")).toBeNull();
  });

  it("игнорирует мусор без префикса", () => {
    expect(parseStartParamPayload("garbage")).toBeNull();
    expect(parseStartParamPayload("")).toBeNull();
    expect(parseStartParamPayload(null)).toBeNull();
    expect(parseStartParamPayload(undefined)).toBeNull();
  });

  it("отбрасывает прошедшую/некорректную дату, сохраняя комнату", () => {
    const r = parseStartParamPayload("room_floor-2-hall-20_2000-01-01");
    expect(r).toEqual({ roomId: "floor-2-hall-20" });
  });

  it("корректно разрезает id с дефисами и дату через нижнее подчёркивание", () => {
    expect(parseStartParamPayload(`room_floor-2-room-11_${validFuture}`)).toEqual({
      roomId: "floor-2-room-11",
      date: validFuture,
    });
  });
});

describe("buildStartParamPayload", () => {
  it("строит payload из intent", () => {
    expect(buildStartParamPayload({ roomId: "floor-1-34", date: validFuture })).toBe(
      `room_floor-1-34_${validFuture}`
    );
    expect(buildStartParamPayload({ roomId: "whole-house" })).toBe("room_whole-house");
  });

  it("возвращает null для неизвестной комнаты", () => {
    expect(buildStartParamPayload({ roomId: "unknown" })).toBeNull();
  });

  it("округление: parse(build(intent)) === intent", () => {
    const intent = { roomId: "floor-2-office-6", date: validFuture };
    const payload = buildStartParamPayload(intent);
    expect(payload).not.toBeNull();
    expect(parseStartParamPayload(payload)).toEqual(intent);
  });
});

describe("buildDeepLink", () => {
  it("строит ссылку t.me", () => {
    const link = buildDeepLink({ roomId: "floor-1-34" });
    expect(link).toBe(
      "https://t.me/SkazTerem_bot/booking?startapp=room_floor-1-34"
    );
  });

  it("null при невалидной комнате", () => {
    expect(buildDeepLink({ roomId: "bad" })).toBeNull();
  });
});
