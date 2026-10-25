import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { requestOtp, verifyOtp } from "@/server/auth/otp";
import { db } from "@/server/db";
import { createBooking, rescheduleBooking } from "@/server/services/bookings";
import { buildExportWorkbook } from "@/server/services/export";
import {
  acceptPlatformTerms,
  currentCustomerDocs,
  currentPlatformTerms,
  hasAcceptedPlatformTerms,
  hashLegalText,
} from "@/server/services/legal";
import { clock, createAdmin, createUser, expectAppError, setSettings, TOMORROW, TUESDAY } from "./helpers";

const IP = "10.1.2.3";
const UA = "Mozilla/5.0 (test)";

beforeEach(async () => {
  await setSettings();
});

describe("admin acceptance of the software terms", () => {
  it("is required, recorded with evidence, and then satisfied", async () => {
    const admin = await createAdmin();
    const terms = currentPlatformTerms();
    expect(await hasAcceptedPlatformTerms(admin.id)).toBe(false);

    await acceptPlatformTerms({ userId: admin.id, version: terms.version, ip: IP, userAgent: UA });
    expect(await hasAcceptedPlatformTerms(admin.id)).toBe(true);

    const record = await db.consentRecord.findFirstOrThrow({ where: { userId: admin.id } });
    expect(record).toMatchObject({
      context: "ADMIN_PLATFORM_TERMS",
      document: "PLATFORM_TERMS",
      version: terms.version,
      contentHash: terms.hash,
      ip: IP,
      userAgent: UA,
    });
    expect(record.acceptedAt).toBeInstanceOf(Date);
    expect(await db.auditLog.count({ where: { action: "PLATFORM_TERMS_ACCEPTED", actorId: admin.id } })).toBe(1);
  });

  it("asks again when a new version is published", async () => {
    const admin = await createAdmin();
    const v1 = currentPlatformTerms();
    await acceptPlatformTerms({ userId: admin.id, version: v1.version });
    const v2 = { ...v1, version: v1.version + 1, content: v1.content + "\n\n## ۱۳. بند جدید", hash: "" };
    v2.hash = hashLegalText(v2.title, v2.content);
    expect(await hasAcceptedPlatformTerms(admin.id, v2)).toBe(false);
    await acceptPlatformTerms({ userId: admin.id, version: v2.version }, v2);
    expect(await hasAcceptedPlatformTerms(admin.id, v2)).toBe(true);
    expect(await db.consentRecord.count({ where: { userId: admin.id } })).toBe(2); // history kept
  });

  it("asks again when the text changes even if the version number was not bumped", async () => {
    const admin = await createAdmin();
    const v1 = currentPlatformTerms();
    await acceptPlatformTerms({ userId: admin.id, version: v1.version });
    const edited = { ...v1, content: v1.content.replace("۱۲.", "۱۲ (ویرایش)."), hash: "" };
    edited.hash = hashLegalText(edited.title, edited.content);
    expect(await hasAcceptedPlatformTerms(admin.id, edited)).toBe(false);
  });

  it("rejects accepting an outdated version and non-admin accounts", async () => {
    const admin = await createAdmin();
    await expectAppError(acceptPlatformTerms({ userId: admin.id, version: currentPlatformTerms().version + 5 }), "TERMS_OUTDATED");
    const user = await createUser();
    await expectAppError(acceptPlatformTerms({ userId: user.id, version: currentPlatformTerms().version }), "FORBIDDEN");
    expect(await db.consentRecord.count()).toBe(0);
  });
});

describe("customer documents", () => {
  it("come from code with a version and a hash of the exact text", () => {
    const docs = currentCustomerDocs();
    expect(docs.TERMS).toMatchObject({ kind: "TERMS", title: "قوانین و مقررات" });
    expect(docs.PRIVACY).toMatchObject({ kind: "PRIVACY", title: "حریم خصوصی" });
    expect(docs.TERMS.version).toBeGreaterThanOrEqual(1);
    expect(docs.TERMS.content.length).toBeGreaterThan(100);
    expect(docs.TERMS.contentHash).toBe(hashLegalText(docs.TERMS.title, docs.TERMS.content));
    expect(docs.TERMS.contentHash).not.toBe(docs.PRIVACY.contentHash);
  });
});

describe("customer consent", () => {
  const PHONE = "09127778899";

  async function register() {
    const { devCode } = await requestOtp({
      phone: PHONE,
      purpose: "REGISTER",
      registration: { fullName: "سارا رضایی", gender: "FEMALE", acceptTerms: true },
      ip: IP,
    });
    return verifyOtp({ phone: PHONE, purpose: "REGISTER", code: devCode!, ip: IP, userAgent: UA });
  }

  it("registration requires ticking the checkbox", async () => {
    await expectAppError(
      requestOtp({ phone: PHONE, purpose: "REGISTER", registration: { fullName: "سارا رضایی", gender: "FEMALE", acceptTerms: false }, ip: IP }),
      "TERMS_REQUIRED",
    );
    expect(await db.otpCode.count()).toBe(0);
  });

  it("records the accepted versions at registration", async () => {
    const shown = currentCustomerDocs();
    const user = await register();

    const rows = await db.consentRecord.findMany({ where: { userId: user.id }, orderBy: { document: "asc" } });
    expect(rows.map((r) => [r.context, r.document, r.version])).toEqual([
      ["REGISTER", "PRIVACY", shown.PRIVACY.version],
      ["REGISTER", "TERMS", shown.TERMS.version],
    ]);
    expect(rows[1]!.contentHash).toBe(shown.TERMS.contentHash);
    expect(rows[0]).toMatchObject({ ip: IP, userAgent: UA });
  });

  it("does not ask for or record consent when booking", async () => {
    const user = await createUser(); // e.g. imported, without any consent record
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9 }, clock);
    await rescheduleBooking({ userId: user.id, bookingId: booking.id, dateKey: TUESDAY, hour: 10 }, clock);
    expect(await db.consentRecord.count({ where: { userId: user.id } })).toBe(0);
  });

  it("exports consent records to Excel", async () => {
    const admin = await createAdmin();
    await acceptPlatformTerms({ userId: admin.id, version: currentPlatformTerms().version, ip: IP, userAgent: UA });
    await register();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildExportWorkbook({ sections: ["consents"] }, clock)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("سوابق پذیرش قوانین")!;
    expect(sheet.rowCount).toBe(4); // header + admin terms + 2 registration documents
    const values = [2, 3, 4].map((r) => sheet.getRow(r).getCell(6).value);
    expect(values).toContain("شرایط استفاده از نرم‌افزار");
    expect(values).toContain("قوانین و مقررات");
    expect(sheet.getRow(2).getCell(10).value).toBe(IP);
    expect(String(sheet.getRow(2).getCell(13).value)).toHaveLength(64);
  });
});
