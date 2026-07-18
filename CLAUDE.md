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

`npm` is authoritative — `package-lock.json` is the only committed lockfile, and Vercel's build command (`vercel.json`) invokes `npm run build`. `bun` can still be used ad hoc, but don't commit a `bun.lock`/`bun.lockb` alongside `package-lock.json` — having multiple lockfiles lets them drift out of sync.

`src/test/supabase-migration.test.ts` runs `supabase-migrations-2-security.sql` **and** `supabase-migrations-3-balance.sql` against PGlite (real Postgres in WASM, node environment): initData signature verification is checked against a reference `node:crypto` implementation, plus booking conflict logic, ownership checks, the hour-deposit accounting (charge/refund/topup), and RLS state. Run it after any change to either migration file.

## Architecture

This is a **room booking web app** for "Сказочный Терем" — a rental space in Russia. Users open the app as a Telegram Mini App via @SkazTerem_bot, authenticate automatically, and book one of 5 rooms.

**Tech stack:** React 18 + TypeScript + Vite, Tailwind CSS (shadcn/ui components), Supabase (Postgres), TanStack Query, React Router v6.

### Authentication

Auth is Telegram-based, not Supabase Auth. The signed `window.Telegram.WebApp.initData` string is the credential: its HMAC signature is verified **server-side in Postgres** (`private.tg_verify_init_data`, see `supabase-migrations-2-security.sql`) on every auth and every mutation. `initDataUnsafe` is never trusted.

`AuthProvider` in `src/lib/auth.tsx` runs on load:

1. Cached profile from `localStorage["auth_user"]` is shown immediately while verification runs.
2. If `initData` is present (opened inside Telegram) → RPC `auth_subscriber(initData)` verifies the signature, creates/reactivates the subscriber, updates names, returns the profile. UUID stored as `auth_token`.
3. Otherwise, if `localStorage["auth_token"]` exists → RPC `get_subscriber(uuid)` returns own profile (knowledge of the UUID acts as a bearer token). If invalid, token is cleared.
4. If neither works → unauthenticated (shows toast if user tries to book).

Protected routes (`/book`, `/bookings`) redirect unauthenticated users to `/`. There is no `/auth` page — it was removed. Booking/cancelling requires `initData`, so it only works inside Telegram.

### Booking Flow

`src/pages/booking/` is a 5-step wizard: `room → date → time → details → confirm`, split across:
- `BookingFlow.tsx` — orchestrator: step state machine, `room`/`date`/`confirm` steps inline, the "occupied" conflict dialog, and the `create_booking` mutation.
- `TimeStep.tsx` — time slot picker, fetches existing bookings via `useQuery(["roomBookings", roomId, date])`.
- `DetailsStep.tsx` — event title/description/name form, handles the iOS keyboard-offset padding.
- `constants.ts` — `Step` type, `STEP_ORDER`, `isIOS`.

- URL param `?room=<id>` skips the room-selection step.
- Time-slot conflict logic (`isStartBlocked`, `getAvailableEndSlots`) is in `src/lib/timeSlots.ts` as pure functions (unit-tested in `src/test/timeSlots.test.ts`) — not inlined in `TimeStep.tsx`, so it's testable without rendering. `TIME_SLOTS` = 00:00–23:00 hourly; `END_TIME_SLOTS` adds `24:00` for midnight bookings.
- **Back navigation clears time:** `goBack()` resets `formData.startTime` and `formData.endTime` when leaving or arriving at the "time" step — ensures `TimeStep` always mounts fresh.
- `TimeStep` fetches bookings via TanStack Query (`getActiveBookingsForRoomDate`), refetching automatically when `roomId`/`date` change; filtering is client-side. `isTimeSlotAvailable` runs before the details step as a UX pre-check; the **authoritative** conflict check happens atomically inside the `create_booking` RPC (advisory lock + check + insert in one transaction), so concurrent double-booking is impossible.
- Booking creation is a `useMutation` (`bookMutation` in `BookingFlow.tsx`); on success it invalidates the `["myBookings"]` query so `MyBookings.tsx` shows the new booking without a manual refetch.
- `title` is stored **clean** (just the event name) — no more `{roomName} | {eventTitle} | {userName}` composition on the client. See Data Layer below for where the composite string still gets built.
- After writing to Supabase, `syncBookingToGoogleCalendar()` is called (fire-and-forget, never throws).
- Users can enter arbitrary start/end times via `<input type="time">` in addition to hourly slot buttons.
- **Booking horizon limit:** the latest bookable date is configured in `src/config/bookingLimits.ts` — either `{ mode: "days", days: N }` (N days ahead of today) or `{ mode: "fixed", date: "YYYY-MM-DD" }` (fixed cutoff, inclusive). Overridable via env vars `VITE_BOOKING_MAX_DATE` (takes priority) / `VITE_BOOKING_MAX_DAYS`. `getMaxBookingDate()` feeds both the date `<input max>` and the `handleDateSelect` guard; `getMaxDateErrorMessage()` builds the toast text. Default is 90 days — this is deliberately edited by hand for real cutoffs (e.g. facility closures), not a bug when it's in the past.
- **iOS input handling:** `isIOS` (`src/pages/booking/constants.ts`, detects iPhone/iPad via `navigator.userAgent` + `maxTouchPoints`) gates `onChange` vs `onBlur` for all three date/time free-input fields. On iOS, `onChange` fires on every spinner scroll tick — only `onBlur` (fires on "Done") triggers step transitions. On desktop, `onChange` triggers immediately as before.
- **Keyboard offset:** `DetailsStep` uses `window.visualViewport` resize/scroll events to compute `keyboardOffset` and applies it as `paddingBottom` on the form, keeping the "Далее" button above the iOS software keyboard.

