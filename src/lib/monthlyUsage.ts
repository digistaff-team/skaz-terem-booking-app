import { Booking } from "@/types/booking";
import { durationMinutes } from "./duration";
import { MONTHLY_LIMITS_MINUTES } from "@/config/monthlyLimits";

export interface RoomMonthUsage {
  roomId: string;
  /** Лимит помещения на месяц, минуты. */
  limitMinutes: number;
  /** Израсходовано активными бронями месяца (включая брони «Всего Терема»). */
  usedMinutes: number;
  /** Остаток; может быть отрицательным — лимит информационный. */
  remainingMinutes: number;
}

/**
 * Расход общего месячного лимита по каждому помещению.
 * На вход — брони одного календарного месяца; отменённые игнорируются.
 * Бронь «whole-house» расходует лимит каждого помещения.
 * Уборка (isCleaning) — служебное время, пул жителей не расходует.
 */
export function computeMonthUsage(bookings: Booking[]): RoomMonthUsage[] {
  const active = bookings.filter((b) => b.status === "active" && !b.isCleaning);

  return Object.entries(MONTHLY_LIMITS_MINUTES).map(([roomId, limitMinutes]) => {
    const usedMinutes = active
      .filter((b) => b.roomId === roomId || b.roomId === "whole-house")
      .reduce((s, b) => s + durationMinutes(b.startTime, b.endTime), 0);

    return { roomId, limitMinutes, usedMinutes, remainingMinutes: limitMinutes - usedMinutes };
  });
}
