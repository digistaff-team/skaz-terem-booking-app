// @vitest-environment node
//
// Интеграционный тест supabase-migrations-2-security.sql и
// supabase-migrations-3-balance.sql на PGlite
// (настоящий Postgres, скомпилированный в WASM — без внешней БД).
//
// Проверяет:
//  - миграции выполняются без ошибок;
//  - HMAC-проверка подписи Telegram initData совпадает с эталонной
//    реализацией на node:crypto (независимая реализация алгоритма);
//  - атомарную конфликт-логику create_booking, включая «Весь Терем»;
//  - серверную проверку владельца в cancel_booking;
//  - депозит часов: поминутное списание, уход в минус, начисление
//    через admin_add_hours, возврат при отмене, legacy-брони без возврата;
//  - что RLS включён и политик на запись нет.
//
// Тесты в файле выполняются строго по порядку и разделяют одну БД.

import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const MIGRATION_PATH = fileURLToPath(
  new URL("../../supabase-migrations-2-security.sql", import.meta.url)
);
const MIGRATION3_PATH = fileURLToPath(
  new URL("../../supabase-migrations-3-balance.sql", import.meta.url)
);

// Тестовый токен: подставляется в private.app_config вместо продового
const BOT_TOKEN = "7654321098:AAtest_token_for_local_verification_x";

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Собирает initData и подписывает её по официальному алгоритму Telegram. */
function buildInitData(
  user: TgUser,
  opts: { authDate?: number; tamper?: boolean } = {}
): string {
  const { authDate = Math.floor(Date.now() / 1000), tamper = false } = opts;
  const params: Record<string, string> = {
    query_id: "AAHtest77",
    user: JSON.stringify(user),
    auth_date: String(authDate),
    signature: "fakeEd25519sig_ABC-123_xyz=",
    chat_instance: "-7712345678901234567",
    chat_type: "private",
  };
  const checkString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  let hash = createHmac("sha256", secret).update(checkString).digest("hex");
  if (tamper) hash = hash.replace(/^./, hash[0] === "0" ? "1" : "0");
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${qs}&hash=${hash}`;
}

let db: PGlite;

async function expectRpcError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code);
}

const ivan: TgUser = {
  id: 111222333,
  first_name: "Иван Ёж",
  last_name: "Тёркин-Léon",
  username: "ivan_ez",
};
const maria: TgUser = { id: 444555666, first_name: "Мария", username: "maria_m" };
const ivanInit = buildInitData(ivan);
const mariaInit = buildInitData(maria);

let ivanId: string;
let mariaId: string;

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const in2days = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

function book(
  init: string,
  room: string,
  start: string,
  end: string,
  date: string = tomorrow
) {
  return db.query<{ b: Record<string, unknown> }>(
    "SELECT public.create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9) AS b",
    [init, room, "Тестовая комната", date, start, end, "Комната | Тест | Иван", "", "Иван"]
  );
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });

  // Базовая схема как в проде: времена — TEXT ('HH:MM'), дата — DATE
  await db.exec(`
    CREATE SCHEMA extensions;
    CREATE TABLE subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id BIGINT UNIQUE NOT NULL,
      username TEXT, first_name TEXT, last_name TEXT,
      subscribed_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE
    );
    CREATE TABLE bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id TEXT NOT NULL, room_name TEXT NOT NULL,
      date DATE NOT NULL,
      start_time TEXT NOT NULL, end_time TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT,
      user_name TEXT, user_id UUID REFERENCES subscribers(id),
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // GRANT/REVOKE опускаем: ролей anon/authenticated/service_role в PGlite нет
  for (const path of [MIGRATION_PATH, MIGRATION3_PATH]) {
    const migration = readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => !/^\s*(GRANT|REVOKE)\s/i.test(l))
      .join("\n");
    await db.exec(migration);
  }

  await db.query(
    "UPDATE private.app_config SET value = $1 WHERE key = 'telegram_bot_token'",
    [BOT_TOKEN]
  );
}, 60000);

