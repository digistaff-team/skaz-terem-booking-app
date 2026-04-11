import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { rooms } from "@/data/rooms";
import { Room, BookingFormData } from "@/types/booking";
import { addBooking, isTimeSlotAvailable } from "@/lib/bookingStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Clock, Home, Check } from "lucide-react";

type Step = "room" | "date" | "time" | "details" | "confirm";

const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => {
  const h = 8 + i;
  return `${h.toString().padStart(2, "0")}:00`;
});

const BookingFlow = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("room");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<Partial<BookingFormData>>({});

  const handleRoomSelect = (room: Room) => {
    setSelectedRoom(room);
    setFormData((p) => ({ ...p, roomId: room.id }));
    setStep("date");
  };

  const handleDateSelect = (date: string) => {
    const today = new Date().toISOString().split("T")[0];
    if (date < today) {
      toast.error("Эта дата в прошлом, выберите другую");
      return;
    }
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    if (date > maxDate.toISOString().split("T")[0]) {
      toast.error("Бронирование возможно не более чем на 90 дней вперёд");
      return;
    }
    setFormData((p) => ({ ...p, date }));
    setStep("time");
  };

  const handleTimeSelect = (startTime: string, endTime: string) => {
    if (!selectedRoom || !formData.date) return;
    if (!isTimeSlotAvailable(selectedRoom.id, formData.date, startTime, endTime)) {
      toast.error("Это время уже занято, выберите другое");
      return;
    }
    setFormData((p) => ({ ...p, startTime, endTime }));
    setStep("details");
  };

  const handleDetailsSubmit = (title: string, description: string, userName: string) => {
    setFormData((p) => ({ ...p, title, description, userName }));
    setStep("confirm");
  };

  const handleConfirm = () => {
    if (!selectedRoom || !formData.date || !formData.startTime || !formData.endTime || !formData.title || !formData.userName) return;

    addBooking({
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      title: formData.title,
      description: formData.description || "",
      userName: formData.userName,
    });

    toast.success("Помещение успешно забронировано!");
    navigate("/bookings");
  };

  const goBack = () => {
    const steps: Step[] = ["room", "date", "time", "details", "confirm"];
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
    else navigate("/");
  };

  const formatDate = (d: string) => {
    return new Date(d + "T12:00:00").toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button onClick={goBack} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Назад
          </button>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-6">
            {["room", "date", "time", "details", "confirm"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-2 w-8 rounded-full transition-colors ${
                  ["room", "date", "time", "details", "confirm"].indexOf(step) >= i
                    ? "bg-primary"
                    : "bg-border"
                }`} />
              </div>
            ))}
          </div>
        </div>

        {/* Step: Room */}
        {step === "room" && (
          <div>
            <h2 className="mb-1 text-2xl font-bold text-foreground">Выберите помещение</h2>
            <p className="mb-6 text-muted-foreground">Какое пространство вам подходит?</p>
            <div className="space-y-3">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => handleRoomSelect(room)}
                  className="w-full flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30"
                >
                  <span className="text-2xl">{room.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">{room.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{room.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{room.area} м²</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Date */}
        {step === "date" && (
          <div>
            <h2 className="mb-1 text-2xl font-bold text-foreground">
              <CalendarDays className="inline h-6 w-6 mr-2" />Выберите дату
            </h2>
            <p className="mb-6 text-muted-foreground">{selectedRoom?.name}</p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: "Сегодня", offset: 0 },
                { label: "Завтра", offset: 1 },
                { label: "Послезавтра", offset: 2 },
              ].map(({ label, offset }) => {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                const dateStr = d.toISOString().split("T")[0];
                return (
                  <button
                    key={label}
                    onClick={() => handleDateSelect(dateStr)}
                    className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30"
                  >
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="text-sm text-muted-foreground">
                      {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </p>
                  </button>
                );
              })}
            </div>

            <div>
              <Label htmlFor="custom-date" className="text-sm text-muted-foreground">
                Или выберите другую дату
              </Label>
              <Input
                id="custom-date"
                type="date"
                min={new Date().toISOString().split("T")[0]}
                max={(() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().split("T")[0]; })()}
                onChange={(e) => handleDateSelect(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
        )}

        {/* Step: Time */}
        {step === "time" && <TimeStep
          date={formData.date!}
          roomId={selectedRoom!.id}
          roomName={selectedRoom!.name}
          formatDate={formatDate}
          onSelect={handleTimeSelect}
        />}

        {/* Step: Details */}
        {step === "details" && <DetailsStep onSubmit={handleDetailsSubmit} />}

        {/* Step: Confirm */}
        {step === "confirm" && selectedRoom && (
          <div>
            <h2 className="mb-6 text-2xl font-bold text-foreground">
              <Check className="inline h-6 w-6 mr-2" />Подтвердите бронирование
            </h2>

            <div className="rounded-xl border border-border bg-card p-6 space-y-4 mb-6">
              <div className="flex items-center gap-3">
                <Home className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Помещение</p>
                  <p className="font-semibold text-foreground">{selectedRoom.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Дата</p>
                  <p className="font-semibold text-foreground">{formatDate(formData.date!)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Время</p>
                  <p className="font-semibold text-foreground">{formData.startTime} — {formData.endTime}</p>
                </div>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">Мероприятие</p>
                <p className="font-semibold text-foreground">{formData.title}</p>
                {formData.description && <p className="text-sm text-muted-foreground mt-1">{formData.description}</p>}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ответственный</p>
                <p className="font-semibold text-foreground">{formData.userName}</p>
              </div>
            </div>

            <Button onClick={handleConfirm} className="w-full" size="lg">
              Подтвердить бронирование
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

function TimeStep({ date, roomId, roomName, formatDate, onSelect }: {
  date: string;
  roomId: string;
  roomName: string;
  formatDate: (d: string) => string;
  onSelect: (start: string, end: string) => void;
}) {
  const [startTime, setStartTime] = useState<string | null>(null);

  const endSlots = startTime
    ? TIME_SLOTS.filter((t) => t > startTime && isTimeSlotAvailable(roomId, date, startTime, t))
    : [];

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-foreground">
        <Clock className="inline h-6 w-6 mr-2" />
        {startTime ? "Время окончания" : "Время начала"}
      </h2>
      <p className="mb-6 text-muted-foreground">{roomName} · {formatDate(date)}</p>

      {!startTime ? (
        <div className="grid grid-cols-3 gap-2">
          {TIME_SLOTS.map((t) => (
            <button
              key={t}
              onClick={() => setStartTime(t)}
              className="rounded-lg border border-border bg-card px-3 py-3 text-center font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
            >
              {t}
            </button>
          ))}
        </div>
      ) : (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Начало: <span className="font-semibold text-foreground">{startTime}</span>
            <button onClick={() => setStartTime(null)} className="ml-2 text-primary hover:underline">изменить</button>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {endSlots.map((t) => (
              <button
                key={t}
                onClick={() => onSelect(startTime, t)}
                className="rounded-lg border border-border bg-card px-3 py-3 text-center font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
              >
                {t}
              </button>
            ))}
          </div>
          {endSlots.length === 0 && (
            <p className="text-sm text-muted-foreground">Нет доступных слотов после {startTime}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailsStep({ onSubmit }: { onSubmit: (title: string, desc: string, name: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [userName, setUserName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !userName.trim()) {
      toast.error("Заполните обязательные поля");
      return;
    }
    onSubmit(title.trim(), description.trim(), userName.trim());
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="mb-6 text-2xl font-bold text-foreground">Детали мероприятия</h2>
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
          <Label htmlFor="name">Ваше имя (ответственный) *</Label>
          <Input id="name" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Имя и фамилия" className="mt-1.5" />
        </div>
        <Button type="submit" className="w-full" size="lg">Далее</Button>
      </div>
    </form>
  );
}

export default BookingFlow;
