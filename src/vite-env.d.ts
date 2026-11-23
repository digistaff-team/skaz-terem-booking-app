/// <reference types="vite/client" />

// ============================================================
// Глобальные типы Telegram WebApp (Bot API 8.0)
// ============================================================

interface TelegramWebApp {
  version: string;
  platform: "android" | "ios" | "desktop" | "web_platform" | "unknown";
  colorScheme: "light" | "dark";
  themeParams?: Record<string, string>;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
      is_premium?: boolean;
    };
    start_param?: string;
    auth_date?: number;
    hash?: string;
  };
  isActive: boolean;
  isWindowFocused?: () => boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;

  // BackButton
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };

  // HapticFeedback
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };

  // Dialogs
  showAlert: (message: string) => void;
  showConfirm: (
    message: string,
    callback?: (confirmed: boolean) => void
  ) => void;
  showPopup?: (
    params: {
      title?: string;
      message: string;
      buttons: Array<{
        type: "ok" | "cancel" | "close" | "default";
        id?: string;
        text?: string;
        behavior?: "back" | "close";
      }>;
    },
    callback?: (button_id: string) => void
  ) => void;

  // Theme colors
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;

  // Closing confirmation
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  isClosingConfirmationEnabled?: boolean;

  // VerticalSwipes
  enableVerticalSwipes?: () => void;
  disableVerticalSwipes?: () => void;

  // Links
  openTelegramLink: (url: string) => void;
  openLink: (url: string, params?: { try_instant_view?: boolean }) => void;
  shareMessage?: (
    chatId: string | number,
    messageId: string | number,
    callback?: (result: { url?: string }) => void
  ) => void;
  switchInlineQuery?: (query: string, chooseChatResult?: string[]) => void;

  // HomeScreen
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (
    callback: (result: { status: string } | string) => void
  ) => void;
  onEvent?: (eventType: string, callback: (...args: unknown[]) => void) => void;
  offEvent?: (eventType: string, callback: (...args: unknown[]) => void) => void;

  // CloudStorage (callback-based API)
  CloudStorage?: {
    getItem: (key: string, callback: (error: string | null, value: string | null) => void) => void;
    setItem: (key: string, value: string, callback: (error: string | null, result: boolean) => void) => void;
    getKeys: (callback: (error: string | null, keys: string[]) => void) => void;
    removeItem: (key: string, callback: (error: string | null, removed: boolean) => void) => void;
  };

  // Fullscreen / orientation / safe area
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  lockOrientation?: (dir: string) => void;
  unlockOrientation?: () => void;
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
    webApp?: TelegramWebApp;
  }
}

export { TelegramWebApp };
