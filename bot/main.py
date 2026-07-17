"""
Telegram Bot для авторизации пользователей Сказочного Терема.

При /start бот:
1. Проверяет, состоит ли пользователь в закрытой группе -1003507317011
2. Если состоит — сохраняет в Supabase и шлёт ссылку для входа
3. Если не состоит — просит вступить

Команда /hours (только для администраторов из ADMIN_CHAT_IDS) —
начисление купленных часов на баланс помещения пользователя.

Зависимости:
  pip install aiogram supabase python-dotenv
"""

import os
import logging
from datetime import datetime

from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from supabase import create_client, Client

from dotenv import load_dotenv

load_dotenv()

# === Конфигурация ===
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://aveitrccxqbjfxysogiv.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Service role key для записи
GROUP_ID = "-1003507317011"
APP_URL = os.getenv("APP_URL", "https://skaz-terem-booking.vercel.app")
# Пригласительная ссылка на закрытую группу (задайте в .env) —
# в приватной группе её нужно сгенерировать заранее, обычной ссылки-username нет
GROUP_INVITE_URL = os.getenv("GROUP_INVITE_URL", "")
# chat_id администраторов через запятую — им доступна команда /hours
ADMIN_CHAT_IDS = {
    int(x) for x in os.getenv("ADMIN_CHAT_IDS", "").replace(" ", "").split(",") if x
}

# Номера помещений для команды /hours (id должны совпадать с src/data/rooms.ts)
ROOMS = {
    "1": ("floor-1-34", "1-й этаж, 34 м²"),
    "2": ("floor-2-hall-20", "2 этаж, зал 20 м²"),
    "3": ("floor-2-room-11", "2 этаж, комната 11 м²"),
    "4": ("floor-2-office-6", "2 этаж, кабинет 6 м²"),
    "5": ("whole-house", "Весь Сказочный Терем"),
}

if not BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN not set in .env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


async def is_member(chat_id: int) -> bool:
    """Проверяет, состоит ли пользователь в закрытой группе."""
    try:
        member = await bot.get_chat_member(GROUP_ID, chat_id)
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
            # Обновляем имя и реактивируем (мог отписаться и вернуться)
            subscriber_id = result.data[0]["id"]
            supabase.table("subscribers").update({
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
                "is_active": True,
            }).eq("id", subscriber_id).execute()
            return subscriber_id

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

    # Проверяем членство в закрытой группе
    if not await is_member(chat_id):
        group_line = (
            f"{GROUP_INVITE_URL}\n\n" if GROUP_INVITE_URL
            else "(ссылку для вступления можно получить у куратора)\n\n"
        )
        await message.answer(
            "🏡 Добро пожаловать в Сказочный Терем!\n\n"
            "Для доступа к приложению необходимо вступить в нашу закрытую группу:\n"
            + group_line +
            "После вступления нажмите /start ещё раз."
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

    # Страницы /auth больше нет: Mini App авторизуется сама по подписанной
    # Telegram initData (проверка на сервере), токен в ссылке не нужен.
    await message.answer(
        f"✅ Добро пожаловать, {first_name or username or 'друг'}!\n\n"
        f"🏡 Нажмите на кнопку ниже, чтобы войти в приложение:\n",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton(text="🏡 Войти в Сказочный Терем", url=APP_URL)]
        ])
    )
    logger.info(f"Subscriber {chat_id} logged in")


def format_minutes(total: int) -> str:
    """−105 -> '−1 ч 45 мин'."""
    sign = "−" if total < 0 else ""
    h, m = divmod(abs(total), 60)
    if h and m:
        return f"{sign}{h} ч {m} мин"
    if h:
        return f"{sign}{h} ч"
    return f"{sign}{m} мин"


