// ============================================================
// Адаптер Telegram WebApp
// ============================================================
// Единая точка доступа к window.Telegram.WebApp с graceful fallback.
// Все вызовы вне Telegram возвращают no-op / null.
// ============================================================

import type { TelegramWebApp } from "../vite-env";

// ---------- геттер ----------

/** Безопасный доступ к WebApp; вне Telegram — null. */
export function tg(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window.Telegram?.WebApp;
  return typeof w === "object" ? w : null;
}

// ---------- окружение ----------

/** Запущено внутри Telegram Mini App? */
export function isTelegramEnv(): boolean {
  return !!tg() || !!(window.Telegram?.WebApp?.initData);
}

// ---------- capability check ----------

/** Есть ли у WebApp метод с именем methodName? */
export function canUse(method: string): boolean {
  const w = tg();
  return typeof w?.[method as keyof typeof w] === "function";
}

// ---------- theme helpers ----------

/**
 * Тёплые цвета приложения (из src/index.css):
 *   light: --warm-glow = hsl(35,100%,95%) → #FFF6E5
 *   dark:  --background = hsl(25,20%,10%) → #1F1A1A
 */
const THEME_LIGHT = { header: "#FFF6E5", background: "#FFF6E5" };
const THEME_DARK = { header: "#1F1A1A", background: "#1F1A1A" };

/** Текущая тема Telegram (light/dark). */
function currentScheme(): "light" | "dark" {
  return tg()?.colorScheme === "dark" ? "dark" : "light";
}

/** Применить цвета шапки и фона под текущую тему (если WebApp поддерживает). */
export function applyTheme(): void {
  const w = tg();
  if (!w) return;
  const theme = currentScheme() === "dark" ? THEME_DARK : THEME_LIGHT;
  if (canUse("setHeaderColor")) w.setHeaderColor?.(theme.header);
  if (canUse("setBackgroundColor")) w.setBackgroundColor?.(theme.background);

  // Реагируем на смену темы Telegram, если доступно отслеживание событий
  if (typeof w.onEvent === "function") {
    w.onEvent("themeChanged", () => {
      const t = currentScheme() === "dark" ? THEME_DARK : THEME_LIGHT;
      w.setHeaderColor?.(t.header);
      w.setBackgroundColor?.(t.background);
    });
  }
}

// ---------- closing confirmation ----------

export function enableClosingConfirmation(): void {
  if (canUse("enableClosingConfirmation")) tg()?.enableClosingConfirmation();
}

export function disableClosingConfirmation(): void {
  if (canUse("disableClosingConfirmation")) tg()?.disableClosingConfirmation();
}

export function setClosingConfirmation(on: boolean): void {
  if (on) enableClosingConfirmation();
  else disableClosingConfirmation();
}

// ---------- vertical swipes ----------

export function enableVerticalSwipes(): void {
  if (canUse("enableVerticalSwipes")) tg()?.enableVerticalSwipes();
}

export function disableVerticalSwipes(): void {
  if (canUse("disableVerticalSwipes")) tg()?.disableVerticalSwipes();
}

export function setVerticalSwipes(on: boolean): void {
  if (on) enableVerticalSwipes();
  else disableVerticalSwipes();
}

// ---------- haptic feedback ----------

/**
 * Реальный API SDK (public/telegram-web-app.js):
 *   notificationOccurred("success" | "error" | "warning")
 *   selectionChanged()
 * — а не successOccurred/errorOccurred/warningOccurred, как было здесь раньше.
 */
type HapticNotification = "success" | "error" | "warning";

/** Уведомляющий тактильный отклик; no-op вне Telegram. */
export function hapticNotify(type: HapticNotification): void {
  const hf = tg()?.HapticFeedback;
  if (hf && typeof hf.notificationOccurred === "function") {
    hf.notificationOccurred(type);
  }
}

export function hapticSuccess(): void { hapticNotify("success"); }
export function hapticError(): void { hapticNotify("error"); }
export function hapticWarning(): void { hapticNotify("warning"); }

