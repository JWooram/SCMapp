/* 입력 보호 + 생산기획 재고·생산 가능 물량 누적(＋/−) 입력
   1) 입력 중 화면이 다시 그려져 칸이 비워지는 문제 방지
      - 15초 자동 갱신(poll), 창 포커스 갱신(syncWorkspace) 같은 '백그라운드' 다시 그리기는
        입력칸에 커서가 있거나 값을 고치는 중이면 건너뜁니다.
      - 사용자가 직접 누른 버튼(이벤트 안에서 호출)은 그대로 다시 그립니다.
   2) 생산 탭: 숫자를 입력하면 기존 값에 더하기(기본) / 빼기 중 선택해서 반영 + 차종 추가하기
   3) 판매계획 확정 화면: '공유 요약 복사'·'기대효과 보기' 대신 '최종 결과 저장하기' → 최종 결과 화면 */
(function(){
"use strict";
if(typeof SCREENS==="undefined"||typeof refresh!=="function") return;

/* ---------- 1. 입력 보호 ---------- */
let dirtyScreen=null;
const isField=el=>el&&el.matches&&el.matches("input,textarea,select");
document.addEventListener("input",e=>{ if(isField(e.target)&&curEl&&curEl.contains(e.target)) dirtyScreen=nav.cur(); },true);
document.addEventListener("click",e=>{ if(e.target.closest("[data-work-submit],[data-adj-submit],[data-cta],[data-tab],[data-go],.back")) dirtyScreen=null; },true);
const baseRefresh=window.refresh;
window.refresh=function(){
  const id=nav.cur();
  if(dirtyScreen&&dirtyScreen!==id) dirtyScreen=null;
  const ae=document.activeElement;
  const typing=isField(ae)&&curEl&&curEl.contains(ae)&&ae.type!=="button";
  if(!window.event&&(typing||dirtyScreen===id)) return; // 백그라운드 갱신은 입력 중이면 건너뜀
  return baseRefresh.apply(this,arguments);
};

/* ---------- 2. 생산 탭 누적 입력 ---------- */
if(!SCREENS.rolecapacity) return;
S.adjMode=S.adjMode||{inv:"add",cap:"add"};
const W=()=>S.workspace||{inventory:[],capacities:[]};
const models=()=>[...new Set([...Object.keys((S.dataset&&S.dataset.series)||{}),...((W().models)||[])])];
const n=v=>fmt(Number(v)||0);
const opt=()=>models().map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
const inv=m=>(W().inventory||[]).find(x=>x.model===m);
const cap=(m,mo,l)=>(W().capacities||[]).find(x=>x.model===m&&x.month===mo&&x.line===l);
const toggle=k=>`<div class="adj-toggle" data-adj-group="${k}">
  <button type="button" class="${S.adjMode[k]==="add"?"on":""}" data-adj-mode="${k}|add">＋ 더하기</button>
  <button type="button" class="${S.adjMode[k]==="sub"?"on":""}" data-adj-mode="${k}|sub">− 빼기</button></div>`;
const num=(id,label)=>`<label>${label}<input class="field" id="${id}" type="number" min="0" max="999999" inputmode="numeric" placeholder="0"></label>`;

function invHint(){
  const m=document.getElementById("adj-inv-model")?.value; const x=inv(m);
  const el=document.getElementById("adj-inv-now");
  if(el) el.innerHTML=`현재 <b>${esc(m||"")}</b> · 완성차 <b>${x?n(x.finished):0}대</b> · 부품 <b>${x?n(x.parts):0}대</b>`;
}
function capHint(){
  const g=id=>(document.getElementById(id)?.value||"").trim();
  const x=cap(g("adj-cap-model"),g("adj-cap-month"),g("adj-cap-line"));
  const el=document.getElementById("adj-cap-now");
  if(el) el.innerHTML=g("adj-cap-line")?`현재 · 라인 생산능력 <b>${x?n(x.capacity):0}대</b> · 부품 수급 최대 <b>${x?n(x.partsLimit):0}대</b>`:"라인을 입력하면 현재 등록된 값이 보여요";
}

SCREENS.rolecapacity.html=()=>{
  const ms=models();
  const rows=ms.map(m=>{const x=inv(m);const cs=(W().capacities||[]).filter(c=>c.model===m&&c.month===planMonth());
    const c=cs.length?cs.reduce((s,a)=>s+Math.min(a.capacity,a.partsLimit),0):null;
    return `<div class="row"><div class="grow"><div class="t">${esc(m)}</div><div class="s">완성차 ${x?n(x.finished):"미입력"} · 부품 ${x?n(x.parts):"미입력"}</div></div><b>${c==null?"능력 미입력":n(c)+"대"}</b></div>`;}).join("");
  return `<div class="eyebrow">생산기획팀 · 제약 입력</div><h1>만들 수 있는 수량을<br>먼저 공유해요</h1>
  <p class="lead">숫자를 넣으면 기존 값에 <b>더해져요</b>. 잘못 넣었으면 <b>− 빼기</b>로 바꿔서 같은 수를 입력하세요.</p>
  <div class="sec" style="display:flex;justify-content:space-between;align-items:center">차종별 현재 입력<button type="button" class="adj-add" data-adj-addmodel>＋ 차종 추가하기</button></div>${rows}
  <div class="sec">재고 현황 입력</div>
  <div class="work-form">
    ${toggle("inv")}
    <label>차종<select class="field" id="adj-inv-model">${opt()}</select></label>
    <div class="adj-now" id="adj-inv-now"></div>
    ${num("adj-finished","완성차 재고 (대)")}${num("adj-parts","부품 가용 수량 (대 환산)")}
    <button class="btn" data-adj-submit="inv">재고 반영</button>
  </div>
  <div class="sec">생산 가능 물량 입력</div>
  <div class="work-form">
    ${toggle("cap")}
    <label>차종<select class="field" id="adj-cap-model">${opt()}</select></label>
    <label>생산 대상 월<input class="field" id="adj-cap-month" value="${esc(planMonth())}" placeholder="YYYY-MM"></label>
    <label>라인<input class="field" id="adj-cap-line" placeholder="예: 광주 1라인"></label>
    <div class="adj-now" id="adj-cap-now"></div>
    ${num("adj-capacity","라인 생산능력 (대)")}${num("adj-partsLimit","부품 수급상 최대 수량 (대)")}
    <label>제약·특이 사항<textarea class="field" id="adj-cap-note" maxlength="220" placeholder="부품 수급 차질, 정비 일정, 대체 사양"></textarea></label>
    <button class="btn" data-adj-submit="cap">생산 가능 물량 반영</button>
  </div>
  <p class="small" style="margin:15px 0">시범용 화면입니다. 실제 현대차 ERP·실제 부품/완성차 재고와 연결되어 있지 않습니다.</p>`;
};
const baseMount=SCREENS.rolecapacity.mount;
SCREENS.rolecapacity.mount=el=>{ if(baseMount) baseMount(el); invHint(); capHint(); };
// 화면이 처음 열릴 때도 현재값 표시
new MutationObserver(()=>{ if(nav.cur()==="rolecapacity"){ if(document.getElementById("adj-inv-now")?.innerHTML==="") invHint(); if(document.getElementById("adj-cap-now")?.innerHTML==="") capHint(); } })
  .observe(document.body,{childList:true,subtree:true});
document.addEventListener("change",e=>{ if(e.target.id==="adj-inv-model") invHint(); if(["adj-cap-model"].includes(e.target.id)) capHint(); });
document.addEventListener("input",e=>{ if(["adj-cap-month","adj-cap-line"].includes(e.target.id)) capHint(); });

document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-adj-mode]");
  if(t){ const [k,m]=t.dataset.adjMode.split("|"); S.adjMode[k]=m;
    t.parentElement.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b===t)); return; }
  const b=e.target.closest("[data-adj-submit]"); if(!b) return;
  const kind=b.dataset.adjSubmit, mode=S.adjMode[kind];
  const g=id=>(document.getElementById(id)?.value||"").trim(), q=id=>Number(g(id)||0);
  let action,data;
  if(kind==="inv"){ action="inventory.save"; data={model:g("adj-inv-model"),finished:q("adj-finished"),parts:q("adj-parts"),mode}; if(!data.finished&&!data.parts) return toast("수량을 입력해 주세요"); }
  else { action="capacity.save"; data={model:g("adj-cap-model"),month:g("adj-cap-month"),line:g("adj-cap-line"),capacity:q("adj-capacity"),partsLimit:q("adj-partsLimit"),note:g("adj-cap-note"),mode};
    if(!data.line) return toast("라인을 입력해 주세요"); if(!data.capacity&&!data.partsLimit) return toast("수량을 입력해 주세요"); }
  if(!S.online) return toast("서버에 연결되지 않아 저장할 수 없어요");
  b.disabled=true;
  try{
    // 최신 값을 다시 읽은 뒤, 기존 값 ± 입력값으로 계산해서 저장 (서버에는 결과값만 보냄)
    if(typeof window.refreshWorkspace==="function"){ S.workBusy=false; await window.refreshWorkspace(true); }
    const sign=mode==="sub"?-1:1;
    if(kind==="inv"){ const x=inv(data.model)||{};
      data={model:data.model,finished:(+x.finished||0)+sign*data.finished,parts:(+x.parts||0)+sign*data.parts}; }
    else { const x=cap(data.model,data.month,data.line)||{};
      data={...data,capacity:(+x.capacity||0)+sign*data.capacity,partsLimit:(+x.partsLimit||0)+sign*data.partsLimit,note:data.note||x.note||""}; delete data.mode; }
    if(Object.values(data).some(v=>typeof v==="number"&&v<0)) throw new Error("현재 값보다 많이 뺄 수 없어요");
    await api("workspace",{method:"POST",body:{action,data}});
    dirtyScreen=null;
    if(typeof window.refreshWorkspace==="function") await window.refreshWorkspace(true);
    baseRefresh();
    toast(mode==="sub"?"입력한 수량만큼 뺐어요":"기존 값에 더했어요");
  }catch(err){ toast(err.message||"저장하지 못했어요"); }
  finally{ b.disabled=false; }
});


