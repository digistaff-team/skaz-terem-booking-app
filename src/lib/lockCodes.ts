import { supabase } from "@/integrations/supabase/client";
import { getInitData } from "./auth";
import { NO_TELEGRAM_ERROR } from "./rpcErrors";

export interface LockCode {
  code: string;
  /** true — запасной общий код (Tuya ещё не настроена), false — персональный. */
  isStatic: boolean;
  effectiveFrom: string; // ISO
  effectiveTo: string; // ISO
}

interface LockCodeResponse {
  ok: boolean;
  error?: string;
  code?: string;
  static?: boolean;
  effective_from?: string;
  effective_to?: string;
}

/** Персональный код ключницы для брони (Edge Function tuya-lock-code).
 * Идемпотентно: повторный вызов возвращает уже выданный код. */
export async function getLockCode(bookingId: string): Promise<LockCode> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  const { data, error } = await supabase.functions.invoke<LockCodeResponse>("tuya-lock-code", {
    body: { init_data: initData, booking_id: bookingId },
  });

  if (error || !data?.ok || !data.code) {
    throw new Error(data?.error || error?.message || "LOCK_CODE_ERROR");
  }

  return {
    code: data.code,
    isStatic: data.static ?? false,
    effectiveFrom: data.effective_from ?? "",
    effectiveTo: data.effective_to ?? "",
  };
}
