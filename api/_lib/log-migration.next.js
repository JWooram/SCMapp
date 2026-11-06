// 일회성 로그 초기화 마이그레이션 (v2, 2026-11-06 요청).
// 이전 로그(구 activity/audit + 로그테이블 v1)를 저장소에서 실제 삭제하고, 이후 로그는 새로 쌓입니다.
// 계정·로그인 세션·판매 데이터·판매계획은 손대지 않습니다.
import { read, update } from "./store.js";
const MARKER="db/logtable/reset-v2.json";
const LEGACY=["db/activity.json","db/audit.json","db/logtable/activity-v1.json","db/logtable/audit-v1.json"];
let completed=false;
export async function retireLegacyLogs() {
  if (completed) return true;
  const { data: state } = await read(MARKER, () => ({done:false}));
  if (state.done) { completed=true; return true; }
  const removed=[], failed=[];
  if (process.env.LOCAL_STORE_DIR) {
    const fs=await import("node:fs/promises");
    const path=await import("node:path");
    for(const p of LEGACY){ await fs.rm(path.join(process.env.LOCAL_STORE_DIR,p),{force:true}); removed.push(p); }
  } else {
    const { del } = await import("@vercel/blob");
    for(const p of LEGACY){
      try { await del(p); removed.push(p); }
      catch(e){ failed.push(p+": "+(e?.message||e)); }
    }
  }
  if (failed.length) { console.error("Log reset failed:", failed); return false; }
  await update(MARKER,()=>({done:false}),d=>{
    d.done=true;
    d.finishedAt=new Date().toISOString();
    d.removed=removed;
  });
  completed=true;
  return true;
}
