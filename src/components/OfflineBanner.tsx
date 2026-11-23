import { WifiOff } from "lucide-react";

/** Баннер «нет соединения» — показывается поверх контента страниц. */
export const OfflineBanner = () => (
  <div
    role="status"
    className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
  >
    <WifiOff className="h-4 w-4 shrink-0" />
    Нет соединения — показаны сохранённые данные
  </div>
);
