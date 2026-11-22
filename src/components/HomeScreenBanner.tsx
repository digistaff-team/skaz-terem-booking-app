import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

type HomeScreenStatus = "unsupported" | "added" | "missed" | "unknown";

const HomeScreenBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    const handleAdded = () => {
      setVisible(false);
      toast.success("Готово! Иконка добавлена на главный экран");
    };
    const handleFailed = () => setVisible(true);

    webApp.onEvent?.("home_screen_added", handleAdded);
    webApp.onEvent?.("home_screen_failed", handleFailed);

    // Разово проверяем статус иконки на главном экране (Bot API 8.0+)
    const canAdd = typeof webApp.addToHomeScreen === "function";
    let responded = false;
    const fallbackTimer = window.setTimeout(() => {
      // Клиент не ответил на запрос статуса — трактуем как unknown и показываем баннер
      if (!responded && canAdd) setVisible(true);
    }, 1500);

    if (typeof webApp.checkHomeScreenStatus === "function") {
      try {
        webApp.checkHomeScreenStatus((result) => {
          responded = true;
          window.clearTimeout(fallbackTimer);
          // SDK передаёт либо строку статуса, либо объект { status }
          const status: HomeScreenStatus =
            typeof result === "string" ? (result as HomeScreenStatus) : ((result?.status as HomeScreenStatus) ?? "unknown");
          console.info("[HomeScreenBanner] status:", status);
          if (status === "missed" || status === "unknown") {
            setVisible(true);
          }
        });
      } catch (error) {
        // checkHomeScreenStatus не поддерживается этой версией клиента
        responded = true;
        window.clearTimeout(fallbackTimer);
        console.info("[HomeScreenBanner] checkHomeScreenStatus unavailable", error);
      }
    } else {
      // Метода проверки нет, но добавить иконку можно — показываем баннер через fallback-таймер
      console.info("[HomeScreenBanner] checkHomeScreenStatus missing, addToHomeScreen:", canAdd);
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      webApp.offEvent?.("home_screen_added", handleAdded);
      webApp.offEvent?.("home_screen_failed", handleFailed);
    };
  }, []);

  const handleAddToHomeScreen = () => {
    const addToHomeScreen = window.Telegram?.WebApp?.addToHomeScreen;
    if (typeof addToHomeScreen !== "function") {
      toast.error("Функция пока не поддерживается на этом устройстве");
      return;
    }
    // Метод только инициирует системный запрос Telegram и не возвращает результат
    addToHomeScreen();
  };

  if (!visible) return null;

  return (
    <div className="mx-auto mb-6 flex max-w-5xl items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
      <div className="flex-1 text-sm">
        <p className="font-medium text-foreground">Добавьте Сказочный Терем на главный экран</p>
        <p className="text-muted-foreground">Приложение всегда будет под рукой — в один тап.</p>
        <button
          onClick={handleAddToHomeScreen}
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          Добавить иконку →
        </button>
      </div>
      <button
        aria-label="Скрыть"
        onClick={() => setVisible(false)}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default HomeScreenBanner;