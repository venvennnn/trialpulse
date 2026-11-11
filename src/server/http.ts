import { NextResponse } from "next/server";

const buckets = new Map<string, { count: number; reset: number }>();

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function allowRate(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = buckets.get(key);
  if (!current || current.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export async function guardMutation(req: Request, limitKey: string): Promise<NextResponse | null> {
  if (!sameOrigin(req)) return jsonError(403, "FORBIDDEN", "Cross-site request blocked.");
  if (!allowRate(limitKey, 30, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
  const bodyPeek = req.headers.get("x-trialpulse-mode");
  if (bodyPeek === "demo") return jsonError(403, "FORBIDDEN", "Demo identifiers have no authority on provider routes.");
  return null;
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