/* ---------- 차종 추가하기 ---------- */
document.addEventListener("click",e=>{
  if(!e.target.closest("[data-adj-addmodel]")) return;
  openSheet(`<h2 style="margin:0 0 6px">차종 추가하기</h2><p class="small" style="margin:0 0 12px">추가한 차종은 재고·생산 가능 물량·주문 입력에서 바로 고를 수 있어요.</p>
    <input class="field" id="adjModelName" maxlength="30" placeholder="예: SUV G, 전기차 H">
    <button class="btn" style="width:100%;margin-top:12px" id="adjModelOk">추가하기</button>`);
  setTimeout(()=>document.getElementById("adjModelName")?.focus(),50);
  document.getElementById("adjModelOk").onclick=async()=>{
    const name=(document.getElementById("adjModelName")?.value||"").trim();
    if(!name) return toast("차종 이름을 입력해 주세요");
    if(models().includes(name)) return toast("이미 있는 차종이에요");
    if(!S.online) return toast("서버에 연결되지 않아 저장할 수 없어요");
    try{
      await api("workspace",{method:"POST",body:{action:"model.add",data:{name}}});
      S.workBusy=false; if(typeof window.refreshWorkspace==="function") await window.refreshWorkspace(true);
      closeSheet(); dirtyScreen=null; baseRefresh(); toast(name+" 차종을 추가했어요");
    }catch(err){ toast(err.message||"추가하지 못했어요"); }
  };
});

