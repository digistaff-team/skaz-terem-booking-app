-- ============================================================
-- Миграция 2: Безопасность и целостность бронирований
--
-- Что делает:
--   1. Проверка подписи Telegram initData прямо в Postgres (pgcrypto).
--   2. Атомарное создание брони (create_booking) — конфликт двойного
--      бронирования невозможен даже при одновременных запросах.
--   3. Отмена брони (cancel_booking) с серверной проверкой владельца.
--   4. RLS: прямые INSERT/UPDATE/DELETE в bookings и любой доступ
--      к subscribers для anon-ключа закрыты. Все мутации — только
--      через RPC-функции ниже.
--
-- ⚠️ ПЕРЕД ЗАПУСКОМ: замените PASTE_BOT_TOKEN_HERE (шаг 2) на реальный
--    токен бота (тот же, что TELEGRAM_BOT_TOKEN в bot/.env).
--    Затем выполните весь файл в Supabase SQL Editor.
--
-- Этот файл заменяет supabase-register-function.sql (старая функция
-- register_subscriber удаляется) и политики из supabase-migrations.sql.
-- ============================================================

-- ============================================================
-- Шаг 1: Расширение pgcrypto (HMAC-SHA256) и приватная схема
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Шаг 2: Секреты приложения (токен бота для проверки подписи)
-- ============================================================
CREATE TABLE IF NOT EXISTS private.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO private.app_config (key, value)
VALUES ('telegram_bot_token', 'PASTE_BOT_TOKEN_HERE')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- Шаг 3: Вспомогательные функции — URL-decode и разбор initData
-- ============================================================

