-- ============================================================
-- Миграция 3: Депозит часов (личный кабинет)
--
-- Что делает:
--   1. Таблицы room_balances (баланс минут по каждому помещению на
--      пользователя) и balance_transactions (история операций).
--   2. create_booking списывает точную длительность брони с баланса
--      помещения (баланс может уходить в минус — это долг).
--   3. cancel_booking возвращает списанные минуты на баланс.
--      Брони, созданные до появления балансов, ничего не возвращают.
--   4. get_account(initData) — балансы и история для личного кабинета.
--   5. admin_add_hours — начисление часов куратором (только service_role,
--      вызывается Telegram-ботом по команде администратора).
--
-- Запускать ПОСЛЕ supabase-migrations-2-security.sql
-- (использует private.tg_verify_init_data и заменяет
-- create_booking/cancel_booking на версии с учётом баланса).
-- ============================================================

-- ============================================================
-- Шаг 1: Таблицы
-- ============================================================
CREATE TABLE IF NOT EXISTS room_balances (
  user_id UUID NOT NULL REFERENCES subscribers(id),
  room_id TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0, -- может быть отрицательным (долг)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, room_id)
);

CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES subscribers(id),
  room_id TEXT NOT NULL,
  minutes_delta INTEGER NOT NULL, -- плюс: пополнение/возврат, минус: списание
  reason TEXT NOT NULL CHECK (reason IN ('topup', 'booking', 'refund', 'adjust')),
  booking_id UUID,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS balance_transactions_user_idx
  ON balance_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS balance_transactions_booking_idx
  ON balance_transactions (booking_id)
  WHERE booking_id IS NOT NULL;

-- RLS: прямой доступ с anon-ключа закрыт полностью, только RPC
ALTER TABLE room_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON room_balances FROM anon, authenticated;
REVOKE ALL ON balance_transactions FROM anon, authenticated;

-- ============================================================
-- Шаг 2: Внутренние функции
-- ============================================================

