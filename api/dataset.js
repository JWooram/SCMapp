// 판매·딜러 데이터 저장 (로그인한 사람만)
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, currentAccount, log, withErrors } from "./_lib/core.js";
export async function PUT(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req); if (!acc) return fail("로그인이 필요해요", 401);
    if (acc.role !== "SCM 수요계획팀") return fail("판매실적 수정은 SCM 담당자만 가능합니다", 403);
    const { start, series, orders, note } = await body(req);
    if (!start || typeof series !== "object" || !Array.isArray(orders)) return fail("데이터 형식이 올바르지 않아요");
    if (Object.keys(series).length > 50 || orders.length > 2000 || JSON.stringify(series).length > 200000) return fail("데이터가 너무 커요");
    for (const k in series) if (!Array.isArray(series[k]) || series[k].some(v => v !== null && typeof v !== "number")) return fail("판매 실적은 숫자여야 해요");
    const at = new Date().toISOString();
    await update(P.dataset, fresh.dataset, d => { Object.assign(d, { start, series, orders, updatedBy: acc.id, updatedAt: at, note: String(note || "").slice(0, 200) }); });
    await log("data", String(note || "데이터 수정").slice(0, 200), acc.id);
    return json({ ok: true, updatedAt: at });
  });
}