-- Декодирует percent-encoding (UTF-8) и '+' как пробел.
CREATE OR REPLACE FUNCTION private.url_decode(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_bytes BYTEA := ''::BYTEA;
  v_i INT := 1;
  v_len INT := length(p_input);
  v_c TEXT;
BEGIN
  WHILE v_i <= v_len LOOP
    v_c := substr(p_input, v_i, 1);
    IF v_c = '%' AND v_i + 2 <= v_len THEN
      v_bytes := v_bytes || decode(substr(p_input, v_i + 1, 2), 'hex');
      v_i := v_i + 3;
    ELSIF v_c = '+' THEN
      v_bytes := v_bytes || convert_to(' ', 'UTF8');
      v_i := v_i + 1;
    ELSE
      v_bytes := v_bytes || convert_to(v_c, 'UTF8');
      v_i := v_i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(v_bytes, 'UTF8');
END;
$$;

-- Разбирает initData (query string) на пары ключ/значение.
CREATE OR REPLACE FUNCTION private.tg_parse_init_data(p_init_data TEXT)
RETURNS TABLE(key TEXT, value TEXT)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    private.url_decode(split_part(pair, '=', 1)),
    private.url_decode(substr(pair, strpos(pair, '=') + 1))
  FROM unnest(string_to_array(p_init_data, '&')) AS pair
  WHERE pair <> '';
$$;

-- ============================================================
-- Шаг 4: Проверка подписи Telegram initData
-- Алгоритм: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
--   secret_key    = HMAC_SHA256(key = "WebAppData", data = bot_token)
--   expected_hash = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
-- Возвращает JSON пользователя Telegram или бросает исключение.
-- ============================================================
CREATE OR REPLACE FUNCTION private.tg_verify_init_data(p_init_data TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = private, extensions
AS $$
DECLARE
  v_token TEXT;
  v_hash TEXT;
  v_check_string TEXT;
  v_secret BYTEA;
  v_computed TEXT;
  v_auth_date BIGINT;
  v_user JSONB;
BEGIN
  IF p_init_data IS NULL OR p_init_data = '' THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  SELECT c.value INTO v_token FROM private.app_config c WHERE c.key = 'telegram_bot_token';
  IF v_token IS NULL OR v_token = 'PASTE_BOT_TOKEN_HERE' THEN
    RAISE EXCEPTION 'AUTH_NOT_CONFIGURED';
  END IF;

  SELECT p.value INTO v_hash FROM private.tg_parse_init_data(p_init_data) p WHERE p.key = 'hash';
  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  -- data_check_string: все поля кроме hash, байтовая сортировка по ключу, key=value через \n
  SELECT string_agg(p.key || '=' || p.value, E'\n' ORDER BY p.key COLLATE "C")
    INTO v_check_string
    FROM private.tg_parse_init_data(p_init_data) p
   WHERE p.key <> 'hash';

  v_secret := extensions.hmac(convert_to(v_token, 'UTF8'), convert_to('WebAppData', 'UTF8'), 'sha256');
  v_computed := encode(extensions.hmac(convert_to(v_check_string, 'UTF8'), v_secret, 'sha256'), 'hex');

  IF v_computed <> lower(v_hash) THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  -- Подпись не должна быть старше 24 часов (защита от повторного использования)
  SELECT p.value::BIGINT INTO v_auth_date
    FROM private.tg_parse_init_data(p_init_data) p WHERE p.key = 'auth_date';
  IF v_auth_date IS NULL OR extract(epoch FROM now()) - v_auth_date > 86400 THEN
    RAISE EXCEPTION 'AUTH_EXPIRED';
  END IF;

  SELECT p.value::JSONB INTO v_user
    FROM private.tg_parse_init_data(p_init_data) p WHERE p.key = 'user';
  IF v_user IS NULL OR v_user->>'id' IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;

  RETURN v_user;
END;
$$;

-- ============================================================
-- Шаг 5: Авторизация — регистрация/реактивация подписчика
-- Заменяет старую register_subscriber (принимала chat_id без проверки —
-- любой мог представиться любым пользователем).
-- ============================================================
CREATE OR REPLACE FUNCTION public.auth_subscriber(p_init_data TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_user JSONB;
  v_sub subscribers;
BEGIN
  v_user := private.tg_verify_init_data(p_init_data);

  INSERT INTO subscribers (chat_id, username, first_name, last_name)
  VALUES (
    (v_user->>'id')::BIGINT,
    v_user->>'username',
    v_user->>'first_name',
    v_user->>'last_name'
  )
  ON CONFLICT (chat_id) DO UPDATE SET
    username = EXCLUDED.username,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    is_active = TRUE
  RETURNING * INTO v_sub;

  RETURN to_jsonb(v_sub);
END;
$$;

-- Чтение своего профиля по UUID-токену из localStorage (знание UUID = владение
-- токеном; перебор всей таблицы, как при старой политике USING(true), невозможен).
CREATE OR REPLACE FUNCTION public.get_subscriber(p_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(s) FROM subscribers s WHERE s.id = p_id AND s.is_active;
$$;

-- ============================================================
-- Шаг 6: Атомарное создание брони
-- Advisory-блокировка по дате сериализует одновременные запросы;
-- проверка конфликта и вставка происходят в одной транзакции.
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

  RETURN to_jsonb(v_row);
END;
$$;

-- ============================================================
-- Шаг 7: Отмена брони (только своей)
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

  RETURN to_jsonb(v_row);
END;
$$;

-- ============================================================
-- Шаг 8: Права на функции
-- ============================================================
REVOKE ALL ON FUNCTION public.auth_subscriber(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_subscriber(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking(TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_subscriber(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscriber(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking(TEXT, UUID) TO anon, authenticated;

-- Старая небезопасная функция регистрации больше не нужна
DROP FUNCTION IF EXISTS public.register_subscriber(BIGINT, TEXT, TEXT, TEXT);

-- ============================================================
-- Шаг 9: RLS — закрываем прямой доступ с anon-ключа
-- ============================================================
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Убираем старые политики (были завязаны на auth.uid(), который всегда NULL)
DROP POLICY IF EXISTS "Users can view own profile" ON subscribers;
DROP POLICY IF EXISTS "Public read subscriber by id" ON subscribers;
DROP POLICY IF EXISTS "Users can view own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can update own bookings" ON bookings;
-- На случай permissive-политик, добавленных через дашборд:
DROP POLICY IF EXISTS "Enable read access for all users" ON bookings;
DROP POLICY IF EXISTS "Enable insert for all users" ON bookings;
DROP POLICY IF EXISTS "Enable update for all users" ON bookings;
DROP POLICY IF EXISTS "Enable read access for all users" ON subscribers;
DROP POLICY IF EXISTS "Enable insert for all users" ON subscribers;

-- Расписание в приложении публичное — чтение bookings оставляем открытым
CREATE POLICY "Public read bookings"
  ON bookings FOR SELECT
  USING (true);

-- Политик на INSERT/UPDATE/DELETE нет → прямые записи запрещены.
-- Для subscribers политик нет вообще → таблица недоступна с anon-ключа;
-- чтение своего профиля — только через get_subscriber(uuid).
-- Бот (service role) обходит RLS и продолжает работать как раньше.

REVOKE INSERT, UPDATE, DELETE ON bookings FROM anon, authenticated;
REVOKE ALL ON subscribers FROM anon, authenticated;
