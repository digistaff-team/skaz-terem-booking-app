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
        <CalendarClock className="h-5 w-5 text-primary" /> Общие часы в {monthName}
      </h2>
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">⏳ Считаю остаток...</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          {usage.map((u) => (
            <div key={u.roomId} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{roomLabel(u.roomId)}</span>
              <span className="shrink-0 font-medium text-foreground">
                {formatMinutes(u.usedMinutes)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default MonthlyLimits;
