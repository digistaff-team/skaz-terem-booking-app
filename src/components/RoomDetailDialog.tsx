import { Room } from "@/types/booking";
import { roomImages } from "@/data/roomImages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface RoomDetailDialogProps {
  room: Room;
  open: boolean;
  onClose: () => void;
  onBook: () => void;
}

const RoomDetailDialog = ({ room, open, onClose, onBook }: RoomDetailDialogProps) => {
  const image = roomImages[room.id];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90dvh] flex flex-col" hideCloseButton>
        {image && (
          <img
            src={image}
            alt={room.name}
            className="h-52 w-full object-cover shrink-0"
          />
        )}

        <div className="relative overflow-y-auto p-6 pt-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
          >
            <X className="h-4 w-4" />
          </button>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span>{room.icon}</span> {room.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Подробная информация о помещении {room.name}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary">{room.area} м²</Badge>
            <Badge variant="outline">{room.floor}</Badge>
          </div>

          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            {room.description}
          </p>

          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-foreground">Оснащение</h4>
            <div className="flex flex-wrap gap-1.5">
              {room.features.map((f) => (
                <span
                  key={f}
                  className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-foreground">Подходит для</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {room.suitableFor.map((s) => (
                <li key={s}>🔹 {s}</li>
              ))}
            </ul>
          </div>

          {room.noFood && (
            <p className="mt-3 text-xs text-muted-foreground">
              🙏 Без употребления пищи. Кухня и санузел на 1-м этаже.
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <Button className="w-full" size="lg" onClick={onBook}>
            Забронировать
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RoomDetailDialog;
