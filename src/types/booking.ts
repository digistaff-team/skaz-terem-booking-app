export interface Room {
  id: string;
  name: string;
  area: number;
  floor: string;
  description: string;
  features: string[];
  suitableFor: string[];
  noFood: boolean;
  calendarId: string;
  icon: string;
  /** ISO-дата (YYYY-MM-DD), до которой помещение недоступно для брони (включительно). */
  unavailableUntil?: string;
  /** Причина недоступности — показывается пользователю. */
  unavailableReason?: string;
}

export interface Subscriber {
  id: string;
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  subscribedAt: string;
  isActive: boolean;
}

export interface Booking {
  id: string;
  roomId: string;
  roomName: string;
  date: string; // ISO date string
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  title: string;
  description: string;
  userName: string;
  userId?: string; // subscriber.id
  status: 'active' | 'cancelled';
  createdAt: string;
  /** Бронь создана постфактум на уже прошедшую дату (пост-учёт посещаемости). */
  isBackdated: boolean;
  /** Служебная бронь админа под уборку: без резидента и без списания часов. */
  isCleaning: boolean;
}

export interface BookingFormData {
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  userName: string;
  /** Только для админов: бронь оформляется на этого резидента (его chat_id). */
  onBehalfOfChatId?: number;
  /** Только для админов: слот занимается под уборку. */
  isCleaning?: boolean;
}
