import { json, endSession, clearSid, withErrors } from "./_lib/core.js";
export async function POST(req) {
  return withErrors(async () => { const r = await endSession(req); return json({ ok: true, durationMin: r?.dur ?? null }, 200, clearSid()); });
}