-- 'HH:MM' -> минуты от полуночи; '24:00' -> 1440
CREATE OR REPLACE FUNCTION private.time_to_minutes(t TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
AS $$
  SELECT split_part(t, ':', 1)::INTEGER * 60 + split_part(t, ':', 2)::INTEGER
$$;

-- Атомарно изменяет баланс и пишет транзакцию. Возвращает новый баланс.
CREATE OR REPLACE FUNCTION private.apply_balance_change(
  p_user_id UUID,
  p_room_id TEXT,
  p_delta INTEGER,
  p_reason TEXT,
  p_booking_id UUID,
  p_comment TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, private
AS $$
DECLARE
  v_new INTEGER;
BEGIN
  INSERT INTO room_balances (user_id, room_id, minutes)
  VALUES (p_user_id, p_room_id, p_delta)
  ON CONFLICT (user_id, room_id)
  DO UPDATE SET
    minutes = room_balances.minutes + EXCLUDED.minutes,
    updated_at = NOW()
  RETURNING minutes INTO v_new;

  INSERT INTO balance_transactions (user_id, room_id, minutes_delta, reason, booking_id, comment)
  VALUES (p_user_id, p_room_id, p_delta, p_reason, p_booking_id, p_comment);

  RETURN v_new;
END;
$$;

-- ============================================================
-- Шаг 3: create_booking — теперь списывает минуты с баланса.
-- Сигнатура не меняется; в ответ добавляются charged_minutes
-- и balance_after. Отрицательный баланс разрешён (долг).
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_booking(
  p_init_data TEXT,
  p_room_id TEXT,
  p_room_name TEXT,
  p_date TEXT,
  p_start_time TEXT,
  p_end_time TEXT,
  p_title TEXT,
  p_description TEXT,
  p_user_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_user JSONB;
  v_sub_id UUID;
  v_row bookings;
  v_duration INTEGER;
  v_balance_after INTEGER;
BEGIN
  v_user := private.tg_verify_init_data(p_init_data);

  SELECT s.id INTO v_sub_id
    FROM subscribers s
   WHERE s.chat_id = (v_user->>'id')::BIGINT AND s.is_active;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  -- Валидация входных данных
  IF p_room_id IS NULL OR p_room_id NOT IN
     ('floor-1-34', 'floor-2-hall-20', 'floor-2-room-11', 'floor-2-office-6', 'whole-house')
  THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' OR length(p_title) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF length(coalesce(p_description, '')) > 2000 OR length(coalesce(p_user_name, '')) > 200 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_date IS NULL OR p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_start_time IS NULL OR p_start_time !~ '^([01]\d|2[0-3]):[0-5]\d$' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_end_time IS NULL OR (p_end_time !~ '^([01]\d|2[0-3]):[0-5]\d$' AND p_end_time <> '24:00') THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  -- Дата: не в прошлом (по времени Терема, UTC+3) и не дальше года вперёд
  IF p_date::DATE < (now() AT TIME ZONE 'Europe/Moscow')::DATE
     OR p_date::DATE > (now() AT TIME ZONE 'Europe/Moscow')::DATE + 365
  THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- Сериализуем все бронирования на эту дату (транзакционная блокировка)
  PERFORM pg_advisory_xact_lock(hashtext('bookings_' || p_date));

  -- Конфликт: то же помещение, либо «Весь Терем» с любой стороны.
  -- date::TEXT — работает и для DATE-, и для TEXT-колонки; времена в базе
  -- хранятся как текст 'HH:MM', лексикографическое сравнение корректно.
  IF EXISTS (
    SELECT 1
      FROM bookings b
     WHERE b.date::TEXT = p_date
       AND b.status = 'active'
       AND (b.room_id = p_room_id OR b.room_id = 'whole-house' OR p_room_id = 'whole-house')
       AND b.start_time < p_end_time
       AND b.end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'BOOKING_CONFLICT';
  END IF;

  INSERT INTO bookings
    (room_id, room_name, date, start_time, end_time, title, description, user_name, user_id, status)
  VALUES
    -- p_date::DATE вставляется и в DATE-, и в TEXT-колонку (ISO-формат)
    (p_room_id, p_room_name, p_date::DATE, p_start_time, p_end_time,
     btrim(p_title), coalesce(p_description, ''), coalesce(p_user_name, ''), v_sub_id, 'active')
  RETURNING * INTO v_row;

  -- Списание с депозита часов: поминутно, в той же транзакции, что и бронь
  v_duration := private.time_to_minutes(p_end_time) - private.time_to_minutes(p_start_time);
  v_balance_after := private.apply_balance_change(
    v_sub_id, p_room_id, -v_duration, 'booking', v_row.id, NULL
  );

  RETURN to_jsonb(v_row) || jsonb_build_object(
    'charged_minutes', v_duration,
    'balance_after', v_balance_after
  );
END;
$$;

-- ============================================================
-- Шаг 4: cancel_booking — возвращает списанные минуты.
-- Возврат = чистая сумма транзакций по этой брони со знаком минус:
--   • у legacy-броней (до появления балансов) транзакций нет — возврат 0;
--   • повторный возврат невозможен (после refund чистая сумма = 0,
--     а сама повторная отмена и так блокируется по status).
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_booking(p_init_data TEXT, p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_user JSONB;
  v_sub_id UUID;
  v_row bookings;
  v_refund INTEGER;
  v_balance_after INTEGER;
BEGIN
  v_user := private.tg_verify_init_data(p_init_data);

  SELECT s.id INTO v_sub_id
    FROM subscribers s
   WHERE s.chat_id = (v_user->>'id')::BIGINT AND s.is_active;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  UPDATE bookings
     SET status = 'cancelled'
   WHERE id = p_booking_id
     AND user_id = v_sub_id
     AND status = 'active'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  SELECT COALESCE(-SUM(t.minutes_delta), 0) INTO v_refund
    FROM balance_transactions t
   WHERE t.booking_id = p_booking_id;

  IF v_refund > 0 THEN
    v_balance_after := private.apply_balance_change(
      v_sub_id, v_row.room_id, v_refund, 'refund', p_booking_id, NULL
    );
  END IF;

  RETURN to_jsonb(v_row) || jsonb_build_object(
    'refund_minutes', GREATEST(v_refund, 0),
    'balance_after', v_balance_after
  );
END;
$$;

-- ============================================================
-- Шаг 5: Личный кабинет — балансы и история операций
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_account(p_init_data TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_user JSONB;
  v_sub_id UUID;
BEGIN
  v_user := private.tg_verify_init_data(p_init_data);

  SELECT s.id INTO v_sub_id
    FROM subscribers s
   WHERE s.chat_id = (v_user->>'id')::BIGINT AND s.is_active;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  RETURN jsonb_build_object(
    'balances', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('room_id', b.room_id, 'minutes', b.minutes))
         FROM room_balances b
        WHERE b.user_id = v_sub_id),
      '[]'::JSONB
    ),
    'transactions', COALESCE(
      (SELECT jsonb_agg(x.item)
         FROM (
           SELECT jsonb_build_object(
                    'room_id', t.room_id,
                    'minutes_delta', t.minutes_delta,
                    'reason', t.reason,
                    'comment', t.comment,
                    'created_at', t.created_at
                  ) AS item
             FROM balance_transactions t
            WHERE t.user_id = v_sub_id
            ORDER BY t.created_at DESC
            LIMIT 30
         ) x),
      '[]'::JSONB
    )
  );
END;
$$;

-- ============================================================
-- Шаг 6: Начисление часов куратором.
-- Доступ ТОЛЬКО для service_role — вызывается Telegram-ботом,
-- который сам проверяет, что команду отправил администратор.
-- p_minutes может быть отрицательным (корректировка).
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_add_hours(
  p_chat_id BIGINT,
  p_room_id TEXT,
  p_minutes INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_sub_id UUID;
  v_new INTEGER;
BEGIN
  IF p_minutes IS NULL OR p_minutes = 0 OR abs(p_minutes) > 600000 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_room_id IS NULL OR p_room_id NOT IN
     ('floor-1-34', 'floor-2-hall-20', 'floor-2-room-11', 'floor-2-office-6', 'whole-house')
  THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  SELECT s.id INTO v_sub_id FROM subscribers s WHERE s.chat_id = p_chat_id;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  v_new := private.apply_balance_change(
    v_sub_id, p_room_id, p_minutes,
    CASE WHEN p_minutes > 0 THEN 'topup' ELSE 'adjust' END,
    NULL, p_comment
  );

  RETURN jsonb_build_object('room_id', p_room_id, 'balance_minutes', v_new);
END;
$$;

-- ============================================================
-- Шаг 7: Права
-- ============================================================
REVOKE ALL ON FUNCTION public.get_account(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_add_hours(BIGINT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_hours(BIGINT, TEXT, INTEGER, TEXT) TO service_role;
