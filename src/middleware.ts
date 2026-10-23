import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Edge-level guard. Real authorisation happens on the server in every API
 * handler and layout; this only
 *   1. rejects cross-site state-changing API requests (CSRF defence in depth), and
 *   2. redirects visitors without a session cookie away from protected pages.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin && host && originHost(origin) !== host) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "درخواست از مبدأ نامعتبر" } }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !req.cookies.has("bk_admin")) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  if (/^\/(home|bookings|profile)(\/|$)/.test(pathname) && !req.cookies.has("bk_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null; // e.g. "null" from sandboxed frames
  }
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/home/:path*", "/bookings/:path*", "/profile/:path*"],
};
