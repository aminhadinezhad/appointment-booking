import { formatJalali, formatRange, WEEKDAY_NAMES } from "./dates";
import { isWholeDayLock, type LockRule, type LockTypeName } from "./slots";

export const LOCK_TYPE_LABELS: Record<LockTypeName, string> = {
  FULL_DAY: "روز کامل",
  TIME_RANGE: "بازه ساعتی",
  WEEKLY: "هفتگی",
};

/** Human readable scope, e.g. "هر سه‌شنبه، ۰۸:۰۰ تا ۱۲:۰۰". */
export function describeLockScope(lock: Pick<LockRule, "type" | "date" | "weekday" | "startHour" | "endHour">): string {
  const hours = isWholeDayLock(lock) ? "کل روز" : formatRange(lock.startHour, lock.endHour);
  if (lock.type === "WEEKLY") return `هر ${WEEKDAY_NAMES[lock.weekday ?? 0]}، ${hours}`;
  return `${lock.date ? formatJalali(lock.date) : "—"}، ${hours}`;
}
