import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getBookingsForDate } from "@/lib/bookingStore";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, CalendarDays } from "lucide-react";
import { ru } from "date-fns/locale";
import { format, addDays } from "date-fns";

function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function formatDisplayDate(dateStr: string): string {
  const today = toISODate(new Date());
  const tomorrow = toISODate(addDays(new Date(), 1));
  if (dateStr === today) return "Сегодня";
  if (dateStr === tomorrow) return "Завтра";
  return format(new Date(dateStr), "d MMMM", { locale: ru });
}

function parseEventTitle(title: string): string {
  const parts = title.split(" | ");
  return parts.length >= 2 ? parts[1] : title;
}

const Schedule = () => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>(toISODate(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["schedule", selectedDate],
    queryFn: () => getBookingsForDate(selectedDate),
  });

  return (
    <div className="min-h-screen warm-glow">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Расписание</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {/* Date selector */}
        <div className="flex items-center gap-2">
          <Button
            variant={selectedDate === toISODate(new Date()) ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedDate(toISODate(new Date()))}
          >
            Сегодня
          </Button>
          <Button
            variant={selectedDate === toISODate(addDays(new Date(), 1)) ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedDate(toISODate(addDays(new Date(), 1)))}
          >
            Завтра
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {selectedDate !== toISODate(new Date()) && selectedDate !== toISODate(addDays(new Date(), 1))
                  ? format(new Date(selectedDate), "d MMM", { locale: ru })
                  : "Дата"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(selectedDate)}
                onSelect={(d) => {
                  if (d) {
                    setSelectedDate(toISODate(d));
                    setCalendarOpen(false);
                  }
                }}
                locale={ru}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Date heading */}
        <h2 className="text-base font-medium text-muted-foreground">
          {formatDisplayDate(selectedDate)}
          {selectedDate !== toISODate(new Date()) && selectedDate !== toISODate(addDays(new Date(), 1)) &&
            `, ${format(new Date(selectedDate), "EEEE", { locale: ru })}`}
        </h2>

        {/* Bookings list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : bookings.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Нет бронирований на этот день
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-border bg-card p-4 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {b.startTime} — {b.endTime}
                  </span>
                  <span className="text-xs text-muted-foreground">{b.roomName}</span>
                </div>
                <p className="text-sm text-foreground">{parseEventTitle(b.title)}</p>
                <p className="text-xs text-muted-foreground">{b.userName}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Schedule;
