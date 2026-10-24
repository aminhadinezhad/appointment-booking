import { createHash, randomBytes } from "node:crypto";
import type { Role, User } from "@prisma/client";
import { db } from "../db";

export const SESSION_TTL_MS: Record<Role, number> = {
  USER: 30 * 24 * 60 * 60 * 1000, // 30 days
  ADMIN: 12 * 60 * 60 * 1000, // 12 hours
};

export type SessionUser = Pick<User, "id" | "fullName" | "phone" | "username" | "gender" | "role" | "isActive" | "notes" | "createdAt">;

const SESSION_USER_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  username: true,
  gender: true,
  role: true,
  isActive: true,
  notes: true,
  createdAt: true,
} as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  user: Pick<User, "id" | "role">,
  userAgent?: string | null,
  ip?: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS[user.role]);
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt,
      userAgent: userAgent?.slice(0, 300) ?? null,
      ip: ip?.slice(0, 64) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Resolves a session token to its (active) user, or null. Expired sessions are removed. */
export async function getUserBySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, expiresAt: true, user: { select: SESSION_USER_SELECT } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (!session.user.isActive) return null;
  return session.user;
}

export async function deleteSessionByToken(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function deleteUserSessions(userId: string, exceptToken?: string): Promise<void> {
  await db.session.deleteMany({
    where: { userId, ...(exceptToken ? { NOT: { tokenHash: hashToken(exceptToken) } } : {}) },
  });
}
