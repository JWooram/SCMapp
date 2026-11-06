// 새 계정 만들기 (이름 + 소속 + 비밀번호) 후 바로 로그인
import crypto from "node:crypto";
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, hashPin, validPin, startSession, setSid, publicAccount, ROLES, log, withErrors } from "./_lib/core.js";
import { TEAM } from "./_lib/seed.js";
export async function POST(req) {
  return withErrors(async () => {
    const { name, role, pin } = await body(req);
    const nm = String(name || "").trim().replace(/[<>]/g, "");
    if (!nm || nm.length > 20) return fail("이름을 1~20자로 입력해 주세요");
    if (!ROLES.includes(role)) return fail("소속을 골라 주세요");
    if (!validPin(pin)) return fail("비밀번호는 숫자 4자리예요");
    const acc = await update(P.accounts, fresh.accounts, d => {
      if (d.list.some(a => a.name === nm)) return null;
      if (d.list.length >= 100) return null;
      const salt = crypto.randomBytes(16).toString("hex");
      const a = { id: "acc-" + crypto.randomBytes(6).toString("hex"), name: nm, role, team: TEAM, salt, hash: hashPin(pin, salt), loginCount: 0, online: false, createdAt: new Date().toISOString() };
      d.list.push(a); return { ...a };
    });
    if (!acc) return fail("같은 이름의 계정이 이미 있어요", 409);
    await log("account", `${acc.name} 계정 생성 (${role})`, acc.id);
    const { token, ses, acc: a } = await startSession(acc, req);
    return json({ me: { ...publicAccount(a), sessionId: ses.id, sessionStart: ses.loginAt } }, 200, setSid(token));
  });
}
