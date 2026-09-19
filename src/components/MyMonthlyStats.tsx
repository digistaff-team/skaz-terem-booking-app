import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBookings } from "@/lib/bookingStore";
import { computePersonalMonthlyStats, PersonalRoomStat } from "@/lib/personalStats";
import { formatMonthLabel } from "@/lib/stats";
import { formatMinutes } from "@/lib/duration";
import { useAuth } from "@/lib/auth";
import { parseLocalDate } from "@/lib/dates";
import { rooms } from "@/data/rooms";
import { History } from "lucide-react";

/** Сколько последних месяцев показывать столбиками — дальше график не влезает в телефон. */
const MONTHS_SHOWN = 12;

/** '2026-07' → «Июль 2026». */
function monthTitle(month: string): string {
  const d = parseLocalDate(`${month}-01`);
  const name = d.toLocaleDateString("ru-RU", { month: "long" });
  return `${name[0].toUpperCase()}${name.slice(1)} ${d.getFullYear()}`;
}

function roomLabel(stat: PersonalRoomStat): string {
  const room = rooms.find((r) => r.id === stat.roomId);
  return room ? `${room.icon} ${room.name}` : stat.roomName;
}

/**
 * История личных часов: столбики по месяцам (последний год) + разбивка
 * выбранного месяца по помещениям. Месяц выбирается нажатием на столбик,
 * по умолчанию открыт самый свежий месяц с бронями.
 */
const MyMonthlyStats = () => {
  const { user } = useAuth();
  const [picked, setPicked] = useState<string | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["myBookingsHistory", user?.id],
    queryFn: () => getBookings(user!.id),
    enabled: !!user?.id,
  });

  const months = useMemo(
    () => (user?.id ? computePersonalMonthlyStats(bookings, user.id).slice(-MONTHS_SHOWN) : []),
    [bookings, user?.id]
  );

  if (!user?.id) return null;

  // picked может указывать на месяц, которого уже нет (бронь отменили) — тогда
  // откатываемся на самый свежий, поэтому выбор не хранится в useEffect.
  const selected = months.find((m) => m.month === picked) ?? months[months.length - 1];
  const maxMonthMinutes = Math.max(...months.map((m) => m.minutes), 1);
  const maxRoomMinutes = Math.max(...(selected?.byRoom.map((r) => r.minutes) ?? []), 1);

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
        <History className="h-5 w-5 text-primary" /> Моя статистика по месяцам
      </h2>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground animate-pulse">⏳ Собираю историю броней...</p>
        </div>
      ) : !selected ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Статистика появится после первой брони
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          {/* Месяцы: столбик = часы месяца, нажатие выбирает месяц */}
          <div className="flex items-end gap-1.5 h-28">
            {months.map((m) => {
              const isSelected = m.month === selected.month;
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => setPicked(m.month)}
                  aria-pressed={isSelected}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  title={`${monthTitle(m.month)}: ${formatMinutes(m.minutes)}`}
                >
                  <div
                    className={`w-full max-w-10 rounded-t transition-colors ${
                      isSelected ? "bg-accent" : "bg-accent/40"
                    }`}
                    style={{ height: `${Math.max((m.minutes / maxMonthMinutes) * 80, 3)}px` }}
                  />
                  <span
                    className={`max-w-full truncate text-xs ${
                      isSelected ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {formatMonthLabel(m.month)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Выбранный месяц: итог и разбивка по помещениям */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-foreground">
                {monthTitle(selected.month)}
              </span>
              <span className="shrink-0 font-semibold text-foreground">
                {formatMinutes(selected.minutes)}
              </span>
            </div>

            <div className="space-y-3">
              {selected.byRoom.map((r) => (
                <div key={r.roomId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">{roomLabel(r)}</span>
                    <span className="shrink-0 font-medium text-foreground">
                      {formatMinutes(r.minutes)}
                      <span className="ml-1 font-normal text-muted-foreground">· {r.count}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-accent"
                      style={{ width: `${Math.max((r.minutes / maxRoomMinutes) * 100, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Число после точки — количество броней
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default MyMonthlyStats;
