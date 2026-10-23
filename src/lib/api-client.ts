/** Thin fetch wrapper for the app's JSON API (client side). */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal };

export async function apiFetch<T>(url: string, options: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید", 0, "NETWORK");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && typeof window !== "undefined") {
      const loginPath = window.location.pathname.startsWith("/admin") ? "/admin/login" : "/login";
      if (window.location.pathname !== loginPath) window.location.assign(loginPath);
    }
    throw new ApiError(err?.message ?? "خطای غیرمنتظره‌ای رخ داد", res.status, err?.code ?? "UNKNOWN", err?.fields, err?.details);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "خطای غیرمنتظره‌ای رخ داد";
}

export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
}
