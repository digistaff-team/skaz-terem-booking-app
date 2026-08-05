import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { adminListUsers, adminUserName } from "@/lib/adminStore";

interface DetailsStepProps {
  onSubmit: (title: string, desc: string, name: string, onBehalfOfChatId?: number) => void;
  userName: string;
}

const respFieldEditEnabled = import.meta.env.VITE_EDIT_RESP_FIELD === "true";

// Стили нативного <select> в тон Input (см. Admin.tsx)
const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export function DetailsStep({ onSubmit, userName: initialUserName }: DetailsStepProps) {
  const { user } = useAuth();
  const isRespFieldEditable = respFieldEditEnabled && !!user?.isAdmin;
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
  const displayName = selectedUser ? adminUserName(selectedUser) : initialUserName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Введите название мероприятия");
      return;
    }
    onSubmit(
      title.trim(),
      description.trim(),
      displayName.trim(),
      selectedUser ? selectedUser.chatId : undefined
    );
  };

  return (
    <form onSubmit={handleSubmit} style={{ paddingBottom: keyboardOffset }}>
      <h2 className="mb-6 text-2xl font-bold text-foreground">Детали бронирования</h2>
      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Название мероприятия *</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Мастер-класс по живописи" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="desc">Описание</Label>
          <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Краткое описание (необязательно)" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="name">Ответственный</Label>
          {isRespFieldEditable ? (
            <select
              id="name"
              className={selectClass + " mt-1.5"}
              value={onBehalfChatId}
              onChange={(e) => setOnBehalfChatId(e.target.value)}
            >
              <option value="">Я сам ({initialUserName})</option>
              {users.map((u) => (
                <option key={u.chatId} value={String(u.chatId)}>
                  {adminUserName(u)}
                </option>
              ))}
            </select>
          ) : (
            <Input id="name" value={initialUserName} readOnly disabled className="mt-1.5" />
          )}
        </div>
        <Button type="submit" className="w-full" size="lg">Далее</Button>
      </div>
    </form>
  );
}
