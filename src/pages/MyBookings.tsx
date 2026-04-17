import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getActiveBookings, cancelBooking } from "@/lib/bookingStore";
import { useAuth } from "@/lib/auth";
import { Booking } from "@/types/booking";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Home, Trash2 } from "lucide-react";

const MyBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadBookings = async () => {
    setIsLoading(true);
    const data = await getActiveBookings(user?.id);
    setBookings(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadBookings();
  }, [user?.id]);

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    toast.info("Удаляю ваше бронирование...");
    try {
      await cancelBooking(id, user?.id);
      await loadBookings();
      toast.success("Бронирование отменено");
    } catch (err: any) {
      toast.error("Ошибка при отмене: " + err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    const dayMonth = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const weekday = date.toLocaleDateString("ru-RU", { weekday: "long" });
    return `${dayMonth}, ${weekday}`;
  };

  const parseEventTitle = (title: string) => {
    const parts = title.split(" | ");
    return parts.length >= 2 ? parts[1] : title;
  };

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> На главную
        </Link>

        <h1 className="mb-6 text-2xl font-bold text-foreground">Мои бронирования</h1>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground animate-pulse">⏳ Ищем ваши бронирования...</p>
          </div>
        ) : bookings.length === 0 ? (
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
                  <h3 className={`font-semibold text-base transition-colors duration-300 ${
                    cancellingId === b.id ? "text-muted-foreground" : "text-foreground"
                  }`}>
                    <span className="block">{formatDate(b.date)}</span>
                    <span className="block">{b.startTime} — {b.endTime}</span>
                  </h3>
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancellingId !== null}
                    className={`transition-colors p-1 shrink-0 ${
                      cancellingId === b.id
                        ? "text-muted-foreground cursor-not-allowed"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
                    title="Отменить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Home className="h-4 w-4 shrink-0" /> {b.roomName}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-4 w-4 shrink-0" /> {parseEventTitle(b.title)}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Ответственный: {b.userName}</p>
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