describe("auth_subscriber: проверка подписи initData", () => {
  it("принимает валидную подпись и декодирует UTF-8 (кириллица в url_decode)", async () => {
    const r = await db.query<{ s: Record<string, unknown> }>(
      "SELECT public.auth_subscriber($1) AS s",
      [ivanInit]
    );
    const s = r.rows[0].s;
    expect(s.chat_id).toBe(111222333);
    expect(s.first_name).toBe("Иван Ёж");
    expect(s.last_name).toBe("Тёркин-Léon");
    ivanId = s.id as string;
  });

  it("повторный вход возвращает тот же id и реактивирует подписчика", async () => {
    await db.query("UPDATE subscribers SET is_active = FALSE WHERE chat_id = 111222333");
    const r = await db.query<{ s: Record<string, unknown> }>(
      "SELECT public.auth_subscriber($1) AS s",
      [ivanInit]
    );
    expect(r.rows[0].s.id).toBe(ivanId);
    expect(r.rows[0].s.is_active).toBe(true);
  });

  it("отклоняет подделанный hash", async () => {
    await expectRpcError(
      db.query("SELECT public.auth_subscriber($1)", [buildInitData(ivan, { tamper: true })]),
      "AUTH_INVALID"
    );
  });

  it("отклоняет чужой chat_id без подписи", async () => {
    const forged =
      "user=%7B%22id%22%3A999%7D&auth_date=" +
      Math.floor(Date.now() / 1000) +
      "&hash=deadbeef";
    await expectRpcError(db.query("SELECT public.auth_subscriber($1)", [forged]), "AUTH_INVALID");
  });

  it("отклоняет подпись старше 24 часов", async () => {
    const stale = buildInitData(ivan, { authDate: Math.floor(Date.now() / 1000) - 90000 });
    await expectRpcError(db.query("SELECT public.auth_subscriber($1)", [stale]), "AUTH_EXPIRED");
  });

  it("get_subscriber возвращает профиль по UUID", async () => {
    const r = await db.query<{ s: Record<string, unknown> | null }>(
      "SELECT public.get_subscriber($1) AS s",
      [ivanId]
    );
    expect(r.rows[0].s?.chat_id).toBe(111222333);

    // Мария тоже регистрируется — нужна для следующих тестов
    const m = await db.query<{ s: Record<string, unknown> }>(
      "SELECT public.auth_subscriber($1) AS s",
      [mariaInit]
    );
    mariaId = m.rows[0].s.id as string;
    expect(mariaId).toBeTruthy();
  });
});

