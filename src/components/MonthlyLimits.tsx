import { useQuery } from "@tanstack/react-query";
import { getActiveBookingsForMonth } from "@/lib/bookingStore";
import { computeMonthUsage } from "@/lib/monthlyUsage";
import { formatMinutes } from "@/lib/duration";
import { rooms } from "@/data/rooms";
import { CalendarClock } from "lucide-react";

function roomLabel(roomId: string): string {
  const room = rooms.find((r) => r.id === roomId);
  return room ? `${room.icon} ${room.name}` : roomId;
}

/** Общий месячный лимит часов по помещениям (единый пул всех жителей). */
const MonthlyLimits = () => {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthName = now.toLocaleDateString("ru-RU", { month: "long" });

  const { data: monthBookings = [], isLoading } = useQuery({
    queryKey: ["monthBookings", month],
    queryFn: () => getActiveBookingsForMonth(month),
  });

  const usage = computeMonthUsage(monthBookings);

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" /> Лимит Терема на {monthName}
      </h2>
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">⏳ Считаю остаток...</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {usage.map((u) => {
            const over = u.remainingMinutes < 0;
            const share = Math.min(u.usedMinutes / u.limitMinutes, 1);
            return (
              <div key={u.roomId}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{roomLabel(u.roomId)}</span>
                  <span className={`shrink-0 font-medium ${over ? "text-destructive" : "text-foreground"}`}>
                    {over
                      ? `превышен на ${formatMinutes(-u.remainingMinutes)}`
                      : `${formatMinutes(u.remainingMinutes)} из ${formatMinutes(u.limitMinutes)}`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary">
                  <div
                    className={`h-2 rounded-full ${over ? "bg-destructive" : "bg-accent"}`}
                    style={{ width: `${Math.max(share * 100, u.usedMinutes > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Лимит общий для всех жителей и обновляется 1-го числа каждого месяца.
        Бронь «Всего Терема» расходует лимит каждого помещения.
      </p>
    </section>
  );
};

export default MonthlyLimits;
