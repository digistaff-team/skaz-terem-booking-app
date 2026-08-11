import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getActiveBookingsForRoomDate } from "@/lib/bookingStore";
import { toLocalISODate, formatDateLong } from "@/lib/dates";
import { TIME_SLOTS, isStartBlocked, getAvailableEndSlots } from "@/lib/timeSlots";
import { isIOS } from "./constants";

interface TimeStepProps {
  date: string;
  roomId: string;
  roomName: string;
  roomIcon: string;
  onSelect: (start: string, end: string) => void;
  initialStartTime?: string | null;
  isAdmin?: boolean;
}

export function TimeStep({ date, roomId, roomName, roomIcon, onSelect, initialStartTime, isAdmin }: TimeStepProps) {
  const [startTime, setStartTime] = useState<string | null>(initialStartTime || null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { data: existingBookings = [], isLoading: isLoadingBookings } = useQuery({
    queryKey: ["roomBookings", roomId, date],
    queryFn: () => getActiveBookingsForRoomDate(roomId, date),
  });

  const availableEndSlots = startTime ? getAvailableEndSlots(existingBookings, startTime) : [];

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-foreground">
        <Clock className="inline h-6 w-6 mr-2" />
        {startTime ? "Время окончания" : "Время начала"}
      </h2>
      <p className="mb-2 text-lg font-semibold text-primary">{roomIcon} {roomName}</p>
      <p className="mb-6 text-muted-foreground">{formatDateLong(date)}</p>

      {isLoadingBookings ? (
        <p className="text-sm text-muted-foreground animate-pulse">⏳ Загружаю расписание...</p>
      ) : !startTime ? (
        <>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {(() => {
              const today = toLocalISODate();
              const isToday = date === today;
              const currentHour = new Date().getHours();
              const visibleSlots = (isToday && !isAdmin
                ? TIME_SLOTS.filter((t) => parseInt(t) > currentHour)
                : TIME_SLOTS
              ).filter((t) => !isStartBlocked(existingBookings, t));

              if (visibleSlots.length === 0) {
                return (
                  <div className="col-span-3 text-center py-6 text-muted-foreground">
                    <p>На этот день нет свободного времени</p>
                  </div>
                );
              }

              return visibleSlots.map((t) => (
                <button
                  key={t}
                  onClick={() => setStartTime(t)}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-center font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
                >
                  {t}
                </button>
              ));
            })()}
          </div>
          <div>
            <Label htmlFor="custom-start-time" className="text-sm text-muted-foreground">
              Или выберите другое время
            </Label>
            <Input
              id="custom-start-time"
              type="time"
              value={customStart}
              onChange={(e) => {
                const val = e.target.value;
                setCustomStart(val);
                if (!isIOS && val && val.split(":")[1] !== "00") {
                  if (isStartBlocked(existingBookings, val)) {
                    toast.error("Это время уже занято");
                  } else {
                    setStartTime(val);
                  }
                }
              }}
              onBlur={() => {
                if (!isIOS || !customStart) return;
                if (isStartBlocked(existingBookings, customStart)) {
                  toast.error("Это время уже занято");
                  setCustomStart("");
                } else {
                  setStartTime(customStart);
                }
              }}
              className="mt-2"
            />
          </div>
        </>
      ) : (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Начало: <span className="font-semibold text-foreground">{startTime}</span>
            <button onClick={() => setStartTime(null)} className="ml-2 text-primary hover:underline">изменить</button>
          </p>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {availableEndSlots.map((t) => (
              <button
                key={t}
                onClick={() => onSelect(startTime, t)}
                className="rounded-lg border border-border bg-card px-3 py-3 text-center font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5"
              >
                {t}
              </button>
            ))}
            {availableEndSlots.length === 0 && (
              <p className="col-span-3 text-sm text-muted-foreground">Нет доступных слотов после {startTime}</p>
            )}
          </div>
          <div>
            <Label htmlFor="custom-end-time" className="text-sm text-muted-foreground">
              Или выберите другое время
            </Label>
            <Input
              id="custom-end-time"
              type="time"
              value={customEnd}
              onChange={(e) => {
                const val = e.target.value;
                setCustomEnd(val);
                if (!isIOS && val && val.split(":")[1] !== "00") {
                  if (val <= startTime) {
                    toast.error("Время окончания должно быть позже начала");
                    return;
                  }
                  if (existingBookings.some((b) => b.startTime < val && b.endTime > startTime)) {
                    toast.error("Это время уже занято");
                    return;
                  }
                  onSelect(startTime, val);
                }
              }}
              onBlur={() => {
                if (!isIOS || !customEnd) return;
                if (customEnd <= startTime) {
                  toast.error("Время окончания должно быть позже начала");
                  setCustomEnd("");
                  return;
                }
                if (existingBookings.some((b) => b.startTime < customEnd && b.endTime > startTime)) {
                  toast.error("Это время уже занято");
                  setCustomEnd("");
                  return;
                }
                onSelect(startTime, customEnd);
              }}
              className="mt-2"
            />
          </div>
        </div>
      )}
    </div>
  );
}
