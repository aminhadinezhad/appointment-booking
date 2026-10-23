import ExcelJS from "exceljs";
import { dateKeyToDb, dbToDateKey, formatJalaliPlain, formatRange, WEEKDAY_NAMES, weekdayOf, type DateKey } from "@/lib/dates";
import { pad2, toEnDigits } from "@/lib/digits";
import { LOCK_TYPE_LABELS, describeLockScope } from "@/lib/locks";
import { locksCoveringSlot } from "@/lib/slots";
import { tehranParts } from "@/lib/time";
import { db } from "../db";
import { displayStatusOf, type BookingDisplayStatus, type Clock } from "./bookings";
import { activeLocksForRange, toLockRule } from "./schedule-data";

export type ExportSection = "users" | "bookings" | "locks";

const STATUS_LABELS: Record<BookingDisplayStatus, string> = {
  UPCOMING: "ثبت شده (در انتظار)",
  IN_PROGRESS: "در حال برگزاری",
  HELD: "برگزار شده",
  CANCELLED: "لغو شده",
};

const GENDER_LABELS = { MALE: "مرد", FEMALE: "زن" } as const;

function tehranDateTime(instant: Date | null | undefined): { date: string; time: string } {
  if (!instant) return { date: "", time: "" };
  const t = tehranParts(instant);
  return { date: formatJalaliPlain(t.dateKey), time: `${pad2(t.hour)}:${pad2(t.minute)}` };
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[]) {
  const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Tahoma" };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 22;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

function finishSheet(sheet: ExcelJS.Worksheet) {
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    row.font = { name: "Tahoma" };
    row.alignment = { vertical: "middle", horizontal: "right" };
  });
}

/**
 * Builds an .xlsx workbook. `from`/`to` limit bookings to a date range
 * (inclusive); users and locks are always exported in full.
 */
