// 설정 탭의 별도 감사 로그. 반드시 로그인한 팀원에게만 제공합니다.
import { read } from "./_lib/store.js";
import { P, fresh, json, fail, currentAccount, withErrors } from "./_lib/core.js";

export async function GET(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req);
    if (!acc) return fail("로그인한 팀원만 로그 기록을 볼 수 있어요", 401);
    const { data } = await read(P.audit, fresh.audit);
    const list = Array.isArray(data.list) ? data.list : [];
    const counts = list.reduce((out, item) => {
      out[item.type] = (out[item.type] || 0) + 1;
      return out;
    }, {});
    return json({
      ok: true,
      list: list.slice(0, 120),
      total: list.length,
      counts,
      storage: "Vercel Blob · db/audit.json",
      note: "전용 로그 저장소 활성화 이후의 기록입니다."
    });
  });
}
