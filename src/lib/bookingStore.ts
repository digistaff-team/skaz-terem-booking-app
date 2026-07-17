import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";
import {
  syncBookingToGoogleCalendar,
  cancelBookingInGoogleCalendar,
} from "./googleCalendar";
import { rooms } from "@/data/rooms";
import { getInitData } from "./auth";
import { toLocalISODate, currentTimeHHMM } from "./dates";

// Коды исключений из RPC-функций (supabase-migrations-2-security.sql)
const RPC_ERROR_MESSAGES: Record<string, string> = {
  BOOKING_CONFLICT: "Это время уже занято, выберите другое",
  AUTH_INVALID: "Не удалось подтвердить вашу личность. Переоткройте приложение через бота @SkazTerem_bot",
  AUTH_EXPIRED: "Сессия устарела. Закройте и снова откройте приложение через бота @SkazTerem_bot",
  AUTH_NOT_CONFIGURED: "Сервис временно недоступен, попробуйте позже",
  INVALID_INPUT: "Некорректные данные бронирования, проверьте дату и время",
  BOOKING_NOT_FOUND: "Бронирование не найдено или принадлежит другому пользователю",
};

function translateRpcError(message: string): string {
  for (const [code, text] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

const NO_TELEGRAM_ERROR =
  "Бронирование доступно только из Telegram. Откройте приложение через бота @SkazTerem_bot";

const WHOLE_HOUSE_ID = "whole-house";
const ALL_ROOM_IDS = rooms.map((r) => r.id);

// Весь Терем конфликтует со всеми помещениями, каждое помещение — с Весь Терем
function getConflictingRoomIds(roomId: string): string[] {
  if (roomId === WHOLE_HOUSE_ID) return ALL_ROOM_IDS;
  return [roomId, WHOLE_HOUSE_ID];
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

export async function addBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">
): Promise<Booking> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  // Атомарная вставка: проверка конфликтов и запись происходят на сервере
  // в одной транзакции — двойное бронирование невозможно.
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
  });

  if (error) throw new Error(translateRpcError(error.message));

  const newBooking = mapRow(data as BookingRow);

  // Sync to Google Calendar
  await syncBookingToGoogleCalendar(newBooking);

  return newBooking;
}

export async function cancelBooking(id: string): Promise<void> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  // Сервер сам проверяет, что бронь принадлежит этому пользователю
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_init_data: initData,
    p_booking_id: id,
  });

  if (error) throw new Error(translateRpcError(error.message));

  // Remove from Google Calendar
  const cancelled = data as BookingRow | null;
  if (cancelled) {
    await cancelBookingInGoogleCalendar(id, cancelled.room_id);
  }
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

  return (data ?? []).map(mapRow);
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
  };
}
