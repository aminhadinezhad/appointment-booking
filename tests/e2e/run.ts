/**
 * Browser end-to-end scenario against a running dev server (npm run dev).
 *
 *   npm run test:e2e                 # BASE_URL defaults to http://localhost:3000
 *
 * Uses the installed Microsoft Edge or Google Chrome (no browser download).
 * Everything the scenario creates (users, bookings, locks, logs) is removed at the end.
 * Requires the dev SMS provider (console), because it reads the test OTP from the page.
 */
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright-core";
import { addDays, dateKeyToDb, formatJalali, formatJalaliLong } from "../../src/lib/dates";
import { toFaDigits } from "../../src/lib/digits";
import { tehranParts } from "../../src/lib/time";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// A throwaway admin per run, so the first-login terms gate is exercised every time.
const ADMIN_USER = `e2e-admin-${randomBytes(4).toString("hex")}`;
const ADMIN_PASS = randomBytes(12).toString("base64url");
const db = new PrismaClient();
const created = { phones: [] as string[], lockIds: [] as string[], adminIds: [] as string[] };
let failures = 0;
function apiRoutes(dir = path.join(process.cwd(), "src", "app", "api"), prefix = "/api"): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^route\.tsx?$/.test(entry.name)) routes.push(prefix);
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith("[") ? "x" : entry.name;
      routes.push(...apiRoutes(path.join(dir, entry.name), `${prefix}/${segment}`));
    }
  }
  return routes;
}

/** Pages whose state is printed when a step fails. */
const watchedPages: Record<string, Page> = {};

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
    for (const [label, page] of Object.entries(watchedPages)) {
      const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
      console.error(`    [${label}] ${page.url()}\n      ${text.replace(/\s+/g, " ").slice(0, 220)}`);
    }
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
  const consent = page.getByRole("checkbox", { name: /قوانین و مقررات/ });
  if (await consent.isChecked()) throw new Error("the consent checkbox must start unticked");
  await consent.check();
  await page.getByRole("button", { name: "ثبت‌نام" }).click();
  const hint = page.getByText("حالت آزمایشی");
  await hint.waitFor({ timeout: 30_000 });
  await hint.getByRole("button").click(); // fills and submits the dev code
  await page.waitForURL(`${BASE}/home`, { timeout: 60_000 });
}

