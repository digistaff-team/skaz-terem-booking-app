# Настройка персональных кодов ключницы Tuya

Каждая бронь получает уникальный код доступа, действующий в окне брони ±30 минут.
Коды создаёт Supabase Edge Function `tuya-lock-code` через Tuya Cloud API и
показывает пользователю в карточке брони в кабинете.

Пока Tuya не настроена, функция выдаёт запасной общий код из секрета
`STATIC_LOCK_CODE` — приложение работает как раньше, но код больше не зашит
в клиентский бандл.

## Шаг 1. Миграция

Выполните `supabase-migrations-5-lock-codes.sql` в Supabase SQL Editor.

## Шаг 2. Деплой Edge Function

Вариант А — через Dashboard (без установки чего-либо):
1. Supabase Dashboard → Edge Functions → **Deploy a new function** → «Via Editor».
2. Название: `tuya-lock-code`.
3. Вставьте содержимое `supabase/functions/tuya-lock-code/index.ts` и нажмите Deploy.

Вариант Б — через CLI: `supabase functions deploy tuya-lock-code`.

## Шаг 3. Секреты (минимум для запуска)

Dashboard → Edge Functions → Secrets, добавьте:

| Секрет | Значение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен бота @SkazTerem_bot (тот же, что в `bot/.env`) |
| `STATIC_LOCK_CODE` | `2481` — запасной код на переходный период |

После этого коды уже показываются в приложении (пока общий для всех).

## Шаг 4. Проект Tuya IoT Platform (для персональных кодов)

1. Зарегистрируйтесь на **iot.tuya.com** (можно тем же аккаунтом, что Smart Life).
2. **Cloud → Development → Create Cloud Project**:
   - Industry: Smart Home, Development Method: Smart Home;
   - **Data Center: Central Europe Data Center** (важно: тот же регион, что у
     аккаунта Smart Life, для России это обычно Central Europe).
3. В проекте → **Service API → Go to Authorize** подключите:
   - IoT Core, Authorization Token Management, **Smart Lock Open Service**.
4. **Devices → Link App Account → Add App Account** — отсканируйте QR-код
   приложением Smart Life. Ключница появится в списке устройств проекта.
5. Скопируйте:
   - **Access ID** и **Access Secret** (вкладка Overview проекта),
   - **Device ID** ключницы (вкладка Devices).

## Шаг 5. Секреты Tuya

Добавьте в Edge Functions → Secrets:

| Секрет | Значение |
|---|---|
| `TUYA_ACCESS_ID` | Access ID проекта |
| `TUYA_ACCESS_SECRET` | Access Secret проекта |
| `TUYA_DEVICE_ID` | device_id ключницы |
| `TUYA_ENDPOINT` | `https://openapi.tuyaeu.com` (Central Europe) |
| `TUYA_CODE_LENGTH` | длина кода: `6` или `7` — зависит от модели замка |

С момента появления этих секретов новые запросы кода создают **персональный
временный пароль** в ключнице на окно брони.

## Проверка и отладка

1. Сделайте тестовую бронь → в карточке брони должен появиться код.
2. Логи функции: Dashboard → Edge Functions → tuya-lock-code → Logs.
   Ошибки Tuya пишутся туда с кодом и сообщением API (`Tuya /path: code msg`).
3. Типичные проблемы:
   - `1106 permission deny` — не подключён Smart Lock Open Service (шаг 4.3)
     или устройство не привязано к проекту (шаг 4.4);
   - `1004 sign invalid` — неверный Access Secret;
   - ошибка на `temp-password` — попробуйте другую длину кода
     (`TUYA_CODE_LENGTH=7`): у Wi-Fi замков Tuya пароли обычно 7-значные,
     у Zigbee — 6-значные;
   - пустой список устройств — датацентр проекта не совпадает с регионом
     аккаунта Smart Life.

## Ограничения текущей версии

- При отмене брони код не отзывается из Tuya немедленно — он сам истекает
  по окончании окна (окно узкое: бронь ±30 минут).
- Модели замков Tuya различаются API-нюансами; если ваша ключница отвечает
  ошибкой — пришлите текст из логов, поправим формат запроса.
