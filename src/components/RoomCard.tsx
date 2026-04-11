import { Room } from "@/types/booking";
import { Badge } from "@/components/ui/badge";

interface RoomCardProps {
  room: Room;
  onSelect: (room: Room) => void;
}

const RoomCard = ({ room, onSelect }: RoomCardProps) => {
  return (
    <button
      onClick={() => onSelect(room)}
      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 text-left transition-all hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-3xl">{room.icon}</span>
        <Badge variant="secondary" className="text-xs font-medium">
          {room.area} м²
        </Badge>
      </div>

      <h3 className="mb-1 text-lg font-semibold text-foreground">{room.name}</h3>
      <p className="mb-3 text-sm text-muted-foreground leading-relaxed">{room.description}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {room.features.slice(0, 4).map((f) => (
          <span
            key={f}
            className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
          >
            {f}
          </span>
        ))}
        {room.features.length > 4 && (
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            +{room.features.length - 4}
          </span>
        )}
      </div>

      {room.noFood && (
        <p className="text-xs text-muted-foreground">🙏 Без еды и напитков</p>
      )}

      <div className="mt-auto pt-3">
        <span className="text-sm font-medium text-primary group-hover:underline">
          Забронировать →
        </span>
      </div>
    </button>
  );
};

export default RoomCard;
