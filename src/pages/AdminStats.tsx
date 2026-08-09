import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBookings } from "@/lib/bookingStore";
import { computeStats, formatMonthLabel, WEEKDAY_LABELS } from "@/lib/stats";
import { formatMinutes } from "@/lib/duration";
import { useAuth } from "@/lib/auth";
import { toLocalISODate, localISODateInDays } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";

// Цвет заливки — токен accent (hsl(25 60% 45%) ≈ #B8672E): контраст с карточкой
// ~4:1 (проверено валидатором dataviz-скилла; primary #E6801A даёт лишь 2.7:1).
// Один цвет на все графики: везде одна метрика (sequential), серий нет.

type Period = "all" | "thisMonth" | "prevMonth" | "30d";

const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "Всё время" },
  { key: "thisMonth", label: "Этот месяц" },
  { key: "prevMonth", label: "Прошлый месяц" },
  { key: "30d", label: "30 дней" },
];

function periodRange(period: Period): { from?: string; to?: string } {
  const now = new Date();
  switch (period) {
    case "thisMonth":
      return { from: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)) };
    case "prevMonth":
      return {
        from: toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "30d":
      return { from: localISODateInDays(-30) };
    default:
      return {};
  }
}

/** Часы одним числом: 994,6 → «995 ч», 8.5 → «8,5 ч». */
function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  const rounded = h >= 20 ? Math.round(h) : Math.round(h * 10) / 10;
  return `${String(rounded).replace(".", ",")} ч`;
}

/** 1 → «бронь», 2-4 → «брони», 5+/11-14 → «броней». */
function bookingWord(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "броней";
  const mod10 = n % 10;
  if (mod10 === 1) return "бронь";
  if (mod10 >= 2 && mod10 <= 4) return "брони";
  return "броней";
}

function StatTile({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

const AdminStats = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("all");

  const { data: allBookings = [], isLoading } = useQuery({
    queryKey: ["allBookings"],
    queryFn: () => getBookings(),
    enabled: !!user?.isAdmin,
  });

  const stats = useMemo(() => {
    const { from, to } = periodRange(period);
    const rows = allBookings.filter(
      (b) => (!from || b.date >= from) && (!to || b.date <= to)
    );
    return computeStats(rows);
  }, [allBookings, period]);

  if (user && !user.isAdmin) {
    return <Navigate to="/account" replace />;
  }

  const maxMonth = Math.max(...stats.byMonth.map((m) => m.minutes), 1);
  const maxRoom = Math.max(...stats.byRoom.map((r) => r.minutes), 1);
  const maxWeekday = Math.max(...stats.byWeekday, 1);
  const maxHour = Math.max(...stats.byStartHour, 1);
  const peakHour = stats.byStartHour.indexOf(maxHour);

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/account" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> В кабинет
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Статистика
        </h1>
        <p className="mb-4 text-muted-foreground">Бронирования и загрузка помещений</p>

        {/* Период */}
        <div className="mb-6 flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.key}
              variant={period === p.key ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground animate-pulse">⏳ Загружаю данные...</p>
        ) : stats.total === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Нет бронирований за выбранный период
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile
                value={String(stats.active)}
                label="активных броней"
                sub={stats.cancelled > 0 ? `+ ${stats.cancelled} отменено (${Math.round(stats.cancelled / stats.total * 100)}%)` : undefined}
              />
              <StatTile value={hoursLabel(stats.totalMinutes)} label="часов брони" />
              <StatTile value={formatMinutes(stats.avgMinutes)} label="средняя длительность" />
              <StatTile value={String(stats.uniqueUsers)} label="пользователей" />
              <StatTile
                value={hoursLabel(stats.backdatedMinutes)}
                label="Без брони"
                sub={
                  stats.backdatedCount > 0
                    ? `${stats.backdatedCount} ${bookingWord(stats.backdatedCount)} из ${stats.active} (${Math.round(stats.backdatedMinutes / (stats.totalMinutes || 1) * 100)}%)`
                    : undefined
                }
              />
            </div>

            {/* По месяцам */}
            {stats.byMonth.length > 1 && (
              <Section title="Часы брони по месяцам">
                <div className="flex items-end gap-2 h-32">
                  {stats.byMonth.map((m) => (
                    <div key={m.month} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                      <span className="text-xs text-foreground font-medium">{hoursLabel(m.minutes)}</span>
                      <div
                        className="w-full max-w-12 rounded-t bg-accent"
                        style={{ height: `${Math.max((m.minutes / maxMonth) * 88, 3)}px` }}
                        title={`${formatMonthLabel(m.month)}: ${m.count} броней, ${hoursLabel(m.minutes)}`}
                      />
                      <span className="text-xs text-muted-foreground">{formatMonthLabel(m.month)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* По помещениям */}
            <Section title="Часы брони по помещениям">
              <div className="space-y-3">
                {stats.byRoom.map((r) => (
                  <div key={r.roomId}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-foreground truncate">{r.roomName}</span>
                      <span className="shrink-0 font-medium text-foreground">
                        {hoursLabel(r.minutes)}
                        <span className="ml-1 font-normal text-muted-foreground">· {r.count}</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${Math.max((r.minutes / maxRoom) * 100, 2)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Число после точки — количество броней</p>
            </Section>

            {/* По дням недели */}
            <Section title="Брони по дням недели">
              <div className="flex items-end gap-2 h-24">
                {stats.byWeekday.map((n, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <span className="text-xs text-foreground">{n || ""}</span>
                    <div
                      className="w-full max-w-10 rounded-t bg-accent"
                      style={{ height: `${Math.max((n / maxWeekday) * 56, n ? 3 : 1)}px` }}
                      title={`${WEEKDAY_LABELS[i]}: ${n}`}
                    />
                    <span className="text-xs text-muted-foreground">{WEEKDAY_LABELS[i]}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* По времени начала */}
            <Section title="Брони по времени начала">
              <div className="flex items-end gap-px h-20">
                {stats.byStartHour.map((n, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-0">
                    {h === peakHour && n > 0 && (
                      <span className="text-[10px] leading-none text-foreground">{n}</span>
                    )}
                    <div
                      className={`w-full ${h === peakHour ? "bg-accent" : "bg-accent/70"} rounded-t-sm`}
                      style={{ height: `${Math.max((n / maxHour) * 48, n ? 2 : 1)}px` }}
                      title={`${String(h).padStart(2, "0")}:00 — ${n}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
              </div>
            </Section>

            {/* Топ пользователей */}
            <Section title="Топ пользователей по часам">
              <div className="divide-y divide-border">
                {stats.topUsers.map((u, i) => (
                  <div key={u.userName} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate text-foreground">
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                      {u.userName}
                    </span>
                    <span className="shrink-0 font-medium text-foreground">
                      {hoursLabel(u.minutes)}
                      <span className="ml-1 font-normal text-muted-foreground">· {u.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminStats;
