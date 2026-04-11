# Интеграция с Google Calendar через Google Apps Script

## Шаг 1: Создание Google Apps Script

1. Перейдите на [script.google.com](https://script.google.com)
2. Нажмите **"Новый проект"** (или "New Project")
3. Переименуйте проект: нажмите на "Без названия" → введите `SkazTerem Calendar Sync`

## Шаг 2: Написание скрипта

1. Удалите весь код в файле `Code.gs`
2. Вставьте следующий код:

```javascript
// Google Apps Script для синхронизации бронирований с Google Calendar

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === "create") {
      createEvent(data);
    } else if (data.action === "delete") {
      deleteEvent(data);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function createEvent(data) {
  const calendar = CalendarApp.getCalendarById(data.calendarId);
  
  // Создаём дату и время начала/окончания
  const startDate = new Date(data.date + "T" + data.startTime + ":00+03:00");
  const endDate = new Date(data.date + "T" + data.endTime + ":00+03:00");
  
  // Создаём событие
  const event = calendar.createEvent(
    data.summary,
    startDate,
    endDate,
    {
      description: data.description
    }
  );
  
  // Добавляем ID бронирования для возможности удаления
  event.setTag("bookingId", data.bookingId);
  
  Logger.log("Event created: " + event.getId());
}

function deleteEvent(data) {
  const calendar = CalendarApp.getCalendarById(data.calendarId);
  
  // Ищем событие по тегу bookingId
  const events = calendar.getEvents(new Date("2020-01-01"), new Date("2030-12-31"));
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const bookingId = event.getTag("bookingId");
    
    if (bookingId === data.bookingId) {
      event.deleteEvent();
      Logger.log("Event deleted: " + data.bookingId);
      return;
    }
  }
  
  Logger.log("Event not found: " + data.bookingId);
}
```

## Шаг 3: Предоставление доступа к календарям

1. Убедитесь, что у вас есть доступ ко всем 5 календарям (вы должны быть их владельцем)
2. Календари уже созданы и их ID находятся в файле `src/data/rooms.ts`

## Шаг 4: Развёртывание скрипта

1. Нажмите кнопку **"Начать развёртывание"** (Deploy) → **"Новое развёртывание"** (New deployment)
2. Нажмите на шестерёнку ⚙️ → выберите **"Веб-приложение"** (Web app)
3. Заполните поля:
   - **Описание**: `SkazTerem Calendar Sync API`
   - **Выполнять от имени**: `Меня` (Me) — ваш аккаунт Google
   - **У кого есть доступ**: `Все` (Anyone) — **это важно!**
4. Нажмите **"Начать развёртывание"** (Deploy)
5. Google запросит разрешения — предоставьте все доступы
6. Скопируйте **URL веб-приложения** (Web App URL) — он выглядит как:
   ```
   https://script.google.com/macros/s/AKfycbxXXXXXXXXXXXXXXXXXXXXXXX/exec
   ```

## Шаг 5: Настройка локального окружения

1. Создайте файл `.env.local` в корне проекта (если ещё не создан)
2. Добавьте переменную:

```env
VITE_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/ВАШ_ID/exec
```

## Шаг 6: Настройка на Vercel

1. Откройте ваш проект на Vercel
2. Перейдите в **Settings** → **Environment Variables**
3. Добавьте переменную:
   - **Name**: `VITE_GOOGLE_APPS_SCRIPT_URL`
   - **Value**: URL из шага 4
   - **Environments**: выберите Production, Preview, Development
4. Сохраните и сделайте новый деплой

## Шаг 7: Проверка работы

1. Создайте новое бронирование в приложении
2. Откройте Google Calendar нужной комнаты
3. Событие должно появиться в календаре

## Как это работает

- **При создании бронирования**: `addBooking()` → сохраняет в Supabase → отправляет в Google Calendar
- **При отмене бронирования**: `cancelBooking()` → обновляет статус в Supabase → удаляет событие из Google Calendar
- **`mode: "no-cors"`**: запросы отправляются без CORS, Google Apps Script принимает их без проблем

## Важно знать

⚠️ **Google Apps Script имеет ограничения:**
- 20,000 запросов в день (для бесплатных аккаунтов)
- 6 минут на выполнение одного запроса

Для вашего проекта этих лимитов более чем достаточно.

## Если что-то пошло не так

1. **Событие не создаётся**: проверьте URL скрипта в `.env.local`
2. **Ошибка доступа**: убедитесь, что у скрипта есть доступ к календарю
3. **Событие создалось, но не удалилось**: проверьте, что тег `bookingId` совпадает

Логи выполнения скрипта можно посмотреть на [script.google.com](https://script.google.com) → ваш проект → **Выполнения** (Executions)
