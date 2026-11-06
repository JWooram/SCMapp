// 일회성 초기화 마이그레이션 (v3, 2026-11-06 요청).
// 서버 계정·로그인 세션을 모두 비우고, 로그(구 activity/audit + 로그테이블 v1)도 실제 삭제합니다.
// 이후에는 '+ 새 계정 만들기'로 만든 계정만 생기고, 로그는 새로 쌓입니다.
// 판매 데이터·판매계획·협업 데이터는 손대지 않습니다.
import { read, update } from "./store.js";
const MARKER="db/logtable/reset-v3.json";
const LOGS=["db/activity.json","db/audit.json","db/logtable/activity-v1.json","db/logtable/audit-v1.json"];
let completed=false;
export async function retireLegacyLogs() {
  if (completed) return true;
  const { data: state } = await read(MARKER, () => ({done:false}));
  if (state.done) { completed=true; return true; }
  // 1) 계정·세션 비우기 (빈 목록으로 저장해 예전 기본 팀원 계정도 다시 생기지 않게 함)
  await update("db/accounts.json", () => ({list:[]}), d => { d.list = []; });
  await update("db/sessions.json", () => ({list:[]}), d => { d.list = []; });
  // 2) 로그 실제 삭제
  const removed=[], failed=[];
  if (process.env.LOCAL_STORE_DIR) {
    const fs=await import("node:fs/promises");
    const path=await import("node:path");
    for(const p of LOGS){ await fs.rm(path.join(process.env.LOCAL_STORE_DIR,p),{force:true}); removed.push(p); }
  } else {
    const { del } = await import("@vercel/blob");
    for(const p of LOGS){
      try { await del(p); removed.push(p); }
      catch(e){ failed.push(p+": "+(e?.message||e)); }
    }
  }
  if (failed.length) { console.error("Reset failed:", failed); return false; }
  await update(MARKER,()=>({done:false}),d=>{
    d.done=true;
    d.finishedAt=new Date().toISOString();
    d.removed=removed;
    d.accountsCleared=true;
  });
  completed=true;
  return true;
}