HOURS_USAGE = (
    "Начисление часов на баланс пользователя.\n\n"
    "Формат:\n"
    "/hours <@username или chat_id> <номер помещения> <часы>\n\n"
    "Помещения:\n"
    + "\n".join(f"  {k} — {name}" for k, (_, name) in ROOMS.items())
    + "\n\nПримеры:\n"
    "/hours @ivanov 2 10 — начислить 10 часов на «зал 20 м²»\n"
    "/hours 123456789 5 1.5 — начислить полтора часа на «Весь Терем»\n"
    "/hours @ivanov 2 -3 — списать 3 часа (корректировка)"
)


@dp.message(Command("hours"))
async def cmd_hours(message: types.Message):
    """Начисление часов — только для администраторов из ADMIN_CHAT_IDS."""
    if message.from_user.id not in ADMIN_CHAT_IDS:
        await message.answer("Эта команда доступна только куратору.")
        return

    args = (message.text or "").split()[1:]
    if len(args) != 3:
        await message.answer(HOURS_USAGE)
        return

    target, room_key, hours_str = args

    room = ROOMS.get(room_key)
    if not room:
        await message.answer(f"Неизвестное помещение «{room_key}».\n\n{HOURS_USAGE}")
        return
    room_id, room_name = room

    try:
        hours = float(hours_str.replace(",", "."))
        minutes = round(hours * 60)
    except ValueError:
        await message.answer(f"Не удалось разобрать число часов «{hours_str}».")
        return
    if minutes == 0:
        await message.answer("Число часов не должно быть нулевым.")
        return

    # Находим пользователя: @username или числовой chat_id
    try:
        if target.startswith("@"):
            result = supabase.table("subscribers").select("chat_id, first_name, last_name, username") \
                .eq("username", target[1:]).execute()
        else:
            result = supabase.table("subscribers").select("chat_id, first_name, last_name, username") \
                .eq("chat_id", int(target)).execute()
    except ValueError:
        await message.answer(f"«{target}» — не @username и не числовой chat_id.")
        return
    except Exception as e:
        logger.error(f"Error looking up subscriber {target}: {e}")
        await message.answer("❌ Ошибка при поиске пользователя. Попробуйте позже.")
        return

    if not result.data:
        await message.answer(
            f"Пользователь {target} не найден. "
            "Он должен хотя бы раз нажать /start в боте."
        )
        return

    sub = result.data[0]
    chat_id = sub["chat_id"]
    display_name = " ".join(filter(None, [sub.get("first_name"), sub.get("last_name")])) \
        or sub.get("username") or str(chat_id)

    # Начисляем через RPC (атомарно: баланс + запись в историю)
    try:
        admin_name = message.from_user.username or str(message.from_user.id)
        rpc_result = supabase.rpc("admin_add_hours", {
            "p_chat_id": chat_id,
            "p_room_id": room_id,
            "p_minutes": minutes,
            "p_comment": f"через бота, админ @{admin_name}",
        }).execute()
        new_balance = rpc_result.data["balance_minutes"]
    except Exception as e:
        logger.error(f"admin_add_hours failed for {chat_id}: {e}")
        await message.answer("❌ Ошибка при начислении. Попробуйте позже.")
        return

    verb = "Начислено" if minutes > 0 else "Списано"
    await message.answer(
        f"✅ {verb} {format_minutes(abs(minutes))} — {display_name}, «{room_name}».\n"
        f"Новый баланс: {format_minutes(new_balance)}"
    )
    logger.info(f"Admin {message.from_user.id} adjusted {chat_id} balance: {room_id} {minutes:+d} min")

    # Уведомляем пользователя (не критично, если не получится)
    if minutes > 0:
        try:
            await bot.send_message(
                chat_id,
                f"🏡 Вам начислено {format_minutes(minutes)} на «{room_name}».\n"
                f"Баланс: {format_minutes(new_balance)}. Подробности — в кабинете приложения.",
            )
        except Exception as e:
            logger.warning(f"Could not notify {chat_id} about topup: {e}")


@dp.message()
async def echo_all(message: types.Message):
    """Эхо для всех остальных сообщений."""
    await message.answer(
        "Нажмите /start для входа в приложение.\n\n"
        "Если вы не состоите в нашей группе, вступите и попробуйте снова."
    )


async def main():
    logger.info("Starting bot...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
