import { useState } from "react";
import { Link } from "react-router-dom";
import { rooms } from "@/data/rooms";
import RoomCard from "@/components/RoomCard";
import { useNavigate } from "react-router-dom";
import { Room } from "@/types/booking";
import { CalendarDays, BookOpen, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const RULES_DOC_URL = "https://docs.google.com/document/d/1IzZu5TbWXBxJ0GMgYMluc_rp9HMhgAQn23KK56HiuHQ/preview";

const Index = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [rulesOpen, setRulesOpen] = useState(false);

  const handleRoomSelect = (room: Room) => {
    if (!isAuthenticated) {
      toast.info("Для бронирования откройте приложение через бота @SkazTerem_bot");
      return;
    }
    navigate(`/book?room=${room.id}`);
  };

  const handleBookClick = (e: React.MouseEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      toast.info("Для бронирования откройте приложение через бота @SkazTerem_bot");
    }
  };

  return (
    <div className="min-h-screen warm-glow">
      {/* Hero */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏡</span>
            <h1 className="text-xl font-bold text-foreground">Сказочный Терем</h1>
          </div>
          <div className="flex gap-2">
            {isAuthenticated ? (
              <Link to="/bookings">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <ClipboardList className="h-4 w-4" /> Мои брони
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => toast.info("Для бронирования откройте приложение через бота @SkazTerem_bot")}>
                <ClipboardList className="h-4 w-4" /> Мои брони
              </Button>
            )}
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-5xl px-4 py-10">
        {/* Welcome */}
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold text-foreground sm:text-4xl">
            Забронируйте и приходите
          </h2>
          <p className="mx-auto max-w-lg text-muted-foreground">
            Уютное место для работы, встреч, мастер-классов и праздников. Выберите помещение и забронируйте заранее.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/book" onClick={handleBookClick}>
              <Button size="lg" className="gap-2">
                <CalendarDays className="h-5 w-5" /> Забронировать
              </Button>
            </Link>
            <Link to="/schedule">
              <Button variant="outline" size="lg" className="gap-2">
                <BookOpen className="h-5 w-5" /> Расписание
              </Button>
            </Link>
          </div>
        </div>

        {/* Rooms */}
        <section>
          <h3 className="mb-5 text-xl font-semibold text-foreground">Наши помещения</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} onSelect={handleRoomSelect} />
            ))}
          </div>
        </section>

        {/* Info section */}
        <section className="mt-12 rounded-xl border border-border bg-card p-6">
          <h3 className="mb-3 text-lg font-semibold text-foreground">📋 Общие правила</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>🏡 Посещение по предварительной записи</li>
            <li>🍽️ Приём пищи только на 1-м этаже</li>
            <li>🧹 После посещения оставьте помещение в порядке</li>
            <li>🐱 Кот Персик — хранитель Терема. Будьте с ним уважительны</li>
          </ul>
          <button
            onClick={() => setRulesOpen(true)}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            Полные правила →
          </button>

          <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
            <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Правила Сказочного Терема</DialogTitle>
              </DialogHeader>
              <iframe
                src={RULES_DOC_URL}
                className="flex-1 min-h-0 w-full rounded border-0"
                title="Правила"
              />
            </DialogContent>
          </Dialog>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Куратор: Ольга Шанина +7 (989) 249-63-18
      </footer>
    </div>
  );
};

export default Index;
