-- ============================================================
-- Миграция 10: Защита часов «Школы» для помещения floor-1-34
--
-- Помещение «1-й этаж, 34 м2» недоступно для бронирования в часы
-- занятий «Школы». Школа занимает room_id='floor-2-room-11' по
-- фиксированному расписанию (Пн/Вт/Чт/Пт) с 04.09.2026 по 31.05.2027.
--
-- Логика проверки внутри create_booking:
--   Если бронируется floor-1-34 И на эту дату существует активная
--   бронь «Школа» (title='Школа', room_id='floor-2-room-11'), то
--   проверяется пересечение времени со слотом школы этого дня недели.
--   При пересечении -> RAISE 'SCHOOL_HOURS_BLOCKED'.
--
-- Слоты школы по дням недели:
--   Пн(1): 08:30-16:00  Вт(2): 08:30-14:30  Чт(4): 08:30-14:30  Пт(5): 08:30-14:00
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
  p_on_behalf_of_chat_id BIGINT DEFAULT NULL,
  p_is_cleaning BOOLEAN DEFAULT FALSE
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
  v_is_backdated BOOLEAN;
  v_is_cleaning BOOLEAN := coalesce(p_is_cleaning, FALSE);
  v_row bookings;
  v_duration INTEGER;
  v_balance_after INTEGER;
  -- переменные для проверки конфликта со школой
  v_school_start TEXT;
  v_school_end TEXT;
  v_dow INTEGER;
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
  v_is_backdated := p_date::DATE < (now() AT TIME ZONE 'Europe/Moscow')::DATE;
  IF v_is_backdated THEN
    IF NOT coalesce(v_is_admin, FALSE)
       OR p_date::DATE < (now() AT TIME ZONE 'Europe/Moscow')::DATE - 30
    THEN
      RAISE EXCEPTION 'INVALID_INPUT';
    END IF;
  END IF;

  -- Уборка и бронь от имени резидента — только для админов, и не одновременно:
  -- у уборки нет резидента.
  IF (v_is_cleaning OR p_on_behalf_of_chat_id IS NOT NULL)
     AND NOT coalesce(v_is_admin, FALSE)
  THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  IF v_is_cleaning AND p_on_behalf_of_chat_id IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  -- ================================================================
  -- Проверка защиты часов «Школы» для помещения floor-1-34
  -- Бронь самой «Школы» (room_id='floor-2-room-11') не блокируется.
  -- Админ может забронировать floor-1-34 поверх школы (исключение).
  -- ================================================================
  IF p_room_id = 'floor-1-34' AND NOT coalesce(v_is_admin, FALSE) THEN
    -- Определяем день недели и соответствующий слот школы
    v_dow := EXTRACT(ISODOW FROM p_date::DATE)::INTEGER;  -- 1=Пн ... 7=Вс
    v_school_start := NULL;
    v_school_end   := NULL;

    IF v_dow = 1 THEN v_school_start := '08:30'; v_school_end := '16:00';
    ELSIF v_dow = 2 THEN v_school_start := '08:30'; v_school_end := '14:30';
    ELSIF v_dow = 4 THEN v_school_start := '08:30'; v_school_end := '14:30';
    ELSIF v_dow = 5 THEN v_school_start := '08:30'; v_school_end := '14:00';
    END IF;

    -- Если день недели входит в расписание школы, проверяем наличие активной брони «Школа» на эту дату
    IF v_school_start IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM bookings b
         WHERE b.room_id = 'floor-2-room-11'
           AND b.title = 'Школа'
           AND b.date::TEXT = p_date
           AND b.status = 'active'
      ) THEN
        -- Проверяем пересечение времени запрашиваемой брони со слотом школы
        IF p_start_time < v_school_end AND p_end_time > v_school_start THEN
          RAISE EXCEPTION 'SCHOOL_HOURS_BLOCKED';
        END IF;
      END IF;
    END IF;
  END IF;
  -- ================================================================

  -- Бронирование от имени резидента: бронь и списание часов оформляются на
  -- выбранного резидента, а не на вызывающего админа; имя «Ответственный»
  -- сервер берёт из его профиля, чтобы избежать опечаток.
  v_owner_id := v_sub_id;
  v_owner_name := CASE WHEN v_is_cleaning THEN 'Фея чистоты' ELSE coalesce(p_user_name, '') END;
  IF p_on_behalf_of_chat_id IS NOT NULL THEN
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
    (room_id, room_name, date, start_time, end_time, title, description, user_name, user_id, status,
     is_backdated, is_cleaning)
  VALUES
    -- p_date::DATE вставляется и в DATE-, и в TEXT-колонку (ISO-формат)
    (p_room_id, p_room_name, p_date::DATE, p_start_time, p_end_time,
     btrim(p_title), coalesce(p_description, ''), v_owner_name, v_owner_id, 'active',
     v_is_backdated, v_is_cleaning)
  RETURNING * INTO v_row;

  -- Уборка депозит не трогает: служебное время, а не использование помещения.
  IF v_is_cleaning THEN
    RETURN to_jsonb(v_row) || jsonb_build_object(
      'charged_minutes', 0,
      'balance_after', NULL
    );
  END IF;

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

REVOKE ALL ON FUNCTION public.create_booking(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BOOLEAN) TO anon, authenticated;