describe("create_booking: атомарная конфликт-логика", () => {
  let bookingId: string;

  it("создаёт бронь с верной подписью", async () => {
    const r = await book(ivanInit, "floor-2-hall-20", "10:00", "12:00");
    const b = r.rows[0].b;
    expect(b.status).toBe("active");
    expect(b.user_id).toBe(ivanId);
    expect(b.date).toBe(tomorrow);
    bookingId = b.id as string;
  });

  it("пересечение того же зала → BOOKING_CONFLICT", async () => {
    await expectRpcError(book(mariaInit, "floor-2-hall-20", "11:00", "13:00"), "BOOKING_CONFLICT");
  });

  it("бронь встык (12:00 сразу после 10:00–12:00) разрешена", async () => {
    await book(mariaInit, "floor-2-hall-20", "12:00", "13:00");
  });

  it("«Весь Терем» конфликтует с занятой комнатой", async () => {
    await expectRpcError(book(mariaInit, "whole-house", "09:00", "24:00"), "BOOKING_CONFLICT");
  });

  it("другая комната в то же время разрешена", async () => {
    await book(mariaInit, "floor-2-room-11", "10:00", "12:00");
  });

  it("комната при занятом «Весь Терем» → BOOKING_CONFLICT", async () => {
    await book(ivanInit, "whole-house", "10:00", "14:00", in2days);
    await expectRpcError(
      book(mariaInit, "floor-1-34", "13:00", "15:00", in2days),
      "BOOKING_CONFLICT"
    );
  });

  it("бронь до полуночи (24:00) проходит валидацию", async () => {
    await book(ivanInit, "floor-2-office-6", "23:00", "24:00");
  });

  it("дата в прошлом → INVALID_INPUT", async () => {
    await expectRpcError(
      book(ivanInit, "floor-1-34", "10:00", "11:00", "2024-01-01"),
      "INVALID_INPUT"
    );
  });

  it("конец раньше начала → INVALID_INPUT", async () => {
    await expectRpcError(book(ivanInit, "floor-1-34", "12:00", "10:00"), "INVALID_INPUT");
  });

  it("неизвестная комната → INVALID_INPUT", async () => {
    await expectRpcError(book(ivanInit, "hacker-room", "10:00", "11:00"), "INVALID_INPUT");
  });

  it("мусорное время → INVALID_INPUT", async () => {
    await expectRpcError(book(ivanInit, "floor-1-34", "25:99", "26:00"), "INVALID_INPUT");
  });

  it("пустая initData → AUTH_INVALID", async () => {
    await expectRpcError(book("", "floor-1-34", "10:00", "11:00"), "AUTH_INVALID");
  });

  describe("cancel_booking: серверная проверка владельца", () => {
    it("чужую бронь отменить нельзя", async () => {
      await expectRpcError(
        db.query("SELECT public.cancel_booking($1,$2)", [mariaInit, bookingId]),
        "BOOKING_NOT_FOUND"
      );
    });

    it("свою бронь можно; слот освобождается", async () => {
      const r = await db.query<{ b: Record<string, unknown> }>(
        "SELECT public.cancel_booking($1,$2) AS b",
        [ivanInit, bookingId]
      );
      expect(r.rows[0].b.status).toBe("cancelled");
      await book(mariaInit, "floor-2-hall-20", "10:00", "11:00"); // слот снова свободен
    });

    it("повторная отмена → BOOKING_NOT_FOUND", async () => {
      await expectRpcError(
        db.query("SELECT public.cancel_booking($1,$2)", [ivanInit, bookingId]),
        "BOOKING_NOT_FOUND"
      );
    });
  });
});

describe("RLS", () => {
  it("включён на всех таблицах; на запись политик нет, чтение bookings открыто", async () => {
    const r = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      npol: number | string;
    }>(`
      SELECT c.relname, c.relrowsecurity,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS npol
        FROM pg_class c
       WHERE c.relname IN ('bookings','subscribers','room_balances','balance_transactions')
       ORDER BY c.relname
    `);
    expect(r.rows).toHaveLength(4);
    for (const row of r.rows) {
      expect(row.relrowsecurity).toBe(true);
      // публичный SELECT есть только у bookings, остальное — только через RPC
      expect(Number(row.npol)).toBe(row.relname === "bookings" ? 1 : 0);
    }
  });
});

