import { Booking } from "@/types/booking";
import { durationMinutes } from "./duration";

export interface PersonalRoomStat {
  roomId: string;
  roomName: string;
  count: number;
  minutes: number;
}

export interface PersonalMonthStat {
  month: string; // YYYY-MM
  count: number;
  minutes: number;
  /** Помещения, которые житель бронировал в этом месяце; по убыванию часов. */
  byRoom: PersonalRoomStat[];
}

/**
 * История часов одного жителя по календарным месяцам: сколько часов он забронировал
 * в каждом месяце и как они разложились по помещениям.
 *
 * Отменённые брони и брони других жителей игнорируются; месяцы без броней в
 * результат не попадают (кабинет рисует столбик на каждый месяц из этого списка).
 * Бронь «Всего Терема» — отдельная строка со своей длительностью: она не
 * размазывается по комнатам, как в общем лимите (`computeMonthUsage`), потому что
 * здесь считается личное время жителя, а не загрузка помещений.
 *
 * Результат отсортирован по возрастанию месяца — так его рисует график.
 */
export function computePersonalMonthlyStats(
  bookings: Booking[],
  userId: string
): PersonalMonthStat[] {
  const byMonth = new Map<
    string,
    { month: string; count: number; minutes: number; rooms: Map<string, PersonalRoomStat> }
  >();

  for (const b of bookings) {
    if (b.status !== "active" || b.userId !== userId) continue;

    const month = b.date.slice(0, 7);
    const minutes = durationMinutes(b.startTime, b.endTime);

    const m = byMonth.get(month) ?? { month, count: 0, minutes: 0, rooms: new Map() };
    m.count++;
    m.minutes += minutes;

    const r = m.rooms.get(b.roomId) ?? {
      roomId: b.roomId,
      roomName: b.roomName,
      count: 0,
      minutes: 0,
    };
    r.count++;
    r.minutes += minutes;
    m.rooms.set(b.roomId, r);

    byMonth.set(month, m);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ month, count, minutes, rooms }) => ({
      month,
      count,
      minutes,
      byRoom: [...rooms.values()].sort((a, b) => b.minutes - a.minutes),
    }));
}