### Pages

- `/` — `Index.tsx`: main page with room cards, schedule button, rules popup (inline content, no iframe).
- `/book` — `src/pages/booking/BookingFlow.tsx`: booking wizard (protected).
- `/schedule` — `Schedule.tsx`: read-only view of all bookings for a selected date, sorted by time.
- `/account` — `Account.tsx`: personal cabinet (protected). Sections in order: **active bookings with cancel** (`src/components/BookingsList.tsx` — `useQuery(["myBookings", userId])` + cancel `useMutation`; `cancellingId` for the per-row blur/disable animation is derived from `cancelMutation.isPending ? cancelMutation.variables : null`), per-room hour balances (negative = долг, shown in red), top-up instructions, last 30 balance transactions (`useQuery(["account"])` → `getAccount()` in `src/lib/accountStore.ts` → RPC `get_account(initData)`). There is no separate «Мои брони» page — `/bookings` redirects to `/account` (kept because the booking-success flow historically navigated there).
- `/admin` — `Admin.tsx`: hour top-up form for admins only (`is_admin` flag; non-admins are redirected to `/account`, and the server enforces `ADMIN_ONLY` anyway). Native `<select>` elements styled like Input — the shadcn Select component was removed in the dependency cleanup.
- `/admin/stats` — `AdminStats.tsx`: booking statistics for admins (client-side guard only — bookings are publicly readable anyway). Fetches all bookings, filters by period presets, and renders KPI tiles + pure-CSS bar charts (months/rooms/weekdays/start hours) + top-users list. Aggregation lives in `src/lib/stats.ts` (`computeStats`, unit-tested). All charts are single-measure → one fill color: the `accent` token (~4:1 contrast vs card; `primary` fails 3:1) with direct value labels — no hover dependency on mobile.

### Data Layer

`src/lib/bookingStore.ts` — all Supabase queries for bookings. **Reads** go directly to the `bookings` table (public SELECT policy). **Writes** go through RPC only: `create_booking(initData, ...)` and `cancel_booking(initData, id)` — both verify the Telegram signature and enforce ownership/conflicts server-side. RPC exceptions use short codes (`BOOKING_CONFLICT`, `AUTH_INVALID`, `AUTH_EXPIRED`, `INVALID_INPUT`, `BOOKING_NOT_FOUND`) translated to Russian in `translateRpcError`.

**Whole-house conflict logic:** `"whole-house"` conflicts with every individual room and vice versa. Client-side pre-checks use `getConflictingRoomIds(roomId)` with `.in("room_id", ...)` — never `.eq()`. The same rule is duplicated in the `create_booking` SQL function (and its allowed room-id list must be kept in sync with `src/data/rooms.ts`).

`src/lib/googleCalendar.ts` — syncs create/cancel to Google Calendars via Apps Script webhook (`VITE_GOOGLE_APPS_SCRIPT_URL`). Uses `mode: "no-cors"`; failures are logged but never thrown. `formatCalendarSummary()` composes the `{roomName} | {eventTitle} | {userName}` string shown as the Calendar event title — this is the **only** place that composite string is built; it is not stored in Supabase.

`src/data/rooms.ts` — static room definitions (5 rooms). Each has a `calendarId`.

