import { supabase } from "@/integrations/supabase/client";
import { getInitData } from "./auth";
import { translateRpcError, NO_TELEGRAM_ERROR } from "./rpcErrors";

export interface AdminUser {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  balances: { roomId: string; minutes: number }[];
}

interface AdminUserRow {
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  balances: { room_id: string; minutes: number }[];
}

export function adminUserName(u: AdminUser): string {
  const parts = [u.firstName, u.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (u.username) return `@${u.username}`;
  return String(u.chatId);
}

/** Список активных пользователей с балансами (только для администраторов). */
export async function adminListUsers(): Promise<AdminUser[]> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  const { data, error } = await supabase.rpc("admin_list_users", {
    p_init_data: initData,
  });

  if (error) throw new Error(translateRpcError(error.message));

  return (data as AdminUserRow[]).map((u) => ({
    chatId: u.chat_id,
    username: u.username ?? undefined,
    firstName: u.first_name ?? undefined,
    lastName: u.last_name ?? undefined,
    balances: u.balances.map((b) => ({ roomId: b.room_id, minutes: b.minutes })),
  }));
}

export interface AdjustHoursParams {
  chatId: number;
  roomId: string;
  minutes: number; // плюс — начисление, минус — корректировка
  comment?: string;
}

/** Начисляет/списывает минуты на баланс пользователя (только для администраторов). */
export async function adminAdjustHours(params: AdjustHoursParams): Promise<{ balanceMinutes: number }> {
  const initData = getInitData();
  if (!initData) throw new Error(NO_TELEGRAM_ERROR);

  const { data, error } = await supabase.rpc("admin_adjust_hours", {
    p_init_data: initData,
    p_chat_id: params.chatId,
    p_room_id: params.roomId,
    p_minutes: params.minutes,
    p_comment: params.comment || null,
  });

  if (error) throw new Error(translateRpcError(error.message));

  return { balanceMinutes: (data as { balance_minutes: number }).balance_minutes };
}
