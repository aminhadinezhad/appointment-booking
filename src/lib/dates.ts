/**
 * Calendar-date helpers.
 *
 * A "date key" is a Gregorian calendar date string `YYYY-MM-DD` interpreted in
 * Asia/Tehran. It is the single representation used across API, services and
 * the database (`@db.Date`, stored as UTC midnight). Jalali (Shamsi) values are
 * derived from it only for display and month navigation.
 */
import { toGregorian, toJalaali, jalaaliMonthLength, isValidJalaaliDate } from "jalaali-js";
import { pad2, toFaDigits } from "./digits";

export type DateKey = string;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Weekday names indexed by JS weekday (0 = Sunday). */
export const WEEKDAY_NAMES = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"] as const;

/** JS weekday numbers in Persian week order (Saturday first). */
export const PERSIAN_WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

/** One-letter column headers for a Saturday-first calendar. */
export const WEEKDAY_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

export function parseDateKey(key: string): { y: number; m: number; d: number } | null {
  const match = DATE_KEY_RE.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isValidDateKey(key: string): boolean {
  return parseDateKey(key) !== null;
}

function mustParse(key: DateKey) {
  const parts = parseDateKey(key);
  if (!parts) throw new RangeError(`Invalid date key: ${key}`);
  return parts;
}

export function dateKeyFromParts(y: number, m: number, d: number): DateKey {
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

/** Date key -> JS Date at UTC midnight (the value Prisma uses for `@db.Date`). */
export function dateKeyToDb(key: DateKey): Date {
  const { y, m, d } = mustParse(key);
  return new Date(Date.UTC(y, m - 1, d));
}

/** JS Date from a `@db.Date` column -> date key. */
export function dbToDateKey(date: Date): DateKey {
  return dateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(key: DateKey, days: number): DateKey {
  return dbToDateKey(new Date(dateKeyToDb(key).getTime() + days * DAY_MS));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: DateKey, to: DateKey): number {
  return Math.round((dateKeyToDb(to).getTime() - dateKeyToDb(from).getTime()) / DAY_MS);
}

/** JS weekday: 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(key: DateKey): number {
  return dateKeyToDb(key).getUTCDay();
}

/** Column index in a Saturday-first week (0 = Saturday ... 6 = Friday). */
export function persianWeekIndex(key: DateKey): number {
  return (weekdayOf(key) + 1) % 7;
}

export type JalaliDate = { jy: number; jm: number; jd: number };

export function toJalali(key: DateKey): JalaliDate {
  const { y, m, d } = mustParse(key);
  return toJalaali(y, m, d);
}

export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return Number.isInteger(jy) && Number.isInteger(jm) && Number.isInteger(jd) && isValidJalaaliDate(jy, jm, jd);
}

export function fromJalali(jy: number, jm: number, jd: number): DateKey {
  if (!isValidJalali(jy, jm, jd)) throw new RangeError(`Invalid Jalali date: ${jy}/${jm}/${jd}`);
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return dateKeyFromParts(gy, gm, gd);
}

export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

/** All date keys of a Jalali month, in order. */
export function jalaliMonthDays(jy: number, jm: number): DateKey[] {
  const start = fromJalali(jy, jm, 1);
  const length = jalaliMonthLength(jy, jm);
  return Array.from({ length }, (_, i) => addDays(start, i));
}

export function shiftJalaliMonth(jy: number, jm: number, delta: number): { jy: number; jm: number } {
  const index = jy * 12 + (jm - 1) + delta;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
}

/** "1405/08/01" (ASCII digits) — used in exports and inputs. */
export function formatJalaliPlain(key: DateKey): string {
  const { jy, jm, jd } = toJalali(key);
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

/** "۱۴۰۵/۰۸/۰۱" */
export function formatJalali(key: DateKey): string {
  return toFaDigits(formatJalaliPlain(key));
}

/** "جمعه ۱ آبان ۱۴۰۵" */
export function formatJalaliLong(key: DateKey, withWeekday = true): string {
  const { jy, jm, jd } = toJalali(key);
  const text = `${toFaDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`;
  return withWeekday ? `${WEEKDAY_NAMES[weekdayOf(key)]} ${text}` : text;
}

export function formatJalaliMonth(jy: number, jm: number): string {
  return `${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`;
}

/** "09:00" for hour 9, "24:00" for hour 24 (used as an exclusive end). */
export function formatHour(hour: number, digits: "fa" | "en" = "fa"): string {
  const text = `${pad2(hour)}:00`;
  return digits === "fa" ? toFaDigits(text) : text;
}

/** "۰۹:۰۰ تا ۱۰:۰۰" for the one-hour slot starting at `hour`. */
export function formatSlot(hour: number, digits: "fa" | "en" = "fa"): string {
  return formatRange(hour, hour + 1, digits);
}

export function formatRange(startHour: number, endHour: number, digits: "fa" | "en" = "fa"): string {
  return `${formatHour(startHour, digits)} تا ${formatHour(endHour, digits)}`;
}
