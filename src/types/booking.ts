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
}

export interface BookingFormData {
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
  userName: string;
}
