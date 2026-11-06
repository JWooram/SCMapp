import crypto from "node:crypto";
import { read, update } from "./store.js";
import { SAMPLE_DATASET, TEAM, TEAM_MEMBERS, ROLES } from "./seed.js";

export { ROLES };
export const P = {
  accounts: "db/accounts.json",
  sessions: "db/sessions.json",
  dataset: "db/dataset.json",
  plans: "db/plans.json",
  activity: "db/activity.json",
  audit: "db/audit.json",
  workspace: "db/workspace.json",
};
const now = () => new Date().toISOString();
const id = (n = 10) => crypto.randomBytes(n).toString("base64url");

/* ---------- 기본값 (파일이 아직 없을 때) ---------- */
export const fresh = {
  accounts: () => ({ list: TEAM_MEMBERS.map((name, i) => ({ id: `team1-0${i + 1}`, name, role: null, team: TEAM, salt: null, hash: null, loginCount: 0, online: false, createdAt: now() })) }),
  sessions: () => ({ list: [] }),
  dataset: () => ({ ...JSON.parse(JSON.stringify(SAMPLE_DATASET)), updatedBy: null, updatedAt: now(), note: "예시 데이터 (가상의 숫자)" }),
  plans: () => ({ list: [] }),
  activity: () => ({ list: [] }),
  audit: () => ({ version: 1, list: [] }),
};

/* ---------- HTTP 도우미 ---------- */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
export const fail = (msg, status = 400, extra = {}) => json({ error: msg, ...extra }, status);
export async function body(req) { try { return await req.json(); } catch { return {}; } }
function cookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
export function setSid(token) {
  const secure = process.env.LOCAL_STORE_DIR ? "" : " Secure;";
  return { "set-cookie": `sid=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}` };
}
export const clearSid = () => ({ "set-cookie": "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" });

/* ---------- 비밀번호 (scrypt 해시, 원문 저장 안 함) ---------- */
export function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString("hex"); }
export function checkPin(pin, acc) {
  if (!acc.hash || !acc.salt) return false;
  const a = Buffer.from(hashPin(pin, acc.salt), "hex"), b = Buffer.from(acc.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const validPin = p => /^\d{4}$/.test(String(p || ""));

/* ---------- 공개용 계정 정보 (해시·잠금 정보 제외) ---------- */
export function publicAccount(a) {
  if (!a) return null;
  const { salt, hash, fails, lockUntil, pinChangeFails, pinChangeLockUntil, ...rest } = a;
  return { ...rest, hasPin: !!hash };
}

/* ---------- 활동 기록 ---------- */
export async function log(type, text, accountId, meta = {}) {
  const entry = { id: id(8), type, text, by: accountId || null, at: now() };
  // 업무 요약 기록과 전용 감사 로그는 서로 다른 비공개 Blob JSON에 보관합니다.
  await Promise.all([
    update(P.activity, fresh.activity, d => { d.list.unshift(entry); d.list = d.list.slice(0, 300); }),
    update(P.audit, fresh.audit, d => { d.list.unshift({ ...entry, meta }); d.list = d.list.slice(0, 1000); })
  ]);
}

/* ---------- 세션 ---------- */
export async function currentAccount(req) {
  const t = cookie(req, "sid"); if (!t) return { acc: null, ses: null };
  const { data: s } = await read(P.sessions, fresh.sessions);
  const ses = s.list.find(x => x.tokenHash === sha(t) && !x.logoutAt);
  if (!ses) return { acc: null, ses: null };
  const { data: a } = await read(P.accounts, fresh.accounts);
  return { acc: a.list.find(x => x.id === ses.accountId) || null, ses };
}
export async function startSession(acc, req) {
  const token = id(32), at = now();
  const ua = req.headers.get("user-agent") || "";
  const ses = { id: id(8), tokenHash: sha(token), accountId: acc.id, role: acc.role, loginAt: at, logoutAt: null, durationMin: null, device: /Mobi/i.test(ua) ? "모바일" : "PC" };
  // 서로 다른 Blob 파일 3개를 병렬로 갱신해 모든 팀원의 로그인 대기시간을 단축합니다.
  // 인증(checkPin)은 위에서 완료됐으며, 기록이 모두 저장된 후에만 쿠키를 발급합니다.
  const [, updated] = await Promise.all([
    update(P.sessions, fresh.sessions, d => { d.list.unshift(ses); d.list = d.list.slice(0, 2000); }),
    update(P.accounts, fresh.accounts, d => {
      const a = d.list.find(x => x.id === acc.id);
      Object.assign(a, { loginCount: (a.loginCount || 0) + 1, lastLoginAt: at, firstLoginAt: a.firstLoginAt || at, online: true, currentSession: ses.id, fails: 0, lockUntil: null,
        recentLogins: [at, ...(a.recentLogins || [])].slice(0, 10) });
      return a;
    }),
    log("login", `${acc.name} 로그인 (${acc.role})`, acc.id, {device:ses.device})
  ]);
  return { token, ses, acc: updated };
}
export async function endSession(req) {
  const { acc, ses } = await currentAccount(req);
  if (!ses) return null;
  const at = now(), dur = Math.max(0, Math.round((new Date(at) - new Date(ses.loginAt)) / 60000));
  await update(P.sessions, fresh.sessions, d => { const s = d.list.find(x => x.id === ses.id); if (s) Object.assign(s, { logoutAt: at, durationMin: dur }); });
  if (acc) {
    await update(P.accounts, fresh.accounts, d => { const a = d.list.find(x => x.id === acc.id); if (a) Object.assign(a, { online: false, lastLogoutAt: at, currentSession: null }); });
    await log("logout", `${acc.name} 로그아웃 (${dur}분 사용)`, acc.id, {durationMin:dur});
  }
  return { acc, dur };
}

export async function withErrors(fn) {
  try { return await fn(); }
  catch (e) { console.error(e); return fail(e.message || "서버 오류", 500); }
}
