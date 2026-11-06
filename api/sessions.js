// 내 접속 기록 (최근 10회)
import { read } from "./_lib/store.js";
import { P, fresh, json, fail, currentAccount, withErrors } from "./_lib/core.js";
export async function GET(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req); if (!acc) return fail("로그인이 필요해요", 401);
    const { data } = await read(P.sessions, fresh.sessions);
    return json({ list: data.list.filter(s => s.accountId === acc.id).slice(0, 10).map(({ tokenHash, ...s }) => s) });
  });
}