/* ---------- 3. 판매계획 확정 → 최종 결과 ---------- */
if(SCREENS.confirm){
  const confirmHtml=SCREENS.confirm.html;
  SCREENS.confirm.html=()=>confirmHtml().replace(/<button[^>]*data-copy[^>]*>[\s\S]*?<\/button>/,"");
  SCREENS.confirm.cta=()=>({label:"최종 결과 저장하기",go:async()=>{
    for(let i=0;i<30&&S.planStatus==="saving";i++) await new Promise(r=>setTimeout(r,200));
    if(S.online&&S.planStatus!=="saved"){ try{ await savePlan(analyzeAll()); }catch(e){} }
    if(S.online&&S.planStatus!=="saved") return toast("저장하지 못했어요. 다시 눌러 주세요");
    nav.push("planfinal");
  }});
  SCREENS.planfinal={ title:"최종 결과", noBack:true, html:()=>{
    const p=S.lastPlan; if(!p) return `<div class="card small">저장된 판매계획이 없어요.</div>`;
    const who=(S.accounts||[]).find(a=>a.id===p.confirmedBy)?.name||S.account?.name||"";
    return `<div style="text-align:center"><div class="donecheck">${ICON.check}</div>
      <div class="eyebrow">최종 결과 · ${esc(p.month||"")}</div>
      <h1>${planMonthKo()} 판매계획<br>최종 결과를 저장했어요</h1>
      <p class="lead">${S.online?"팀 서버에 저장됐어요":"체험 모드라 서버에는 저장되지 않았어요"}${p.confirmedAt?" · "+when(p.confirmedAt):""}${who?" · "+esc(who):""}</p></div>
      <div class="stats"><div class="stat"><div class="v" style="font-size:20px;padding-top:6px">${fmt(p.total)}</div><div class="l">총 판매계획(대)</div><div class="d">생산기획 전달 기준</div></div>
        <div class="stat"><div class="v">${p.auto}</div><div class="l">자동 확정</div><div class="d">기준 ±${p.limit??S.limit}% 안</div></div>
        <div class="stat"><div class="v" style="color:var(--warn)">${p.exceptions}</div><div class="l">협의 확정</div><div class="d">예외 협의 반영</div></div></div>
      <div class="sec">차종별 최종 수량</div>
      <div class="card">${(p.items||[]).map(i=>`<div class="row"><div class="grow"><div class="t">${esc(i.model)}</div><div class="s">${esc(i.status||"")}${i.memo?` · ${esc(i.memo)}`:""}</div></div><b class="num">${fmt(i.qty)}대</b></div>`).join("")}</div>
      <div class="sec">다음 할 일</div>
      <button class="tapcard" data-go="roletransfers"><div class="ic">→</div><div style="flex:1"><b>생산기획팀에 전달하기</b><div class="small">확정 계획을 생산기획 화면으로 보내요</div></div><span class="chev">›</span></button>
      <button class="tapcard" data-go="records"><div class="ic g">✓</div><div style="flex:1"><b>팀 기록에서 보기</b><div class="small">확정한 계획 이력을 확인해요</div></div><span class="chev">›</span></button>`;
  }, cta:()=>({label:"홈으로",go:()=>nav.reset("home")}) };
}
const css=document.createElement("style");
css.textContent=`.adj-toggle{display:flex;gap:6px;background:#F2F4F6;border-radius:12px;padding:4px;margin-bottom:10px}
.adj-toggle button{flex:1;border:0;background:transparent;border-radius:9px;padding:10px 0;font-weight:700;color:#6B7684;font-size:15px}
.adj-toggle button.on{background:#fff;color:#3182F6;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.adj-toggle button[data-adj-mode$="sub"].on{color:#F04452}
.adj-add{border:0;background:#E8F3FF;color:#3182F6;font-weight:700;font-size:13px;border-radius:8px;padding:6px 10px}
.adj-now{font-size:13px;color:#4E5968;background:#F9FAFB;border-radius:10px;padding:9px 12px;margin:2px 0 8px}`;
document.head.appendChild(css);
})();
