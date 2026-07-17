-- ============================================================
-- Миграция 4: Админ-раздел в приложении (начисление часов)
--
-- Основной бот живёт на ProTalk, поэтому начисление часов делается
-- прямо в Mini App: у подписчика появляется флаг is_admin, админам
-- доступны RPC admin_list_users / admin_adjust_hours (авторизация —
-- та же подписанная Telegram initData, что и у остальных мутаций).
--
-- Запускать ПОСЛЕ supabase-migrations-3-balance.sql.
--
-- ⚠️ ПОСЛЕ ЗАПУСКА назначьте администратора (куратора) вручную:
--    UPDATE subscribers SET is_admin = TRUE WHERE chat_id = 123456789;
--    (chat_id виден в таблице subscribers после /start в боте)
-- ============================================================

-- ============================================================
-- Шаг 1: Флаг администратора
-- ============================================================
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- Шаг 2: Проверка «вызывающий — админ» (внутренняя)
-- ============================================================
CREATE OR REPLACE FUNCTION private.require_admin(p_init_data TEXT)
RETURNS subscribers
LANGUAGE plpgsql
SET search_path = public, private, extensions
AS $$
DECLARE
  v_user JSONB;
  v_sub subscribers;
BEGIN
  v_user := private.tg_verify_init_data(p_init_data);

  SELECT s.* INTO v_sub
    FROM subscribers s
   WHERE s.chat_id = (v_user->>'id')::BIGINT AND s.is_active;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'AUTH_INVALID';
  END IF;
  IF NOT v_sub.is_admin THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  RETURN v_sub;
END;
$$;

-- ============================================================
-- Шаг 3: Список пользователей с балансами (для формы начисления)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_users(p_init_data TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_admin subscribers;
BEGIN
  v_admin := private.require_admin(p_init_data);

  RETURN COALESCE(
    (SELECT jsonb_agg(u.item ORDER BY u.sort_name)
       FROM (
         SELECT jsonb_build_object(
                  'chat_id', s.chat_id,
                  'username', s.username,
                  'first_name', s.first_name,
                  'last_name', s.last_name,
                  'balances', COALESCE(
                    (SELECT jsonb_agg(jsonb_build_object('room_id', b.room_id, 'minutes', b.minutes))
                       FROM room_balances b
                      WHERE b.user_id = s.id),
                    '[]'::JSONB
                  )
                ) AS item,
                lower(COALESCE(s.first_name, s.username, s.chat_id::TEXT)) AS sort_name
           FROM subscribers s
          WHERE s.is_active
       ) u),
    '[]'::JSONB
  );
END;
$$;

-- ============================================================
-- Шаг 4: Начисление/корректировка часов админом из приложения.
-- Та же логика, что admin_add_hours (service_role), но авторизация —
-- по initData + is_admin; кто начислил — дописывается в комментарий.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_hours(
  p_init_data TEXT,
  p_chat_id BIGINT,
  p_room_id TEXT,
  p_minutes INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_admin subscribers;
  v_sub_id UUID;
  v_new INTEGER;
  v_comment TEXT;
BEGIN
  v_admin := private.require_admin(p_init_data);

  IF p_minutes IS NULL OR p_minutes = 0 OR abs(p_minutes) > 600000 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF p_room_id IS NULL OR p_room_id NOT IN
     ('floor-1-34', 'floor-2-hall-20', 'floor-2-room-11', 'floor-2-office-6', 'whole-house')
  THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  IF length(coalesce(p_comment, '')) > 500 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  SELECT s.id INTO v_sub_id FROM subscribers s WHERE s.chat_id = p_chat_id;
  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- След аудита: кто начислил
  v_comment := COALESCE(NULLIF(btrim(p_comment), '') || ' · ', '')
               || 'админ: ' || COALESCE(v_admin.username, v_admin.first_name, v_admin.chat_id::TEXT);

  v_new := private.apply_balance_change(
    v_sub_id, p_room_id, p_minutes,
    CASE WHEN p_minutes > 0 THEN 'topup' ELSE 'adjust' END,
    NULL, v_comment
  );

  RETURN jsonb_build_object('room_id', p_room_id, 'balance_minutes', v_new);
END;
$$;

-- ============================================================
-- Шаг 5: Права
-- ============================================================
REVOKE ALL ON FUNCTION public.admin_list_users(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_adjust_hours(TEXT, BIGINT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_hours(TEXT, BIGINT, TEXT, INTEGER, TEXT) TO anon, authenticated;

-- Назначение администратора (выполните вручную, подставив chat_id куратора):
-- UPDATE subscribers SET is_admin = TRUE WHERE chat_id = 123456789;
