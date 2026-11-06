// 한 번만 수행하는 과거 활동 로그 정리.
// 계정/비밀번호/세션/업무 데이터는 절대로 수정하거나 삭제하지 않습니다.
// 새 로그는 db/logtable/ 아래 파일에 계속 보존됩니다.
import { read, update } from "./store.js";
const MARKER = "db/logtable/reset-v3.json";
const LEGACY_LOGS = ["db/activity.json", "db/audit.json"];
let completed = false;

export async function retireLegacyLogs() {
  if (completed) return true;
  const { data: state } = await read(MARKER, () => ({ done: false }));
  if (state.done) { completed = true; return true; }

  const removed = [], failed = [];
  if (process.env.LOCAL_STORE_DIR) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    for (const p of LEGACY_LOGS) {
      try { await fs.rm(path.join(process.env.LOCAL_STORE_DIR, p), { force: true }); removed.push(p); }
      catch(e) { failed.push(p + ": " + (e?.message || e)); }
    }
  } else {
    const { del } = await import("@vercel/blob");
    for (const p of LEGACY_LOGS) {
      try { await del(p); removed.push(p); }
      catch(e) { failed.push(p + ": " + (e?.message || e)); }
    }
  }
  if (failed.length) { console.error("Legacy log cleanup failed:", failed); return false; }
  await update(MARKER, () => ({ done: false }), d => {
    d.done = true; d.finishedAt = new Date().toISOString(); d.removed = removed;
    d.accountsPreserved = true; d.sessionsPreserved = true;
  });
  completed = true;
  return true;
}
