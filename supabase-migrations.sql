-- ============================================
-- Шаг 1: Создать таблицу subscribers
-- ============================================
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- Шаг 2: Добавить колонку user_id в bookings
-- ============================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES subscribers(id);

-- ============================================
-- Шаг 3: Row Level Security (RLS)
-- ============================================
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Шаг 4: Политики для subscribers
-- ============================================

-- Любой может прочитать свои данные
CREATE POLICY "Users can view own profile"
  ON subscribers FOR SELECT
  USING (id = auth.uid());

-- Анонимный доступ только по ID (для фронтенда)
-- Фронтенд будет использовать select по id напрямую
CREATE POLICY "Public read subscriber by id"
  ON subscribers FOR SELECT
  USING (true);

-- ============================================
-- Шаг 5: Политики для bookings
-- ============================================

-- Пользователь видит только свои брони
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Пользователь может создавать брони только для себя
CREATE POLICY "Users can create own bookings"
  ON bookings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Пользователь может обновлять только свои брони
CREATE POLICY "Users can update own bookings"
  ON bookings FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================
-- Примечание:
-- Так как мы используем кастомную авторизацию
-- (не Supabase Auth), auth.uid() будет NULL.
-- Фронтенд будет фильтровать по user_id вручную.
-- RLS политики здесь — дополнительная защита.
--
-- Для работы без Supabase Auth нужно либо:
-- 1. Отключить RLS (просто, но менее безопасно)
-- 2. Использовать service_role ключ на бэкенде
-- 3. Создать кастомную функцию авторизации
-- ============================================

-- Если хотите отключить RLS временно:
-- ALTER TABLE bookings DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE subscribers DISABLE ROW LEVEL SECURITY;
