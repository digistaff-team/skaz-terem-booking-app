import { Booking } from "@/types/booking";
import { durationMinutes } from "./duration";
import { PERSONAL_MONTHLY_LIMIT_MINUTES } from "@/config/personalLimits";

export interface PersonalMonthUsage {
  limitMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
}

/**
 * Расход персонального месячного лимита одного жителя.
 * На вход — брони одного календарного месяца (любых помещений);
 * отменённые игнорируются. В отличие от общего лимита по помещениям,
 * бронь «whole-house» считается один раз обычной длительностью —
 * лимит один общий на все помещения, а не per-room.
 */
export function computePersonalMonthUsage(
  bookings: Booking[],
  userId: string
): PersonalMonthUsage {
  const usedMinutes = bookings
    .filter((b) => b.status === "active" && b.userId === userId)
    .reduce((s, b) => s + durationMinutes(b.startTime, b.endTime), 0);

  return {
    limitMinutes: PERSONAL_MONTHLY_LIMIT_MINUTES,
    usedMinutes,
    remainingMinutes: PERSONAL_MONTHLY_LIMIT_MINUTES - usedMinutes,
  };
}
