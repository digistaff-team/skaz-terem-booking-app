import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useAuth, getUserName } from "@/lib/auth";
import { getMaxBookingDate, getMaxDateErrorMessage } from "@/config/bookingLimits";
import { getErrorMessage } from "@/lib/utils";
import { toLocalISODate, localISODateInDays, currentTimeHHMM, formatDateLong } from "@/lib/dates";
import { STEP_ORDER, isIOS, type Step } from "./constants";
import { TimeStep } from "./TimeStep";
import { DetailsStep } from "./DetailsStep";

const BookingFlow = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>("room");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [formData, setFormData] = useState<Partial<BookingFormData>>({});
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingBookings, setConflictingBookings] = useState<Booking[]>([]);
  const [conflictTime, setConflictTime] = useState({ start: "", end: "" });
  const [isCheckingNow, setIsCheckingNow] = useState(false);
  const [pendingDate, setPendingDate] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const bookMutation = useMutation({
    mutationFn: (payload: Omit<Booking, "id" | "createdAt" | "status">) => addBooking(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myBookings"] });
      queryClient.invalidateQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["monthBookings"] });
      queryClient.invalidateQueries({ queryKey: ["personalMonthBookings"] });
    },
  });

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
    const today = toLocalISODate();
    if (date < today) {
      toast.error("Эта дата в прошлом, выберите другую");
      return;
    }
    if (date > getMaxBookingDate()) {
      toast.error(getMaxDateErrorMessage());
      return;
    }
    setFormData((p) => ({ ...p, date }));
    setStep("time");
  };

  const handleNowSelect = async () => {
    if (!selectedRoom) return;
    const now = new Date();
    const today = toLocalISODate(now);
    if (today > getMaxBookingDate()) {
      toast.error(getMaxDateErrorMessage());
      return;
    }
    setIsCheckingNow(true);
    try {
      const startTime = currentTimeHHMM(now);

      // Проверяем, свободно ли хотя бы на 30 минут
      const checkEndTime = currentTimeHHMM(new Date(now.getTime() + 30 * 60 * 1000));
      const isFree = await isTimeSlotAvailable(selectedRoom.id, today, startTime, checkEndTime);

      if (!isFree) {
        // Занято — показываем конфликты
        const conflicts = await getConflictingBookings(selectedRoom.id, today, startTime, "24:00");
        setConflictingBookings(conflicts);
        setConflictTime({ start: startTime, end: "24:00" });
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
    } catch (err) {
      toast.error("Ошибка при проверке: " + getErrorMessage(err));
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

  const handleDetailsSubmit = (title: string, description: string, name: string) => {
    const userName = name || (user ? getUserName(user) : "Гость");
    setFormData((p) => ({ ...p, title, description, userName }));
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!selectedRoom || !formData.date || !formData.startTime || !formData.endTime || !formData.title || !formData.userName) return;
    if (bookMutation.isPending) return;

    try {
      await bookMutation.mutateAsync({
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        title: formData.title,
        description: formData.description || "",
        userName: formData.userName || getUserName(user),
      });

      toast.success("Помещение успешно забронировано!\nКод от ключницы — в карточке брони.");
      navigate("/account");
    } catch (err) {
      toast.error("Ошибка при бронировании: " + getErrorMessage(err));
    }
  };

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      const prevStep = STEP_ORDER[idx - 1];
      if (step === "time" || prevStep === "time") {
        setFormData(p => ({ ...p, startTime: "", endTime: "" }));
      }
      setStep(prevStep);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <button onClick={goBack} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Назад
          </button>
          <div className="flex items-center gap-2 mb-6">
            {STEP_ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`h-2 w-8 rounded-full transition-colors ${
                  STEP_ORDER.indexOf(step) >= i
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
              {/* Сегодня / Завтра / Послезавтра */}
              {(["Сегодня", "Завтра", "Послезавтра"] as const).map((label, offset) => {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                return (
                  <button
                    key={label}
                    onClick={() => handleDateSelect(localISODateInDays(offset))}
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
                min={toLocalISODate()}
                max={getMaxBookingDate()}
                value={pendingDate}
                onChange={(e) => {
                  setPendingDate(e.target.value);
                  if (!isIOS && e.target.value) handleDateSelect(e.target.value);
                }}
                onBlur={(e) => {
                  if (isIOS && e.target.value) handleDateSelect(e.target.value);
                }}
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
          onSelect={handleTimeSelect}
          initialStartTime={formData.startTime || null}
        />}

        {step === "details" && <DetailsStep onSubmit={handleDetailsSubmit} userName={user ? getUserName(user) : ""} />}

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
                  <p className="font-semibold text-foreground">{formatDateLong(formData.date!)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Время</p>
                  <p className="font-semibold text-foreground">
                    {formData.startTime} — {formData.endTime}
                  </p>
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
              disabled={bookMutation.isPending}
            >
              {bookMutation.isPending ? (
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

export default BookingFlow;
