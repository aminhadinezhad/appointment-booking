/**
 * Creates the initial admin (from ADMIN_* env vars) and default settings.
 * An existing admin's password is kept unless ADMIN_RESET_PASSWORD=true.
 *
 *   npm run db:seed          # admin + settings
 *   npm run db:seed -- --demo # also sample users, bookings and locks (dev only)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, dateKeyToDb, weekdayOf } from "../src/lib/dates";
import { tehranParts } from "../src/lib/time";

const db = new PrismaClient();
const DEFAULT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || "مدیر سامانه";
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  const existing = await db.user.findUnique({ where: { username } });
  if (existing && existing.role !== "ADMIN") throw new Error(`User "${username}" exists but is not an admin`);
  if (!existing) {
    await db.user.create({ data: { username, fullName, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) } });
    console.log(`Created admin "${username}"`);
  } else if (process.env.ADMIN_RESET_PASSWORD === "true") {
    await db.user.update({ where: { id: existing.id }, data: { passwordHash: await bcrypt.hash(password, 12), isActive: true } });
    console.log(`Reset password of admin "${username}"`);
  } else {
    console.log(`Admin "${username}" already exists (password unchanged)`);
  }
  return db.user.findUniqueOrThrow({ where: { username } });
}

async function seedSettings() {
  await db.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, bookableHours: DEFAULT_HOURS, maxAdvanceDays: 60 },
  });
}

async function seedDemo(adminId: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Demo data is not allowed in production");
  if ((await db.user.count({ where: { role: "USER" } })) > 0) {
    console.log("Users already exist; skipping demo data");
    return;
  }
  const people = [
    { fullName: "علی محمدی", phone: "09123456789", gender: "MALE" },
    { fullName: "سارا رضایی", phone: "09123456788", gender: "FEMALE" },
    { fullName: "مهدی کریمی", phone: "09123456787", gender: "MALE" },
    { fullName: "ندا احمدی", phone: "09123456786", gender: "FEMALE", isActive: false },
  ] as const;
  const users = [];
  for (const p of people) users.push(await db.user.create({ data: { ...p, role: "USER" } }));

  const today = tehranParts().dateKey;
  const nextWeekday = (weekday: number) => {
    let d = addDays(today, 1);
    while (weekdayOf(d) !== weekday) d = addDays(d, 1);
    return d;
  };
  const [ali, sara, mahdi] = users as [(typeof users)[0], (typeof users)[0], (typeof users)[0]];

  await db.booking.createMany({
    data: [
      { userId: ali.id, date: dateKeyToDb(addDays(today, -3)), hour: 10 },
      { userId: sara.id, date: dateKeyToDb(addDays(today, -2)), hour: 11 },
      { userId: ali.id, date: dateKeyToDb(addDays(today, 1)), hour: 9 },
      { userId: sara.id, date: dateKeyToDb(addDays(today, 1)), hour: 13 },
      { userId: mahdi.id, date: dateKeyToDb(addDays(today, 3)), hour: 10 },
    ],
  });
  await db.booking.create({
    data: {
      userId: mahdi.id,
      date: dateKeyToDb(addDays(today, 2)),
      hour: 15,
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: mahdi.id,
      cancelReason: "لغو توسط کاربر",
    },
  });

  await db.scheduleLock.createMany({
    data: [
      { type: "WEEKLY", weekday: 5, startHour: 0, endHour: 24, reason: "تعطیلی جمعه‌ها", isReasonPublic: true, createdById: adminId },
      { type: "WEEKLY", weekday: 2, startHour: 8, endHour: 10, reason: "جلسه هفتگی تیم", createdById: adminId },
      { type: "FULL_DAY", date: dateKeyToDb(addDays(nextWeekday(1), 7)), startHour: 0, endHour: 24, reason: "تعطیل رسمی", isReasonPublic: true, createdById: adminId },
    ],
  });
  console.log("Demo data created (4 users, 6 bookings, 3 locks)");
}

async function main() {
  const admin = await seedAdmin();
  await seedSettings();
  if (process.argv.includes("--demo")) await seedDemo(admin.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
