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
const notFound = e => e && (e.name === "BlobNotFoundError" || /not\s*found/i.test(e.message || ""));
const isConflict = e => e && (e.name === "BlobPreconditionFailedError" || /precondition/i.test(e.message || ""));

async function readRaw(p) {
  if (LOCAL) {
    try { return { txt: await fs.readFile(path.join(LOCAL, p), "utf8") }; } catch { return null; }
  }
  const { get } = await blob();
  try {
    const r = await get(p, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return { txt: await new Response(r.stream).text(), etag: r.blob && r.blob.etag };
  } catch (e) { if (notFound(e)) return null; throw e; }
}

async function writeRaw(p, txt, etag) {
  if (LOCAL) {
    const f = path.join(LOCAL, p);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, txt);
    return;
  }
  const { put } = await blob();
  const opts = { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60 };
  // Vercel Blob의 get() ETag와 put() ifMatch 형식이 맞지 않아 버전 비교는 쓰지 않는다(마지막 저장 우선).
  await put(p, txt, opts);
}

export async function read(p, fallback) {
  const r = await readRaw(p);
  if (!r) return { data: fallback(), etag: null };
  return { data: JSON.parse(r.txt), etag: r.etag || null };
}

// 읽고-고치고-쓰기 (수업용 규모라 마지막 저장 우선으로 충분)
export async function update(p, fallback, fn) {
  const { data } = await read(p, fallback);
  const out = await fn(data);
  await writeRaw(p, JSON.stringify(data), null);
  return out;
}
