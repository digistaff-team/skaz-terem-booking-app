import { useState, useEffect, useCallback } from "react";
import { getInitData } from "./auth";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionStatus = "idle" | "checking" | "allowed" | "blocked" | "error";

/**
 * Проверяет членство пользователя в закрытой группе Терема.
 *
 * Статус «blocked» ставится только когда сервер явно ответил «не состоит».
 * При техническом сбое (нет токена, упавший Telegram API, функция не
 * задеплоена) — «error»: пускать безопаснее, чем парализовать бронирование
 * у всех из-за недоступности внешнего API.
 */
export function useGroupSubscription(subscriberId?: string) {
  const [status, setStatus] = useState<SubscriptionStatus>("idle");

  const refresh = useCallback(async () => {
    if (!subscriberId) {
      setStatus("idle");
      return;
    }

    setStatus("checking");
    const initData = getInitData();
    const body: Record<string, string> = { subscriber_id: subscriberId };
    if (initData) body.init_data = initData;

    try {
      const { data, error } = await supabase.functions.invoke(
        "check-group-subscription",
        { body },
      );
      const result = data as { subscribed?: boolean; error?: string } | null;

      if (error || !result) {
        console.error("check-group-subscription failed:", error?.message ?? "empty response");
        setStatus("error");
        return;
      }
      if (result.error) {
        console.error("check-group-subscription:", result.error);
        setStatus("error");
        return;
      }
      setStatus(result.subscribed ? "allowed" : "blocked");
    } catch (err) {
      console.error("check-group-subscription threw:", err);
      setStatus("error");
    }
  }, [subscriberId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}
