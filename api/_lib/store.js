// 저장소: Vercel Blob(비공개)에 JSON 파일로 저장한다.
// 로컬 점검 때는 LOCAL_STORE_DIR 환경변수가 있으면 디스크 폴더를 대신 쓴다.
import { promises as fs } from "node:fs";
import path from "node:path";

const LOCAL = process.env.LOCAL_STORE_DIR;
let blobMod = null;
async function blob() {
  if (!blobMod) blobMod = await import("@vercel/blob");
  return blobMod;
}

class Conflict extends Error {}

async function readRaw(p) {
  if (LOCAL) {
    try {
      const f = path.join(LOCAL, p);
      const txt = await fs.readFile(f, "utf8");
      const st = await fs.stat(f);
      return { txt, etag: String(st.mtimeMs) };
    } catch { return null; }
  }
  const { get } = await blob();
  try {
    const r = await get(p, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    const txt = await new Response(r.stream).text();
    return { txt, etag: r.blob.etag };
  } catch (e) {
    if (e && (e.name === "BlobNotFoundError" || /not\s*found/i.test(e.message || ""))) return null;
    throw e;
  }
}

async function writeRaw(p, txt, etag) {
  if (LOCAL) {
    const f = path.join(LOCAL, p);
    await fs.mkdir(path.dirname(f), { recursive: true });
    if (etag) { try { const st = await fs.stat(f); if (String(st.mtimeMs) !== etag) throw new Conflict(); } catch (e) { if (e instanceof Conflict) throw e; } }
    await fs.writeFile(f, txt);
    return;
  }
  const { put } = await blob();
  const opts = { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" };
  if (etag) opts.ifMatch = etag;
  try { await put(p, txt, opts); }
  catch (e) { if (e && (e.name === "BlobPreconditionFailedError" || /precondition/i.test(e.message || ""))) throw new Conflict(); throw e; }
}

export async function read(p, fallback) {
  const r = await readRaw(p);
  if (!r) return { data: fallback(), etag: null };
  return { data: JSON.parse(r.txt), etag: r.etag };
}

// 읽고-고치고-쓰기. 다른 사람이 동시에 고쳤으면(etag 불일치) 다시 시도한다.
export async function update(p, fallback, fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await read(p, fallback);
    const out = await fn(data);
    try { await writeRaw(p, JSON.stringify(data), etag); return out; }
    catch (e) { if (e instanceof Conflict) { await new Promise(r => setTimeout(r, 60 * (i + 1) + Math.random() * 60)); continue; } throw e; }
  }
  throw new Error("저장 충돌이 반복돼요. 잠시 후 다시 시도해 주세요");
}
