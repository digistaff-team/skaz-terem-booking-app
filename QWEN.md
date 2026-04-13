# Сказочный Терем — Booking App

Веб-приложение для бронирования помещений коворкинга «Сказочный Терем».

## Технологии

| Категория | Стек |
|-----------|------|
| **Фреймворк** | React 18 + TypeScript |
| **Сборка** | Vite 5 |
| **Роутинг** | React Router 6 |
| **Стили** | Tailwind CSS 3 + shadcn/ui |
| **UI-компоненты** | Radix UI + Lucide Icons |
| **Бэкенд/БД** | Supabase |
| **Календари** | Google Calendar (через Google Apps Script) |
| **Тесты** | Vitest + Testing Library |
| **Деплой** | Vercel |

## Структура проекта

```
├── src/
│   ├── App.tsx              # Роутер: /, /book, /bookings, *
│   ├── main.tsx             # Точка входа
│   ├── types/
│   │   └── booking.ts       # Room, Booking, BookingFormData
│   ├── data/
│   │   └── rooms.ts         # 5 помещений с calendarId
│   ├── lib/
│   │   ├── bookingStore.ts  # CRUD бронирований (Supabase)
│   │   └── googleCalendar.ts # Синхронизация с Google Calendar
│   ├── pages/
│   │   ├── Index.tsx        # Главная: карточки комнат, правила
│   │   ├── BookingFlow.tsx  # 5-шаговый визард бронирования
│   │   ├── MyBookings.tsx   # Список активных бронирований
│   │   └── NotFound.tsx     # 404
│   ├── components/
│   │   ├── RoomCard.tsx     # Карточка помещения
│   │   ├── NavLink.tsx      # Навигационная ссылка
│   │   └── ui/              # shadcn/ui компоненты
│   └── integrations/
│       └── supabase/client.ts # Supabase клиент (захардкожены ключи)
├── public/
│   ├── favicon.svg           # Фавикон — домик
│   └── placeholder.svg
├── vercel.json               # SPA роутинг (rewrites на index.html)
├── vite.config.ts            # Алиас @ → ./src
└── .env.example              # Шаблон переменных окружения
```

## Маршруты

| Путь | Описание |
|------|----------|
| `/` | Главная: список помещений, кнопка «Забронировать», ссылка на Google Calendar расписание |
| `/book` | Визард бронирования (5 шагов) |
| `/book?room=<id>` | Визард сразу на шаге выбора даты для указанной комнаты |
| `/bookings` | Мои бронирования — просмотр и отмена |
| `*` | Страница 404 |

## Визард бронирования (5 шагов)

1. **Помещение** — выбор из 5 комнат (пропускается если `?room=` в URL)
2. **Дата** — быстрые кнопки (сегодня/завтра/послезавтра) или календарь (макс. 90 дней вперёд)
3. **Время** — слоты с 08:00 до 22:00 (почасовые). Проверка конфликтов через Supabase
4. **Детали** — название, описание, имя ответственного
5. **Подтверждение** — сводка и кнопка «Подтвердить бронирование»

## Помещения

| ID | Название | Площадь | Еда? |
|----|----------|---------|------|
| `floor-1-34` | 1-й этаж, 34 м² | 34 м² | ✅ |
| `floor-2-hall-20` | 2 этаж, зал 20 м² | 20 м² | ❌ |
| `floor-2-room-11` | 2 этаж, комната 11 м² | 11 м² | ❌ |
| `floor-2-office-6` | 2 этаж, кабинет 6 м² | 6 м² | ❌ |
| `whole-house` | Весь Сказочный Терем | 96 м² | ✅ |

## База данных (Supabase)

Таблица `bookings`:

| Колонка | Тип |
|---------|-----|
| `id` | uuid (PK) |
| `room_id` | text |
| `room_name` | text |
| `date` | date |
| `start_time` | time |
| `end_time` | time |
| `title` | text |
| `description` | text |
| `user_name` | text |
| `status` | text (`active` / `cancelled`) |
| `created_at` | timestamptz |

## Google Calendar интеграция

При создании/отмене бронирования данные отправляются в Google Apps Script (`VITE_GOOGLE_APPS_SCRIPT_URL`). Скрипт создаёт/удаляет события в календаре конкретной комнаты (calendarId хранится в `rooms.ts`). Используется `mode: "no-cors"` — ответ не читается.

## Команды

```bash
# Установка зависимостей
npm install

# Запуск dev-сервера (порт 8080)
npm run dev

# Сборка продакшн
npm run build

# Сборка dev-режима
npm run build:dev

# Превью собранной версии
npm run preview

# Линт
npm run lint

# Тесты (однократно)
npm test

# Тесты (watch)
npm run test:watch
```

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `VITE_GOOGLE_APPS_SCRIPT_URL` | URL Google Apps Script для синхронизации с Calendar |

Supabase URL и ключ захардкожены в `src/integrations/supabase/client.ts` (не через env).

## Деплой (Vercel)

- Автоматический деплой при пуше в `main`
- `vercel.json` обеспечивает SPA-роутинг (все запросы → `index.html`)
- Нужна переменная `VITE_GOOGLE_APPS_SCRIPT_URL` в Settings → Environment Variables

## Замечания

- Supabase-ключи захардкожены — для безопасности рекомендуется перенести их в переменные окружения (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `lovable-tagger` — дев-зависимость от Lovable, можно удалить
- Общий календарь `skaz.terem@gmail.com` не синхронизируется — только календари отдельных комнат
