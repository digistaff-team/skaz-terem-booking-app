# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Location

The app lives in the `skaz-terem-booking-app/` subdirectory, not at the repo root (`C:\Projects\SkazTerem_Bot`). Run all npm/git commands from inside `skaz-terem-booking-app/` — the git repository, `package.json`, and this file are all there, not in the parent folder.

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Vitest in watch mode
```

`bun` also works as a package manager alternative to `npm`.

## Architecture

This is a **room booking web app** for "Сказочный Терем" — a rental space in Russia. Users open the app as a Telegram Mini App via @SkazTerem_bot, authenticate automatically, and book one of 5 rooms.

**Tech stack:** React 18 + TypeScript + Vite, Tailwind CSS (shadcn/ui components), Supabase (Postgres), TanStack Query, React Router v6.

### Authentication

Auth is Telegram-based, not Supabase Auth. `AuthProvider` in `src/lib/auth.tsx` runs on load:

1. If `localStorage["auth_token"]` exists → validate UUID against `subscribers` table. If invalid, clear and fall through.
2. Try Telegram Mini App auto-auth via `window.Telegram.WebApp.initDataUnsafe.user` — calls Supabase RPC `register_subscriber` (creates or reactivates the user, returns UUID), stores UUID as `auth_token`.
3. If neither works → unauthenticated (shows toast if user tries to book).

Protected routes (`/book`, `/bookings`) redirect unauthenticated users to `/`. There is no `/auth` page — it was removed.

### Booking Flow

`src/pages/BookingFlow.tsx` is a 5-step wizard: `room → date → time → details → confirm`.

- URL param `?room=<id>` skips the room-selection step.
- `TIME_SLOTS` = 00:00–23:00 hourly; `END_TIME_SLOTS` adds `24:00` for midnight bookings.
- **Back navigation clears time:** `goBack()` resets `formData.startTime` and `formData.endTime` when leaving or arriving at the "time" step — ensures `TimeStep` always mounts fresh.
- Each time slot step fetches bookings once on mount via `getActiveBookingsForRoomDate`; filtering is client-side. A server-side `isTimeSlotAvailable` guard runs before confirm as a race-condition check.
- On confirm, title is stored as `{roomName} | {eventTitle} | {userName}`.
- After writing to Supabase, `syncBookingToGoogleCalendar()` is called (fire-and-forget, never throws).
- Users can enter arbitrary start/end times via `<input type="time">` in addition to hourly slot buttons.
- **Booking horizon limit:** the latest bookable date is configured in `src/config/bookingLimits.ts` — either `{ mode: "days", days: N }` (N days ahead of today) or `{ mode: "fixed", date: "YYYY-MM-DD" }` (fixed cutoff, inclusive). Overridable via env vars `VITE_BOOKING_MAX_DATE` (takes priority) / `VITE_BOOKING_MAX_DAYS`. `getMaxBookingDate()` feeds both the date `<input max>` and the `handleDateSelect` guard; `getMaxDateErrorMessage()` builds the toast text. Default is 90 days.
- **iOS input handling:** `isIOS` constant (top of file, detects iPhone/iPad via `navigator.userAgent` + `maxTouchPoints`) gates `onChange` vs `onBlur` for all three date/time free-input fields. On iOS, `onChange` fires on every spinner scroll tick — only `onBlur` (fires on "Done") triggers step transitions. On desktop, `onChange` triggers immediately as before.
- **Keyboard offset:** `DetailsStep` uses `window.visualViewport` resize/scroll events to compute `keyboardOffset` and applies it as `paddingBottom` on the form, keeping the "Далее" button above the iOS software keyboard.

### Pages

- `/` — `Index.tsx`: main page with room cards, schedule button, rules popup (inline content, no iframe).
- `/book` — `BookingFlow.tsx`: booking wizard (protected).
- `/bookings` — `MyBookings.tsx`: user's active bookings with cancel (protected).
- `/schedule` — `Schedule.tsx`: read-only view of all bookings for a selected date, sorted by time.

### Data Layer

`src/lib/bookingStore.ts` — all Supabase queries for bookings (CRUD + conflict detection + schedule).

**Whole-house conflict logic:** `"whole-house"` conflicts with every individual room and vice versa. `getConflictingRoomIds(roomId)` expands the check. All conflict/availability queries use `.in("room_id", ...)` — never `.eq()`.

`src/lib/googleCalendar.ts` — syncs create/cancel to Google Calendars via Apps Script webhook (`VITE_GOOGLE_APPS_SCRIPT_URL`). Uses `mode: "no-cors"`; failures are logged but never thrown.

`src/data/rooms.ts` — static room definitions (5 rooms). Each has a `calendarId`. The `title` field in bookings is parsed as `{roomName} | {eventTitle} | {userName}` — use `title.split(" | ")[1]` to extract event name.

### Supabase Tables

- `subscribers` — Telegram users (`id`, `chat_id`, `username`, `first_name`, `last_name`, `is_active`)
- `bookings` — (`room_id`, `room_name`, `date`, `start_time`, `end_time`, `title`, `description`, `user_name`, `user_id`, `status`)

The Supabase client in `src/integrations/supabase/client.ts` uses a hardcoded anon key (public, safe for client-side).

### Telegram Mini App

`public/telegram-web-app.js` is a locally hosted copy of the Telegram SDK (avoids CDN loading failures). Loaded first in `index.html`. `src/main.tsx` calls `WebApp.ready()` and `WebApp.expand()` before React renders.

### Styling

Custom warm-amber theme in `src/index.css`. The `warm-glow` utility class is the page background on all routes. All UI components are from shadcn/ui in `src/components/ui/`. `DialogContent` accepts a `hideCloseButton` prop (added to `src/components/ui/dialog.tsx`) to suppress the default `×` button.

**iOS global CSS fixes** (in `src/index.css`): `-webkit-tap-highlight-color: transparent` on `*` removes tap flash on buttons; `overscroll-behavior-y: none` on `body` prevents elastic bounce from triggering Telegram Mini App close gesture; `padding-bottom: env(safe-area-inset-bottom)` on `body` keeps content above the iPhone home indicator. Requires `viewport-fit=cover` in `index.html` meta viewport tag for safe-area env vars to work.

### Path Alias

`@/` resolves to `src/` in both Vite and TypeScript configs.
