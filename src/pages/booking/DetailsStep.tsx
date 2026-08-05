import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DetailsStepProps {
  onSubmit: (title: string, desc: string, name: string) => void;
  userName: string;
}

const isRespFieldEditable = import.meta.env.VITE_EDIT_RESP_FIELD === "true";

export function DetailsStep({ onSubmit, userName: initialUserName }: DetailsStepProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [userName, setUserName] = useState(initialUserName);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Введите название мероприятия");
      return;
    }
    onSubmit(title.trim(), description.trim(), userName.trim());
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
          <Input
            id="name"
            value={userName}
            onChange={isRespFieldEditable ? (e) => setUserName(e.target.value) : undefined}
            readOnly={!isRespFieldEditable}
            disabled={!isRespFieldEditable}
            className="mt-1.5"
          />
        </div>
        <Button type="submit" className="w-full" size="lg">Далее</Button>
      </div>
    </form>
  );
}
