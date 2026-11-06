// 로그인: 계정 ID + 비밀번호 4자리. 5번 틀리면 5분 잠금.
import { read, update } from "./_lib/store.js";
import { P, fresh, json, fail, body, checkPin, validPin, startSession, setSid, publicAccount, withErrors } from "./_lib/core.js";
export async function POST(req) {
  return withErrors(async () => {
    const { accountId, pin } = await body(req);
    if (!accountId || !validPin(pin)) return fail("계정과 비밀번호 4자리를 입력해 주세요");
    const { data } = await read(P.accounts, fresh.accounts);
    const acc = data.list.find(a => a.id === accountId);
    if (!acc) return fail("계정을 찾을 수 없어요", 404);
    if (!acc.hash) return fail("아직 비밀번호를 정하지 않은 계정이에요", 409, { needPin: true });
    if (acc.lockUntil && Date.now() < Date.parse(acc.lockUntil)) return fail(`잠겨 있어요. ${Math.ceil((Date.parse(acc.lockUntil) - Date.now()) / 1000)}초 뒤에 다시 시도해 주세요`, 423);
    if (!checkPin(pin, acc)) {
      const fails = await update(P.accounts, fresh.accounts, d => { const a = d.list.find(x => x.id === accountId); a.fails = (a.fails || 0) + 1; if (a.fails >= 5) { a.lockUntil = new Date(Date.now() + 5 * 60000).toISOString(); a.fails = 0; return 5; } return a.fails; });
      return fail(fails >= 5 ? "5번 틀려서 5분 동안 잠겼어요" : `비밀번호가 달라요 (${fails}/5)`, 401);
    }
    const { token, ses, acc: a } = await startSession(acc, req);
    return json({ me: { ...publicAccount(a), sessionId: ses.id, sessionStart: ses.loginAt } }, 200, setSid(token));
  });
}