/** Лёгкий «щелчок» при выборе опции; no-op вне Telegram. */
export function hapticTap(): void {
  const hf = tg()?.HapticFeedback;
  if (hf && typeof hf.selectionChanged === "function") {
    hf.selectionChanged();
  }
}

// ---------- showConfirm / showAlert ----------

/** Нативный confirm Telegram; вне Telegram — window.confirm. */
export async function showConfirm(message: string): Promise<boolean> {
  const w = tg();
  if (w && typeof w.showConfirm === "function") {
    return new Promise<boolean>((resolve) => {
      w.showConfirm(message, (confirmed: boolean) => resolve(confirmed));
    });
  }
  return window.confirm(message);
}

/** Нативный showAlert Telegram; вне Telegram — window.alert. */
export function showAlert(message: string): void {
  const w = tg();
  if (w && typeof w.showAlert === "function") {
    w.showAlert(message);
    return;
  }
  window.alert(message);
}

// ---------- BackButton ----------

/** Подписка на нажатие BackButton; возвращает функцию отписки. */
export function onBackButton(handler: () => void): () => void {
  const back = tg()?.BackButton;
  if (back && typeof back.onClick === "function") {
    back.onClick(handler);
    return () => back.offClick?.(handler);
  }
  return () => {};
}

/** Показать BackButton (если есть). */
export function showBackButton(): void {
  tg()?.BackButton?.show();
}

/** Скрыть BackButton (если есть). */
export function hideBackButton(): void {
  tg()?.BackButton?.hide();
}

// ---------- CloudStorage ----------

/** Прочитать ключ из CloudStorage (callback → Promise). */
export async function cloudGet(key: string): Promise<string | null> {
  const w = tg();
  if (!w?.CloudStorage) return null;
  try {
    return await new Promise<string | null>((resolve) => {
      w.CloudStorage!.getItem(key, (err, value) => {
        resolve(err ? null : value);
      });
    });
  } catch {
    return null;
  }
}

/** Записать ключ в CloudStorage. */
export async function cloudSet(key: string, value: string): Promise<boolean> {
  const w = tg();
  if (!w?.CloudStorage) return false;
  try {
    await new Promise<boolean>((resolve) => {
      w.CloudStorage!.setItem(key, value, (err, result) => {
        resolve(err ? false : result);
      });
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- openTelegramLink / shareMessage ----------

/** Открыть ссылку в Telegram (t.me/…). */
export function openTelegramLink(url: string): void {
  const w = tg();
  if (w && typeof w.openTelegramLink === "function") {
    w.openTelegramLink(url);
    return;
  }
  window.open(url, "_blank");
}

/** Поделиться (inline или подготовка поста). */
export async function shareMessage(intent: {
  chatId?: number;
  text: string;
}): Promise<void> {
  const w = tg();
  if (w && typeof w.shareMessage === "function") {
    // @ts-expect-error shareMessage API может отличаться в разных SDK
    w.shareMessage({ text: intent.text, chat_id: intent.chatId });
    return;
  }
  // Fallback: копировать в буфер
  await navigator.clipboard?.writeText(intent.text);
}

// ---------- lifecycle ----------

type LifecycleEvent = "activated" | "deactivated";

let lifecycleCallbacks: Map<LifecycleEvent, () => void> = new Map();

/** Подписка на события activated / deactivated. */
export function onLifecycleEvent(
  event: LifecycleEvent,
  callback: () => void
): () => void {
  const w = tg();
  if (w && typeof w.onEvent === "function") {
    w.onEvent(event, callback as (...args: unknown[]) => void);
    return () => w.offEvent?.(event, callback as (...args: unknown[]) => void);
  }
  return () => {};
}

// ---------- init ----------

/** Вызвать ready() / expand() при загрузке. */
export function initWebApp(): void {
  const w = tg();
  if (!w) return;
  w.ready?.();
  w.expand?.();
}

// ---------- dev-лог ----------

if (import.meta.env.DEV) {
  const w = tg();
  if (w) {
    console.info(
      "[telegram] version=%s platform=%s",
      w.version ?? "?",
      w.platform ?? "?"
    );
  }
}
