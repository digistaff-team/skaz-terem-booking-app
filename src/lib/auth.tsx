import { useState, useEffect, createContext, useContext, createElement, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
        colorScheme: "light" | "dark";
      };
    };
  }
}

const AUTH_TOKEN_KEY = "auth_token";
const AUTH_USER_KEY = "auth_user";

export interface Subscriber {
  id: string;
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscribedAt: string;
  isActive: boolean;
}

// === Telegram Mini App ===

/** Подписанная строка initData — сервер проверяет её подпись при каждой мутации. */
export function getInitData(): string | null {
  const initData = window.Telegram?.WebApp?.initData;
  return initData && initData.length > 0 ? initData : null;
}

// === LocalStorage helpers ===

function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function getCachedUser(): Subscriber | null {
  const cached = localStorage.getItem(AUTH_USER_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }
  return null;
}

function cacheUser(user: Subscriber | null): void {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

// === Supabase RPC ===

interface SubscriberRow {
  id: string;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  subscribed_at: string;
  is_active: boolean;
}

function mapSubscriberRow(row: SubscriberRow): Subscriber {
  return {
    id: row.id,
    chatId: row.chat_id,
    username: row.username ?? undefined,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    subscribedAt: row.subscribed_at,
    isActive: row.is_active,
  };
}

/** Регистрация/вход по подписанной initData (подпись проверяется на сервере). */
async function authWithTelegram(initData: string): Promise<Subscriber | null> {
  const { data, error } = await supabase.rpc("auth_subscriber", {
    p_init_data: initData,
  });

  if (error || !data) {
    if (error) console.error("Telegram auth failed:", error.message);
    return null;
  }

  return mapSubscriberRow(data as SubscriberRow);
}

async function fetchSubscriberById(id: string): Promise<Subscriber | null> {
  const { data, error } = await supabase.rpc("get_subscriber", { p_id: id });

  if (error || !data) {
    return null;
  }

  return mapSubscriberRow(data as SubscriberRow);
}

// === React Context ===

interface AuthContextType {
  user: Subscriber | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Subscriber | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const applyUser = (subscriber: Subscriber | null) => {
      if (subscriber) {
        setToken(subscriber.id);
        cacheUser(subscriber);
        setUser(subscriber);
      }
      setIsLoading(false);
    };

    // Кэшированный профиль показываем сразу, пока идёт проверка
    const cached = getToken() ? getCachedUser() : null;
    if (cached) {
      setUser(cached);
      setIsLoading(false);
    }

    const initData = getInitData();
    if (initData) {
      // Открыто из Telegram — авторизуемся по подписанной initData
      // (заодно обновляет имя/username и реактивирует подписчика)
      authWithTelegram(initData)
        .then(applyUser)
        .catch(() => setIsLoading(false));
    } else {
      // Открыто в обычном браузере — пробуем сохранённый токен
      const token = getToken();
      if (token) {
        fetchSubscriberById(token).then((subscriber) => {
          if (subscriber) {
            applyUser(subscriber);
          } else {
            clearToken();
            setUser(null);
            setIsLoading(false);
          }
        });
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshUser = async () => {
    const token = getToken();
    if (token) {
      const subscriber = await fetchSubscriberById(token);
      if (subscriber) {
        setUser(subscriber);
        cacheUser(subscriber);
      }
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return createElement(
    AuthContext.Provider,
    {
      value: {
        user,
        isLoading,
        isAuthenticated: !!user,
        logout,
        refreshUser,
      },
    },
    children
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// === Utility exports ===

export { getToken, setToken, clearToken, cacheUser, fetchSubscriberById };

export function getUserName(user: Subscriber | null): string {
  if (!user) return "Гость";
  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (user.username) return user.username;
  return "Пользователь";
}
