import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { adminListUsers, adminUserName } from "@/lib/adminStore";

interface DetailsStepProps {
  onSubmit: (title: string, desc: string, name: string, onBehalfOfChatId?: number, isCleaning?: boolean) => void;
  userName: string;
}

const respFieldEditEnabled = import.meta.env.VITE_EDIT_RESP_FIELD === "true";
const NO_BOOKING_VALUE = "none"; // «Без брони» — использование без привязки к резиденту
const CLEANING_VALUE = "cleaning"; // «Фея чистоты» — слот под уборку, часы не списываются
const CLEANING_NAME = "Фея чистоты"; // «Ответственный» (сервер ставит то же имя сам)
const CLEANING_TITLE = "Уборка"; // подставляется в «Мероприятие»

// Стили нативного <select> в тон Input (см. Admin.tsx)
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function DetailsStep({ onSubmit, userName: initialUserName }: DetailsStepProps) {
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const isRespFieldEditable = respFieldEditEnabled && isAdmin;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [onBehalfChatId, setOnBehalfChatId] = useState(""); // "" = сам админ
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const { data: users = [] } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: adminListUsers,
    enabled: isRespFieldEditable,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(offset > 0 ? offset : 0);
    };
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    return () => {
      vv.removeEventListener("resize", handler);
      vv.removeEventListener("scroll", handler);
    };
  }, []);

  const selectedUser = users.find((u) => String(u.chatId) === onBehalfChatId);
  const isNoBookingSelected = onBehalfChatId === NO_BOOKING_VALUE;
  const isCleaningSelected = onBehalfChatId === CLEANING_VALUE;
  const displayName = isCleaningSelected
    ? CLEANING_NAME
    : isNoBookingSelected
    ? "Без брони"
    : selectedUser
    ? adminUserName(selectedUser)
    : initialUserName;

  // «Фея чистоты» подставляет «Уборка» в «Мероприятие»; при уходе с неё
  // убираем только эту автоподстановку, введённое вручную не трогаем.
  const handleResponsibleChange = (value: string) => {
    if (value === CLEANING_VALUE) {
      setTitle(CLEANING_TITLE);
    } else if (isCleaningSelected && title === CLEANING_TITLE) {
      setTitle("");
    }
    setOnBehalfChatId(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // У уборки название необязательно — по умолчанию «Уборка».
    const finalTitle = title.trim() || (isCleaningSelected ? CLEANING_TITLE : "");
    if (!finalTitle) {
      toast.error("Введите название мероприятия");
      return;
    }
    onSubmit(
      finalTitle,
      description.trim(),
      displayName.trim(),
      selectedUser ? selectedUser.chatId : undefined,
      isCleaningSelected
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ paddingBottom: keyboardOffset }}>
      <h2 className="mb-6 text-2xl font-bold text-foreground">Детали бронирования</h2>
      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Название мероприятия{isCleaningSelected ? "" : " *"}</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isCleaningSelected ? CLEANING_TITLE : "Например: Мастер-класс по живописи"}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="desc">Описание</Label>
          <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Краткое описание (необязательно)" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="name">Ответственный</Label>
          {isAdmin ? (
            <select
              id="name"
              className={selectClass + " mt-1.5"}
              value={onBehalfChatId}
              onChange={(e) => handleResponsibleChange(e.target.value)}
            >
              <option value="">Я сам ({initialUserName})</option>
              <option value={CLEANING_VALUE}>{CLEANING_NAME}</option>
              {isRespFieldEditable && <option value={NO_BOOKING_VALUE}>Без брони</option>}
              {isRespFieldEditable &&
                users.map((u) => (
                  <option key={u.chatId} value={String(u.chatId)}>
                    {adminUserName(u)}
                  </option>
                ))}
            </select>
          ) : (
            <Input id="name" value={initialUserName} readOnly disabled className="mt-1.5" />
          )}
          {isCleaningSelected && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Слот займётся под уборку, часы с депозита не спишутся.
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" size="lg">Далее</Button>
      </div>
    </form>
  );
}
