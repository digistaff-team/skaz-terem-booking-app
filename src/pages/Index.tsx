import { useState } from "react";
import { Link } from "react-router-dom";
import { rooms } from "@/data/rooms";
import RoomCard from "@/components/RoomCard";
import { useNavigate } from "react-router-dom";
import { Room } from "@/types/booking";
import { CalendarDays, BookOpen, ClipboardList, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";


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
            <DialogContent className="max-w-lg h-dvh flex flex-col">
              <DialogHeader>
                <DialogTitle>Правила Сказочного Терема</DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 text-sm text-foreground leading-relaxed">
                <p className="text-muted-foreground">Дорогие гости! Добро пожаловать в общественное пространство ПРП «Сказочный край». Чтобы ваше пребывание было комфортным, просим ознакомиться с правилами:</p>
                {[
                  "Сказочный терем рад принять гостей по предварительной записи.",
                  "Перед въездом на участок оборудована большая парковка. Просьба оставлять машины на ней. На территорию заезжают только машины для разгрузочных работ.",
                  "Вы можете воспользоваться любой из трёх комнат на втором этаже, первым этажом, либо всем Теремом.",
                  "Для обеспечения безопасности в Тереме функционируют камеры видеонаблюдения.",
                  "У Терема есть хранитель — шикарный рыжий кот Персик. Пожалуйста, относитесь к нему с уважением. Кот с характером, гладить его можно только если он сам к вам подошёл. Особенно он не любит быть игрушкой для детей — может за себя постоять.",
                  "Перед посещением Терема убедитесь, что ваши питомцы остались дома.",
                  "После посещения проверьте, чтобы все помещения, которыми вы пользовались, остались в таком же порядке, как были до вас. Для уборки можно воспользоваться пылесосом, шваброй и тряпочками из кладовки (около пианино).",
                  "Если пользовались мебелью — передвигали, раскладывали — расставьте её по местам. Посуду и стол после использования обязательно вымойте. Все принесённые вещи и посуду сразу заберите с собой.",
                  "Для чаепития вы можете угощаться чаями и «Дубреем» (в верхнем левом ящике кухни), а также вкусняшками из шкафов и холодильника. Оставить угощения можно в закрытой таре — чтобы Персик не добрался 😉",
                  "В Тереме раздельный сбор мусора. Био-отходы собираем в отдельное ведёрко. Если оно наполнено — вынесите в компостер (за бамбуком, позади дома).",
                  "Любые трапезы (застолья, чаепития, перекусы) возможны только на первом этаже. Все комнаты на втором этаже используются исключительно без еды и напитков.",
                  "Во время пребывания держите закрытыми двери в техническое помещение, ванную комнату и комнаты на 2-м этаже.",
                  "Перед уходом проверьте, чтобы все светильники и электроприборы были выключены, окна закрыты.",
                  "Пожалуйста, бережно относитесь к пространству Терема, хрупким вещам и технике.",
                  "В случае непредвиденных обстоятельств свяжитесь с управляющей Ольгой: +7 (989) 249-63-18 (WhatsApp, Telegram). Будьте готовы возместить ущерб, если таковой случился.",
                ].map((rule, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-primary shrink-0">🏡</span>
                    <p>{rule}</p>
                  </div>
                ))}
                <p className="pt-2 text-center text-muted-foreground">Желаем приятного пребывания в Тереме! 🤗</p>
              </div>
            </DialogContent>
          </Dialog>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Куратор: Ольга Шанина{" "}
        <a href="tel:+79892496318" className="inline-flex items-center gap-1 text-primary hover:underline">
          <Phone className="h-3 w-3" />
          +7 (989) 249-63-18
        </a>
      </footer>
    </div>
  );
};

export default Index;
