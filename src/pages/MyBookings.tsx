import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getActiveBookings, cancelBooking } from "@/lib/bookingStore";
import { Booking } from "@/types/booking";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Clock, Home, Trash2 } from "lucide-react";

const MyBookings = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadBookings = async () => {
    const data = await getActiveBookings();
    setBookings(data);
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    toast.info("Удаляю ваше бронирование...");
    try {
      await cancelBooking(id);
      await loadBookings();
      toast.success("Бронирование отменено");
    } catch (err: any) {
      toast.error("Ошибка при отмене: " + err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "numeric",
      month: "long",
    });

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> На главную
        </Link>

        <h1 className="mb-6 text-2xl font-bold text-foreground">Мои бронирования</h1>

        {bookings.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground mb-4">У вас пока нет активных бронирований</p>
            <Link to="/book">
              <Button>Забронировать помещение</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl border border-border bg-card p-5 transition-all duration-300 ${
                  cancellingId === b.id
                    ? "opacity-40 pointer-events-none blur-[1px]"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-foreground text-lg">{b.title}</h3>
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancellingId !== null}
                    className={`transition-colors p-1 ${
                      cancellingId === b.id
                        ? "text-muted-foreground cursor-not-allowed"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
                    title="Отменить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Home className="h-4 w-4" /> {b.roomName}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> {formatDate(b.date)}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" /> {b.startTime} — {b.endTime}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Ответственный: {b.userName}</p>
                {cancellingId === b.id && (
                  <p className="mt-3 text-sm text-muted-foreground animate-pulse">
                    ⏳ Удаляю ваше бронирование...
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyBookings;
