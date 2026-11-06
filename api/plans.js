// 판매계획 확정 저장 (월별 1건, 같은 달은 덮어씀)
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, currentAccount, log, withErrors } from "./_lib/core.js";
export async function POST(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req); if (!acc) return fail("로그인이 필요해요", 401);
    if (acc.role !== "SCM 수요계획팀") return fail("판매계획 확정은 SCM 담당자만 가능합니다", 403);
    const { plan } = await body(req);
    if (!plan || !/^\d{4}-\d{2}$/.test(plan.month) || !Array.isArray(plan.items) || plan.items.length > 50) return fail("계획 형식이 올바르지 않아요");
    const saved = { ...plan, confirmedBy: acc.id, confirmedAt: new Date().toISOString() };
    await update(P.plans, fresh.plans, d => { d.list = [saved, ...d.list.filter(p => p.month !== saved.month)].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 60); });
    const [y, m] = saved.month.split("-");
    await log("plan", `${+m}월 판매계획 확정 (자동 ${saved.auto} · 협의 ${saved.exceptions})`, acc.id);
    return json({ ok: true, plan: saved });
  });
}