export async function buildExportWorkbook(
  options: { sections: ExportSection[]; from?: DateKey; to?: DateKey },
  clock: Clock = {},
): Promise<Buffer> {
  const now = clock.now ?? new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "سامانه رزرو مشاوره";
  workbook.created = now;

  if (options.sections.includes("users")) {
    const users = await db.user.findMany({
      where: { role: "USER" },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { bookings: true } } },
    });
    const sheet = addSheet(workbook, "کاربران", [
      { header: "ردیف", key: "row", width: 7 },
      { header: "نام و نام خانوادگی", key: "fullName", width: 26 },
      { header: "شماره موبایل", key: "phone", width: 16 },
      { header: "جنسیت", key: "gender", width: 9 },
      { header: "وضعیت", key: "status", width: 10 },
      { header: "تاریخ ثبت‌نام", key: "date", width: 14 },
      { header: "ساعت ثبت‌نام", key: "time", width: 12 },
      { header: "تعداد رزروها", key: "bookings", width: 12 },
      { header: "توضیحات", key: "notes", width: 40 },
    ]);
    users.forEach((u, i) => {
      const created = tehranDateTime(u.createdAt);
      sheet.addRow({
        row: i + 1,
        fullName: u.fullName,
        phone: u.phone ?? "",
        gender: u.gender ? GENDER_LABELS[u.gender] : "",
        status: u.isActive ? "فعال" : "غیرفعال",
        date: created.date,
        time: created.time,
        bookings: u._count.bookings,
        notes: u.notes ?? "",
      });
    });
    finishSheet(sheet);
  }

  if (options.sections.includes("bookings")) {
    const bookings = await db.booking.findMany({
      where:
        options.from || options.to
          ? {
              date: {
                ...(options.from ? { gte: dateKeyToDb(options.from) } : {}),
                ...(options.to ? { lte: dateKeyToDb(options.to) } : {}),
              },
            }
          : {},
      include: { user: { select: { fullName: true, phone: true } }, cancelledBy: { select: { fullName: true, role: true } } },
      orderBy: [{ date: "asc" }, { hour: "asc" }, { createdAt: "asc" }],
    });
    const keys = bookings.map((b) => dbToDateKey(b.date));
    const locks = keys.length ? await activeLocksForRange(db, keys[0]!, keys.at(-1)!) : [];
    const sheet = addSheet(workbook, "رزروها", [
      { header: "ردیف", key: "row", width: 7 },
      { header: "تاریخ جلسه", key: "date", width: 13 },
      { header: "روز هفته", key: "weekday", width: 11 },
      { header: "ساعت", key: "slot", width: 16 },
      { header: "نام کاربر", key: "user", width: 24 },
      { header: "موبایل", key: "phone", width: 15 },
      { header: "وضعیت", key: "status", width: 18 },
      { header: "تاریخ ثبت رزرو", key: "createdDate", width: 14 },
      { header: "ساعت ثبت رزرو", key: "createdTime", width: 13 },
      { header: "تاریخ لغو", key: "cancelledDate", width: 13 },
      { header: "لغوکننده", key: "cancelledBy", width: 18 },
      { header: "دلیل لغو", key: "cancelReason", width: 30 },
      { header: "در محدوده قفل‌شده", key: "inLock", width: 15 },
    ]);
    bookings.forEach((b, i) => {
      const dateKey = keys[i]!;
      const created = tehranDateTime(b.createdAt);
      const cancelled = tehranDateTime(b.cancelledAt);
      const inLock = b.status === "ACTIVE" && locksCoveringSlot(locks, dateKey, b.hour).length > 0;
      sheet.addRow({
        row: i + 1,
        date: formatJalaliPlain(dateKey),
        weekday: WEEKDAY_NAMES[weekdayOf(dateKey)],
        slot: formatRange(b.hour, b.hour + 1, "en"),
        user: b.user.fullName,
        phone: b.user.phone ?? "",
        status: STATUS_LABELS[displayStatusOf(b, now)],
        createdDate: created.date,
        createdTime: created.time,
        cancelledDate: cancelled.date,
        cancelledBy: b.cancelledBy ? `${b.cancelledBy.fullName}${b.cancelledBy.role === "ADMIN" ? " (مدیر)" : ""}` : "",
        cancelReason: b.cancelReason ?? "",
        inLock: inLock ? "بله" : "",
      });
    });
    finishSheet(sheet);
  }

  if (options.sections.includes("locks")) {
    const locks = await db.scheduleLock.findMany({
      include: { createdBy: { select: { fullName: true } }, updatedBy: { select: { fullName: true } }, unlockedBy: { select: { fullName: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    const sheet = addSheet(workbook, "قفل‌ها و تعطیلی‌ها", [
      { header: "ردیف", key: "row", width: 7 },
      { header: "نوع قفل", key: "type", width: 12 },
      { header: "محدوده", key: "scope", width: 32 },
      { header: "دلیل", key: "reason", width: 30 },
      { header: "نمایش دلیل به کاربر", key: "public", width: 16 },
      { header: "وضعیت", key: "status", width: 10 },
      { header: "ایجادکننده", key: "createdBy", width: 18 },
      { header: "تاریخ ایجاد", key: "createdAt", width: 18 },
      { header: "آخرین تغییر", key: "updatedAt", width: 18 },
      { header: "آخرین تغییردهنده", key: "updatedBy", width: 18 },
      { header: "بازکننده قفل", key: "unlockedBy", width: 18 },
      { header: "زمان بازگشایی", key: "unlockedAt", width: 18 },
      { header: "دلیل بازگشایی", key: "unlockReason", width: 30 },
    ]);
    const stamp = (d: Date | null) => {
      const v = tehranDateTime(d);
      return v.date ? `${v.date} ${v.time}` : "";
    };
    locks.forEach((l, i) => {
      sheet.addRow({
        row: i + 1,
        type: LOCK_TYPE_LABELS[l.type],
        scope: toEnDigits(describeLockScope(toLockRule(l))),
        reason: l.reason ?? "",
        public: l.isReasonPublic ? "بله" : "خیر",
        status: l.isActive ? "فعال" : "باز شده",
        createdBy: l.createdBy.fullName,
        createdAt: stamp(l.createdAt),
        updatedAt: stamp(l.updatedAt),
        updatedBy: l.updatedBy?.fullName ?? "",
        unlockedBy: l.unlockedBy?.fullName ?? "",
        unlockedAt: stamp(l.unlockedAt),
        unlockReason: l.unlockReason ?? "",
      });
    });
    finishSheet(sheet);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
