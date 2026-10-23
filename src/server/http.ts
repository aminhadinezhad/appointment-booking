import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { AppError } from "./errors";

export type ApiErrorBody = {
  error: { code: string; message: string; details?: Record<string, unknown>; fields?: Record<string, string> };
};

function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fields;
}

export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    const headers: HeadersInit = {};
    const retry = error.details?.retryAfterSec;
    if (error.status === 429 && typeof retry === "number") headers["Retry-After"] = String(retry);
    return NextResponse.json(
      { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      { status: error.status, headers },
    );
  }
  if (error instanceof ZodError) {
    const fields = zodFields(error);
    return NextResponse.json(
      { error: { code: "VALIDATION", message: Object.values(fields)[0] ?? "اطلاعات ارسالی معتبر نیست", fields } },
      { status: 400 },
    );
  }
  console.error("[api] unexpected error:", error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید" } }, { status: 500 });
}

type RouteContext<P> = { params: Promise<P> };

/** Wraps a route handler: maps errors to JSON responses and serialises plain return values. */
export function api<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("VALIDATION", { message: "بدنه درخواست معتبر نیست" });
  }
  return schema.parse(body);
}

export function readQuery<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}
