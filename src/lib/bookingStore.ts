import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";
import {
  syncBookingToGoogleCalendar,
  cancelBookingInGoogleCalendar,
} from "./googleCalendar";
import { rooms } from "@/data/rooms";

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
  const today = new Date().toISOString().split("T")[0];
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

  return (data ?? []).map(mapRow);
}

export async function addBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">,
  userId?: string
): Promise<Booking> {
  const { data, error } = await supabase
    .from("bookings")
    .insert({
      room_id: booking.roomId,
      room_name: booking.roomName,
      date: booking.date,
      start_time: booking.startTime,
      end_time: booking.endTime,
      title: booking.title,
      description: booking.description,
      user_name: booking.userName,
      user_id: userId || null,
      status: "active",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const newBooking = mapRow(data);

  // Sync to Google Calendar
  await syncBookingToGoogleCalendar(newBooking);

  return newBooking;
}

export async function cancelBooking(id: string, userId?: string): Promise<void> {
  // Get booking data before cancelling
  const { data: bookingData } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (!bookingData) {
    throw new Error("Бронирование не найдено");
  }

  // Check ownership if userId provided
  if (userId && bookingData.user_id !== userId) {
    throw new Error("Вы можете отменить только своё бронирование");
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Remove from Google Calendar
  if (bookingData) {
    await cancelBookingInGoogleCalendar(id, bookingData.room_id);
  }
}

export async function getCurrentBooking(
  roomId: string
): Promise<{ userName: string; title: string; endTime: string } | null> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentTime = now.toTimeString().slice(0, 5);

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

function mapRow(row: any): Booking {
  return {
    id: row.id,
    roomId: row.room_id,
    roomName: row.room_name,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    description: row.description,
    userName: row.user_name,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
  };
}
