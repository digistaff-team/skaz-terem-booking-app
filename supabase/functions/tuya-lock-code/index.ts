// Edge Function: выдача персонального временного кода ключницы Tuya на бронь.
//
// POST { init_data, booking_id } →
//   { ok: true, code, effective_from, effective_to, static }
//   { ok: false, error: "AUTH_INVALID" | "BOOKING_NOT_FOUND" | "NOT_CONFIGURED" | "TUYA_ERROR" }
//
// Логика:
//   1. Проверяем подпись Telegram initData (тот же алгоритм, что в Postgres).
//   2. Проверяем, что бронь существует, активна и принадлежит вызывающему.
//   3. Если код уже выдавался — возвращаем его (идемпотентность).
//   4. Иначе создаём временный пароль в Tuya Cloud на окно брони ±30 минут,
//      сохраняем в lock_codes и возвращаем.
//   5. Если Tuya не сконфигурирована — возвращаем запасной статический код
//      из секрета STATIC_LOCK_CODE (не сохраняем: после настройки Tuya
//      пользователь при следующем запросе получит персональный код).
//
// Секреты (Dashboard → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN  — токен бота (проверка подписи initData)
//   STATIC_LOCK_CODE    — запасной код, пока Tuya не настроена (напр. 2481)
//   TUYA_ACCESS_ID      — Access ID облачного проекта iot.tuya.com
//   TUYA_ACCESS_SECRET  — Access Secret проекта
//   TUYA_DEVICE_ID      — device_id ключницы
//   TUYA_ENDPOINT       — датацентр, по умолчанию https://openapi.tuyaeu.com
//   TUYA_CODE_LENGTH    — длина генерируемого кода (по умолчанию 6; у Wi-Fi
//                         замков Tuya часто 7 — проверьте на своём устройстве)
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY доступны в Edge Functions автоматически.

import { createClient } from "npm:@supabase/supabase-js@2";
import aesjs from "npm:aes-js@3.1.2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const STATIC_LOCK_CODE = Deno.env.get("STATIC_LOCK_CODE") ?? "";
const TUYA_ACCESS_ID = Deno.env.get("TUYA_ACCESS_ID") ?? "";
const TUYA_ACCESS_SECRET = Deno.env.get("TUYA_ACCESS_SECRET") ?? "";
const TUYA_DEVICE_ID = Deno.env.get("TUYA_DEVICE_ID") ?? "";
const TUYA_ENDPOINT = Deno.env.get("TUYA_ENDPOINT") ?? "https://openapi.tuyaeu.com";
const CODE_LENGTH = parseInt(Deno.env.get("TUYA_CODE_LENGTH") ?? "6", 10);

// Часовой пояс Терема — даты/времена броней хранятся в местном времени
const TZ = "+03:00";
const BUFFER_MS = 30 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// === Проверка подписи Telegram initData (Web Crypto) ===

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key instanceof Uint8Array ? key.buffer as ArrayBuffer : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyInitData(initData: string): Promise<{ id: number } | null> {
  if (!initData || !TELEGRAM_BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = await hmacSha256(new TextEncoder().encode("WebAppData"), TELEGRAM_BOT_TOKEN);
  const computed = hex(await hmacSha256(secret, checkString));
  if (computed !== hash.toLowerCase()) return null;
  const authDate = parseInt(params.get("auth_date") ?? "0", 10);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "");
    return typeof user?.id === "number" ? user : null;
  } catch {
    return null;
  }
}

// === Окно действия кода ===

function bookingWindow(date: string, start: string, end: string): { from: Date; to: Date } {
  const from = new Date(new Date(`${date}T${start}:00${TZ}`).getTime() - BUFFER_MS);
  const endMs = end === "24:00"
    ? new Date(`${date}T00:00:00${TZ}`).getTime() + 24 * 3600 * 1000
    : new Date(`${date}T${end}:00${TZ}`).getTime();
  return { from, to: new Date(endMs + BUFFER_MS) };
}

function generateCode(length: number): string {
  const digits = new Uint8Array(length);
  crypto.getRandomValues(digits);
  // первая цифра 1–9 (некоторые замки не принимают ведущий ноль)
  let code = String(1 + (digits[0] % 9));
  for (let i = 1; i < length; i++) code += String(digits[i] % 10);
  return code;
}

// === Tuya Cloud API (подпись запросов v2: HMAC-SHA256) ===

async function sha256hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

async function tuyaRequest(
  method: string,
  path: string,
  body: unknown,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const t = String(Date.now());
  const bodyStr = body ? JSON.stringify(body) : "";
  const stringToSign = `${method}\n${await sha256hex(bodyStr)}\n\n${path}`;
  const signStr = TUYA_ACCESS_ID + accessToken + t + stringToSign;
  const sign = hex(await hmacSha256(new TextEncoder().encode(TUYA_ACCESS_SECRET), signStr)).toUpperCase();

  const headers: Record<string, string> = {
    client_id: TUYA_ACCESS_ID,
    sign,
    t,
    sign_method: "HMAC-SHA256",
    "Content-Type": "application/json",
  };
  if (accessToken) headers.access_token = accessToken;

  const res = await fetch(TUYA_ENDPOINT + path, {
    method,
    headers,
    body: bodyStr || undefined,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`Tuya ${path}: ${data.code} ${data.msg}`);
  }
  return data.result as Record<string, unknown>;
}

