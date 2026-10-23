import type { User } from "@prisma/client";
import { audit } from "../audit";
import { db } from "../db";
import { AppError } from "../errors";
import { enforceRateLimit, resetRateLimit } from "../rate-limit";
import { hashPassword, verifyPassword } from "./password";
import { deleteUserSessions } from "./sessions";

const MAX_PER_IP_15_MIN = 30;
const MAX_PER_USERNAME_15_MIN = 10;

export async function authenticateAdmin(input: { username: string; password: string; ip: string }): Promise<User> {
  const username = input.username.trim().toLowerCase();
  await enforceRateLimit(`admin-login-ip:${input.ip}`, MAX_PER_IP_15_MIN, 900);
  await enforceRateLimit(`admin-login-user:${username}`, MAX_PER_USERNAME_15_MIN, 900);

  const user = await db.user.findUnique({ where: { username } });
  const candidateHash = user?.role === "ADMIN" ? user.passwordHash : null;
  const valid = await verifyPassword(input.password, candidateHash);
  if (!valid || !user) throw new AppError("INVALID_CREDENTIALS");
  if (!user.isActive) throw new AppError("ACCOUNT_DISABLED");

  await resetRateLimit(`admin-login-user:${username}`);
  return user;
}

/** Changes an admin password and signs out the admin's other sessions. */
export async function changeAdminPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentToken?: string;
}): Promise<void> {
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user || user.role !== "ADMIN") throw new AppError("FORBIDDEN");
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw new AppError("WRONG_PASSWORD");

  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit(tx, { actorId: user.id, action: "ADMIN_PASSWORD_CHANGED", entity: "User", entityId: user.id });
  });
  await deleteUserSessions(user.id, input.currentToken);
}
