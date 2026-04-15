# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server (Vite)
bun run build        # Production build
bun run lint         # ESLint
bun run test         # Run tests once (Vitest)
bun run test:watch   # Vitest in watch mode
```

## Architecture

This is a **room booking web app** for "Сказочный Терем" — a rental space in Russia. Users arrive via a Telegram bot link, authenticate, and book one of 5 rooms.

**Tech stack:** React 18 + TypeScript + Vite, Tailwind CSS (shadcn/ui components), Supabase (Postgres), TanStack Query, React Router v6.

### Authentication

Auth is Telegram-based, not Supabase Auth. Users land on `/auth?chat_id=<telegram_id>` from the Pro-Talk bot. The auth page (`src/pages/Auth.tsx`) looks up or auto-registers the subscriber and stores their UUID in `localStorage` as `auth_token`. The `AuthProvider` in `src/lib/auth.tsx` reads this token and re-validates it against the `subscribers` Supabase table on load.

Protected routes (`/book`, `/bookings`) redirect unauthenticated users to `/`.

### Booking Flow

`src/pages/BookingFlow.tsx` is a 5-step wizard: `room → date → time → details → confirm`.

- URL param `?room=<id>` skips the room-selection step (used when navigating from a RoomCard).
- Time slots run 08:00–22:00 in 1-hour increments (`TIME_SLOTS`).
- The "Сейчас" (Now) button picks the next full hour and checks availability before jumping to time-end selection.
- On confirm, the booking title is stored as `{roomName} | {eventTitle} | {userName}`.
- After writing to Supabase, `syncBookingToGoogleCalendar()` is called fire-and-forget.

### Data Layer

`src/lib/bookingStore.ts` — all Supabase queries for bookings (CRUD + conflict detection).

**Whole-house conflict logic:** `"whole-house"` conflicts with every individual room and vice versa. `getConflictingRoomIds(roomId)` expands the check: booking `"whole-house"` checks all 5 room IDs; booking any individual room checks `[roomId, "whole-house"]`. All conflict/availability queries use `.in("room_id", ...)` — never `.eq()`.

**Time slot availability in the UI:** `TimeStep` (inside `BookingFlow.tsx`) calls `getActiveBookingsForRoomDate` once on mount to fetch all active bookings for the room+date. Start slots that fall within an existing booking are hidden entirely. End slots are filtered client-side from the same data — no per-slot async calls. A final server-side `isTimeSlotAvailable` check is still made in `handleTimeSelect` as a race-condition guard before writing to Supabase.

`src/lib/googleCalendar.ts` — syncs create/cancel actions to individual Google Calendars via a Google Apps Script webhook. URL comes from `VITE_GOOGLE_APPS_SCRIPT_URL` env var. Uses `mode: "no-cors"` so responses are opaque; failures are logged but never thrown.

`src/data/rooms.ts` — static room definitions. Each room has a `calendarId` pointing to its individual Google Calendar.

### Supabase Tables

- `subscribers` — Telegram users (`id`, `chat_id`, `username`, `first_name`, `last_name`, `is_active`)
- `bookings` — (`room_id`, `room_name`, `date`, `start_time`, `end_time`, `title`, `description`, `user_name`, `user_id`, `status`)

The Supabase client in `src/integrations/supabase/client.ts` uses a hardcoded anon key (public, safe for client-side).

### Styling

Custom warm-amber theme defined in `src/index.css` using CSS custom properties. The `warm-glow` utility class (`background: linear-gradient(...)`) is used as the page background on all routes. All UI components are from shadcn/ui in `src/components/ui/`.

### Path Alias

`@/` resolves to `src/` in both Vite and TypeScript configs.
