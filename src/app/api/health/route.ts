import { providerStatus } from "@/server/config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const status = providerStatus();
  return NextResponse.json({ ok: true, demo: true, ...status });
}
