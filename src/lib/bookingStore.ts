import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types/booking";
import {
  syncBookingToGoogleCalendar,
  cancelBookingInGoogleCalendar,
} from "./googleCalendar";

export async function getBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching bookings:", error);
    return [];
  }

  return (data ?? []).map(mapRow);
}

export async function getActiveBookings(): Promise<Booking[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("status", "active")
    .gte("date", today)
    .order("date", { ascending: true });

  if (error) {
    console.error("Error fetching active bookings:", error);
    return [];
  }

  return (data ?? []).map(mapRow);
}

export async function addBooking(
  booking: Omit<Booking, "id" | "createdAt" | "status">
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

export async function cancelBooking(id: string): Promise<void> {
  // Get booking data before cancelling
  const { data: bookingData } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

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

export async function isTimeSlotAvailable(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): Promise<boolean> {
  let query = supabase
    .from("bookings")
    .select("id")
    .eq("room_id", roomId)
    .eq("date", date)
    .eq("status", "active")
    .lt("start_time", endTime)
    .gt("end_time", startTime);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error checking availability:", error);
    return false;
  }

  return (data ?? []).length === 0;
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
    status: row.status,
    createdAt: row.created_at,
  };
}
