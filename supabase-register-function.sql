-- Функция авто-регистрации при первом визите
-- Вызывается через RPC из клиентского приложения

CREATE OR REPLACE FUNCTION register_subscriber(
  p_chat_id BIGINT,
  p_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Выполняется с правами владельца (обходит RLS)
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Проверяем, есть ли уже пользователь с таким chat_id
  SELECT id INTO v_id
  FROM subscribers
  WHERE chat_id = p_chat_id;

  -- Если найден — возвращаем его ID
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Создаём нового подписчика
  INSERT INTO subscribers (chat_id, username, first_name, last_name)
  VALUES (p_chat_id, p_username, p_first_name, p_last_name)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Разрешаем вызывать функцию всем (безопасно — она только создаёт/возвращает)
GRANT EXECUTE ON FUNCTION register_subscriber(BIGINT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION register_subscriber(BIGINT, TEXT, TEXT, TEXT) TO authenticated;
