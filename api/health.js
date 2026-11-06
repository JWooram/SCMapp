// 저장소 점검: 팀 데이터는 건드리지 않고 db/health.json 에 두 번 연속 쓰고 읽어 본다.
import { read, update } from "./_lib/store.js";
import { json, withErrors } from "./_lib/core.js";
export async function GET() {
  return withErrors(async () => {
    const t0 = Date.now();
    await update("db/health.json", () => ({ count: 0 }), d => { d.count = (d.count || 0) + 1; d.at = new Date().toISOString(); });
    await update("db/health.json", () => ({ count: 0 }), d => { d.count = (d.count || 0) + 1; d.at = new Date().toISOString(); });
    const { data } = await read("db/health.json", () => ({}));
    return json({ ok: true, writes: data.count, ms: Date.now() - t0 });
  });
}
