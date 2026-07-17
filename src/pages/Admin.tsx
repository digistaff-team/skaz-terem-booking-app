import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminListUsers, adminAdjustHours, adminUserName } from "@/lib/adminStore";
import { useAuth } from "@/lib/auth";
import { rooms } from "@/data/rooms";
import { formatMinutes } from "@/lib/duration";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, CircleDollarSign } from "lucide-react";

// Стили нативного <select> в тон Input (shadcn Select удалён при чистке зависимостей)
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const Admin = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [chatId, setChatId] = useState("");
  const [roomId, setRoomId] = useState(rooms[0].id);
  const [hours, setHours] = useState("");
  const [comment, setComment] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: adminListUsers,
    enabled: !!user?.isAdmin,
  });

  const adjustMutation = useMutation({
    mutationFn: adminAdjustHours,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["account"] });
      toast.success(`Готово! Новый баланс: ${formatMinutes(result.balanceMinutes)}`);
      setHours("");
      setComment("");
    },
    onError: (err) => {
      toast.error("Ошибка: " + getErrorMessage(err));
    },
  });

  // Сервер всё равно проверит ADMIN_ONLY — это только чтобы не показывать форму зря
  if (user && !user.isAdmin) {
    return <Navigate to="/account" replace />;
  }

  const selectedUser = users.find((u) => String(u.chatId) === chatId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      toast.error("Выберите пользователя");
      return;
    }
    const parsed = parseFloat(hours.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed === 0) {
      toast.error("Укажите число часов, например 10 или 1.5 (отрицательное — списание)");
      return;
    }
    const minutes = Math.round(parsed * 60);
    adjustMutation.mutate({
      chatId: selectedUser.chatId,
      roomId,
      minutes,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/account" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> В кабинет
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-foreground flex items-center gap-2">
          <CircleDollarSign className="h-6 w-6 text-primary" /> Начисление часов
        </h1>
        <p className="mb-6 text-muted-foreground">
          Начисляйте купленные часы на баланс помещения. Отрицательное число часов — списание (корректировка).
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground animate-pulse">⏳ Загружаю пользователей...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="admin-user">Пользователь</Label>
              <select
                id="admin-user"
                className={selectClass + " mt-1.5"}
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              >
                <option value="">— выберите пользователя —</option>
                {users.map((u) => (
                  <option key={u.chatId} value={String(u.chatId)}>
                    {adminUserName(u)}{u.username && adminUserName(u) !== `@${u.username}` ? ` (@${u.username})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedUser && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-2 text-sm font-semibold text-foreground">Текущие балансы</p>
                <div className="space-y-1">
                  {rooms.map((room) => {
                    const minutes = selectedUser.balances.find((b) => b.roomId === room.id)?.minutes ?? 0;
                    return (
                      <div key={room.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{room.icon} {room.name}</span>
                        <span className={minutes < 0 ? "text-destructive font-medium" : "text-foreground font-medium"}>
                          {formatMinutes(minutes)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="admin-room">Помещение</Label>
              <select
                id="admin-room"
                className={selectClass + " mt-1.5"}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.icon} {room.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="admin-hours">Часы</Label>
              <Input
                id="admin-hours"
                type="number"
                inputMode="decimal"
                step="0.25"
                placeholder="Например: 10 или 1.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="admin-comment">Комментарий (необязательно)</Label>
              <Input
                id="admin-comment"
                placeholder="Например: оплата переводом 15.07"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? "Начисляю..." : "Начислить"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Admin;
