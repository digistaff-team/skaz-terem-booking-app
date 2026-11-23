import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getActiveBookingsForRoomDate, getSchoolSlotForDate } from "@/lib/bookingStore";
import { toLocalISODate, formatDateLong } from "@/lib/dates";
import { TIME_SLOTS, isStartBlocked, getAvailableEndSlots } from "@/lib/timeSlots";
import { isIOS } from "./constants";
import { hapticTap, hapticWarning } from "@/lib/telegram";

const SCHOOL_BLOCKED_ROOM_ID = "floor-1-34";
const SCHOOL_BLOCKED_MESSAGE =
  "В часы работы Школы бронирование 1-го этажа недоступно";

// Помещения 2-го этажа, где во время уроков Школы показываем мягкое
// предупреждение (бронь не блокируем).
const SCHOOL_WARNING_ROOM_IDS = ["floor-2-hall-20", "floor-2-office-6"];
const SCHOOL_WARNING_MESSAGE =
  "В часы работы Школы просим не мешать ведению занятий🙏🏻";

/** Начало слота попадает в часы школы → блокируем выбор. */
function schoolBlocksStart(school: { start: string; end: string } | null, t: string): boolean {
  return !!school && t >= school.start && t < school.end;
}

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

  // Однократный hapticWarning за выбор (сбрасывается при смене startTime)
  const [schoolWarnedFor, setSchoolWarnedFor] = useState<string | null>(null);

  const warnSchoolBlockOnce = (key: string) => {
    if (schoolWarnedFor !== key) {
      hapticWarning();
      setSchoolWarnedFor(key);
    }
  };

  // Фактические часы школы на эту дату: берём из броней «Школа», которые
  // getActiveBookingsForRoomDate подтягивает для 1-го этажа. Во время каникул
  // такой брони нет — блокировка не действует.
  const schoolSlot = roomId === SCHOOL_BLOCKED_ROOM_ID
    ? (() => {
        const b = existingBookings.find((x) => x.title === "Школа");
        return b ? { start: b.startTime, end: b.endTime } : null;
      })()
    : null;
  /** Начало или пересечение окончания со школой → недоступно. */
  const blockedBySchool = (start: string, end: string) =>
    !!schoolSlot && start < schoolSlot.end && end > schoolSlot.start;

  // Часы работы Школы по расписанию — для помещений 2-го этажа показываем
  // мягкое предупреждение (не блокируем бронь), если время накладывается.
  const schoolWarningSlot = SCHOOL_WARNING_ROOM_IDS.includes(roomId)
    ? getSchoolSlotForDate(date)
    : null;
  const overlapsSchoolWarning = (start: string, end: string) =>
    !!schoolWarningSlot && start < schoolWarningSlot.end && end > schoolWarningSlot.start;

  // Зелёный баннер-предупреждение: показываем, когда выбранный интервал
  // пересекается с часами Школы. Пока окончание не выбрано, считаем концом
  // конец дня — если начало уже попало в часы школы, пересечение гарантировано
  // при любом окончании позже начала.
  const schoolWarningVisible = (() => {
    if (!schoolWarningSlot || !startTime) return false;
    const end = customEnd && customEnd > startTime ? customEnd : "23:59";
    return overlapsSchoolWarning(startTime, end);
  })();

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold text-foreground">
        <Clock className="inline h-6 w-6 mr-2" />
        {startTime ? "Время окончания" : "Время начала"}
      </h2>
      <p className="mb-2 text-lg font-semibold text-primary">{roomIcon} {roomName}</p>
      <p className="mb-6 text-muted-foreground">{formatDateLong(date)}</p>

      {schoolWarningVisible && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white"
        >
          {SCHOOL_WARNING_MESSAGE}
        </div>
      )}

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
              ).filter((t) => !isStartBlocked(existingBookings, t) && !schoolBlocksStart(schoolSlot, t));

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
                  onClick={() => { hapticTap(); setStartTime(t); }}
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
                if (!val) return;
                // Проверка школы — для любого времени (включая круглые часы).
                if (schoolBlocksStart(schoolSlot, val)) {
                  toast.error(SCHOOL_BLOCKED_MESSAGE);
                  return;
                }
                // Остальные проверки — только для некруглого времени
                // (круглые часы уже отфильтрованы в сетке кнопок).
                if (!isIOS && val.split(":")[1] !== "00") {
                  if (isStartBlocked(existingBookings, val)) {
                    toast.error("Это время уже занято");
                  } else {
                    setStartTime(val);
                  }
                }
              }}
              onBlur={() => {
                if (!customStart) return;
                if (schoolBlocksStart(schoolSlot, customStart)) {
                  toast.error(SCHOOL_BLOCKED_MESSAGE);
                  setCustomStart("");
                  return;
                }
                if (!isIOS || customStart.split(":")[1] === "00") return;
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
                onClick={() => {
                  if (blockedBySchool(startTime, t)) {
                    hapticWarning();
                    toast.error(SCHOOL_BLOCKED_MESSAGE);
                    return;
                  }
                  hapticTap();
                  onSelect(startTime, t);
                }}
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
                  if (blockedBySchool(startTime, val)) {
                    toast.error(SCHOOL_BLOCKED_MESSAGE);
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
                if (blockedBySchool(startTime, customEnd)) {
                  toast.error(SCHOOL_BLOCKED_MESSAGE);
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
