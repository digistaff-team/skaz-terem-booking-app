import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { rooms } from "@/data/rooms";
import { Room, BookingFormData, Booking } from "@/types/booking";
import { addBooking, isTimeSlotAvailable, getConflictingBookings } from "@/lib/bookingStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Clock, Home, Check, Zap } from "lucide-react";

type Step = "room" | "date" | "time" | "details" | "confirm";

const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => {
  const h = 8 + i;
  return `${h.toString().padStart(2, "0")}:00`;
});

const BookingFlow = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("room");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<Partial<BookingFormData>>({});
  const [isBooking, setIsBooking] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingBookings, setConflictingBookings] = useState<Booking[]>([]);
  const [conflictTime, setConflictTime] = useState({ start: "", end: "" });
  const [isCheckingNow, setIsCheckingNow] = useState(false);

  // Проверяем, есть ли room в URL — сразу переходим к выбору даты
  useEffect(() => {
    const roomId = searchParams.get("room");
    if (roomId) {
      const room = rooms.find((r) => r.id === roomId);
      if (room) {
        setSelectedRoom(room);
        setFormData((p) => ({ ...p, roomId: room.id }));
        setStep("date");
      }
    }
  }, []);

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

  const handleNowSelect = async () => {
    if (!selectedRoom) return;
    setIsCheckingNow(true);
    try {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const currentHour = now.getHours();

      // Определяем время начала (следующий полный час)
      let startHour: number;
      if (currentHour < 8) {
        startHour = 8;
      } else if (currentHour >= 21) {
        toast.error("Сегодня уже нельзя забронировать — осталось менее часа до закрытия");
        return;
      } else {
        startHour = currentHour + 1;
      }

      const startTime = `${startHour.toString().padStart(2, "0")}:00`;

      // Проверяем, свободно ли хотя бы на 1 час
      const oneHourEnd = `${(startHour + 1).toString().padStart(2, "0")}:00`;
      const isFree = await isTimeSlotAvailable(selectedRoom.id, today, startTime, oneHourEnd);

      if (!isFree) {
        // Занято — показываем конфликты
        const conflicts = await getConflictingBookings(selectedRoom.id, today, startTime, "22:00");
        setConflictingBookings(conflicts);
        setConflictTime({ start: startTime, end: "22:00" });
        setShowConflictDialog(true);
      } else {
        // Свободно — переходим к выбору времени окончания
        setFormData((p) => ({
          ...p,
          date: today,
          startTime,
        }));
        setStep("time");
      }
    } catch (err: any) {
      toast.error("Ошибка при проверке: " + err.message);
    } finally {
      setIsCheckingNow(false);
    }
  };

  const handleTimeSelect = async (startTime: string, endTime: string) => {
    if (!selectedRoom || !formData.date) return;
    const available = await isTimeSlotAvailable(selectedRoom.id, formData.date, startTime, endTime);
    if (!available) {
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

  const handleConfirm = async () => {
    if (!selectedRoom || !formData.date || !formData.startTime || !formData.endTime || !formData.title || !formData.userName) return;
    if (isBooking) return;

    setIsBooking(true);

    try {
      await addBooking({
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
    } catch (err: any) {
      toast.error("Ошибка при бронировании: " + err.message);
      setIsBooking(false);
    }
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
        <div className="mb-8">
          <button onClick={goBack} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Назад
          </button>
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

        {step === "date" && (
          <div>
            <h2 className="mb-1 text-2xl font-bold text-foreground">
              <CalendarDays className="inline h-6 w-6 mr-2" />Выберите дату
            </h2>
            <p className="mb-2 text-lg font-semibold text-primary">{selectedRoom?.icon} {selectedRoom?.name}</p>
            <p className="mb-6 text-muted-foreground">Когда вам нужно помещение?</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {/* Сейчас */}
              <button
                onClick={handleNowSelect}
                disabled={isCheckingNow}
                className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-left transition-all hover:shadow-md hover:border-primary/50 disabled:opacity-60"
              >
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" />
                  {isCheckingNow ? "Проверяю..." : "Сейчас"}
                </p>
                <p className="text-sm text-muted-foreground">Моментальная бронь</p>
              </button>
              {/* Сегодня */}
              {(() => {
                const d = new Date();
                const dateStr = d.toISOString().split("T")[0];
                return (
                  <button
                    onClick={() => handleDateSelect(dateStr)}
                    className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30"
                  >
                    <p className="font-semibold text-foreground">Сегодня</p>
                    <p className="text-sm text-muted-foreground">
                      {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </p>
                  </button>
                );
              })()}
              {/* Завтра */}
              {(() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                const dateStr = d.toISOString().split("T")[0];
                return (
                  <button
                    onClick={() => handleDateSelect(dateStr)}
                    className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30"
                  >
                    <p className="font-semibold text-foreground">Завтра</p>
                    <p className="text-sm text-muted-foreground">
                      {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </p>
                  </button>
                );
              })()}
              {/* Послезавтра */}
              {(() => {
                const d = new Date();
                d.setDate(d.getDate() + 2);
                const dateStr = d.toISOString().split("T")[0];
                return (
                  <button
                    onClick={() => handleDateSelect(dateStr)}
                    className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30"
                  >
                    <p className="font-semibold text-foreground">Послезавтра</p>
                    <p className="text-sm text-muted-foreground">
                      {d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                    </p>
                  </button>
                );
              })()}
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

        {step === "time" && <TimeStep
          date={formData.date!}
          roomId={selectedRoom!.id}
          roomName={selectedRoom!.name}
          roomIcon={selectedRoom!.icon}
          formatDate={formatDate}
          onSelect={handleTimeSelect}
          initialStartTime={formData.startTime || null}
        />}

        {step === "details" && <DetailsStep onSubmit={handleDetailsSubmit} />}

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
            <Button
              onClick={handleConfirm}
              className="w-full"
              size="lg"
              disabled={isBooking}
            >
              {isBooking ? (
                <span className="animate-pulse">
                  Бронирую {selectedRoom.name}...
                </span>
              ) : (
                "Подтвердить бронирование"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Dialog: помещение занято */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⛔ Помещение занято</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              {selectedRoom?.icon} {selectedRoom?.name} занято с {conflictTime.start} до {conflictTime.end}:
            </p>
            <div className="space-y-3">
              {conflictingBookings.map((b) => (
                <div key={b.id} className="rounded-lg border border-border bg-muted/50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {b.startTime} — {b.endTime}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{b.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ответственный: {b.userName}
                  </p>
                  {b.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {b.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button
              onClick={() => setShowConflictDialog(false)}
              className="w-full"
            >
              Выбрать другое время
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function TimeStep({ date, roomId, roomName, roomIcon, formatDate, onSelect, initialStartTime }: {
  date: string;
  roomId: string;
  roomName: string;
  roomIcon: string;
  formatDate: (d: string) => string;
  onSelect: (start: string, end: string) => void;
  initialStartTime?: string | null;
}) {
  const [startTime, setStartTime] = useState<string | null>(initialStartTime || null);
  const [availableEndSlots, setAvailableEndSlots] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  // Если startTime уже задан (режим "Сейчас"), сразу проверяем слоты окончания
  useEffect(() => {
    if (initialStartTime && !startTime) {
      setStartTime(initialStartTime);
    }
  }, [initialStartTime]);

  useEffect(() => {
    if (startTime) {
      const checkEndSlots = async () => {
        setIsChecking(true);
        setAvailableEndSlots([]);
        const endSlots = TIME_SLOTS.filter((s) => s > startTime);
        try {
          const available = await Promise.all(
            endSlots.map(async (end) => {
              const isAvail = await isTimeSlotAvailable(roomId, date, startTime, end);
              return isAvail ? end : null;
            })
          );
          const filtered = available.filter(Boolean) as string[];
          setAvailableEndSlots(filtered);
        } catch (err) {
          console.error("[TimeSlot check] Error:", err);
        } finally {
          setIsChecking(false);
        }
      };
      checkEndSlots();
    }
  }, [startTime, date, roomId]);

  const handleStartSelect = async (t: string) => {
    setStartTime(t);
    setIsChecking(true);
    setAvailableEndSlots([]);
    const endSlots = TIME_SLOTS.filter((s) => s > t);
    try {
      const available = await Promise.all(
        endSlots.map(async (end) => {
          const isAvail = await isTimeSlotAvailable(roomId, date, t, end);
          return isAvail ? end : null;
        })
      );
      const filtered = available.filter(Boolean) as string[];
      setAvailableEndSlots(filtered);
    } catch (err) {
      console.error("[handleStartSelect] Error:", err);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-foreground">
        <Clock className="inline h-6 w-6 mr-2" />
        {startTime ? "Время окончания" : "Время начала"}
      </h2>
      <p className="mb-2 text-lg font-semibold text-primary">{roomIcon} {roomName}</p>
      <p className="mb-6 text-muted-foreground">{formatDate(date)}</p>

      {!startTime ? (
        <div className="grid grid-cols-3 gap-2">
          {(() => {
            // Фильтруем прошедшие слоты, если дата — сегодня
            const today = new Date().toISOString().split("T")[0];
            const isToday = date === today;
            const currentHour = new Date().getHours();
            const visibleSlots = isToday
              ? TIME_SLOTS.filter((t) => parseInt(t) > currentHour)
              : TIME_SLOTS;

            if (visibleSlots.length === 0) {
              return (
                <div className="col-span-3 text-center py-6 text-muted-foreground">
                  <p>Сегодня время уже прошло</p>
                </div>
              );
            }

            return visibleSlots.map((t) => (
              <button
                key={t}
                onClick={() => handleStartSelect(t)}
                className="rounded-lg border border-border bg-card px-3 py-3 text-center font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
              >
                {t}
              </button>
            ));
          })()}
        </div>
      ) : (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Начало: <span className="font-semibold text-foreground">{startTime}</span>
            <button onClick={() => { setStartTime(null); setAvailableEndSlots([]); }} className="ml-2 text-primary hover:underline">изменить</button>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {availableEndSlots.map((t) => (
              <button
                key={t}
                onClick={() => onSelect(startTime, t)}
                className="rounded-lg border border-border bg-card px-3 py-3 text-center font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
              >
                {t}
              </button>
            ))}
          </div>
          {isChecking ? (
            <p className="text-sm text-muted-foreground animate-pulse">
              ⏳ Проверяю, свободно ли помещение в это время...
            </p>
          ) : availableEndSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет доступных слотов после {startTime}</p>
          ) : null}
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
