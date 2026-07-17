import { Booking } from "@/types/booking";

export const TIME_SLOTS = Array.from({ length: 24 }, (_, i) =>
  `${i.toString().padStart(2, "0")}:00`
);

// Слоты окончания: те же 24 + 24:00 для бронирований до полуночи
export const END_TIME_SLOTS = [...TIME_SLOTS, "24:00"];

/** Слот начала заблокирован, если он попадает внутрь уже существующей брони. */
export function isStartBlocked(bookings: Booking[], t: string): boolean {
  return bookings.some((b) => b.startTime <= t && t < b.endTime);
}

/** Доступные слоты окончания после start — без пересечения существующих броней. */
export function getAvailableEndSlots(bookings: Booking[], start: string): string[] {
  return END_TIME_SLOTS.filter(
    (e) => e > start && !bookings.some((b) => b.startTime < e && b.endTime > start)
  );
}
