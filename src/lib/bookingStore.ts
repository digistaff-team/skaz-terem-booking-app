import { Booking } from "@/types/booking";

const STORAGE_KEY = "terem-bookings";

export function getBookings(): Booking[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Booking[];
}

export function getActiveBookings(): Booking[] {
  return getBookings().filter(
    (b) => b.status === "active" && b.date >= new Date().toISOString().split("T")[0]
  );
}

export function addBooking(booking: Omit<Booking, "id" | "createdAt" | "status">): Booking {
  const bookings = getBookings();
  const newBooking: Booking = {
    ...booking,
    id: crypto.randomUUID(),
    status: "active",
    createdAt: new Date().toISOString(),
  };
  bookings.push(newBooking);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  return newBooking;
}

export function cancelBooking(id: string): void {
  const bookings = getBookings();
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx !== -1) {
    bookings[idx].status = "cancelled";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));
  }
}

export function isTimeSlotAvailable(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): boolean {
  const bookings = getActiveBookings().filter(
    (b) => b.roomId === roomId && b.date === date && b.id !== excludeId
  );
  return !bookings.some((b) => {
    return startTime < b.endTime && endTime > b.startTime;
  });
}
