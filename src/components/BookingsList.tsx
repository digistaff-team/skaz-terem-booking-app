import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveBookings, cancelBooking } from "@/lib/bookingStore";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { formatDateShort } from "@/lib/dates";
import { formatMinutes } from "@/lib/duration";
import { parseEventTitle } from "@/lib/booking";
import { getLockCode } from "@/lib/lockCodes";
import { CalendarDays, Home, Trash2, KeyRound } from "lucide-react";

/** Код ключницы в карточке брони: подгружается сам, при ошибке скрывается. */
const LockCodeRow = ({ bookingId }: { bookingId: string }) => {
  const { data: lockCode, isLoading, isError } = useQuery({
    queryKey: ["lockCode", bookingId],
    queryFn: () => getLockCode(bookingId),
    staleTime: Infinity,
    retry: 1,
  });

  if (isError) return null;
  if (isLoading) {
    return (
      <p className="mt-3 text-sm text-muted-foreground animate-pulse flex items-center gap-2">
        <KeyRound className="h-4 w-4 shrink-0" /> Получаю код доступа...
      </p>
    );
  }
  if (!lockCode) return null;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 flex items-center gap-2">
      <KeyRound className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 text-sm">
        <span className="text-muted-foreground">Код от ключницы: </span>
        <span className="font-bold text-foreground tracking-wider">{lockCode.code}</span>
        {lockCode.effectiveFrom && !lockCode.isStatic && (
          <span className="block text-xs text-muted-foreground">
            действует с {time(lockCode.effectiveFrom)} до {time(lockCode.effectiveTo)}
          </span>
        )}
      </div>
    </div>
  );
};

/** Активные брони пользователя с возможностью отмены (секция кабинета). */
const BookingsList = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["myBookings", user?.id],
    queryFn: () => getActiveBookings(user?.id),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      queryClient.invalidateQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["monthBookings"] });
      toast.success(
        result.refundMinutes > 0
          ? `Бронирование отменено, возвращено ${formatMinutes(result.refundMinutes)}`
          : "Бронирование отменено"
      );
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

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground animate-pulse">⏳ Ищем ваши бронирования...</p>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        У вас пока нет активных бронирований
      </div>
    );
  }

  return (
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
          <LockCodeRow bookingId={b.id} />
          <p className="mt-3 text-xs text-muted-foreground">Ответственный: {b.userName}</p>
          {cancellingId === b.id && (
            <p className="mt-3 text-sm text-muted-foreground animate-pulse">
              ⏳ Удаляю ваше бронирование...
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default BookingsList;
