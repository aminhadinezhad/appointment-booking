/**
 * Browser end-to-end scenario against a running dev server (npm run dev).
 *
 *   npm run test:e2e                 # BASE_URL defaults to http://localhost:3000
 *
 * Uses the installed Microsoft Edge or Google Chrome (no browser download).
 * Everything the scenario creates (users, bookings, locks, logs) is removed at the end.
 * Requires the dev SMS provider (console), because it reads the test OTP from the page.
 */
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright-core";
import { addDays, dateKeyToDb, formatJalali, formatJalaliLong } from "../../src/lib/dates";
import { toFaDigits } from "../../src/lib/digits";
import { tehranParts } from "../../src/lib/time";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? "Admin@12345";
const db = new PrismaClient();
const created = { phones: [] as string[], lockIds: [] as string[] };
let failures = 0;

function randomPhone() {
  return `0990${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`;
}

async function step(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    failures++;
    console.error(`  ✗ ${name}\n    ${(error as Error).message.split("\n").slice(0, 6).join("\n    ")}`);
    throw error;
  }
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function launch(): Promise<Browser> {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: process.env.HEADED !== "1" });
    } catch {
      /* try next */
    }
  }
  throw new Error("Neither Microsoft Edge nor Google Chrome could be launched");
}

/** First date ≥ 14 days ahead whose `hour` slot is free and not locked. */
async function pickFreeSlot(hour: number): Promise<string> {
  const today = tehranParts().dateKey;
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const max = Math.min(settings?.maxAdvanceDays ?? 60, 60);
  for (let i = 14; i <= max; i++) {
    const date = addDays(today, i);
    const weekday = dateKeyToDb(date).getUTCDay();
    const [booked, locked] = await Promise.all([
      db.booking.count({ where: { date: dateKeyToDb(date), hour, status: "ACTIVE" } }),
      db.scheduleLock.count({
        where: {
          isActive: true,
          startHour: { lte: hour },
          endHour: { gt: hour },
          OR: [{ date: dateKeyToDb(date) }, { type: "WEEKLY", weekday }],
        },
      }),
    ]);
    if (!booked && !locked && (settings?.bookableHours ?? [hour]).includes(hour)) return date;
  }
  throw new Error("No free slot found for the scenario");
}

