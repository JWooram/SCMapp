// 역할별 업무 데이터 — 교육용 SCM 협업 MVP
// DB: Vercel Blob private JSON db/workspace.json
import crypto from "node:crypto";
import { read, update } from "./_lib/store.js";
import { P, fresh, json, fail, body, currentAccount, log, withErrors } from "./_lib/core.js";
import { SAMPLE_DATASET, ROLES } from "./_lib/seed.js";

const SCM = ROLES[0], SALES = ROLES[1], PROD = ROLES[2];
const uid = () => crypto.randomBytes(9).toString("base64url");
const at = () => new Date().toISOString();
const clean = (v, max = 160) => String(v ?? "").trim().replace(/[<>]/g, "").slice(0, max);
const qty = v => Number.isSafeInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 999999 ? Number(v) : null;
const periodOK = v => /^20\d{2}-(0[1-9]|1[0-2])$/.test(String(v));
const modelOK = name => Object.hasOwn(SAMPLE_DATASET.series, name);
const limitList = (list, n = 300) => list.slice(0, n);
const blank = () => ({ version: 1, rules: { threshold: 8, at: null, by: null },
  orders: [], inventory: [], capacities: [], overrides: [], exceptions: [], transfers: [] });
const B = "db/workspace.json";
const actionRoles = {
  "order.create": [SALES], "order.reason": [SALES],
  "capacity.save": [PROD], "inventory.save": [PROD], "transfer.ack": [PROD],
  "forecast.save": [SCM], "rules.save": [SCM], "exception.create": [SCM],
  "exception.reply": [SALES, PROD], "exception.decide": [SCM],
  "transfer.send": [SCM]
};
export async function GET(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req);
    if (!acc) return fail("로그인이 필요합니다", 401);
    const { data } = await read(B, blank);
    return json({ ok: true, role: acc.role, workspace: data, note: "실제 ERP 연결 전 시제품. 현업 데이터 아님." });
  });
}
export async function POST(req) {
  return withErrors(async () => {
    const { acc } = await currentAccount(req);
    if (!acc) return fail("로그인이 필요합니다", 401);
    const payload = await body(req), action = String(payload.action || "");
    if (!actionRoles[action]) return fail("지원하지 않는 작업입니다", 400);
    if (!actionRoles[action].includes(acc.role)) return fail("해당 직무의 작업 권한이 없습니다", 403);
    const t = at(), a = payload.data || {};
    let result = null, event = null, error = null;
    // 주의: 이 저장소는 교육용 단일 JSON이며 동시 쓰기 경합 가능성이 있습니다.
    await update(B, blank, d => {
      d.rules ||= { threshold: 8 };
      for (const key of ["orders", "inventory", "capacities", "overrides", "exceptions", "transfers"]) d[key] ||= [];
      const bad = msg => { error = msg; };
      if (action === "order.create") {
        const q = qty(a.quantity), dealer = clean(a.dealer, 70), model = clean(a.model, 50);
        if (!dealer || !modelOK(model) || q == null || q < 1) return bad("영업점·차종·수량을 확인해 주세요");
        result = { id: uid(), dealer, model, spec: clean(a.spec, 70), region: clean(a.region, 50) || "미지정",
          quantity: q, reason: clean(a.reason, 280), status: "접수", targetMonth: periodOK(a.targetMonth) ? a.targetMonth : null,
          eta: null, by: acc.id, at: t };
        d.orders.unshift(result); d.orders = limitList(d.orders, 500);
        event = `${dealer} · ${model} ${q}대 주문 접수`;
      } else if (action === "order.reason") {
        const o = d.orders.find(x => x.id === a.id);
        if (!o || o.by !== acc.id) return bad("본인 주문만 수정할 수 있습니다");
        const reason = clean(a.reason, 280);
        if (!reason) return bad("변경 사유를 입력해 주세요");
        o.reason = reason; o.updatedAt = t; result = o; event = `${o.model} 주문 변경 사유 갱신`;
      } else if (action === "inventory.save") {
        if (!modelOK(a.model) || qty(a.finished) == null || qty(a.parts) == null) return bad("차종 및 재고 수량이 올바르지 않습니다");
        result = { model: a.model, finished: qty(a.finished), parts: qty(a.parts), at: t, by: acc.id };
        d.inventory = [result, ...d.inventory.filter(x => x.model !== a.model)];
        event = `${a.model} 완성차·부품 재고 반영`;
      } else if (action === "capacity.save") {
        if (!modelOK(a.model) || !periodOK(a.month) || !clean(a.line, 60) || qty(a.capacity) == null || qty(a.partsLimit) == null)
          return bad("차종·기간·라인 및 생산 가능 수량을 확인해 주세요");
        result = { model: a.model, month: a.month, line: clean(a.line, 60), capacity: qty(a.capacity),
          partsLimit: qty(a.partsLimit), note: clean(a.note, 220), at: t, by: acc.id };
        d.capacities = [result, ...d.capacities.filter(x => !(x.model === result.model && x.month === result.month && x.line === result.line))].slice(0, 300);
        event = `${result.model} ${result.month} 생산 가능 물량 입력`;
      } else if (action === "forecast.save") {
        const f = qty(a.forecast), r = qty(a.revised), actual = qty(a.actual);
        if (!modelOK(a.model) || !periodOK(a.month) || f == null || r == null || actual == null) return bad("예측·수주·수정 수량을 확인해 주세요");
        result = { model: a.model, month: a.month, region: clean(a.region, 50) || "전체", forecast: f, revised: r,
          actual, reason: clean(a.reason, 240), by: acc.id, at: t };
        d.overrides = [result, ...d.overrides.filter(x => !(x.model === result.model && x.month === result.month && x.region === result.region))].slice(0, 300);
        event = `${result.model} 예측값 ${f}→${r} 수정`;
      } else if (action === "rules.save") {
        const n = Number(a.threshold);
        if (!Number.isFinite(n) || n < 1 || n > 50) return bad("오차 기준은 1~50%만 입력할 수 있습니다");
        d.rules = { threshold: n, by: acc.id, at: t };
        result = d.rules; event = `예외 판정 기준 ±${n}% 변경`;
      } else if (action === "exception.create") {
        if (!modelOK(a.model) || !periodOK(a.month) || qty(a.forecast) == null || qty(a.actual) == null)
          return bad("협의 항목의 차종·기간·수량을 확인해 주세요");
        if (d.exceptions.some(x => x.model === a.model && x.month === a.month && x.status === "협의중"))
          return bad("해당 월·차종의 진행 중인 협의가 이미 있습니다");
        const f = qty(a.forecast), actual = qty(a.actual);
        result = { id: uid(), model: a.model, month: a.month, region: clean(a.region, 50) || "전체",
          forecast: f, actual, errorPct: f ? +((actual - f) / f * 100).toFixed(1) : null,
          reason: clean(a.reason, 300) || "기준 초과/특이 상황", status: "협의중",
          replies: [], decidedQty: null, decision: "", by: acc.id, at: t };
        d.exceptions.unshift(result); d.exceptions = limitList(d.exceptions, 300);
        event = `${result.model} 예외 협의 요청`;
      } else if (action === "exception.reply") {
        const x = d.exceptions.find(x => x.id === a.id);
        if (!x || x.status !== "협의중") return bad("진행 중인 협의를 선택해 주세요");
        const note = clean(a.note, 500), proposal = qty(a.proposal);
        if (!note || proposal == null) return bad("협의 의견과 제안 수량을 입력해 주세요");
        const reply = { id: uid(), role: acc.role, by: acc.id, note, proposal, at: t };
        x.replies.push(reply); x.updatedAt = t; result = reply; event = `${x.model} 예외 협의에 ${acc.role} 의견 등록`;
      } else if (action === "exception.decide") {
        const x = d.exceptions.find(x => x.id === a.id);
        if (!x || x.status !== "협의중" || qty(a.finalQty) == null) return bad("진행 중인 협의와 최종 수량을 확인해 주세요");
        const decision = clean(a.decision, 500);
        if (!decision) return bad("최종 결정 사유를 입력해 주세요");
        x.decidedQty = qty(a.finalQty); x.decision = decision; x.status = "확정";
        x.decidedBy = acc.id; x.decidedAt = t; result = x;
        event = `${x.model} 예외 협의 최종 결정 ${x.decidedQty}대`;
      } else if (action === "transfer.send") {
        if (!periodOK(a.month)) return bad("계획 기간을 확인해 주세요");
        // 확정된 판매계획만 생산기획팀에 전달합니다.
        // 서버에서 계획 저장소를 별도로 읽어 검증하므로 임의 물량 전송을 방지합니다.
        result = { pendingMonth: a.month };
      } else if (action === "transfer.ack") {
        const x = d.transfers.find(x => x.id === a.id);
        if (!x) return bad("전달받은 계획을 찾을 수 없습니다");
        x.status = clean(a.status, 40) === "연계 확인" ? "연계 확인" : "수신 확인";
        x.note = clean(a.note, 240); x.ackBy = acc.id; x.ackAt = t;
        result = x; event = `${x.month} 판매계획 생산기획 ${x.status}`;
      }
    });
    if (error) return fail(error, 400);
    if (action === "transfer.send") {
      const { data: planDb } = await read(P.plans, fresh.plans);
      const plan = planDb.list.find(p => p.month === a.month);
      if (!plan) return fail("먼저 SCM에서 해당 월 판매계획을 확정해야 합니다", 409);
      await update(B, blank, d => {
        d.transfers ||= [];
        result = { id: uid(), month: plan.month, total: plan.total, items: plan.items.map(x => ({ model: x.model, qty: x.qty, status: x.status })),
          from: acc.id, sentAt: t, status: "전달됨", note: "", ackAt: null, ackBy: null };
        d.transfers = [result, ...d.transfers.filter(x => x.month !== plan.month)].slice(0, 100);
      });
      event = `${a.month} 확정 판매계획 생산기획팀 전달`;
    }
    if (event) await log("workspace", event, acc.id, { action });
    return json({ ok: true, item: result, message: event });
  });
}
