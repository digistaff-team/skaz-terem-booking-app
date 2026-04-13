import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchSubscriberById, setToken, cacheUser, getUserName } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Send } from "lucide-react";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      return;
    }

    fetchSubscriberById(token).then((subscriber) => {
      if (subscriber) {
        setToken(token);
        cacheUser(subscriber);
        setUserName(getUserName(subscriber));
        setStatus("success");

        // Redirect after short delay
        setTimeout(() => navigate("/"), 2000);
      } else {
        setStatus("error");
      }
    });
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
                  Ссылка недействительна или ваша подписка не найдена.
                  Запросите новую ссылку у бота.
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
