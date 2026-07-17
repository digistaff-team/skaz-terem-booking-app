/**
 * Извлекает читаемое название мероприятия из title брони.
 *
 * Поддерживает и текущий формат (чистое название мероприятия), и legacy-записи
 * вида "{room} | {event} | {user}", созданные до перехода на чистое хранение
 * title (составную строку теперь собирает только googleCalendar.ts для календаря).
 */
export function parseEventTitle(title: string): string {
  const parts = title.split(" | ");
  return parts.length >= 2 ? parts[1] : title;
}
