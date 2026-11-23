// ============================================================
// Разбор и построение deep-link параметра startapp (итерация 5)
// ============================================================
// Формат payload — компактный: room_<id>[_<YYYY-MM-DD>]
//   пример: "room_floor-1-34_2026-12-05" или просто "room_floor-1-34"
// Источник: WebApp.initDataUnsafe.start_param, fallback — query
// "?startapp=" или "tgWebAppStartParam".
// ============================================================

import { rooms } from "@/data/rooms";
import { getMaxBookingDate } from "@/config/bookingLimits";
import { toLocalISODate } from "@/lib/dates";
import { tg } from "@/lib/telegram";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = "room_";

export interface StartParamIntent {
  roomId: string;
  date?: string;
}

/** Валидация даты: формат, не в прошлом, в пределах горизонта. */
function isValidFutureDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(date + "T23:59:59");
  if (Number.isNaN(d.getTime())) return false;
  return date >= toLocalISODate() && date <= getMaxBookingDate();
}

/** Парсит строку payload → intent (валидные поля). */
export function parseStartParamPayload(payload: string | null | undefined): StartParamIntent | null {
  if (!payload || !payload.startsWith(PREFIX)) return null;
  const rest = payload.slice(PREFIX.length);
  if (!rest) return null;
  // Ищем суффикс даты "_YYYY-MM-DD" (длина даты фиксирована)
  let roomId = rest;
  let date: string | undefined;
  if (rest.length > 11 && rest.at(-11) === "_" && DATE_RE.test(rest.slice(-10))) {
    roomId = rest.slice(0, -11);
    date = rest.slice(-10);
  }
  if (!rooms.some((r) => r.id === roomId)) return null;
  if (date !== undefined && !isValidFutureDate(date)) date = undefined;
  return { roomId, date };
}

/** Читает start_param из initDataUnsafe или query-параметров страницы. */
export function readStartParam(): string | null {
  const fromInit = tg()?.initDataUnsafe?.start_param;
  if (fromInit) return fromInit;
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("startapp") || params.get("tgWebAppStartParam") || null;
}

/** Полный разбор текущего запуска приложения. */
export function readStartIntent(): StartParamIntent | null {
  return parseStartParamPayload(readStartParam());
}

/** Строит payload для ссылки (обратная операция к parse). */
export function buildStartParamPayload(intent: StartParamIntent): string | null {
  if (!rooms.some((r) => r.id === intent.roomId)) return null;
  if (intent.date !== undefined && !isValidFutureDate(intent.date)) return null;
  return `${PREFIX}${intent.roomId}${intent.date ? `_${intent.date}` : ""}`;
}

/** Ссылка вида https://t.me/SkazTerem_bot/booking?startapp=<payload>. */
export function buildDeepLink(intent: StartParamIntent, botUsername = "SkazTerem_bot", appName = "booking"): string | null {
  const payload = buildStartParamPayload(intent);
  if (!payload) return null;
  return `https://t.me/${botUsername}/${appName}?startapp=${encodeURIComponent(payload)}`;
}

// --- sessionStorage intent (для неавторизованных) ---

const INTENT_KEY = "startapp_intent";

export function stashPendingIntent(intent: StartParamIntent): void {
  try { sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch { /* ignore */ }
}

export function takePendingIntent(): StartParamIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(INTENT_KEY);
    const parsed = JSON.parse(raw) as Partial<StartParamIntent>;
    if (typeof parsed?.roomId !== "string") return null;
    return parseStartParamPayload(buildStartParamPayload(parsed as StartParamIntent) ?? "");
  } catch {
    return null;
  }
}
