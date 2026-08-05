-- ============================================================
-- Миграция 7: Бронирование администратором от имени резидента
--
-- Раньше поле «Ответственный» было просто текстом: если админ вписывал
-- туда чужое имя, бронь и списание часов с депозита всё равно оставались
-- на самом админе. Теперь админ может явно выбрать существующего
-- резидента (p_on_behalf_of_chat_id) — тогда бронь и списание часов
-- оформляются на него, а имя «Ответственный» сервер берёт из профиля
-- резидента сам (без опечаток и рассинхрона со статистикой).
--
-- Без этого параметра поведение не меняется — обычная самостоятельная
-- бронь работает как раньше.
--
-- Сигнатура create_booking расширена НОВЫМ параметром с DEFAULT NULL
-- в конце — обратно совместима с существующими вызовами.
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
  p_user_name TEXT,
  p_on_behalf_of_chat_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_user JSONB;
  v_sub_id UUID;
  v_is_admin BOOLEAN;
  v_owner_id UUID;
  v_owner_name TEXT;
  v_row bookings;
  v_duration INTEGER;
  v_balance_after INTEGER;
BEGIN
  v_user := private.tg_verify_init_data(p_init_data);

  SELECT s.id, s.is_admin INTO v_sub_id, v_is_admin
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
  -- Дата: не дальше года вперёд.
  IF p_date::DATE > (now() AT TIME ZONE 'Europe/Moscow')::DATE + 365 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  -- Дата в прошлом: обычным пользователям запрещена. Администраторам разрешена
  -- задним числом не глубже 30 дней назад (пост-учёт посещаемости).
  IF p_date::DATE < (now() AT TIME ZONE 'Europe/Moscow')::DATE THEN
    IF NOT coalesce(v_is_admin, FALSE)
       OR p_date::DATE < (now() AT TIME ZONE 'Europe/Moscow')::DATE - 30
    THEN
      RAISE EXCEPTION 'INVALID_INPUT';
    END IF;
  END IF;

  -- Бронирование от имени резидента: доступно только админам. Бронь и списание
  -- часов оформляются на выбранного резидента, а не на вызывающего админа;
  -- имя «Ответственный» сервер берёт из его профиля, чтобы избежать опечаток.
  v_owner_id := v_sub_id;
  v_owner_name := coalesce(p_user_name, '');
  IF p_on_behalf_of_chat_id IS NOT NULL THEN
    IF NOT coalesce(v_is_admin, FALSE) THEN
      RAISE EXCEPTION 'ADMIN_ONLY';
    END IF;

    SELECT s.id,
           coalesce(nullif(btrim(concat_ws(' ', s.first_name, s.last_name)), ''), s.username, 'Пользователь')
      INTO v_owner_id, v_owner_name
      FROM subscribers s
     WHERE s.chat_id = p_on_behalf_of_chat_id AND s.is_active;
    IF v_owner_id IS NULL THEN
      RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;
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
     btrim(p_title), coalesce(p_description, ''), v_owner_name, v_owner_id, 'active')
  RETURNING * INTO v_row;

  -- Списание с депозита часов: поминутно, в той же транзакции, что и бронь.
  -- Списывается с баланса владельца брони (v_owner_id) — резидента, если бронь
  -- оформлена от его имени, иначе вызывающего.
  v_duration := private.time_to_minutes(p_end_time) - private.time_to_minutes(p_start_time);
  v_balance_after := private.apply_balance_change(
    v_owner_id, p_room_id, -v_duration, 'booking', v_row.id, NULL
  );

  RETURN to_jsonb(v_row) || jsonb_build_object(
    'charged_minutes', v_duration,
    'balance_after', v_balance_after
  );
END;
$$;
