import { Building2, ArrowRight, RefreshCw } from "lucide-react";

interface BookingBlockedOverlayProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function BookingBlockedOverlay({
  onRefresh,
  isRefreshing = false,
}: BookingBlockedOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl dark:bg-zinc-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Building2 className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>

        <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
          Недостаточно прав для бронирования
        </h2>

        <p className="mb-6 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Для доступа к бронированию подайте заявку в нашу группу:
        </p>

        <a
          href="https://t.me/+YhyWCIjwUh0xZGIy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#2AABEE] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#229ED9]"
        >
          Подать заявку
          <ArrowRight className="h-4 w-4" />
        </a>

        {onRefresh && (
          <div className="mt-6">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Проверяю..." : "Проверить ещё раз"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
