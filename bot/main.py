"""
Telegram Bot для авторизации пользователей Сказочного Терема.

При /start бот:
1. Проверяет, подписан ли пользователь на канал -1003507317011
2. Если подписан — сохраняет в Supabase и шлёт ссылку для входа
3. Если не подписан — просит подписаться

Зависимости:
  pip install aiogram supabase python-dotenv
"""

import os
import logging
from datetime import datetime

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from supabase import create_client, Client

from dotenv import load_dotenv

load_dotenv()

# === Конфигурация ===
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://aveitrccxqbjfxysogiv.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Service role key для записи
CHANNEL_ID = "-1003507317011"
APP_URL = os.getenv("APP_URL", "https://skaz-terem-booking.vercel.app")

if not BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN not set in .env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


async def is_subscribed(chat_id: int) -> bool:
    """Проверяет, подписан ли пользователь на канал."""
    try:
        member = await bot.get_chat_member(CHANNEL_ID, chat_id)
        return member.status in ("member", "administrator", "creator")
    except Exception as e:
        logger.error(f"Error checking subscription for {chat_id}: {e}")
        return False


def save_subscriber(chat_id: int, username: str | None, first_name: str | None, last_name: str | None) -> str | None:
    """Сохраняет подписчика в Supabase и возвращает его ID."""
    try:
        # Проверяем, есть ли уже
        result = supabase.table("subscribers").select("id").eq("chat_id", chat_id).execute()
        
        if result.data:
            return result.data[0]["id"]
        
        # Создаём нового
        result = supabase.table("subscribers").insert({
            "chat_id": chat_id,
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
        }).execute()
        
        if result.data:
            return result.data[0]["id"]
        return None
    except Exception as e:
        logger.error(f"Error saving subscriber {chat_id}: {e}")
        return None


@dp.message(CommandStart())
async def cmd_start(message: types.Message):
    chat_id = message.from_user.id
    username = message.from_user.username
    first_name = message.from_user.first_name
    last_name = message.from_user.last_name

    # Проверяем подписку на канал
    if not await is_subscribed(chat_id):
        await message.answer(
            "🏡 Добро пожаловать в Сказочный Терем!\n\n"
            "Для доступа к приложению необходимо подписаться на наш канал:\n"
            "https://t.me/+YOUR_CHANNEL_LINK\n\n"
            "После подписки нажмите /start ещё раз."
        )
        return

    # Сохраняем подписчика
    subscriber_id = save_subscriber(chat_id, username, first_name, last_name)
    if not subscriber_id:
        await message.answer(
            "❌ Произошла ошибка при сохранении. Попробуйте позже."
        )
        logger.error(f"Failed to save subscriber {chat_id}")
        return

    # Генерируем ссылку для входа
    auth_url = f"{APP_URL}/auth?token={subscriber_id}"
    
    await message.answer(
        f"✅ Добро пожаловать, {first_name or username or 'друг'}!\n\n"
        f"🏡 Нажмите на кнопку ниже, чтобы войти в приложение:\n",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(text="🏡 Войти в Сказочный Терем", url=auth_url)]
        ])
    )
    logger.info(f"Subscriber {chat_id} logged in")


@dp.message()
async def echo_all(message: types.Message):
    """Эхо для всех остальных сообщений."""
    await message.answer(
        "Нажмите /start для входа в приложение.\n\n"
        "Если вы не подписаны на канал, подпишитесь и попробуйте снова."
    )


async def main():
    logger.info("Starting bot...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
