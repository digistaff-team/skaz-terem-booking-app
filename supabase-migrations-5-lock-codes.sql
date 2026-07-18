-- ============================================================
-- Миграция 5: Персональные коды ключницы Tuya
--
-- Таблица выданных временных кодов доступа. Коды создаёт Edge Function
-- tuya-lock-code (см. supabase/functions/tuya-lock-code/index.ts):
-- она проверяет подпись Telegram initData, владение бронью, вызывает
-- Tuya Cloud API и сохраняет выданный код сюда.
--
-- С anon-ключа таблица недоступна полностью — Edge Function работает
-- через service role. Никаких RPC для неё нет.
--
-- Запускать можно в любой момент (не зависит от миграций 2–4 по порядку,
-- но требует существующих таблиц bookings и subscribers).
-- ============================================================

CREATE TABLE IF NOT EXISTS lock_codes (
  booking_id UUID PRIMARY KEY REFERENCES bookings(id),
  user_id UUID NOT NULL REFERENCES subscribers(id),
  code TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ NOT NULL,
  -- id временного пароля в Tuya (для отзыва/отладки)
  tuya_password_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE lock_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lock_codes FROM anon, authenticated;
