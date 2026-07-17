import { supabase } from "@/integrations/supabase/client";
import { getInitData } from "./auth";

export interface RoomBalance {
  roomId: string;
  minutes: number;
}

export type TransactionReason = "topup" | "booking" | "refund" | "adjust";

export interface BalanceTransaction {
  roomId: string;
  minutesDelta: number;
  reason: TransactionReason;
  comment: string | null;
  createdAt: string;
}

export interface Account {
  balances: RoomBalance[];
  transactions: BalanceTransaction[];
}

interface AccountPayload {
  balances: { room_id: string; minutes: number }[];
  transactions: {
    room_id: string;
    minutes_delta: number;
    reason: TransactionReason;
    comment: string | null;
    created_at: string;
  }[];
}

/** Балансы часов и история операций текущего пользователя (личный кабинет). */
export async function getAccount(): Promise<Account> {
  const initData = getInitData();
  if (!initData) {
    throw new Error("Кабинет доступен только из Telegram. Откройте приложение через бота @SkazTerem_bot");
  }

  const { data, error } = await supabase.rpc("get_account", {
    p_init_data: initData,
  });

  if (error) throw new Error(error.message);

  const payload = data as AccountPayload;
  return {
    balances: payload.balances.map((b) => ({ roomId: b.room_id, minutes: b.minutes })),
    transactions: payload.transactions.map((t) => ({
      roomId: t.room_id,
      minutesDelta: t.minutes_delta,
      reason: t.reason,
      comment: t.comment,
      createdAt: t.created_at,
    })),
  };
}