describe("депозит часов (миграция 3)", () => {
  // Отдельный пользователь с чистым балансом — не пересекается с бронями выше
  const oleg: TgUser = { id: 777888999, first_name: "Олег", username: "oleg_o" };
  const olegInit = buildInitData(oleg);
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const in4days = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);

  let olegId: string;
  let olegBookingId: string;

  it("бронь списывает точную длительность, баланс уходит в минус (долг)", async () => {
    const auth = await db.query<{ s: Record<string, unknown> }>(
      "SELECT public.auth_subscriber($1) AS s",
      [olegInit]
    );
    olegId = auth.rows[0].s.id as string;

    const r = await book(olegInit, "floor-1-34", "13:30", "15:15", in3days);
    const b = r.rows[0].b;
    expect(b.charged_minutes).toBe(105); // 1 ч 45 мин
    expect(b.balance_after).toBe(-105); // депозита не было — долг
    olegBookingId = b.id as string;
  });

  it("admin_add_hours начисляет минуты и возвращает новый баланс", async () => {
    const r = await db.query<{ a: Record<string, unknown> }>(
      "SELECT public.admin_add_hours($1,$2,$3,$4) AS a",
      [777888999, "floor-1-34", 600, "тест: покупка 10 часов"]
    );
    expect(r.rows[0].a.balance_minutes).toBe(495); // -105 + 600
  });

  it("admin_add_hours: неизвестный пользователь и нулевые минуты отклоняются", async () => {
    await expectRpcError(
      db.query("SELECT public.admin_add_hours($1,$2,$3,$4)", [42, "floor-1-34", 60, null]),
      "USER_NOT_FOUND"
    );
    await expectRpcError(
      db.query("SELECT public.admin_add_hours($1,$2,$3,$4)", [777888999, "floor-1-34", 0, null]),
      "INVALID_INPUT"
    );
    await expectRpcError(
      db.query("SELECT public.admin_add_hours($1,$2,$3,$4)", [777888999, "hacker-room", 60, null]),
      "INVALID_INPUT"
    );
  });

  it("get_account возвращает балансы и историю операций", async () => {
    const r = await db.query<{ acc: { balances: unknown[]; transactions: unknown[] } }>(
      "SELECT public.get_account($1) AS acc",
      [olegInit]
    );
    const acc = r.rows[0].acc;
    const balances = acc.balances as { room_id: string; minutes: number }[];
    expect(balances).toEqual([{ room_id: "floor-1-34", minutes: 495 }]);

    const transactions = acc.transactions as { reason: string; minutes_delta: number }[];
    expect(transactions).toHaveLength(2);
    const reasons = transactions.map((t) => t.reason).sort();
    expect(reasons).toEqual(["booking", "topup"]);
  });

  it("отмена брони возвращает списанные минуты на баланс", async () => {
    const r = await db.query<{ b: Record<string, unknown> }>(
      "SELECT public.cancel_booking($1,$2) AS b",
      [olegInit, olegBookingId]
    );
    expect(r.rows[0].b.refund_minutes).toBe(105);
    expect(r.rows[0].b.balance_after).toBe(600); // 495 + 105
  });

  it("legacy-бронь (без списания) при отмене ничего не возвращает", async () => {
    // Бронь, созданная до появления балансов: вставляем напрямую, без транзакций
    const ins = await db.query<{ id: string }>(
      `INSERT INTO bookings (room_id, room_name, date, start_time, end_time, title, user_name, user_id, status)
       VALUES ('floor-1-34', 'Тест', $1, '10:00', '11:00', 'Legacy', 'Олег', $2, 'active')
       RETURNING id`,
      [in4days, olegId]
    );
    const r = await db.query<{ b: Record<string, unknown> }>(
      "SELECT public.cancel_booking($1,$2) AS b",
      [olegInit, ins.rows[0].id]
    );
    expect(r.rows[0].b.refund_minutes).toBe(0);
    // Баланс не изменился
    const acc = await db.query<{ acc: { balances: { minutes: number }[] } }>(
      "SELECT public.get_account($1) AS acc",
      [olegInit]
    );
    expect(acc.rows[0].acc.balances[0].minutes).toBe(600);
  });

  it("отрицательное начисление (корректировка) уменьшает баланс", async () => {
    const r = await db.query<{ a: Record<string, unknown> }>(
      "SELECT public.admin_add_hours($1,$2,$3,$4)  AS a",
      [777888999, "floor-1-34", -90, "тест: корректировка"]
    );
    expect(r.rows[0].a.balance_minutes).toBe(510); // 600 - 90
  });

  it("балансы раздельные по помещениям", async () => {
    await db.query("SELECT public.admin_add_hours($1,$2,$3,$4)", [777888999, "whole-house", 120, null]);
    const r = await db.query<{ acc: { balances: { room_id: string; minutes: number }[] } }>(
      "SELECT public.get_account($1) AS acc",
      [olegInit]
    );
    const byRoom = Object.fromEntries(r.rows[0].acc.balances.map((b) => [b.room_id, b.minutes]));
    expect(byRoom["floor-1-34"]).toBe(510);
    expect(byRoom["whole-house"]).toBe(120);
  });
});
