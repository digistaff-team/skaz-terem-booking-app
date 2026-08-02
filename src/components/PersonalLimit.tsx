import { useQuery } from "@tanstack/react-query";
import { getActiveBookingsForMonth } from "@/lib/bookingStore";
import { computePersonalMonthUsage } from "@/lib/personalUsage";
import { formatMinutes } from "@/lib/duration";
import { useAuth } from "@/lib/auth";
import { UserRound } from "lucide-react";

/** Персональный месячный лимит часов бронирования (один на все помещения). */
const PersonalLimit = () => {
  const { user } = useAuth();
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthName = now.toLocaleDateString("ru-RU", { month: "long" });

  const { data: monthBookings = [], isLoading } = useQuery({
    queryKey: ["personalMonthBookings", month, user?.id],
    queryFn: () => getActiveBookingsForMonth(month, user!.id),
    enabled: !!user?.id,
  });

  if (!user?.id) return null;

  const usage = computePersonalMonthUsage(monthBookings, user.id);
  const over = usage.remainingMinutes < 0;
  const share = Math.min(usage.usedMinutes / usage.limitMinutes, 1);

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
        <UserRound className="h-5 w-5 text-primary" /> Мой лимит на {monthName}
      </h2>
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">⏳ Считаю остаток...</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-foreground">Часы бронирования</span>
            <span className={`shrink-0 font-medium ${over ? "text-destructive" : "text-foreground"}`}>
              {over
                ? `превышен на ${formatMinutes(-usage.remainingMinutes)}`
                : `${formatMinutes(usage.remainingMinutes)} из ${formatMinutes(usage.limitMinutes)}`}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary">
            <div
              className={`h-2 rounded-full ${over ? "bg-destructive" : "bg-accent"}`}
              style={{ width: `${Math.max(share * 100, usage.usedMinutes > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Личный лимит не зависит от депозита часов и не блокирует бронирование —
        только подсказка, сколько ты уже забронировал в этом месяце.
      </p>
    </section>
  );
};

export default PersonalLimit;