/** AES-128-ECB + PKCS7 (Web Crypto не поддерживает ECB — используем aes-js). */
function aesEcbEncrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const padLen = 16 - (plaintext.length % 16);
  const padded = new Uint8Array(plaintext.length + padLen);
  padded.set(plaintext);
  padded.fill(padLen, plaintext.length);
  // deno-lint-ignore no-explicit-any
  const ecb = new (aesjs as any).ModeOfOperation.ecb(key);
  return ecb.encrypt(padded);
}

function aesEcbDecrypt(key: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  // deno-lint-ignore no-explicit-any
  const ecb = new (aesjs as any).ModeOfOperation.ecb(key);
  return ecb.decrypt(ciphertext);
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

/** Создаёт временный пароль в Tuya. Возвращает id пароля. */
async function createTuyaTempPassword(
  code: string,
  name: string,
  from: Date,
  to: Date,
): Promise<string> {
  // 1. Токен доступа
  const tokenRes = await tuyaRequest("GET", "/v1.0/token?grant_type=1", null, "");
  const accessToken = tokenRes.access_token as string;

  // 2. Тикет шифрования пароля
  const ticket = await tuyaRequest(
    "POST",
    `/v1.0/devices/${TUYA_DEVICE_ID}/door-lock/password-ticket`,
    {},
    accessToken,
  );
  const ticketId = ticket.ticket_id as string;
  const ticketKeyEncrypted = ticket.ticket_key as string;

  // 3. Расшифровываем ticket_key секретом проекта, шифруем им код
  const realKey = aesEcbDecrypt(
    new TextEncoder().encode(TUYA_ACCESS_SECRET),
    hexToBytes(ticketKeyEncrypted),
  ).slice(0, 16);
  const encryptedCode = hex(aesEcbEncrypt(realKey, new TextEncoder().encode(code)).buffer as ArrayBuffer).toUpperCase();

  // 4. Создаём временный пароль на окно брони
  const created = await tuyaRequest(
    "POST",
    `/v1.0/devices/${TUYA_DEVICE_ID}/door-lock/temp-password`,
    {
      name,
      password: encryptedCode,
      effective_time: Math.floor(from.getTime() / 1000),
      invalid_time: Math.floor(to.getTime() / 1000),
      password_type: "ticket",
      ticket_id: ticketId,
    },
    accessToken,
  );
  return String(created.id ?? "");
}

// === Handler ===

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD" }, 405);

  let payload: { init_data?: string; booking_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_REQUEST" }, 400);
  }

  const tgUser = await verifyInitData(payload.init_data ?? "");
  if (!tgUser) return json({ ok: false, error: "AUTH_INVALID" }, 401);
  if (!payload.booking_id) return json({ ok: false, error: "BAD_REQUEST" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Подписчик по chat_id из подписанной initData
  const { data: sub } = await supabase
    .from("subscribers")
    .select("id")
    .eq("chat_id", tgUser.id)
    .eq("is_active", true)
    .single();
  if (!sub) return json({ ok: false, error: "AUTH_INVALID" }, 401);

  // Бронь: существует, активна, принадлежит вызывающему
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, date, start_time, end_time, user_id, user_name, status")
    .eq("id", payload.booking_id)
    .single();
  if (!booking || booking.user_id !== sub.id || booking.status !== "active") {
    return json({ ok: false, error: "BOOKING_NOT_FOUND" }, 404);
  }

  // Уже выдан? Возвращаем существующий (идемпотентность)
  const { data: existing } = await supabase
    .from("lock_codes")
    .select("code, effective_from, effective_to")
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (existing) {
    return json({ ok: true, static: false, ...existing });
  }

  const { from, to } = bookingWindow(booking.date, booking.start_time, booking.end_time);

  // Tuya не настроена → запасной статический код (не сохраняем)
  if (!TUYA_ACCESS_ID || !TUYA_ACCESS_SECRET || !TUYA_DEVICE_ID) {
    if (STATIC_LOCK_CODE) {
      return json({
        ok: true,
        static: true,
        code: STATIC_LOCK_CODE,
        effective_from: from.toISOString(),
        effective_to: to.toISOString(),
      });
    }
    return json({ ok: false, error: "NOT_CONFIGURED" }, 503);
  }

  const code = generateCode(CODE_LENGTH);
  let tuyaPasswordId: string;
  try {
    tuyaPasswordId = await createTuyaTempPassword(
      code,
      `Бронь ${booking.date} ${booking.user_name ?? ""}`.slice(0, 30),
      from,
      to,
    );
  } catch (e) {
    console.error("Tuya error:", e);
    return json({ ok: false, error: "TUYA_ERROR" }, 502);
  }

  const { error: insertError } = await supabase.from("lock_codes").insert({
    booking_id: booking.id,
    user_id: sub.id,
    code,
    effective_from: from.toISOString(),
    effective_to: to.toISOString(),
    tuya_password_id: tuyaPasswordId,
  });
  if (insertError) console.error("lock_codes insert:", insertError.message);

  return json({
    ok: true,
    static: false,
    code,
    effective_from: from.toISOString(),
    effective_to: to.toISOString(),
  });
});
