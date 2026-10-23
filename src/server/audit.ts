import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

export type AuditAction =
  | "USER_REGISTERED"
  | "USER_UPDATED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "BOOKING_CREATED"
  | "BOOKING_CANCELLED"
  | "BOOKING_RESCHEDULED"
  | "LOCK_CREATED"
  | "LOCK_UPDATED"
  | "LOCK_UNLOCKED"
  | "LOCK_REACTIVATED"
  | "SETTINGS_UPDATED"
  | "ADMIN_PASSWORD_CHANGED";

export async function audit(
  tx: Tx,
  entry: { actorId: string | null; action: AuditAction; entity: string; entityId?: string; details?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.auditLog.create({ data: entry });
}
