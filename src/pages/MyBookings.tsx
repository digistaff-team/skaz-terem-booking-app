import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveBookings, cancelBooking } from "@/lib/bookingStore";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { formatDateShort } from "@/lib/dates";
import { parseEventTitle } from "@/lib/booking";
import { ArrowLeft, CalendarDays, Home, Trash2 } from "lucide-react";

const MyBookings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["myBookings", user?.id],
    queryFn: () => getActiveBookings(user?.id),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      toast.success("Бронирование отменено");
    },
    onError: (err) => {
      toast.error("Ошибка при отмене: " + getErrorMessage(err));
    },
  });

  const cancellingId = cancelMutation.isPending ? (cancelMutation.variables as string) : null;

  const handleCancel = (id: string) => {
    toast.info("Удаляю ваше бронирование...");
    cancelMutation.mutate(id);
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
                    <span className="block">{formatDateShort(b.date)}</span>
                    <span className="block">{b.startTime} — {b.endTime}</span>
                  </h3>
                  <button
                    onClick={() => handleCancel(b.id)}
                    disabled={cancelMutation.isPending}
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
