// Edge Function: проверка членства в закрытой группе Терема (-1003507317011).
//
// POST { init_data?, subscriber_id? } →
//   { subscribed: true } | { subscribed: false } | { subscribed: false, error: "..." }
//
// Логика:
//   1. Если есть подписанная Telegram initData — берём chat_id из неё
//      (подпись проверяется тем же алгоритмом, что в Postgres и tuya-lock-code).
//   2. Иначе (приложение открыто в обычном браузере) берём chat_id из
//      subscribers по subscriber_id — только для активного подписчика.
//   3. Запрашиваем getChatMember и пускаем лишь creator/administrator/member.
//
// Секрет (Dashboard → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN — тот же токен, что у tuya-lock-code
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY доступны в Edge Functions автоматически.

import { createClient } from "npm:@supabase/supabase-js@2";

const GROUP_ID = "-1003507317011";
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

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

async function verifyInitData(initData: string): Promise<number | null> {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = await hmacSha256(new TextEncoder().encode("WebAppData"), BOT_TOKEN);
  const computed = hex(await hmacSha256(secret, checkString));
  if (computed !== hash.toLowerCase()) return null;
  const authDate = parseInt(params.get("auth_date") ?? "0", 10);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try {
    const user = JSON.parse(params.get("user") ?? "");
    return typeof user?.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

/** Chat_id по subscriber_id — только активного подписчика (путь «обычный браузер»). */
async function chatIdFromSubscriber(subscriberId: string): Promise<number | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase
    .from("subscribers")
    .select("chat_id, is_active")
    .eq("id", subscriberId)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;
  return data.chat_id as number;
}

/** Состоит ли пользователь в группе (left/kicked/banned → false). */
async function isGroupMember(chatId: number): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${GROUP_ID}&user_id=${chatId}`,
  );
  const data = await res.json();
  if (!data.ok) {
    console.error("getChatMember:", data.error_code, data.description);
    return false;
  }
  return ["creator", "administrator", "member"].includes(data.result?.status);
}

// === Handler ===

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ subscribed: false, error: "METHOD" }, 405);
  if (!BOT_TOKEN) return json({ subscribed: false, error: "NOT_CONFIGURED" }, 503);

  let payload: { init_data?: string; subscriber_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ subscribed: false, error: "BAD_REQUEST" }, 400);
  }

  // Подписанная initData надёжнее, но невалидная (например, протухшая) не должна
  // блокировать проверку — тогда откатываемся на subscriber_id.
  let chatId = payload.init_data ? await verifyInitData(payload.init_data) : null;
  if (chatId === null && payload.subscriber_id) {
    chatId = await chatIdFromSubscriber(payload.subscriber_id);
  }
  if (chatId === null) return json({ subscribed: false, error: "AUTH_INVALID" }, 401);

  return json({ subscribed: await isGroupMember(chatId) });
});
