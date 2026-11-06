// 앱을 열 때 한 번에 필요한 데이터: 내 로그인 상태, 팀원 계정, 판매 데이터, 계획, 활동 기록
import { read } from "./_lib/store.js";
import { P, fresh, json, publicAccount, currentAccount, withErrors } from "./_lib/core.js";
export async function GET(req) {
  return withErrors(async () => {
    const [{ acc, ses }, a, d, p, act] = await Promise.all([
      currentAccount(req), read(P.accounts, fresh.accounts), read(P.dataset, fresh.dataset), read(P.plans, fresh.plans), read(P.activity, fresh.activity)]);
    return json({
      me: acc ? { ...publicAccount(acc), sessionId: ses.id, sessionStart: ses.loginAt } : null,
      accounts: a.data.list.map(publicAccount),
      dataset: d.data, plans: p.data.list.slice(0, 12), activity: act.data.list.slice(0, 40),
      server: { store: process.env.LOCAL_STORE_DIR ? "local" : "vercel-blob", time: new Date().toISOString() }
    });
  });
}