async function main() {
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`App is not reachable at ${BASE}. Start it with "npm run dev".`);

  // The dev server compiles each route on first request; warm them up so the
  // scenario's timeouts measure the app, not the compiler.
  const warmUp = ["/", "/register", "/login", "/home", "/bookings", "/bookings/x", "/bookings/x/confirmed", "/bookings/x/cancelled", "/profile", "/terms", "/privacy", "/platform-terms", "/admin/login", "/admin/terms", "/admin", "/admin/schedule", "/admin/bookings", "/admin/users", "/admin/reports", "/admin/export", "/admin/settings"];
  // One at a time: the dev compiler works sequentially anyway, and parallel
  // requests only make the later ones time out.
  for (const path of warmUp) {
    await fetch(`${BASE}${path}`, {
      redirect: "manual",
      // placeholder cookies get past the middleware so protected routes are compiled too
      headers: { cookie: "bk_session=warmup; bk_admin=warmup" },
      signal: AbortSignal.timeout(180_000),
    }).catch(() => null);
  }
  // Every API route, discovered from src/app/api ([id] segments become "x").
  for (const path of apiRoutes()) {
    await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(180_000) }).catch(() => null);
  }

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
  Object.assign(watchedPages, { user, other, admin });
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
      await page.getByText("برای ادامه باید قوانین و مقررات و حریم خصوصی را بپذیرید").waitFor();
      await page.close();
    });

    await step("user books a slot from the calendar", async () => {
      await user.goto(`${BASE}/home?date=${date}`);
      await user.getByRole("button", { name: new RegExp(`${toFaDigits("10:00")} تا ${toFaDigits("11:00")}، قابل رزرو`) }).click();
      await user.getByRole("dialog").getByText(formatJalaliLong(date)).waitFor();
      // regression: once the booking succeeds the slot becomes "mine"; the open dialog must not turn into "change time"
      await user.evaluate(() => {
        const w = window as unknown as { sawMoveDialog: boolean };
        w.sawMoveDialog = false;
        new MutationObserver(() => {
          if (document.querySelector('[role="dialog"]')?.textContent?.includes("تغییر ساعت رزرو")) w.sawMoveDialog = true;
        }).observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      await user.getByRole("button", { name: "تأیید رزرو" }).click();
      await user.waitForURL(/\/bookings\/.+\/confirmed/, { timeout: 30_000 });
      expect(!(await user.evaluate(() => (window as unknown as { sawMoveDialog: boolean }).sawMoveDialog)), "booking dialog switched to «change time» after confirming");
      await user.getByText("رزرو با موفقیت ثبت شد").waitFor();
      const consents = await db.consentRecord.findMany({ where: { user: { phone: phoneA } } });
      const contexts = consents.map((c) => `${c.context}:${c.document}`).sort().join();
      expect(contexts === "REGISTER:PRIVACY,REGISTER:TERMS", `only the registration consent is expected, got ${contexts}`);
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

    await step("admin pages send no data without a valid session", async () => {
      for (const path of ["/admin", "/admin/bookings", "/admin/schedule"]) {
        const html = await (await fetch(`${BASE}${path}`, { headers: { cookie: "bk_admin=forged-token" } })).text();
        expect(!html.includes("رزروهای امروز") && !html.includes("قفل‌های فعال"), `${path} leaked panel content to a forged session`);
      }
    });

    await step("new admin must accept the software terms before the panel opens", async () => {
      const row = await db.user.create({
        data: { fullName: "مدیر آزمون", username: ADMIN_USER, role: "ADMIN", passwordHash: await bcrypt.hash(ADMIN_PASS, 10) },
      });
      created.adminIds.push(row.id);
      await admin.goto(`${BASE}/admin/login`);
      await admin.getByLabel("نام کاربری").fill(ADMIN_USER);
      await admin.getByLabel("رمز عبور").fill(ADMIN_PASS);
      await admin.getByRole("button", { name: "ورود" }).click();
      await admin.waitForURL(`${BASE}/admin/terms`, { timeout: 30_000 });
      // the panel and the admin API stay closed until acceptance
      const blocked = await admin.request.get(`${BASE}/api/admin/users`);
      expect(blocked.status() === 403, `admin API must be blocked before acceptance, got ${blocked.status()}`);
      const dashboardHtml = await (await admin.request.get(`${BASE}/admin`)).text();
      expect(!dashboardHtml.includes("رزروهای امروز"), "dashboard data must not be sent before acceptance");
      await admin.goto(`${BASE}/admin/schedule`);
      await admin.waitForURL(`${BASE}/admin/terms`);
      const accept = admin.getByRole("button", { name: "پذیرش و ادامه" });
      expect(await accept.isDisabled(), "continue must be disabled until the box is ticked");
      const box = admin.getByRole("checkbox", { name: /مجوزهای قانونی لازم/ });
      expect(!(await box.isChecked()), "the box must start unticked");
      await box.check();
      await accept.click();
      await admin.waitForURL(`${BASE}/admin`, { timeout: 30_000 });
      const record = await db.consentRecord.findFirst({ where: { userId: row.id, document: "PLATFORM_TERMS" } });
      expect(record?.ip && record.userAgent && record.contentHash.length === 64, "acceptance must be recorded with IP, browser and hash");
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
      await user.getByRole("dialog").getByText(formatJalaliLong(date), { exact: true }).waitFor();
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

    await step("legal pages are public and linked only where they belong", async () => {
      const page = await otherCtx.newPage();
      const pages = [
        ["/terms", "قوانین و مقررات"],
        ["/privacy", "حریم خصوصی"],
        ["/platform-terms", "شرایط استفاده از نرم‌افزار سامانه رزرو نوبت"],
      ] as const;
      for (const [path, title] of pages) {
        await page.goto(`${BASE}${path}`);
        await page.getByRole("heading", { level: 1, name: title }).waitFor();
      }
      // the landing page is only for visitors (signed-in customers are sent to /home)
      const visitor = await browser.newPage();
      await visitor.goto(`${BASE}/`);
      await visitor.getByRole("link", { name: "حریم خصوصی" }).waitFor();
      await visitor.close();
      for (const path of ["/home", "/profile"]) {
        await page.goto(`${BASE}${path}`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        expect(!(await page.getByRole("link", { name: /حریم خصوصی/ }).count()), `no legal links on ${path}`);
      }
      await page.close();

      for (const path of ["/admin", "/admin/settings"]) {
        await admin.goto(`${BASE}${path}`);
        await admin.getByRole("heading", { level: 1 }).first().waitFor();
        expect(!(await admin.getByRole("link", { name: /حریم خصوصی|شرایط استفاده/ }).count()), `no legal links on ${path}`);
      }
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
  const userIds = [...users.map((u) => u.id), ...created.adminIds];
  const bookingIds = (await db.booking.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((b) => b.id);
  await db.$transaction([
    db.auditLog.deleteMany({
      where: { OR: [{ entityId: { in: [...bookingIds, ...created.lockIds, ...userIds] } }, { actorId: { in: userIds } }] },
    }),
    db.booking.updateMany({ where: { rescheduledFromId: { in: bookingIds } }, data: { rescheduledFromId: null } }),
    db.booking.deleteMany({ where: { id: { in: bookingIds } } }),
    db.scheduleLock.deleteMany({ where: { id: { in: created.lockIds } } }),
    db.consentRecord.deleteMany({ where: { userId: { in: userIds } } }),
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
