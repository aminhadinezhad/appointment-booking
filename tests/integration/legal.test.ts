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
  hasAcceptedCustomerDocs,
  hasAcceptedPlatformTerms,
  hashLegalText,
  resolveBookingConsent,
  type CustomerDocs,
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

/** The current documents with the privacy text edited, as after a developer changes it. */
function withUpdatedPrivacy(): CustomerDocs {
  const docs = currentCustomerDocs();
  const content = `${docs.PRIVACY.content}\n\nبند جدید`;
  return {
    ...docs,
    PRIVACY: { ...docs.PRIVACY, version: docs.PRIVACY.version + 1, content, contentHash: hashLegalText(docs.PRIVACY.title, content) },
  };
}

describe("customer documents", () => {
  it("come from code with a version and a hash of the exact text", () => {
    const docs = currentCustomerDocs();
    expect(docs.TERMS).toMatchObject({ kind: "TERMS", version: 1, title: "قوانین و مقررات" });
    expect(docs.PRIVACY).toMatchObject({ kind: "PRIVACY", version: 1, title: "حریم خصوصی" });
    expect(docs.TERMS.content.length).toBeGreaterThan(100);
    expect(docs.TERMS.contentHash).toBe(hashLegalText(docs.TERMS.title, docs.TERMS.content));
    expect(docs.TERMS.contentHash).not.toBe(docs.PRIVACY.contentHash);
  });
});

describe("customer consent", () => {
  const PHONE = "09127778899";

  it("registration requires ticking the checkbox", async () => {
    await expectAppError(
      requestOtp({ phone: PHONE, purpose: "REGISTER", registration: { fullName: "سارا رضایی", gender: "FEMALE", acceptTerms: false }, ip: IP }),
      "TERMS_REQUIRED",
    );
    expect(await db.otpCode.count()).toBe(0);
  });

  it("records the accepted versions at registration", async () => {
    const shown = currentCustomerDocs();
    const { devCode } = await requestOtp({
      phone: PHONE,
      purpose: "REGISTER",
      registration: { fullName: "سارا رضایی", gender: "FEMALE", acceptTerms: true },
      ip: IP,
    });
    const user = await verifyOtp({ phone: PHONE, purpose: "REGISTER", code: devCode!, ip: IP, userAgent: UA });

    const rows = await db.consentRecord.findMany({ where: { userId: user.id }, orderBy: { document: "asc" } });
    expect(rows.map((r) => [r.context, r.document, r.version])).toEqual([
      ["REGISTER", "PRIVACY", 1],
      ["REGISTER", "TERMS", 1],
    ]);
    expect(rows[1]!.contentHash).toBe(shown.TERMS.contentHash);
    expect(rows[0]).toMatchObject({ ip: IP, userAgent: UA });
  });

  it("records consent with each booking, inside the booking transaction", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9, consent: { ip: IP, userAgent: UA } }, clock);
    const rows = await db.consentRecord.findMany({ where: { bookingId: booking.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.context === "BOOKING" && r.userId === user.id && r.ip === IP)).toBe(true);

    // a rejected booking leaves no consent rows behind
    await expectAppError(createBooking({ userId: other.id, dateKey: TOMORROW, hour: 9, consent: { ip: IP } }, clock), "SLOT_TAKEN");
    expect(await db.consentRecord.count({ where: { userId: other.id } })).toBe(0);

    const moved = await rescheduleBooking({ userId: user.id, bookingId: booking.id, dateKey: TUESDAY, hour: 10, consent: { ip: IP } }, clock);
    expect(await db.consentRecord.count({ where: { bookingId: moved.id, context: "BOOKING" } })).toBe(2);
  });

  it("asks for consent at booking only after the texts were updated", async () => {
    const { devCode } = await requestOtp({
      phone: PHONE,
      purpose: "REGISTER",
      registration: { fullName: "سارا رضایی", gender: "FEMALE", acceptTerms: true },
      ip: IP,
    });
    const user = await verifyOtp({ phone: PHONE, purpose: "REGISTER", code: devCode!, ip: IP });

    // accepted at registration: nothing to show or record at booking time
    expect(await hasAcceptedCustomerDocs(user.id)).toBe(true);
    expect(await resolveBookingConsent({ userId: user.id, ip: IP })).toBeUndefined();

    // after the privacy text changes, the next booking must carry the acceptance
    const updated = withUpdatedPrivacy();
    expect(await hasAcceptedCustomerDocs(user.id, updated)).toBe(false);
    await expectAppError(resolveBookingConsent({ userId: user.id, ip: IP }, updated), "TERMS_UPDATED");
    expect(await resolveBookingConsent({ userId: user.id, acceptTerms: true, ip: IP, userAgent: UA }, updated)).toEqual({
      ip: IP,
      userAgent: UA,
    });

    // a booking made with consent records the current versions
    const booking = await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9, consent: { ip: IP } }, clock);
    const rows = await db.consentRecord.findMany({ where: { bookingId: booking.id }, orderBy: { document: "asc" } });
    expect(rows.map((r) => [r.document, r.version])).toEqual([
      ["PRIVACY", 1],
      ["TERMS", 1],
    ]);
  });

  it("treats customers without any consent record (e.g. imported) as needing consent", async () => {
    const user = await createUser();
    expect(await hasAcceptedCustomerDocs(user.id)).toBe(false);
    await expectAppError(resolveBookingConsent({ userId: user.id }), "TERMS_UPDATED");
  });

  it("exports consent records to Excel", async () => {
    const admin = await createAdmin();
    await acceptPlatformTerms({ userId: admin.id, version: currentPlatformTerms().version, ip: IP, userAgent: UA });
    const user = await createUser({ fullName: "علی محمدی", phone: "09121112222" });
    await createBooking({ userId: user.id, dateKey: TOMORROW, hour: 9, consent: { ip: IP } }, clock);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildExportWorkbook({ sections: ["consents"] }, clock)) as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("سوابق پذیرش قوانین")!;
    expect(sheet.rowCount).toBe(4); // header + admin terms + 2 booking documents
    const values = [2, 3, 4].map((r) => sheet.getRow(r).getCell(6).value);
    expect(values).toContain("شرایط استفاده از نرم‌افزار");
    expect(values).toContain("قوانین و مقررات");
    expect(sheet.getRow(2).getCell(10).value).toBe(IP);
    expect(String(sheet.getRow(2).getCell(13).value)).toHaveLength(64);
  });
});
