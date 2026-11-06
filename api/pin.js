// 미리 만든 팀원 계정의 첫 비밀번호 설정 (+ 소속 지정) 후 바로 로그인
import crypto from "node:crypto";
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, hashPin, validPin, startSession, setSid, publicAccount, ROLES, log, withErrors } from "./_lib/core.js";
export async function POST(req) {
  return withErrors(async () => {
    const { accountId, role, pin } = await body(req);
    if (!validPin(pin)) return fail("비밀번호는 숫자 4자리예요");
    if (!ROLES.includes(role)) return fail("소속을 골라 주세요");
    const acc = await update(P.accounts, fresh.accounts, d => {
      const a = d.list.find(x => x.id === accountId);
      if (!a || a.hash) return null;
      a.salt = crypto.randomBytes(16).toString("hex"); a.hash = hashPin(pin, a.salt); a.role = role;
      return { ...a };
    });
    if (!acc) return fail("이미 비밀번호가 있는 계정이거나 계정을 찾을 수 없어요", 409);
    await log("account", `${acc.name} 비밀번호 설정 (${role})`, acc.id);
    const { token, ses, acc: a } = await startSession(acc, req);
    return json({ me: { ...publicAccount(a), sessionId: ses.id, sessionStart: ses.loginAt } }, 200, setSid(token));
  });
}
