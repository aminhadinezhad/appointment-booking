import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { env } from "../env";
import { AppError } from "../errors";
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

export async function requireAdmin(): Promise<SessionUser> {
  const admin = await getCurrentUser("ADMIN");
  if (!admin) throw new AppError("UNAUTHORIZED");
  return admin;
}

/** For server components: redirects to the right login page. */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getCurrentUser("USER");
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const admin = await getCurrentUser("ADMIN");
  if (!admin) redirect("/admin/login");
  return admin;
}
