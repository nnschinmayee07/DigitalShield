import { NextResponse } from "next/server";
export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, ...(details ? { details } : {}) } }, { status });
}
export function internalError(error: unknown) {
  // Do not leak stack traces, SQL, or environment details to clients.
  console.error("DigitalShield API error:", error);
  return jsonError("An unexpected server error occurred.", 500);
}
export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new Error("INVALID_JSON"); }
}
