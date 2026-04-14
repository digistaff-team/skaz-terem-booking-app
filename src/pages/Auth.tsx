import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchSubscriberById, fetchSubscriberByChatId, registerSubscriber, setToken, cacheUser, getUserName } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Send } from "lucide-react";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const chatIdParam = searchParams.get("chat_id");

    if (!token && !chatIdParam) {
      setStatus("error");
      return;
    }

    // Приоритет: token (от нашего бота), fallback: chat_id (от Pro-Talk)
    const processAuth = async () => {
      let subscriber = null;
      let authId = "";

      if (token) {
        // Вариант 1: авторизация по токену (наш бот)
        subscriber = await fetchSubscriberById(token);
        authId = token;
      } else if (chatIdParam) {
        // Вариант 2: авторизация по chat_id (Pro-Talk бот)
        const chatId = parseInt(chatIdParam, 10);
        if (isNaN(chatId)) {
          setStatus("error");
          return;
        }

        // Сначала пробуем найти существующего пользователя
        subscriber = await fetchSubscriberByChatId(chatId);

        // Если не найден — регистрируем автоматически
        if (!subscriber) {
          const newId = await registerSubscriber(chatId);
          if (newId) {
            // Перезапрашиваем данные после регистрации
            subscriber = await fetchSubscriberByChatId(chatId);
            authId = newId;
          }
        } else {
          authId = subscriber.id;
        }
      }

      if (subscriber && authId) {
        setToken(authId);
        cacheUser(subscriber);
        setUserName(getUserName(subscriber));
        setStatus("success");
        setTimeout(() => navigate("/"), 2000);
      } else {
        setStatus("error");
      }
    };

    processAuth();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen warm-glow flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-6">
          {status === "loading" && (
            <>
              <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
              <div>
                <h1 className="text-xl font-bold text-foreground mb-2">Входим в систему...</h1>
                <p className="text-sm text-muted-foreground">
                  Проверяем вашу подписку
                </p>
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <div>
                <h1 className="text-xl font-bold text-foreground mb-2">Добро пожаловать!</h1>
                <p className="text-sm text-muted-foreground">
                  Привет, {userName}! Перенаправляем...
                </p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="mx-auto h-12 w-12 text-destructive" />
              <div>
                <h1 className="text-xl font-bold text-foreground mb-2">Не удалось войти</h1>
                <p className="text-sm text-muted-foreground mb-4">
                  Ссылка недействительна или ваш аккаунт не найден.
                  Убедитесь, что вы подписаны на бота @SkazTerem_bot.
                </p>
                <a
                  href="https://t.me/SkazTerem_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="gap-2">
                    <Send className="h-4 w-4" />
                    Открыть бота
                  </Button>
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
