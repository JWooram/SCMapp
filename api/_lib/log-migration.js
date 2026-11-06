// 일회성 로그 재시작 마이그레이션. 이전 로그만 실제 저장소에서 삭제합니다.
// 계정·활성 로그인 세션·판매 데이터·판매계획은 손대지 않습니다.
import { read, update } from "./store.js";
const MARKER="db/logtable/legacy-cleanup-v1.json";
const LEGACY=["db/activity.json","db/audit.json"];
let completed=false;
export async function retireLegacyLogs() {
  if (completed) return true;
  const { data: state } = await read(MARKER, () => ({done:false}));
  if (state.done) { completed=true; return true; }
  if (process.env.LOCAL_STORE_DIR) {
    const fs=await import("node:fs/promises");
    const path=await import("node:path");
    for(const p of LEGACY) await fs.rm(path.join(process.env.LOCAL_STORE_DIR,p),{force:true});
  } else {
    // Vercel Blob SDK supports deleting by a list of private Blob pathnames.
    const { del } = await import("@vercel/blob");
    await del(LEGACY);
  }
  await update(MARKER,()=>({done:false}),d=>{
    d.done=true;
    d.finishedAt=new Date().toISOString();
    d.removed=LEGACY;
  });
  completed=true;
  return true;
}