`title` in the `bookings` table holds the clean event name (set via `create_booking`'s `p_title`). Older rows created before this change still hold the legacy `{roomName} | {eventTitle} | {userName}` format — `parseEventTitle()` in `src/lib/booking.ts` handles both: returns the middle `" | "`-separated segment if present, else the raw title. Used by `MyBookings.tsx` and `Schedule.tsx` wherever an event name is displayed.

`src/lib/dates.ts` — local-date helpers: `toLocalISODate`, `localISODateInDays`, `currentTimeHHMM`, `parseLocalDate` (parses `YYYY-MM-DD` at local noon to dodge timezone day-shift), `formatDateLong`/`formatDateShort` (Russian date formatting, used by `BookingFlow`/`MyBookings` respectively — different layouts, not interchangeable). **Never use `new Date().toISOString().split("T")[0]`** — it returns the UTC date, which is yesterday's date before ~03:00 in Russian timezones.

### Hour Deposit (личный кабинет)

Users pre-pay for hours per room; bookings deduct from that deposit (see `supabase-migrations-3-balance.sql`). Accounting is **per-minute** (`minutes INTEGER` in `room_balances`), **per-room** (separate balance for each of the 5 rooms, including `whole-house`), and **negative balances are allowed** — going into долг does not block booking.

- `create_booking` deducts the exact duration inside the same transaction as the insert, and returns `charged_minutes`/`balance_after` alongside the booking row.
- `cancel_booking` refunds the net sum of that booking's transactions (`refund_minutes` in the response). Legacy bookings created before the deposit system have no transactions → refund 0; double-refund is impossible (net becomes 0 after the first refund).
- Top-up: the **admin section inside the Mini App** (`/admin`, see `supabase-migrations-4-admin.sql`). Subscribers get an `is_admin` flag (set manually: `UPDATE subscribers SET is_admin = TRUE WHERE chat_id = ...`); admins see a «Начисление часов» button in `/account`. RPCs `admin_list_users(initData)` and `admin_adjust_hours(initData, chat_id, room_id, minutes, comment)` verify the caller's initData **and** `is_admin` via `private.require_admin`; the admin's identity is appended to the transaction comment for audit. Positive delta = `topup`, negative = `adjust`.
- `admin_add_hours(chat_id, ...)` (no initData) also exists, granted **only to `service_role`** — a manual/SQL fallback; the anon key cannot call it.
- All balance changes go through `private.apply_balance_change` (atomic upsert-increment + a `balance_transactions` history row). Payment itself happens offline (via the curator); there is no payment integration.
- `src/lib/duration.ts` — `timeToMinutes`/`durationMinutes`/`formatMinutes` («−1 ч 45 мин» formatting).
- Room-id lists are duplicated in `admin_add_hours`/`admin_adjust_hours`/`create_booking` (SQL) — keep in sync with `src/data/rooms.ts`.
- `src/lib/rpcErrors.ts` — the shared RPC error-code → Russian message map (`translateRpcError`), used by `bookingStore`/`adminStore`.

### Supabase Tables

- `subscribers` — Telegram users (`id`, `chat_id`, `username`, `first_name`, `last_name`, `is_active`)
- `bookings` — (`room_id`, `room_name`, `date`, `start_time`, `end_time`, `title`, `description`, `user_name`, `user_id`, `status`)

The Supabase client in `src/integrations/supabase/client.ts` uses a hardcoded anon key (public, safe for client-side).

**RLS (see `supabase-migrations-2-security.sql`, supersedes the policies in `supabase-migrations.sql` and all of `supabase-register-function.sql`):** `bookings` allows public SELECT only; all writes are denied for anon and go through `SECURITY DEFINER` RPCs. `subscribers` has no anon access at all — profile reads go through `get_subscriber(uuid)`. The Python bot uses the service-role key and bypasses RLS. The bot token used for initData verification lives in the `private.app_config` table (key `telegram_bot_token`) — it must be set when running the migration.

### Telegram Mini App

`public/telegram-web-app.js` is a locally hosted copy of the Telegram SDK (avoids CDN loading failures). Loaded first in `index.html`. `src/main.tsx` calls `WebApp.ready()` and `WebApp.expand()` before React renders.

**The production bot @SkazTerem_bot runs on the ProTalk service**, not on `bot/main.py` — that Python script is a reference/local fallback only. Never run it with the production bot token while ProTalk is active (Telegram allows one update consumer per token → 409 Conflict). ProTalk handles the /start flow (group membership check + app link); everything else (auth, booking, balances) is app ↔ Supabase directly.

### Styling

Custom warm-amber theme in `src/index.css`. The `warm-glow` utility class is the page background on all routes. All UI components are from shadcn/ui in `src/components/ui/`. `DialogContent` accepts a `hideCloseButton` prop (added to `src/components/ui/dialog.tsx`) to suppress the default `×` button.

**iOS global CSS fixes** (in `src/index.css`): `-webkit-tap-highlight-color: transparent` on `*` removes tap flash on buttons; `overscroll-behavior-y: none` on `body` prevents elastic bounce from triggering Telegram Mini App close gesture; `padding-bottom: env(safe-area-inset-bottom)` on `body` keeps content above the iPhone home indicator. Requires `viewport-fit=cover` in `index.html` meta viewport tag for safe-area env vars to work.

### Performance

Pages other than `Index` are lazy-loaded via `React.lazy` in `App.tsx` (each is its own chunk). Room photos are WebP (`src/assets/rooms/*.webp`, 1200px wide, q70) — the original `.jpg` files stay in the repo as sources but are not imported, so they don't reach the bundle. Regenerate WebP from JPEG with sharp if photos change.

### Path Alias

`@/` resolves to `src/` in both Vite and TypeScript configs.
