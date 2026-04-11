import { Booking } from "@/types/booking";
import { rooms } from "@/data/rooms";

const GOOGLE_APPS_SCRIPT_URL = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

interface GoogleCalendarPayload {
  action: "create" | "delete";
  calendarId: string;
  summary: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  bookingId: string;
  userName: string;
}

export async function syncBookingToGoogleCalendar(
  booking: Booking
): Promise<void> {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    console.warn("Google Apps Script URL not configured");
    return;
  }

  const room = rooms.find((r) => r.id === booking.roomId);
  if (!room) {
    console.error(`Room ${booking.roomId} not found`);
    return;
  }

  const payload: GoogleCalendarPayload = {
    action: booking.status === "cancelled" ? "delete" : "create",
    calendarId: room.calendarId,
    summary: `${booking.title}`,
    description: generateDescription(booking),
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    bookingId: booking.id,
    userName: booking.userName,
  };

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Booking synced to Google Calendar:", booking.id);
  } catch (error) {
    console.error("Failed to sync booking to Google Calendar:", error);
  }
}

export async function cancelBookingInGoogleCalendar(
  bookingId: string,
  roomId: string
): Promise<void> {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    console.warn("Google Apps Script URL not configured");
    return;
  }

  const room = rooms.find((r) => r.id === roomId);
  if (!room) {
    console.error(`Room ${roomId} not found`);
    return;
  }

  const payload: GoogleCalendarPayload = {
    action: "delete",
    calendarId: room.calendarId,
    summary: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    bookingId,
    userName: "",
  };

  try {
    await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("Booking removed from Google Calendar:", bookingId);
  } catch (error) {
    console.error("Failed to remove booking from Google Calendar:", error);
  }
}

function generateDescription(booking: Booking): string {
  const lines = [
    `Забронировал(а): ${booking.userName}`,
    `ID бронирования: ${booking.id}`,
  ];

  if (booking.description) {
    lines.push(`Описание: ${booking.description}`);
  }

  return lines.join("\n");
}
