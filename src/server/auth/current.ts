import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { env } from "../env";
import { AppError } from "../errors";
import { hasAcceptedPlatformTerms } from "../services/legal";
import { getUserBySessionToken, type SessionUser } from "./sessions";

/** Separate cookies so a user and an admin session can coexist in one browser. */
export const SESSION_COOKIES: Record<Role, string> = { USER: "bk_session", ADMIN: "bk_admin" };

export async function setSessionCookie(role: Role, token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIES[role], token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(role: Role): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIES[role]);
}

export async function getSessionToken(role: Role): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIES[role])?.value;
}

/** Current session user of the given role (cached per request). */
export const getCurrentUser = cache(async (role: Role): Promise<SessionUser | null> => {
  const user = await getUserBySessionToken(await getSessionToken(role));
  return user && user.role === role ? user : null;
});

/** For API handlers: throws 401 instead of redirecting. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser("USER");
  if (!user) throw new AppError("UNAUTHORIZED");
  return user;
}

/** Whether the admin accepted the current software terms (cached per request). */
export const adminAcceptedTerms = cache((userId: string) => hasAcceptedPlatformTerms(userId));

/**
 * For admin API handlers. Until the current software terms are accepted, every
 * admin endpoint is refused, except those that opt in with allowPendingTerms.
 */
export async function requireAdmin(options: { allowPendingTerms?: boolean } = {}): Promise<SessionUser> {
  const admin = await getCurrentUser("ADMIN");
  if (!admin) throw new AppError("UNAUTHORIZED");
  if (!options.allowPendingTerms && !(await adminAcceptedTerms(admin.id))) throw new AppError("TERMS_NOT_ACCEPTED");
  return admin;
}

/** For server components: redirects to the right login page. */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getCurrentUser("USER");
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage(options: { allowPendingTerms?: boolean } = {}): Promise<SessionUser> {
  const admin = await getCurrentUser("ADMIN");
  if (!admin) redirect("/admin/login");
  if (!options.allowPendingTerms && !(await adminAcceptedTerms(admin.id))) redirect("/admin/terms");
  return admin;
}
