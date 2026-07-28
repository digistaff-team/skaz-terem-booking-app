import { Link } from "react-router-dom";
import { useAuth, getUserName } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import BookingsList from "@/components/BookingsList";
import { ArrowLeft, CircleDollarSign, BarChart3, ClipboardList } from "lucide-react";

const Account = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen warm-glow">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/" className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> На главную
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-foreground">Личный кабинет</h1>
        <p className="mb-6 text-muted-foreground">{getUserName(user)}{user?.username ? ` · @${user.username}` : ""}</p>

        {/* Мои бронирования */}
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Мои бронирования
          </h2>
          <BookingsList />
        </section>

        <div className="mt-8 space-y-3">
          <Link to="/book" className="block">
            <Button className="w-full" size="lg">Забронировать помещение</Button>
          </Link>
          {user?.isAdmin && (
            <>
              <Link to="/admin" className="block">
                <Button variant="outline" className="w-full gap-2" size="lg">
                  <CircleDollarSign className="h-5 w-5" /> Начисление часов (админ)
                </Button>
              </Link>
              <Link to="/admin/stats" className="block">
                <Button variant="outline" className="w-full gap-2" size="lg">
                  <BarChart3 className="h-5 w-5" /> Статистика (админ)
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Account;
