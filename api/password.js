// 로그인한 사용자의 PIN 변경: 기존 PIN 재인증, 다른 기기 세션 무효화
import crypto from "node:crypto";
import { update } from "./_lib/store.js";
import { P, fresh, json, fail, body, checkPin, hashPin, validPin, currentAccount, log, withErrors } from "./_lib/core.js";

export async function POST(req) {
  return withErrors(async () => {
    const { acc, ses } = await currentAccount(req);
    if (!acc || !ses) return fail("로그인 후 비밀번호를 변경해 주세요", 401);
    const { currentPin, newPin } = await body(req);
    if (!validPin(currentPin) || !validPin(newPin)) return fail("기존·새 비밀번호는 숫자 4자리입니다", 400);
    if (currentPin === newPin) return fail("기존 비밀번호와 다른 번호를 입력해 주세요", 400);
    if (acc.pinChangeLockUntil && Date.now() < Date.parse(acc.pinChangeLockUntil))
      return fail("비밀번호 변경 시도가 잠겼습니다. 잠시 후 다시 시도해 주세요", 429);
    if (!checkPin(currentPin, acc)) {
      const count = await update(P.accounts, fresh.accounts, d => {
        const u = d.list.find(x => x.id === acc.id);
        u.pinChangeFails = (u.pinChangeFails || 0) + 1;
        if (u.pinChangeFails >= 5) { u.pinChangeLockUntil = new Date(Date.now() + 5 * 60000).toISOString(); u.pinChangeFails = 0; return 5; }
        return u.pinChangeFails;
      });
      return fail(count === 5 ? "5회 오류로 5분간 변경이 제한됩니다" : `현재 비밀번호가 다릅니다 (${count}/5)`, 401);
    }
    const salt = crypto.randomBytes(16).toString("hex"), hash = hashPin(newPin, salt);
    await update(P.accounts, fresh.accounts, d => {
      const u = d.list.find(x => x.id === acc.id);
      if (!u) return;
      u.salt = salt; u.hash = hash; u.pinChangeFails = 0; u.pinChangeLockUntil = null;
      u.pinChangedAt = new Date().toISOString();
    });
    // 변경한 현재 기기는 유지하되, 다른 기기는 로그아웃합니다.
    await update(P.sessions, fresh.sessions, d => {
      for (const x of d.list) if (x.accountId === acc.id && x.id !== ses.id && !x.logoutAt) {
        x.logoutAt = new Date().toISOString(); x.terminatedReason = "PIN 변경";
      }
    });
    await log("security", "비밀번호 변경 완료 (다른 기기 세션 종료)", acc.id);
    return json({ ok: true, message: "비밀번호가 변경되었습니다. 다른 기기 로그인이 종료되었습니다." });
  });
}
