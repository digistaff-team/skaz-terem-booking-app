import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAccount, type TransactionReason } from "@/lib/accountStore";
import { useAuth, getUserName } from "@/lib/auth";
import { rooms } from "@/data/rooms";
import { formatMinutes } from "@/lib/duration";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, Wallet, CircleDollarSign } from "lucide-react";

const REASON_LABELS: Record<TransactionReason, string> = {
  topup: "Пополнение",
  booking: "Бронирование",
  refund: "Возврат за отмену",
  adjust: "Корректировка",
};

function roomLabel(roomId: string): string {
  const room = rooms.find((r) => r.id === roomId);
  return room ? `${room.icon} ${room.name}` : roomId;
}

function formatTransactionDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) +
    ", " +
    d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  );
}

const Account = () => {
  const { user } = useAuth();

  const { data: account, isLoading, error } = useQuery({
    queryKey: ["account"],
    queryFn: getAccount,
  });

  const balanceFor = (roomId: string) =>
    account?.balances.find((b) => b.roomId === roomId)?.minutes ?? 0;

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> На главную
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-foreground">Личный кабинет</h1>
        <p className="mb-6 text-muted-foreground">{getUserName(user)}{user?.username ? ` · @${user.username}` : ""}</p>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground animate-pulse">⏳ Загружаю баланс...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Не удалось загрузить баланс. Переоткройте приложение через бота @SkazTerem_bot.</p>
          </div>
        ) : (
          <>
            {/* Балансы по помещениям */}
            <section className="mb-6">
              <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Баланс часов
              </h2>
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {rooms.map((room) => {
                  const minutes = balanceFor(room.id);
                  return (
                    <div key={room.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg shrink-0">{room.icon}</span>
                        <span className="text-sm text-foreground truncate">{room.name}</span>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className={`text-sm font-semibold ${minutes < 0 ? "text-destructive" : "text-foreground"}`}>
                          {formatMinutes(minutes)}
                        </span>
                        {minutes < 0 && (
                          <span className="block text-xs text-destructive">долг</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Часы списываются при бронировании и возвращаются при отмене. Баланс каждого помещения отдельный.
              </p>
            </section>

            {/* Как пополнить */}
            <section className="mb-6 rounded-xl border border-border bg-card p-4">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Как пополнить баланс</h3>
              <p className="text-sm text-muted-foreground">
                Купить часы можно у куратора Ольги — напишите или позвоните:{" "}
                <a href="tel:+79892496318" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" />
                  +7 (989) 249-63-18
                </a>{" "}
                (WhatsApp, Telegram). После оплаты часы появятся здесь.
              </p>
            </section>

            {/* История операций */}
            <section>
              <h2 className="mb-3 text-lg font-semibold text-foreground">История операций</h2>
              {account && account.transactions.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  Операций пока не было
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card divide-y divide-border">
                  {account?.transactions.map((t, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{REASON_LABELS[t.reason] ?? t.reason}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {roomLabel(t.roomId)} · {formatTransactionDate(t.createdAt)}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ml-3 ${
                        t.minutesDelta > 0 ? "text-primary" : "text-foreground"
                      }`}>
                        {t.minutesDelta > 0 ? "+" : ""}{formatMinutes(t.minutesDelta)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="mt-8 space-y-3">
              <Link to="/book" className="block">
                <Button className="w-full" size="lg">Забронировать помещение</Button>
              </Link>
              {user?.isAdmin && (
                <Link to="/admin" className="block">
                  <Button variant="outline" className="w-full gap-2" size="lg">
                    <CircleDollarSign className="h-5 w-5" /> Начисление часов (админ)
                  </Button>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Account;
