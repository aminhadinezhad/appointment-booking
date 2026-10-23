import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { dateKeyToDb } from "@/lib/dates";
import { db } from "@/server/db";
import { listAdminBookings } from "@/server/services/admin-bookings";
import { cancelBooking, createBooking } from "@/server/services/bookings";
import { buildExportWorkbook } from "@/server/services/export";
import { createLock } from "@/server/services/locks";
import { getSettings, updateSettings } from "@/server/services/settings";
import { getMonthlyStats } from "@/server/services/stats";
import { getUserDetail, listUsers, updateUserByAdmin } from "@/server/services/users";
import { clock, createAdmin, createUser, lockOf, NOW, setSettings, TOMORROW, TUESDAY } from "./helpers";

let adminId: string;

beforeEach(async () => {
  await setSettings();
  adminId = (await createAdmin()).id;
});

describe("users", () => {
  it("lists, searches and filters users with booking counts", async () => {
    const ali = await createUser({ fullName: "علی محمدی", phone: "09123456789" });
    await createUser({ fullName: "سارا رضایی", phone: "09123456788", gender: "FEMALE" });
    await createUser({ fullName: "ندا احمدی", phone: "09123456786", isActive: false, gender: "FEMALE" });
    await createBooking({ userId: ali.id, dateKey: TOMORROW, hour: 9 }, clock);

    const all = await listUsers({});
    expect(all.total).toBe(3); // the admin is not listed
    expect(all.items.find((u) => u.id === ali.id)).toMatchObject({ bookingsCount: 1, activeBookingsCount: 1 });
    expect((await listUsers({ q: "محمدی" })).items.map((u) => u.fullName)).toEqual(["علی محمدی"]);
    expect((await listUsers({ q: "۶۷۸۹" })).items.map((u) => u.fullName)).toEqual(["علی محمدی"]);
    expect((await listUsers({ status: "INACTIVE" })).items.map((u) => u.fullName)).toEqual(["ندا احمدی"]);
    const paged = await listUsers({ page: 2, pageSize: 2 });
    expect(paged.items).toHaveLength(1);
  });

  it("updates notes and status, and exposes user detail with bookings", async () => {
    const user = await createUser();
    await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await updateUserByAdmin(user.id, { notes: "مراجع ویژه" }, adminId);
    await updateUserByAdmin(user.id, { isActive: false }, adminId);
    const detail = await getUserDetail(user.id, clock);
    expect(detail).toMatchObject({ notes: "مراجع ویژه", isActive: false });
    expect(detail.bookings).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "USER_DEACTIVATED" } })).toBe(1);
  });
});

describe("admin bookings", () => {
  it("filters by status, date and search text", async () => {
    const [a, b] = await Promise.all([createUser({ fullName: "علی محمدی" }), createUser({ fullName: "مهدی کریمی" })]);
    await db.booking.create({ data: { userId: a.id, date: dateKeyToDb("2026-10-20"), hour: 9 } }); // held (past)
    const pending = await createBooking({ userId: a.id, dateKey: TOMORROW, hour: 9 }, clock);
    const toCancel = await createBooking({ userId: b.id, dateKey: TUESDAY, hour: 9 }, clock);
    await cancelBooking({ bookingId: toCancel.id, actor: { id: adminId, role: "ADMIN" } }, clock);

    expect((await listAdminBookings({}, clock)).total).toBe(3);
    expect((await listAdminBookings({ status: "PENDING" }, clock)).items.map((i) => i.id)).toEqual([pending.id]);
    expect((await listAdminBookings({ status: "HELD" }, clock)).items[0]!.displayStatus).toBe("HELD");
    expect((await listAdminBookings({ status: "CANCELLED" }, clock)).items[0]!).toMatchObject({ id: toCancel.id, cancelledByAdmin: true });
    expect((await listAdminBookings({ q: "کریمی" }, clock)).items.map((i) => i.id)).toEqual([toCancel.id]);
    expect((await listAdminBookings({ from: TOMORROW, to: TOMORROW }, clock)).items.map((i) => i.id)).toEqual([pending.id]);
  });
});

