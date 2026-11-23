import { useState } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { rooms } from "@/data/rooms";
import { buildDeepLink } from "@/lib/startParam";
import { showAlert } from "@/lib/telegram";
import { toast } from "sonner";

/**
 * Мини-генератор deep-link ссылок для админа (итерация 5).
 * Собирает ссылку https://t.me/SkazTerem_bot/booking?startapp=room_<id>[_<date>]
 * и копирует её в буфер. Невалидная комбинация → ссылка не показывается.
 */
export const DeepLinkGenerator = () => {
  const [roomId, setRoomId] = useState(rooms[0].id);
  const [date, setDate] = useState("");
  const [copied, setCopied] = useState(false);

  const link = buildDeepLink({ roomId, date: date || undefined });

  const handleCopy = async () => {
    if (!link) {
      showAlert("Ссылка недоступна: проверьте комнату и дату");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Ссылка скопирована — можно публиковать в канале");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Фолбэк для WebView без Clipboard API — выделяем текстовое поле
      showAlert("Не удалось скопировать автоматически — выделите ссылку вручную");
    }
  };

  return (
    <div className="mt-8 rounded-xl border border-border bg-card p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Link2 className="h-4 w-4 text-primary" /> Ссылка на бронь (для канала/чата)
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Открывает мастер сразу на выбранной комнате и дате
      </p>

      <div className="grid grid-cols-2 gap-3">
        <select
          aria-label="Комната для ссылки"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.icon} {room.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Дата для ссылки (необязательно)"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {link ? (
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 flex w-full items-center gap-2 rounded-lg bg-muted px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted/70"
          title="Нажмите, чтобы скопировать"
        >
          {copied ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 truncate">{link}</span>
        </button>
      ) : (
        <p className="mt-3 text-xs text-destructive">
          Дата вне допустимого диапазона или комната не найдена — ссылка не сформирована
        </p>
      )}
    </div>
  );
};
