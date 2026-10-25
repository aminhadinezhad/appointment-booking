/** Response shapes of the JSON API, shared by client components. */
import type { DaySummary, SlotView } from "./slots";

export type { DaySummary, SlotView };

export type BookingStatus = "ACTIVE" | "CANCELLED";
export type BookingDisplayStatus = "UPCOMING" | "IN_PROGRESS" | "HELD" | "CANCELLED";
export type Gender = "MALE" | "FEMALE";
export type LockType = "FULL_DAY" | "TIME_RANGE" | "WEEKLY";

export interface Booking {
  id: string;
  dateKey: string;
  hour: number;
  status: BookingStatus;
  displayStatus: BookingDisplayStatus;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByAdmin: boolean;
  canModify: boolean;
}

export interface AdminBooking extends Booking {
  user: { id: string; fullName: string; phone: string | null };
  inLockedRange: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Me {
  id: string;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  notes: string | null;
  createdAt: string;
}

export interface UserListItem {
  id: string;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  isActive: boolean;
  createdAt: string;
  bookingsCount: number;
  activeBookingsCount: number;
}

export interface UserDetail {
  id: string;
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  bookings: Booking[];
}

type PersonRef = { id: string; fullName: string } | null;

export interface Lock {
  id: string;
  type: LockType;
  dateKey: string | null;
  weekday: number | null;
  startHour: number;
  endHour: number;
  reason: string | null;
  isReasonPublic: boolean;
  isActive: boolean;
  scope: string;
  createdAt: string;
  updatedAt: string;
  unlockedAt: string | null;
  unlockReason: string | null;
  createdBy: PersonRef;
  updatedBy: PersonRef;
  unlockedBy: PersonRef;
  keptBookingsCount: number;
}

export interface AffectedBooking {
  id: string;
  dateKey: string;
  hour: number;
  user: { id: string; fullName: string; phone: string | null };
}

export interface LockDetail extends Lock {
  keptBookings: AffectedBooking[];
  history: { id: string; action: string; createdAt: string; actor: PersonRef; details: unknown }[];
}

export interface LockImpact {
  scope: string;
  affectedBookings: AffectedBooking[];
  affectedUsers: number;
  overlappingLocks: { id: string; scope: string }[];
}

export interface LockWriteResult {
  lock: Lock;
  affectedCount: number;
  cancelledCount: number;
}

export interface AdminDayOverview {
  dateKey: string;
  fullyClosed: boolean;
  lockedHours: number[];
  lockIds: string[];
  bookingsCount: number;
  bookingsInLockedRange: number;
}

export interface AdminSlot {
  hour: number;
  isBookableHour: boolean;
  isPast: boolean;
  locks: { id: string; type: LockType; reason: string | null }[];
  booking: { id: string; user: { id: string; fullName: string; phone: string | null } } | null;
}

export interface MonthlyStats {
  jy: number;
  jm: number;
  users: { total: number; active: number; newThisMonth: number };
  bookings: { total: number; held: number; pending: number; cancelled: number };
  gender: { male: number; female: number; unknown: number };
  daily: { dateKey: string; day: number; held: number; pending: number; cancelled: number }[];
  hourly: { hour: number; count: number }[];
}

export interface Settings {
  bookableHours: number[];
  maxAdvanceDays: number;
}
