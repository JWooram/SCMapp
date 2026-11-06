// 개인 설정 저장 (자동 확정 기준)
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, currentAccount, withErrors } from "./_lib/core.js";
export async function PATCH(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req); if (!acc) return fail("로그인이 필요해요", 401);
    if (acc.role !== "SCM 수요계획팀") return fail("판단 기준 설정은 SCM 담당자만 가능합니다", 403);
    const { limit } = await body(req); const n = Number(limit);
    if (!(n >= 1 && n <= 50)) return fail("기준 값이 올바르지 않아요");
    await update(P.accounts, fresh.accounts, d => { const a = d.list.find(x => x.id === acc.id); if (a) a.limit = n; });
    return json({ ok: true });
  });
}
