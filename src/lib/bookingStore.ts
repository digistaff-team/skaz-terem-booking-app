import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";
import {
  syncBookingToGoogleCalendar,
  cancelBookingInGoogleCalendar,
} from "./googleCalendar";
import { rooms } from "@/data/rooms";
import { getInitData } from "./auth";
import { toLocalISODate, currentTimeHHMM } from "./dates";
import { translateRpcError, NO_TELEGRAM_ERROR } from "./rpcErrors";

const WHOLE_HOUSE_ID = "whole-house";
const ALL_ROOM_IDS = rooms.map((r) => r.id);

// Весь Терем конфликтует со всеми помещениями, каждое помещение — с Весь Терем
function getConflictingRoomIds(roomId: string): string[] {
  if (roomId === WHOLE_HOUSE_ID) return ALL_ROOM_IDS;
  return [roomId, WHOLE_HOUSE_ID];
}

// Расписание занятий «Школы» (занимает комнату 11 м²) — часы, в которые
// помещение «1-й этаж, 34 м²» недоступно для бронирования остальными резидентами.
// Полное совпадение с проверкой в create_booking (supabase-migrations-10).
// Ключ — день недели по ISO: 1=Пн … 7=Вс.
const SCHOOL_HOURS_BY_ISODOW: Record<number, { start: string; end: string }> = {
  1: { start: "08:30", end: "16:00" }, // Пн
  2: { start: "08:30", end: "14:30" }, // Вт
  4: { start: "08:30", end: "14:30" }, // Чт
  5: { start: "08:30", end: "14:00" }, // Пт
};
const SCHOOL_ROOM_ID = "floor-2-room-11";
const SCHOOL_BLOCKED_ROOM_ID = "floor-1-34";

/** ISO-день недели даты 'YYYY-MM-DD' (1=Пн … 7=Вс). Полуденный полдень —
 * чтобы часовой пояс не сдвигал дату. */
function isoDayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(y, m - 1, d, 12, 0, 0).getDay(); // 0=Вс … 6=Сб
  return dow === 0 ? 7 : dow;
}

/** Есть ли в списке броней активная бронь «Школа» на эту дату. */
function hasSchoolBooking(bookings: Booking[], date: string): boolean {
  return bookings.some(
    (b) => b.roomId === SCHOOL_ROOM_ID && b.title === "Школа" && b.date === date
  );
}

/** Бронируется ли 34 м² вразрез с расписанием «Школы» при наличии самой брони
 * «Школа» на эту дату (для админов сервер делает исключение — см. миграцию 10). */
function conflictsWithSchoolHours(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  bookings: Booking[]
): boolean {
  if (roomId !== SCHOOL_BLOCKED_ROOM_ID) return false;
  const slot = SCHOOL_HOURS_BY_ISODOW[isoDayOfWeek(date)];
  if (!slot) return false;
  if (!hasSchoolBooking(bookings, date)) return false;
  return startTime < slot.end && endTime > slot.start;
}

export async function getBookings(userId?: string): Promise<Booking[]> {
  let query = supabase
    .from("bookings")
    .select("*")
    .order("date", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching bookings:", error);
    return [];
  }

  return (data ?? []).map(mapRow);
}

export async function getActiveBookings(userId?: string): Promise<Booking[]> {
  const today = toLocalISODate();
  let query = supabase
    .from("bookings")
    .select("*")
    .eq("status", "active")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching active bookings:", error);
    return [];
  }

  const currentTime = currentTimeHHMM();

  return (data ?? [])
    .map(mapRow)
    .filter((b) => b.date > today || b.endTime > currentTime);
}

export interface AddBookingResult {
  booking: Booking;
  /** Сколько минут списано с депозита за эту бронь. */
  chargedMinutes: number;
  /** Баланс помещения после списания (может быть отрицательным — долг). */
  balanceAfter: number;
}

export async function addBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status" | "isBackdated" | "isCleaning">,
  /** Только для админов: бронь и списание часов оформляются на этого резидента. */
  onBehalfOfChatId?: number,
  /** Только для админов: слот под уборку — сервер ставит «Фея чистоты» и не списывает часы. */
  isCleaning = false
): Promise<AddBookingResult> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  // Атомарная вставка: проверка конфликтов, запись и списание минут с депозита
  // происходят на сервере в одной транзакции — двойное бронирование невозможно.
  const { data, error } = await supabase.rpc("create_booking", {
    p_init_data: initData,
    p_room_id: booking.roomId,
    p_room_name: booking.roomName,
    p_date: booking.date,
    p_start_time: booking.startTime,
    p_end_time: booking.endTime,
    p_title: booking.title,
    p_description: booking.description,
    p_user_name: booking.userName,
    p_on_behalf_of_chat_id: onBehalfOfChatId ?? null,
    // Только когда нужно: обычные брони продолжают работать и до применения миграции 9.
    ...(isCleaning ? { p_is_cleaning: true } : {}),
  });

  if (error) throw new Error(translateRpcError(error.message));

  const row = data as BookingRow & { charged_minutes: number; balance_after: number };
  const newBooking = mapRow(row);

  // Sync to Google Calendar
  await syncBookingToGoogleCalendar(newBooking);

  return {
    booking: newBooking,
    chargedMinutes: row.charged_minutes ?? 0,
    balanceAfter: row.balance_after ?? 0,
  };
}

export interface CancelBookingResult {
  /** Сколько минут вернулось на депозит (0 для legacy-броней без списания). */
  refundMinutes: number;
}

