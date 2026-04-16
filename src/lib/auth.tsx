import { useState, useEffect, createContext, useContext, createElement, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
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

// === Supabase queries ===

async function fetchSubscriberById(id: string): Promise<Subscriber | null> {
  const { data, error } = await supabase
    .from("subscribers")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    chatId: data.chat_id,
    username: data.username,
    firstName: data.first_name,
    lastName: data.last_name,
    subscribedAt: data.subscribed_at,
    isActive: data.is_active,
  };
}

async function fetchSubscriberByChatId(chatId: number): Promise<Subscriber | null> {
  const { data, error } = await supabase
    .from("subscribers")
    .select("*")
    .eq("chat_id", chatId)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    chatId: data.chat_id,
    username: data.username,
    firstName: data.first_name,
    lastName: data.last_name,
    subscribedAt: data.subscribed_at,
    isActive: data.is_active,
  };
}

async function registerSubscriber(
  chatId: number,
  firstName?: string | null,
  lastName?: string | null,
  username?: string | null
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("register_subscriber", {
      p_chat_id: chatId,
      p_username: username ?? null,
      p_first_name: firstName ?? null,
      p_last_name: lastName ?? null,
    });

    if (error) {
      console.error("Error registering subscriber:", error);
      return null;
    }

    return data;
  } catch (e) {
    console.error("RPC call failed:", e);
    return null;
  }
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
    const token = getToken();
    if (token) {
      const cached = getCachedUser();
      if (cached) {
        setUser(cached);
        setIsLoading(false);
      }

      fetchSubscriberById(token).then((subscriber) => {
        if (subscriber) {
          setUser(subscriber);
          cacheUser(subscriber);
        } else {
          clearToken();
          setUser(null);
          cacheUser(null);
        }
        setIsLoading(false);
      });
    } else {
      // Нет токена — пробуем авто-аутентификацию через Telegram Mini App
      const tg = window.Telegram?.WebApp;
      const tgUser = tg?.initDataUnsafe?.user;

      console.log("[Auth] window.Telegram defined:", !!window.Telegram);
      console.log("[Auth] window.Telegram.WebApp defined:", !!tg);
      console.log("[Auth] initDataUnsafe:", JSON.stringify(tg?.initDataUnsafe));
      console.log("[Auth] tgUser:", JSON.stringify(tgUser));

      if (tgUser?.id) {
        registerSubscriber(tgUser.id, tgUser.first_name, tgUser.last_name, tgUser.username)
          .then(async (authId) => {
            console.log("[Auth] registerSubscriber authId:", authId);
            if (authId) {
              const subscriber = await fetchSubscriberById(authId);
              console.log("[Auth] fetchSubscriberById result:", JSON.stringify(subscriber));
              if (subscriber) {
                setToken(authId);
                cacheUser(subscriber);
                setUser(subscriber);
              }
            }
            setIsLoading(false);
          })
          .catch((err) => {
            console.error("[Auth] Mini App auth error:", err);
            setIsLoading(false);
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

export { getToken, setToken, clearToken, cacheUser, fetchSubscriberById, fetchSubscriberByChatId, registerSubscriber };

export function getUserName(user: Subscriber | null): string {
  if (!user) return "Гость";
  const parts = [user.firstName, user.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (user.username) return user.username;
  return "Пользователь";
}
