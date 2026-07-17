// Коды исключений из RPC-функций (supabase-migrations-*.sql) → русские сообщения
const RPC_ERROR_MESSAGES: Record<string, string> = {
  BOOKING_CONFLICT: "Это время уже занято, выберите другое",
  AUTH_INVALID: "Не удалось подтвердить вашу личность. Переоткройте приложение через бота @SkazTerem_bot",
  AUTH_EXPIRED: "Сессия устарела. Закройте и снова откройте приложение через бота @SkazTerem_bot",
  AUTH_NOT_CONFIGURED: "Сервис временно недоступен, попробуйте позже",
  INVALID_INPUT: "Некорректные данные, проверьте заполненные поля",
  BOOKING_NOT_FOUND: "Бронирование не найдено или принадлежит другому пользователю",
  ADMIN_ONLY: "Эта операция доступна только администратору",
  USER_NOT_FOUND: "Пользователь не найден — он должен хотя бы раз открыть приложение",
};

export function translateRpcError(message: string): string {
  for (const [code, text] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return message;
}

export const NO_TELEGRAM_ERROR =
  "Действие доступно только из Telegram. Откройте приложение через бота @SkazTerem_bot";