async function register(page: Page, name: string, phone: string, gender: "زن" | "مرد") {
  await page.goto(`${BASE}/register`);
  await page.getByLabel("نام و نام خانوادگی").fill(name);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.locator("label", { hasText: gender }).first().click();
  await page.getByRole("button", { name: "ثبت‌نام" }).click();
  const hint = page.getByText("حالت آزمایشی");
  await hint.waitFor({ timeout: 30_000 });
  await hint.getByRole("button").click(); // fills and submits the dev code
  await page.waitForURL(`${BASE}/home`, { timeout: 60_000 });
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`App is not reachable at ${BASE}. Start it with "npm run dev".`);

  const hour = 10;
  const date = await pickFreeSlot(hour);
  const slotLabel = `${toFaDigits("10:00")} - ${toFaDigits("11:00")}`;
  console.log(`Scenario date: ${formatJalaliLong(date)} ${slotLabel}\n`);

  const browser = await launch();
  const userCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fa-IR" });
  const otherCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fa-IR" });
  const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fa-IR" });
  const errors: string[] = [];
  for (const ctx of [userCtx, otherCtx, adminCtx]) {
    ctx.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  }

  const user = await userCtx.newPage();
  const other = await otherCtx.newPage();
  const admin = await adminCtx.newPage();
  const phoneA = randomPhone();
  const phoneB = randomPhone();
  created.phones.push(phoneA, phoneB);

  try {
    await step("user registers with OTP", () => register(user, "کاربر آزمون", phoneA, "زن"));

    await step("validation messages are shown for an invalid form", async () => {
      const page = await otherCtx.newPage();
      await page.goto(`${BASE}/register`);
      await page.getByLabel("شماره موبایل").fill("123");
      await page.getByRole("button", { name: "ثبت‌نام" }).click();
      await page.getByText("شماره موبایل معتبر نیست").waitFor();
      await page.getByText("جنسیت را انتخاب کنید").waitFor();
      await page.close();
    });

    await step("user books a slot from the calendar", async () => {
      await user.goto(`${BASE}/home?date=${date}`);
      await user.getByRole("button", { name: new RegExp(`${toFaDigits("10:00")} تا ${toFaDigits("11:00")}، قابل رزرو`) }).click();
      await user.getByRole("dialog").getByText(formatJalaliLong(date)).waitFor();
      await user.getByRole("button", { name: "تأیید رزرو" }).click();
      await user.waitForURL(/\/bookings\/.+\/confirmed/, { timeout: 30_000 });
      await user.getByText("رزرو با موفقیت ثبت شد").waitFor();
    });

    await step("the same day cannot get a second booking (moves instead)", async () => {
      await user.goto(`${BASE}/home?date=${date}`);
      await user.getByText("شما در این روز رزرو دارید").waitFor();
      const mine = await db.booking.count({ where: { user: { phone: phoneA }, status: "ACTIVE" } });
      expect(mine === 1, `expected 1 active booking, got ${mine}`);
    });

    await step("another user sees the slot as booked", async () => {
      await register(other, "کاربر دوم", phoneB, "مرد");
      await other.goto(`${BASE}/home?date=${date}`);
      await other.getByRole("button", { name: new RegExp(`${toFaDigits("10:00")} تا ${toFaDigits("11:00")}، رزرو شده`) }).waitFor();
    });

    await step("admin logs in", async () => {
      await admin.goto(`${BASE}/admin/login`);
      await admin.getByLabel("نام کاربری").fill(ADMIN_USER);
      await admin.getByLabel("رمز عبور").fill(ADMIN_PASS);
      await admin.getByRole("button", { name: "ورود" }).click();
      await admin.waitForURL(`${BASE}/admin`, { timeout: 30_000 });
    });

    await step("admin locks the range and is warned about the existing booking", async () => {
      await admin.goto(`${BASE}/admin/schedule`);
      await admin.getByRole("button", { name: "قفل بازه ساعتی" }).first().click();
      const dialog = admin.getByRole("dialog");
      await dialog.locator("#lock-date").click();
      // navigate the picker to the scenario month, then pick the day
      for (let i = 0; i < 3; i++) {
        const cell = admin.getByRole("gridcell", { name: new RegExp(`^${formatJalaliLong(date)}`) });
        if (await cell.count()) {
          await cell.click();
          break;
        }
        await admin.getByRole("button", { name: "ماه بعد" }).last().click();
      }
      await dialog.locator("#lock-start").selectOption("9");
      await dialog.locator("#lock-end").selectOption("12");
      await dialog.locator("#lock-reason").fill("آزمون خودکار");
      await dialog.getByRole("button", { name: "بررسی و ادامه" }).click();
      await dialog.getByText(`${formatJalali(date)}، ${toFaDigits("09:00")} تا ${toFaDigits("12:00")}`).waitFor();
      await dialog.getByText("رزرو فعال از").waitFor();
      await dialog.getByText("کاربر آزمون").waitFor();
      expect(await dialog.getByRole("radio", { name: /حفظ رزروهای موجود/ }).isChecked(), "keep-bookings must be the default");
      await dialog.getByRole("button", { name: "تأیید و ثبت قفل" }).click();
      await admin.getByText("قفل ثبت شد").waitFor();
      const lock = await db.scheduleLock.findFirst({ where: { reason: "آزمون خودکار", isActive: true }, orderBy: { createdAt: "desc" } });
      expect(lock, "lock row should exist");
      created.lockIds.push(lock!.id);
      const kept = await db.booking.count({ where: { user: { phone: phoneA }, status: "ACTIVE" } });
      expect(kept === 1, "existing booking must be kept");
    });

    await step("locked hours are shown as unavailable to users", async () => {
      await other.goto(`${BASE}/home?date=${date}`);
      await other.getByRole("button", { name: new RegExp(`${toFaDigits("09:00")} تا ${toFaDigits("10:00")}، غیرفعال`) }).waitFor();
      const res = await other.request.post(`${BASE}/api/bookings`, { data: { date, hour: 9 } });
      expect(res.status() === 409, `direct API booking of a locked slot must fail, got ${res.status()}`);
      expect((await res.json()).error.code === "SLOT_LOCKED", "error code should be SLOT_LOCKED");
    });

    await step("admin sees the kept booking flagged in the bookings list", async () => {
      await admin.goto(`${BASE}/admin/bookings?inLocked=1`);
      await admin.getByText("کاربر آزمون").waitFor();
      await admin.getByText("رزرو موجود در محدوده قفل‌شده").first().waitFor();
    });

    await step("admin unlocks with a reason and the slot reopens", async () => {
      await admin.goto(`${BASE}/admin/schedule`);
      const card = admin.locator("li", { hasText: "آزمون خودکار" }).first();
      await card.getByRole("button", { name: "بازکردن قفل" }).click();
      await admin.getByLabel("علت بازگشایی").fill("پایان آزمون");
      await admin.getByRole("dialog").getByRole("button", { name: "بازکردن قفل" }).click();
      await admin.getByText("قفل باز شد").waitFor();
      const lock = await db.scheduleLock.findUnique({ where: { id: created.lockIds[0]! } });
      expect(lock && !lock.isActive && lock.unlockReason === "پایان آزمون", "lock should be inactive with reason");
      await other.goto(`${BASE}/home?date=${date}`);
      await other.getByRole("button", { name: new RegExp(`${toFaDigits("09:00")} تا ${toFaDigits("10:00")}، قابل رزرو`) }).waitFor();
    });

    await step("user moves the booking to another hour from its detail page", async () => {
      const booking = await db.booking.findFirstOrThrow({ where: { user: { phone: phoneA }, status: "ACTIVE" } });
      await user.goto(`${BASE}/bookings/${booking.id}`);
      await user.getByRole("link", { name: "تغییر ساعت" }).click();
      await user.getByText("در حال تغییر ساعت رزرو").waitFor();
      await user.getByRole("button", { name: new RegExp(`${toFaDigits("11:00")} تا ${toFaDigits("12:00")}، قابل رزرو`) }).click();
      await user.getByRole("button", { name: "تأیید تغییر ساعت" }).click();
      await user.waitForURL(/\/confirmed\?changed=1/, { timeout: 30_000 });
      await user.getByText("ساعت رزرو با موفقیت تغییر کرد").waitFor();
      const rows = await db.booking.findMany({ where: { user: { phone: phoneA } }, orderBy: { createdAt: "asc" } });
      expect(rows.length === 2 && rows[0]!.status === "CANCELLED" && rows[1]!.status === "ACTIVE" && rows[1]!.hour === 11, "old booking cancelled, new one at 11:00");
    });

    await step("user cancels the booking; the record is kept", async () => {
      const booking = await db.booking.findFirstOrThrow({ where: { user: { phone: phoneA }, status: "ACTIVE" } });
      await user.goto(`${BASE}/bookings/${booking.id}`);
      await user.getByRole("button", { name: "لغو رزرو" }).click();
      await user.getByRole("button", { name: "بله، لغو شود" }).click();
      await user.waitForURL(/\/cancelled$/, { timeout: 30_000 });
      await user.getByText("رزرو لغو شد").waitFor();
      const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(row.status === "CANCELLED", "booking should be cancelled");
    });

    await step("admin pages render without client errors", async () => {
      for (const path of ["/admin", "/admin/users", "/admin/reports", "/admin/export", "/admin/settings"]) {
        await admin.goto(`${BASE}${path}`);
        await admin.waitForLoadState("networkidle");
      }
      expect(errors.length === 0, `client errors: ${errors.join(" | ")}`);
    });
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  const users = await db.user.findMany({ where: { phone: { in: created.phones } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const bookingIds = (await db.booking.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((b) => b.id);
  await db.$transaction([
    db.auditLog.deleteMany({
      where: { OR: [{ entityId: { in: [...bookingIds, ...created.lockIds, ...userIds] } }, { actorId: { in: userIds } }] },
    }),
    db.booking.updateMany({ where: { rescheduledFromId: { in: bookingIds } }, data: { rescheduledFromId: null } }),
    db.booking.deleteMany({ where: { id: { in: bookingIds } } }),
    db.scheduleLock.deleteMany({ where: { id: { in: created.lockIds } } }),
    db.otpCode.deleteMany({ where: { phone: { in: created.phones } } }),
    db.rateLimit.deleteMany({ where: { key: { contains: "0990" } } }),
    db.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}

console.log("E2E scenario\n");
main()
  .catch((error) => {
    if (failures === 0) console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
    await db.$disconnect();
    console.log(process.exitCode ? "\nE2E FAILED" : "\nE2E PASSED");
  });