describe("settings", () => {
  it("updates bookable hours used by the booking engine", async () => {
    const user = await createUser();
    await updateSettings({ bookableHours: [20, 21], maxAdvanceDays: 14 }, adminId);
    expect(await getSettings()).toEqual({ bookableHours: [20, 21], maxAdvanceDays: 14 });
    await expect(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock)).rejects.toMatchObject({ code: "SLOT_NOT_BOOKABLE" });
    await expect(createBooking({ userId: user.id, dateKey: TOMORROW, hour: 20 }, clock)).resolves.toBeTruthy();
    await expect(createBooking({ userId: user.id, dateKey: "2026-11-10", hour: 20 }, clock)).rejects.toMatchObject({ code: "BEYOND_BOOKING_WINDOW" });
  });
});

describe("stats", () => {
  it("summarises a Jalali month", async () => {
    const [m, f] = await Promise.all([createUser({ gender: "MALE" }), createUser({ gender: "FEMALE" })]);
    await db.booking.create({ data: { userId: m.id, date: dateKeyToDb("2026-10-23"), hour: 9 } }); // held, 1405/08/01
    await db.booking.create({ data: { userId: m.id, date: dateKeyToDb("2026-10-24"), hour: 9 } }); // held (today 09:00, now 10:00)
    await createBooking({ userId: f.id, dateKey: TOMORROW, hour: 10 }, clock); // pending
    const c = await createBooking({ userId: m.id, dateKey: TUESDAY, hour: 10 }, clock);
    await cancelBooking({ bookingId: c.id, actor: { id: m.id, role: "USER" } }, clock);
    await db.booking.create({ data: { userId: f.id, date: dateKeyToDb("2026-10-22"), hour: 9 } }); // previous month

    const stats = await getMonthlyStats(1405, 8, clock);
    expect(stats.bookings).toEqual({ total: 4, held: 2, pending: 1, cancelled: 1 });
    expect(stats.gender).toEqual({ male: 1, female: 1, unknown: 0 });
    expect(stats.users.total).toBe(2);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily[0]).toMatchObject({ dateKey: "2026-10-23", day: 1, held: 1 });
    expect(stats.hourly[9]!.count).toBe(2);
    expect(stats.hourly[10]!.count).toBe(1); // the cancelled one is excluded
  });

  it("counts users registered in the month by Tehran time", async () => {
    const u = await createUser();
    // 1405/08/01 00:10 Tehran = 2026-10-22T20:40Z — belongs to Aban, not Mehr
    await db.user.update({ where: { id: u.id }, data: { createdAt: new Date("2026-10-22T20:40:00Z") } });
    expect((await getMonthlyStats(1405, 8, clock)).users.newThisMonth).toBe(1);
    expect((await getMonthlyStats(1405, 7, clock)).users.newThisMonth).toBe(0);
  });
});

describe("excel export", () => {
  it("produces an RTL workbook with users, bookings and locks", async () => {
    const user = await createUser({ fullName: "علی محمدی", phone: "09123456789" });
    await createBooking({ userId: user.id, dateKey: TUESDAY, hour: 9 }, clock);
    await createLock(lockOf({ type: "FULL_DAY", date: TUESDAY, reason: "تعطیل" }), { actorId: adminId, now: NOW });

    const buffer = await buildExportWorkbook({ sections: ["users", "bookings", "locks"] }, clock);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["کاربران", "رزروها", "قفل‌ها و تعطیلی‌ها"]);

    const users = wb.getWorksheet("کاربران")!;
    expect(users.views[0]).toMatchObject({ rightToLeft: true });
    expect(users.getRow(2).getCell(2).value).toBe("علی محمدی");
    expect(users.getRow(2).getCell(3).value).toBe("09123456789");

    const bookings = wb.getWorksheet("رزروها")!;
    const row = bookings.getRow(2);
    expect(row.getCell(2).value).toBe("1405/08/05");
    expect(row.getCell(3).value).toBe("سه‌شنبه");
    expect(row.getCell(4).value).toBe("09:00 تا 10:00");
    expect(row.getCell(13).value).toBe("بله"); // kept inside a locked range

    const locks = wb.getWorksheet("قفل‌ها و تعطیلی‌ها")!;
    expect(locks.getRow(2).getCell(2).value).toBe("روز کامل");
    expect(locks.getRow(2).getCell(3).value).toBe("1405/08/05، کل روز");
  });

  it("limits bookings to a date range", async () => {
    const user = await createUser();
    await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await createBooking({ userId: user.id, dateKey: TUESDAY, hour: 9 }, clock);
    const buffer = await buildExportWorkbook({ sections: ["bookings"], from: TUESDAY, to: TUESDAY }, clock);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["رزروها"]);
    expect(wb.getWorksheet("رزروها")!.rowCount).toBe(2);
  });
});
