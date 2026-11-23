/**
 * Возвращает true, если помещение заблокировано (недоступно для бронирования).
 * Проверка по полю unavailableUntil — ISO-дата (YYYY-MM-DD).
 */
export function isRoomUnavailable(room: { unavailableUntil?: string }): boolean {
  if (!room.unavailableUntil) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const until = new Date(room.unavailableUntil + "T00:00:00");
  return today <= until;
}
