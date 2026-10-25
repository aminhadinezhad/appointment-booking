/**
 * Legal documents and consent records.
 *
 * All texts and their versions live in code (src/legal):
 * - PLATFORM_TERMS: software terms between the provider and the business.
 *   Admins must accept the exact current text (version + hash) before using the panel.
 * - TERMS / PRIVACY: customer-facing documents, accepted at registration.
 *
 * Consent rows are append-only and store the version and hash of the exact text
 * accepted, with time, IP and user agent, so they can serve as evidence.
 */
import { createHash } from "node:crypto";
import type { ConsentContext } from "@prisma/client";
import { CUSTOMER_PRIVACY, CUSTOMER_TERMS } from "@/legal/customer-documents";
import { PLATFORM_TERMS } from "@/legal/platform-terms";
import { audit } from "../audit";
import { db, type Tx } from "../db";
import { AppError } from "../errors";

export function hashLegalText(title: string, content: string): string {
  return createHash("sha256").update(`${title}\n${content}`).digest("hex");
}

export interface PlatformTerms {
  version: number;
  effectiveDate: string;
  title: string;
  summary: readonly string[];
  content: string;
  hash: string;
}

export function currentPlatformTerms(): PlatformTerms {
  return {
    version: PLATFORM_TERMS.version,
    effectiveDate: PLATFORM_TERMS.effectiveDate,
    title: PLATFORM_TERMS.title,
    summary: PLATFORM_TERMS.summary,
    content: PLATFORM_TERMS.content,
    hash: hashLegalText(PLATFORM_TERMS.title, PLATFORM_TERMS.content),
  };
}

/** True when the user has accepted exactly this text (same version and hash). */
export async function hasAcceptedPlatformTerms(userId: string, terms: PlatformTerms = currentPlatformTerms()): Promise<boolean> {
  const count = await db.consentRecord.count({
    where: { userId, document: "PLATFORM_TERMS", version: terms.version, contentHash: terms.hash },
  });
  return count > 0;
}

export async function acceptPlatformTerms(
  input: { userId: string; version: number; ip?: string | null; userAgent?: string | null },
  terms: PlatformTerms = currentPlatformTerms(),
): Promise<void> {
  if (input.version !== terms.version) throw new AppError("TERMS_OUTDATED");
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { role: true } });
    if (user?.role !== "ADMIN") throw new AppError("FORBIDDEN");
    await tx.consentRecord.create({
      data: {
        userId: input.userId,
        context: "ADMIN_PLATFORM_TERMS",
        document: "PLATFORM_TERMS",
        version: terms.version,
        contentHash: terms.hash,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
    await audit(tx, {
      actorId: input.userId,
      action: "PLATFORM_TERMS_ACCEPTED",
      entity: "ConsentRecord",
      details: { version: terms.version, hash: terms.hash },
    });
  });
}

// ---------------------------------------------------------------- customer documents

export const CUSTOMER_DOC_KINDS = ["TERMS", "PRIVACY"] as const;
export type CustomerDocKind = (typeof CUSTOMER_DOC_KINDS)[number];

export interface CustomerDoc {
  kind: CustomerDocKind;
  version: number;
  effectiveDate: string;
  title: string;
  content: string;
  contentHash: string;
}

export type CustomerDocs = Record<CustomerDocKind, CustomerDoc>;

const SOURCES: Record<CustomerDocKind, { version: number; effectiveDate: string; title: string; content: string }> = {
  TERMS: CUSTOMER_TERMS,
  PRIVACY: CUSTOMER_PRIVACY,
};

export function currentCustomerDocs(): CustomerDocs {
  const doc = (kind: CustomerDocKind): CustomerDoc => {
    const s = SOURCES[kind];
    return { kind, version: s.version, effectiveDate: s.effectiveDate, title: s.title, content: s.content, contentHash: hashLegalText(s.title, s.content) };
  };
  return { TERMS: doc("TERMS"), PRIVACY: doc("PRIVACY") };
}

export type AcceptedVersions = Record<CustomerDocKind, { version: number; hash: string }>;

export function acceptedVersionsOf(docs: CustomerDocs): AcceptedVersions {
  return {
    TERMS: { version: docs.TERMS.version, hash: docs.TERMS.contentHash },
    PRIVACY: { version: docs.PRIVACY.version, hash: docs.PRIVACY.contentHash },
  };
}

/** Writes one consent row per customer document (inside the caller's transaction). */
export async function recordCustomerConsent(
  tx: Tx,
  input: {
    userId: string;
    context: Exclude<ConsentContext, "ADMIN_PLATFORM_TERMS">;
    versions: AcceptedVersions;
    bookingId?: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  await tx.consentRecord.createMany({
    data: CUSTOMER_DOC_KINDS.map((kind) => ({
      userId: input.userId,
      context: input.context,
      document: kind,
      version: input.versions[kind].version,
      contentHash: input.versions[kind].hash,
      bookingId: input.bookingId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    })),
  });
}

