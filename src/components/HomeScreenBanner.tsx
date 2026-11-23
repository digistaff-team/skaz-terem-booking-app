import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { tg, canUse, showAlert } from "@/lib/telegram";

type HomeScreenStatus = "unsupported" | "added" | "missed" | "unknown";

const HomeScreenBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const webApp = tg();
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
      if (!responded && canAdd) setVisible(true);
    }, 1500);

    if (canUse("checkHomeScreenStatus")) {
      try {
        webApp.checkHomeScreenStatus((result) => {
          responded = true;
          window.clearTimeout(fallbackTimer);
          const status: HomeScreenStatus =
            typeof result === "string" ? (result as HomeScreenStatus) : ((result as Record<string, unknown>)?.status as HomeScreenStatus) ?? "unknown";
          console.info("[HomeScreenBanner] status:", status);
          if (status === "missed" || status === "unknown") {
            setVisible(true);
          }
        });
      } catch (error) {
        responded = true;
        window.clearTimeout(fallbackTimer);
        console.info("[HomeScreenBanner] checkHomeScreenStatus unavailable", error);
      }
    } else {
      console.info("[HomeScreenBanner] checkHomeScreenStatus missing, addToHomeScreen:", canAdd);
    }

    return () => {
      window.clearTimeout(fallbackTimer);
      webApp.offEvent?.("home_screen_added", handleAdded);
      webApp.offEvent?.("home_screen_failed", handleFailed);
    };
  }, []);

  const handleAddToHomeScreen = () => {
    const addToHomeScreen = tg()?.addToHomeScreen;
    if (typeof addToHomeScreen !== "function") {
      showAlert("Функция пока не поддерживается на этом устройстве");
      return;
    }
    addToHomeScreen();
  };

  if (!visible) return null;

  return (
    <div className="mx-auto mb-6 flex max-w-5xl items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
      <div className="flex-1 text-sm">
        <p className="font-medium text-foreground">Добавьте на главный экран</p>
        <p className="text-muted-foreground">Приложение будет под рукой</p>
        <button
          onClick={handleAddToHomeScreen}
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          Добавить иконку на экран →
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