export async function cancelBooking(id: string): Promise<CancelBookingResult> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  // Сервер сам проверяет, что бронь принадлежит этому пользователю,
  // и возвращает списанные минуты на баланс
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_init_data: initData,
    p_booking_id: id,
  });

  if (error) throw new Error(translateRpcError(error.message));

  const cancelled = data as (BookingRow & { refund_minutes: number }) | null;

  // Remove from Google Calendar
  if (cancelled) {
    await cancelBookingInGoogleCalendar(id, cancelled.room_id);
  }

  return { refundMinutes: cancelled?.refund_minutes ?? 0 };
}

export async function getCurrentBooking(
  roomId: string
): Promise<{ userName: string; title: string; endTime: string } | null> {
  const today = toLocalISODate();
  const currentTime = currentTimeHHMM();

  const { data, error } = await supabase
    .from("bookings")
    .select("user_name, title, end_time")
    .eq("room_id", roomId)
    .eq("date", today)
    .eq("status", "active")
    .lte("start_time", currentTime)
    .gt("end_time", currentTime)
    .limit(1);

  if (error || !data || data.length === 0) return null;

  return {
    userName: data[0].user_name,
    title: data[0].title,
    endTime: data[0].end_time,
  };
}

export async function getActiveBookingsForRoomDate(
  roomId: string,
  date: string
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, room_id, room_name, date, start_time, end_time, title, description, user_name, status")
    .in("room_id", getConflictingRoomIds(roomId))
    .eq("date", date)
    .eq("status", "active");

  if (error) return [];

  const results = (data ?? []).map(mapRow);

  // Для помещения 34 м² подтягиваем также брони «Школа» с 11 м²,
  // чтобы UI показывал часы школы как занятые.
  if (roomId === "floor-1-34") {
    const { data: schoolData, error: schoolError } = await supabase
      .from("bookings")
      .select("id, room_id, room_name, date, start_time, end_time, title, description, user_name, status")
      .eq("room_id", "floor-2-room-11")
      .eq("date", date)
      .eq("title", "Школа")
      .eq("status", "active");
    if (!schoolError && schoolData) {
      results.push(...(schoolData as any[]).map(mapRow));
    }
  }

  return results;
}

/** Активные брони календарного месяца (month = 'YYYY-MM') — для расчёта
 * общего месячного лимита помещений и (если передан userId) персонального
 * лимита конкретного жителя. */
export async function getActiveBookingsForMonth(
  month: string,
  userId?: string
): Promise<Booking[]> {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = toLocalISODate(new Date(y, m, 0)); // последний день месяца

  let query = supabase
    .from("bookings")
    .select("id, room_id, room_name, date, start_time, end_time, title, description, user_name, user_id, status, is_cleaning")
    .gte("date", from)
    .lte("date", to)
    .eq("status", "active");

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) return [];
  return (data ?? []).map(mapRow);
}

export async function getBookingsForDate(date: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, room_id, room_name, date, start_time, end_time, title, description, user_name, user_id, status, created_at")
    .eq("date", date)
    .eq("status", "active")
    .order("start_time", { ascending: true });

  if (error) return [];
  return (data ?? []).map(mapRow);
}

export async function isTimeSlotAvailable(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<boolean> {
  const conflicts = await getConflictingBookings(roomId, date, startTime, endTime, excludeId);
  return conflicts.length === 0;
}

export async function getConflictingBookings(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<Booking[]> {
  let query = supabase
    .from("bookings")
    .select("id, room_id, room_name, date, start_time, end_time, title, description, user_name, status")
    .in("room_id", getConflictingRoomIds(roomId))
    .eq("date", date)
    .eq("status", "active")
    .lt("start_time", endTime)
    .gt("end_time", startTime);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getConflictingBookings] Supabase error:", error);
    return [];
  }

  const conflicts = (data ?? []).map(mapRow);

  // Бронь «Школа» (на комнате 11 м²) делает недоступной бронь 34 м² в часы уроков.
  // Находим саму бронь школы (она не входит в conflicts, т.к. это другое помещение)
  // и при пересечении добавляем её в список — UI покажет слот занятым.
  if (roomId === SCHOOL_BLOCKED_ROOM_ID) {
    const schoolQuery = await supabase
      .from("bookings")
      .select("id, room_id, room_name, date, start_time, end_time, title, description, user_name, status")
      .eq("room_id", SCHOOL_ROOM_ID)
      .eq("date", date)
      .eq("status", "active");
    const schoolBookings = (schoolQuery.data ?? []).map(mapRow);
    if (conflictsWithSchoolHours(roomId, date, startTime, endTime, schoolBookings)) {
      const school = schoolBookings.find((b) => b.title === "Школа");
      if (school) conflicts.push(school);
    }
  }

  return conflicts;
}

// Строка таблицы bookings в Supabase (snake_case).
// user_id и created_at опциональны — часть запросов выбирает не все колонки.
interface BookingRow {
  id: string;
  room_id: string;
  room_name: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  description: string | null;
  user_name: string;
  user_id?: string | null;
  status: Booking["status"];
  created_at?: string | null;
  is_backdated?: boolean | null;
  is_cleaning?: boolean | null;
}

function mapRow(row: BookingRow): Booking {
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    description: row.description ?? "",
    userName: row.user_name,
    userId: row.user_id ?? undefined,
    status: row.status,
    createdAt: row.created_at ?? "",
    isBackdated: row.is_backdated ?? false,
    isCleaning: row.is_cleaning ?? false,
  };
}
