import { dateKeyFromParts, type DateKey, formatJalali } from "./dates";
import { pad2, toFaDigits } from "./digits";

export const TIMEZONE = "Asia/Tehran";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type TehranNow = { dateKey: DateKey; hour: number; minute: number };

/** Wall-clock date and time in Asia/Tehran for the given instant. */
export function tehranParts(instant: Date = new Date()): TehranNow {
  const parts: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(instant)) parts[p.type] = p.value;
  return {
    dateKey: dateKeyFromParts(Number(parts.year), Number(parts.month), Number(parts.day)),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** A slot has started (and can no longer be booked) once its start hour is reached. */
export function isSlotStarted(dateKey: DateKey, hour: number, now: TehranNow): boolean {
  if (dateKey !== now.dateKey) return dateKey < now.dateKey;
  return hour <= now.hour;
}

/** A slot is over once its end hour (hour + 1) is reached. */
export function isSlotEnded(dateKey: DateKey, hour: number, now: TehranNow): boolean {
  if (dateKey !== now.dateKey) return dateKey < now.dateKey;
  return hour + 1 <= now.hour;
}

/** The instant at which the given date starts (00:00) in Tehran. */
export function tehranStartOfDay(dateKey: DateKey): Date {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  // Start from the current fixed offset (+03:30) and correct for historical DST.
  let instant = new Date(Date.UTC(y, m - 1, d) - 3.5 * 3_600_000);
  for (let i = 0; i < 3; i++) {
    const p = tehranParts(instant);
    if (p.dateKey === dateKey && p.hour === 0 && p.minute === 0) break;
    const minutesIntoDay = p.hour * 60 + p.minute;
    const dayOffset = p.dateKey < dateKey ? 1 : p.dateKey > dateKey ? -1 : 0;
    const shiftMinutes = dayOffset * 24 * 60 - minutesIntoDay;
    instant = new Date(instant.getTime() + shiftMinutes * 60_000);
  }
  return instant;
}

/** "۱۴۰۵/۰۸/۰۱ - ۱۴:۰۵" for an instant, in Tehran time. */
export function formatDateTime(instant: Date | string): string {
  const now = tehranParts(new Date(instant));
  return `${formatJalali(now.dateKey)} - ${toFaDigits(`${pad2(now.hour)}:${pad2(now.minute)}`)}`;
}
