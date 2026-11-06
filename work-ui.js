/* SCM Demand Studio role-based workflow.
   Uses the existing authentication, nav, forecasting, and Vercel APIs.
   Production planning here records constraints only: it does not schedule a factory.
*/
(function(){
"use strict";
const SCM="SCM 수요계획팀", SALES="영업팀", PROD="생산기획팀";
const demo=()=>!!S.demo;
const teamRole=()=>S.role||SCM;
const modelNames=()=>Object.keys(S.dataset.series||{});
const noData=()=>({rules:{threshold:8},orders:[],capacities:[],inventory:[],overrides:[],exceptions:[],transfers:[]});
const db=()=>S.workspace||noData();
const v=(id)=>document.getElementById(id)?.value?.trim()||"";
const f=v=>fmt(Number(v)||0);
const clean=x=>esc(x??"");
const time=x=>x?when(x):"미입력";
const month=()=>planMonth();
const no=()=>S.account?.id||null;
const note=()=>'<p class="small" style="margin:15px 0">시범용 화면입니다. 실제 현대차 ERP·실제 부품/완성차 재고와 연결되어 있지 않습니다.</p>';
const field=(id,title,placeholder,value,type="text")=>'<label>'+title+'<input class="field" id="wf-'+id+'" type="'+type+'" '+(type==="number"?'min="0" max="999999" inputmode="numeric"':"")+' placeholder="'+clean(placeholder||"")+'" value="'+clean(value??"")+'"></label>';
const select=(id,title,options)=>'<label>'+title+'<select class="field" id="wf-'+id+'">'+options+'</select></label>';
const textarea=(id,title,placeholder)=>'<label>'+title+'<textarea class="field" id="wf-'+id+'" maxlength="500" placeholder="'+clean(placeholder||"")+'"></textarea></label>';
const modelOptions=()=>modelNames().map(m=>'<option value="'+clean(m)+'">'+clean(m)+'</option>').join("");
const pill=status=>'<span class="work-pill '+(["접수","협의중","전달됨"].includes(status)?"warn":"ok")+'">'+clean(status||"미정")+'</span>';
const tile=(title,sub,page)=>'<button class="tapcard" data-go="'+page+'"><div class="grow"><b>'+title+'</b><div class="small">'+sub+'</div></div><span class="chev">›</span></button>';
const stats=xs=>'<div class="work-stat">'+xs.map(x=>'<div class="ws"><div class="v">'+x[0]+'</div><div class="l">'+clean(x[1])+'</div></div>').join("")+'</div>';
const header=(subtitle,title,desc)=>'<div class="eyebrow">'+subtitle+'</div><h1>'+title+'</h1><p class="lead">'+desc+'</p>';
const card=(title,sub,right,actions)=>'<div class="work-card"><div class="hd"><b>'+title+'</b>'+(right||"")+'</div><div class="sub">'+sub+'</div>'+(actions?'<div class="work-actions">'+actions+'</div>':"")+'</div>';
const action=(label,data,primary=false)=>'<button class="work-action '+(primary?"primary":"")+'" '+data+'>'+label+'</button>';
const form=(name,fields,title)=>'<div class="work-form">'+fields+'<button class="btn" data-work-submit="'+name+'">'+title+'</button></div>';
const orderTotal=()=>db().orders.reduce((n,a)=>n+Number(a.quantity||0),0);
const capacityFor=model=>{const c=db().capacities.filter(x=>x.model===model&&x.month===month());return c.length?c.reduce((n,x)=>n+Math.min(x.capacity,x.partsLimit),0):null};
const orderFor=model=>db().orders.filter(x=>x.model===model && (!x.targetMonth || x.targetMonth===month())).reduce((n,x)=>n+Number(x.quantity||0),0);
const stockFor=model=>db().inventory.find(x=>x.model===model);
const exceptions=()=>db().exceptions||[];
const roleDesc=role=>role===SCM?"통합 현황과 예측, 협의·최종 확정":role===SALES?"표준 주문 입력과 현장 협의":"생산 가능 물량과 제약 정보 공유";
function livePlans(){return Array.isArray(S.plans)?S.plans:[];}
function currentPlan(){return livePlans().find(x=>x.month===month())||S.lastPlan||null;}

async function syncWorkspace(force=false){
 if(!S.online||S.demo){if(!S.workspace)S.workspace=noData();return;}
 if(!S.account||S.workBusy||(!force&&S.workAt&&Date.now()-S.workAt<13000))return;
 S.workBusy=true;
 try{
  const result=await api("workspace");
  S.workspace=result.workspace||noData();S.workAt=Date.now();
  if(S.workspace.rules?.threshold>=1)S.limit=S.workspace.rules.threshold;
  if(curEl&&["home","roleoverview","roleforecast","rolestatus","roleexceptions","rolereport"].includes(nav.cur()))refresh();
 }catch(err){console.warn("직무 업무 조회:",err.message);}
 finally{S.workBusy=false;}
}
function simulate(action,data){
 const w=db(),at=new Date().toISOString(),id="demo-"+Date.now().toString(36);
 if(action==="order.create")w.orders.unshift({...data,id,by:no(),at,status:"접수",quantity:Number(data.quantity)});
 if(action==="order.reason"){const x=w.orders.find(x=>x.id===data.id);if(x)x.reason=data.reason;}
 if(action==="capacity.save"){w.capacities=[{...data,by:no(),at},...w.capacities.filter(x=>x.model!==data.model||x.month!==data.month||x.line!==data.line)];}
 if(action==="inventory.save"){w.inventory=[{...data,by:no(),at},...w.inventory.filter(x=>x.model!==data.model)];}
 if(action==="forecast.save"){w.overrides=[{...data,by:no(),at},...w.overrides.filter(x=>x.model!==data.model||x.month!==data.month||x.region!==data.region)];}
 if(action==="rules.save"){w.rules={threshold:Number(data.threshold),at,by:no()};S.limit=w.rules.threshold;}
 if(action==="exception.create"){if(w.exceptions.some(x=>x.model===data.model&&x.month===data.month&&x.status==="협의중"))throw Error("이미 진행 중인 협의가 있습니다");
   w.exceptions.unshift({...data,id,by:no(),at,status:"협의중",replies:[]});}
 if(action==="exception.reply"){const x=w.exceptions.find(x=>x.id===data.id);if(x)x.replies.push({role:teamRole(),by:no(),at,note:data.note,proposal:data.proposal});}
 if(action==="exception.decide"){const x=w.exceptions.find(x=>x.id===data.id);if(x)Object.assign(x,{status:"확정",decidedQty:Number(data.finalQty),decision:data.decision,decidedAt:at});}
 if(action==="transfer.send"){const p=currentPlan();if(!p)throw Error("먼저 판매계획 확정을 진행해 주세요");
  w.transfers=[{...p,id,month:data.month,status:"전달됨",sentAt:at,total:p.total,items:p.items||[]},...w.transfers.filter(x=>x.month!==data.month)];}
 if(action==="transfer.ack"){const x=w.transfers.find(x=>x.id===data.id);if(x)Object.assign(x,{status:data.status,ackAt:at,note:data.note});}
 return {ok:true};
}
async function submit(actionName,data,goTo){
 const locked=document.querySelector("[data-work-submit='"+actionName+"']");if(locked)locked.disabled=true;
 try{
  if(demo()){simulate(actionName,data);}
  else{await api("workspace",{method:"POST",body:{action:actionName,data}});await syncWorkspace(true);}
  toast("저장했어요"+(demo()?" · 체험 데이터":""));
  nav.reset(goTo||"home");
 }catch(e){toast(e.message||"처리하지 못했어요");if(locked)locked.disabled=false;}
}
function roleHome(){
 const role=teamRole(),intro=header(role+" · HINT 2기 1조",clean(S.account?.name||"팀원")+"님,<br>오늘의 업무",roleDesc(role));
 const demoSelect=demo()?'<div class="work-card"><b style="font-size:13px">직무 화면 체험</b><div class="work-summary">'+[SCM,SALES,PROD].map((r,i)=>'<button class="work-action '+(role===r?"primary":"")+'" data-work-demo-role="'+clean(r)+'">'+["SCM","영업","생산기획"][i]+'</button>').join("")+'</div></div>':"";
 if(role===SCM){
  let avg="미측정";try{const nums=analyzeAll().map(x=>x.r.mape).filter(Number.isFinite);if(nums.length)avg=(nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1)+"%";}catch{}
  const finished=db().inventory.reduce((a,b)=>a+Number(b.finished||0),0);
  const cap=db().capacities.filter(x=>x.month===month()).reduce((a,b)=>a+Math.min(b.capacity,b.partsLimit),0);
  return intro+demoSelect+stats([[f(orderTotal())+"대","영업팀 신규 수주"],[f(finished)+"대","입력된 완성차 재고"],[cap?f(cap)+"대":"미입력","이번 달 생산 가능"],[avg,"백테스트 평균 오차"]])
   +tile("통합 현황 대시보드","주문·부품·완성차·생산 제약 한눈에 보기","roleoverview")
   +tile("수요예측·예외 판단","4가지 통계 예측과 수주 비교, 직접 수정","roleforecast")
   +tile("확정 기준 설정","오차 ±X% 판정 규칙 관리","rolerules")
   +tile("공통 예외 협의","영업·생산기획 의견 확인 후 최종 결정","roleexceptions")
   +tile("판매계획 전달","확정 계획을 생산기획팀에 전송","roletransfers")
   +tile("핵심 지표 리포트","오차율·예외 건수·목표 대비 실적","rolereport")
   +'<div class="sec">프로젝트와 기존 기능</div>'
   +tile("개선 기획서","AS-IS → TO-BE → 기대효과","asis")
   +tile("통계 예측 상세 보기","그래프·백테스트·데이터 검증","merge")+note();
 }
 if(role===SALES){
  const mine=db().orders.filter(x=>x.by===no());
  return intro+demoSelect+stats([[f(mine.length)+"건","내 주문"],[f(mine.reduce((a,x)=>a+x.quantity,0))+"대","내 주문 수량"],[f(exceptions().filter(x=>x.status==="협의중").length)+"건","협의 진행 중"],[f(modelNames().length)+"종","등록 차종"]])
   +tile("발주 가능 수량·주문 입력","확인 가능한 생산 물량과 표준 주문 등록","roleorder")
   +tile("내 주문 진행 현황","접수·확정 연계·납기 정보 조회","rolestatus")
   +tile("예외 협의 응답","현장 수요·프로모션·법인 계약 의견","roleexceptions")
   +'<div class="sec">발주 참고 현황</div>'
   +modelNames().map(m=>'<div class="row"><div class="grow"><div class="t">'+clean(m)+'</div><div class="s">확인 가능한 생산 가능 물량</div></div><b>'+ (capacityFor(m)==null?"미입력":f(capacityFor(m))+"대") +'</b></div>').join("")+note();
 }
 const recent=db().transfers[0];
 return intro+demoSelect+stats([[f(db().capacities.length)+"건","생산능력 입력"],[f(db().inventory.length)+"종","재고 입력 차종"],[f(db().transfers.length)+"건","전달받은 계획"],[f(exceptions().filter(x=>x.status==="협의중").length)+"건","협의 진행 중"]])
  +tile("생산 가능 물량·제약 입력","라인 능력과 부품 조달 한계","rolecapacity")
  +tile("확정 판매계획 수신","SCM이 전달한 계획 확인 및 연계 상태","roletransfers")
  +tile("예외 건 협의 응답","생산 제약과 대체 사양 제안","roleexceptions")
  +(recent?card(clean(recent.month)+" 최신 전달 계획","총 "+f(recent.total)+"대 · "+time(recent.sentAt),pill(recent.status)):"")+note();
}
function overview(){
 const all=db().orders;
 const demoOrders=S.dataset.orders||[];
 return header("SCM · 통합 현황","실적과 현장 제약을<br>한눈에 확인해요","영업팀 주문과 생산기획팀의 재고·생산 가능 수량이 업데이트되면 반영됩니다.")
 +stats([[f(all.length)+"건","영업팀 접수 주문"],[f(orderTotal())+"대","신규 입력 주문 수량"],[f(db().inventory.length)+"종","재고 데이터 등록"],[f(db().capacities.length)+"건","생산 제약 등록"]])
 +'<div class="sec">차종별 통합 현황</div>'
 +modelNames().map(m=>{const x=stockFor(m),cap=capacityFor(m);return card(clean(m),
   '영업 신규 수주 '+f(orderFor(m))+'대 · 완성차 재고 '+(x?f(x.finished)+"대":"미입력")+' · 부품 재고 '+(x?f(x.parts)+"대":"미입력"),
   cap==null?'<span class="pill k">생산 미입력</span>':'<span class="pill ok">생산 '+f(cap)+'대</span>');}).join("")
 +'<div class="sec">영업점별 최근 주문</div>'
 +(all.length?all.slice(0,20).map(x=>card(clean(x.dealer)+" · "+clean(x.model),clean(x.region)+" · "+f(x.quantity)+"대 · "+time(x.at),pill(x.status))).join(""):'<div class="work-empty">새로 입력한 주문이 없습니다. 기존 시범 주문 '+f(demoOrders.length)+'건은 수요예측 데이터 검증에서 확인할 수 있습니다.</div>')
 +tile("기존 주문·판매실적 검증","중복 주문 및 데이터 누락 확인","merge")+note();
}
function forecasting(){
 let A=[];try{A=analyzeAll();}catch(e){return '<div class="audit-empty">판매 데이터 검증이 필요합니다. '+clean(e.message)+'</div>';}
 const threshold=db().rules?.threshold||S.limit||8;
 return header("SCM · 통계 기반 예측","예측과 수주를 비교하고<br>예외를 분류해요","현재 시제품은 AI 학습 모델이 아닌 4가지 통계적 예측 기법을 사용합니다. 수주가 입력된 항목만 오차를 계산합니다.")
 +'<div class="work-summary"><span>오차 기준 ±'+threshold+'%</span><span>'+f(A.length)+'개 차종</span><span>'+month()+' 예측</span></div>'
 +tile("자동 확정 판단 기준 설정","팀 공통 오차 기준 관리","rolerules")
 +'<div class="sec">차종별 예측</div>'
 +A.map(a=>{
   const ov=db().overrides.find(x=>x.model===a.name&&x.month===month()&&x.region==="전체");
   const pred=ov?.revised??Math.round(a.future[0]),orders=db().orders.filter(o=>o.model===a.name&&(!o.targetMonth||o.targetMonth===month()));
   const real=orders.length?orders.reduce((s,x)=>s+x.quantity,0):null;
   const err=real!=null&&pred>0?Math.abs(real-pred)/pred*100:null;
   const status=err===null?"수주 미입력":err<=threshold?"일반":"예외";
   return card(clean(a.name)+' · '+f(pred)+'대',
      '백테스트 MAPE '+a.r.mape.toFixed(1)+'% · 실제 입력 수주 '+(real==null?"미입력":f(real)+"대")+' · 수주 대비 오차 '+(err==null?"미산정":err.toFixed(1)+"%"),
      status==="일반"?'<span class="work-pill ok">기준 안</span>':status==="예외"?'<span class="work-pill warn">협의 대상</span>':'<span class="work-pill">수주 미입력</span>',
      action("수정","data-work-forecast='"+clean(a.name)+"'")+
      (status==="예외"?action("예외 협의 요청","data-work-new-exception='"+clean(a.name)+"'",true):""));
 }).join("")
 +tile("예측 그래프·방법 상세","기존 4가지 예측 기법 비교","result")
 +note();
}
function forecastEdit(){
 const model=S.workModel||modelNames()[0];let a;try{a=analyze(model)}catch{return "데이터 없음";}
 const ov=db().overrides.find(x=>x.model===model&&x.month===month()&&x.region==="전체");
 const actual=orderFor(model);
 return header("SCM · 수요예측 수정",clean(model)+" 예측값 수정","기존 예측값, 입력된 실제 수주량과 변경 사유를 저장합니다.")
 +stats([[f(a.future[0])+"대","통계적 예측"],[f(actual)+"대","입력된 수주"]])
 +form("forecast.save",
   '<input type="hidden" id="wf-model" value="'+clean(model)+'">'
   +field("month","대상 월", "YYYY-MM",month())
   +field("region","지역", "지역 또는 전체",ov?.region||"전체")
   +field("forecast","기존 예측 (대)","",Math.round(a.future[0]),"number")
   +field("actual","실제 입력 수주 (대)","",actual,"number")
   +field("revised","수정 예측 (대)","",ov?.revised??Math.round(a.future[0]),"number")
   +textarea("reason","수정 사유","프로모션, 법인 계약, 공급 제약 등"),
   "수정 예측값 저장");
}
function rules(){
 const val=db().rules?.threshold||S.limit||8;
 return header("SCM · 판단 기준","일반과 예외의<br>경계를 설정해요","수주 대비 예측 오차가 설정한 범위 이내면 일반 건, 초과하면 협의 대상으로 분류합니다.")
 +stats([["±"+val+"%","현재 공동 판단 기준"],[f(exceptions().filter(x=>x.status==="협의중").length)+"건","진행 중 협의"]])
 +form("rules.save",field("threshold","오차 기준 (%)","1~50",val,"number"),"판단 기준 저장")
 +'<div class="work-msg">오차 기준은 모든 팀에서 공유되며, 이 기준만으로 생산 제약까지 충족한다고 보장하지 않습니다.</div>';
}
function order(){
 return header("영업팀 · 수요 입력","현장 수요를<br>한 번만 입력해요","발주 가능한 수량은 생산기획팀 입력이 있어야 표시됩니다. 미입력 항목은 실제 주문 가능 재고를 보장하지 않습니다.")
 +'<div class="sec">차종별 발주 참고 물량</div>'
 +modelNames().map(m=>'<div class="row"><div class="grow"><div class="t">'+clean(m)+'</div><div class="s">생산 가능 물량 (입력 기준)</div></div><b>'+ (capacityFor(m)==null?"미입력":f(capacityFor(m))+"대")+'</b></div>').join("")
 +'<div class="sec">신규 주문 등록</div>'
 +form("order.create",
  field("dealer","영업점","예: 광주 상무점")
  +select("model","차종",modelOptions())
  +field("spec","사양","예: 기본형, 상위 사양")
  +field("region","지역","예: 광주")
  +field("targetMonth","요청 월","YYYY-MM",month())
  +field("quantity","주문 수량 (대)","1",null,"number")
  +textarea("reason","변경·특이 사유","예: 법인 대량 계약, 프로모션"),
  "주문 접수하기")+note();
}
function status(){
 const mine=db().orders.filter(x=>x.by===no());
 return header("영업팀 · 주문 현황","내 주문을 확인해요","확정과 납기는 연동 데이터가 확보되는 순서대로 표시합니다.")
 +stats([[f(mine.length)+"건","내 주문"],[f(mine.reduce((s,x)=>s+x.quantity,0))+"대","총 수량"]])
 +(mine.length?mine.map(x=>card(clean(x.dealer)+" · "+clean(x.model),
   f(x.quantity)+"대 · "+clean(x.spec||"사양 미지정")+" · "+time(x.at)+"<br>변경 사유: "+clean(x.reason||"미입력")+"<br>예상 납기: "+clean(x.eta||"미확정"),
   pill(x.status),action("사유 수정","data-work-edit-reason='"+clean(x.id)+"'"))).join(""):'<div class="work-empty">내가 입력한 주문이 없습니다.</div>')
 +note();
}
function reasonEdit(){
 const o=db().orders.find(x=>x.id===S.workOrderId&&x.by===no());
 if(!o)return '<div class="work-empty">수정할 수 있는 내 주문을 선택해 주세요.</div>';
 return header("영업팀 · 주문 변경",clean(o.model)+" 주문 사유","기존 주문의 변경·특이 사유를 기록합니다.")
 +form("order.reason",'<input type="hidden" id="wf-id" value="'+clean(o.id)+'">'+textarea("reason","주문 변경 사유",o.reason||"프로모션, 법인 계약 등의 사유"),"변경 사유 저장");
}
function production(){
 const stockFields=select("stock-model","차종",modelOptions())
  +field("finished","완성차 재고 (대)","0",0,"number")
  +field("parts","부품 가용 수량 (대 환산)","0",0,"number");
 const capFields=select("cap-model","차종",modelOptions())
  +field("cap-month","생산 대상 월","YYYY-MM",month())
  +field("cap-line","라인","예: 광주 1라인")
  +field("capacity","라인 생산능력 (대)","0",0,"number")
  +field("partsLimit","부품 수급상 최대 수량 (대)","0",0,"number")
  +textarea("cap-note","제약·특이 사항","부품 수급 차질, 정비 일정, 대체 사양");
 return header("생산기획팀 · 제약 입력","만들 수 있는 수량을<br>먼저 공유해요","생산 일정 수립 자체는 범위 밖이며, 제약과 가능 수량만 반영합니다.")
  +'<div class="sec">차종별 현재 입력</div>'
  +modelNames().map(m=>{const x=stockFor(m),c=capacityFor(m);return '<div class="row"><div class="grow"><div class="t">'+clean(m)+'</div><div class="s">완성차 '+(x?f(x.finished):"미입력")+' · 부품 '+(x?f(x.parts):"미입력")+'</div></div><b>'+ (c==null?"능력 미입력":f(c)+"대")+'</b></div>'}).join("")
  +'<div class="sec">재고 현황 입력</div>'+form("inventory.save",stockFields,"재고 등록")
  +'<div class="sec">생산 가능 물량 입력</div>'+form("capacity.save",capFields,"생산 가능 물량 등록")+note();
}
function transfers(){
 const t=db().transfers;
 if(teamRole()===SCM){
  const ps=livePlans().slice(0,10), p=currentPlan();
  return header("SCM · 계획 전달","확정된 판매계획을<br>생산기획팀에 전달해요","먼저 기존 수요예측 흐름에서 판매계획을 확정해 주세요.")
   +(p?card(clean(p.month)+" 판매계획",f(p.total)+"대 · 자동 "+f(p.auto)+"건 · 협의 "+f(p.exceptions)+"건",pill("확정됨")):'<div class="work-empty">이번 달 확정한 판매계획이 아직 없습니다.</div>')
   +form("transfer.send",select("month","전달할 월",ps.map(x=>'<option value="'+clean(x.month)+'">'+clean(x.month)+'</option>').join("")||'<option value="'+month()+'">'+month()+'</option>'),"생산기획팀에 전달")
   +tile("판매계획 확정하기","기존 예측·검증 과정으로 이동","merge")
   +'<div class="sec">전달 이력</div>'
   +(t.length?t.map(x=>card(clean(x.month)+" 계획",f(x.total)+"대 · "+time(x.sentAt),pill(x.status))).join(""):'<div class="work-empty">전달 기록이 없습니다.</div>');
 }
 return header("생산기획팀 · 계획 수신","확정된 판매계획을<br>확인해요","전달받은 판매계획을 확인하고 생산·납기계획으로의 연계 상태를 남깁니다.")
 +stats([[f(t.length)+"건","수신 계획"],[f(t.filter(x=>x.status==="연계 확인").length)+"건","연계 확인"]])
 +(t.length?t.map(x=>card(clean(x.month)+" · "+f(x.total)+"대",
    (x.items||[]).map(i=>clean(i.model)+" "+f(i.qty)+"대").join(" · ")+"<br>전달 "+time(x.sentAt),
    pill(x.status),
    action("수신 확인","data-work-transfer='"+clean(x.id)+"|수신 확인'")+
    action("연계 확인","data-work-transfer='"+clean(x.id)+"|연계 확인'",true))).join("")
  :'<div class="work-empty">SCM에서 전달된 판매계획이 아직 없습니다.</div>')+note();
}
function exceptionsList(){
 const e=exceptions(),open=e.filter(x=>x.status==="협의중");
 return header("공통 · 예외 협의","세 팀의 의견을<br>한곳에서 모아요","SCM이 요청하고 영업·생산기획이 의견을 남기며 SCM이 최종 수량을 결정합니다.")
 +stats([[f(open.length)+"건","협의 진행 중"],[f(e.filter(x=>x.status==="확정").length)+"건","협의 확정"]])
 +(teamRole()===SCM?'<button class="btn" style="width:100%;margin:3px 0 14px" data-go="roleexceptionnew">+ 새 예외 협의 요청</button>':"")
 +(e.length?e.map(x=>card(clean(x.model)+" · "+clean(x.month),
   "예측 "+f(x.forecast)+"대 · 수주 "+f(x.actual)+"대 · "+clean(x.reason||"예외")+"<br>영업/생산기획 의견 "+f(x.replies?.length||0)+"건",
   pill(x.status),action("협의 상세 보기","data-work-exception='"+clean(x.id)+"'",true))).join("")
 :'<div class="work-empty">현재 생성된 예외 협의가 없습니다.</div>')+note();
}
function exceptionNew(){
 const selected=S.workModel||modelNames()[0];
 let pred=0;try{pred=Math.round(analyze(selected).future[0]);}catch{}
 const opts=modelNames().map(m=>'<option value="'+clean(m)+'" '+(m===selected?"selected":"")+'>'+clean(m)+'</option>').join("");
 return header("SCM · 예외 등록","예외 협의를 요청해요","예측과 실제 수주, 오차 사유를 적으면 세 팀의 공통 화면에 등록됩니다.")
 +form("exception.create",select("model","차종",opts)
   +field("month","대상 월","YYYY-MM",month())
   +field("region","지역","전체 또는 지역","전체")
   +field("forecast","예측 수량 (대)","",pred,"number")
   +field("actual","실제 수주 (대)","",orderFor(selected),"number")
   +textarea("reason","예외 판단 사유","수요 급변, 공급 차질, 예측 오차 초과"),
  "예외 협의 요청 보내기")+note();
}
function exceptionDetail(){
 const x=exceptions().find(x=>x.id===S.workExceptionId);
 if(!x)return '<div class="work-empty">협의 항목을 찾지 못했습니다.</div>';
 let html=header("공통 · 협의 상세",clean(x.model)+" 예외 협의","영업·생산기획이 의견을 남기고 SCM이 최종 결정합니다.")
  +stats([[f(x.forecast)+"대","예측"],[f(x.actual)+"대","실제 수주"]])
  +card("판단 근거",clean(x.reason||"기준 초과")+" · 요청 "+time(x.at),pill(x.status))
  +'<div class="sec">팀별 의견 기록</div>';
 html+=(x.replies?.length?x.replies.map(y=>card(clean(y.role)+" · "+f(y.proposal)+"대",
   clean(y.note)+"<br>"+clean(accName(y.by))+" · "+time(y.at),pill("의견 등록"))).join("")
  :'<div class="work-empty">아직 입력된 협의 의견이 없습니다.</div>');
 if(x.status==="협의중"&&(teamRole()===SALES||teamRole()===PROD)){
  html+='<div class="sec">협의 응답하기</div>'
   +form("exception.reply",field("proposal","제안 수량 (대)","",x.actual,"number")
     +textarea("note","현장·생산 제약 의견",teamRole()===SALES?"법인 계약, 지역 프로모션, 판매전망":"라인 생산능력, 부품 수급, 대체 사양"),"협의 의견 등록");
 }
 if(x.status==="협의중"&&teamRole()===SCM){
  html+='<div class="sec">SCM 최종 판단</div>'
   +form("exception.decide",field("finalQty","최종 확정 수량 (대)","",x.actual,"number")
     +textarea("decision","결정 근거","영업 의견·생산 제약을 반영한 판단"),"협의 최종 확정");
 }
 if(x.status==="확정")html+=card("최종 결정",f(x.decidedQty)+"대 · "+clean(x.decision||"")+'<br>'+time(x.decidedAt),pill("확정"));
 return html;
}
function report(){
 let A=[];try{A=analyzeAll();}catch{}
 const values=A.map(x=>x.r.mape).filter(Number.isFinite);
 const avg=values.length?(values.reduce((s,x)=>s+x,0)/values.length).toFixed(1)+"%":"미측정";
 const list=exceptions();
 return header("SCM · 핵심 지표","성과지표를<br>자동으로 집계해요","예측 정확도와 협의 현황은 입력 데이터로 계산하며, 업무 리드타임은 실제 측정 전입니다.")
 +stats([[avg,"백테스트 평균 오차"],[f(list.length)+"건","등록된 협의"],[f(list.filter(x=>x.status==="협의중").length)+"건","진행 중 협의"],["미측정","계획 수립 리드타임"]])
 +'<div class="sec">차종별 예측 오차</div>'
 +A.map(a=>'<div class="row"><div class="grow"><div class="t">'+clean(a.name)+'</div><div class="s">'+clean(METHODS[a.key].name)+'</div></div><b>'+a.r.mape.toFixed(1)+'%</b></div>').join("")
 +'<div class="work-msg" style="margin-top:13px">기획서의 리드타임 7→4일, 오차율 15→10%는 목표 가정이며 실제 측정치가 아닙니다.</div>'+note();
}
function define(id,title,fn){
 SCREENS[id]={title,enter:()=>{void syncWorkspace();},html:fn};
}
S.workspace=S.workspace||noData();
window.refreshWorkspace=syncWorkspace;
const originalHome=SCREENS.home.html;
SCREENS.home.enter=()=>{void syncWorkspace();};
SCREENS.home.html=roleHome;
define("roleoverview","통합 현황",overview);
define("roleforecast","수요예측",forecasting);
define("roleforecastedit","수정 예측값",forecastEdit);
define("rolerules","판단 기준",rules);
define("roleorder","주문 입력",order);
define("rolestatus","내 주문",status);
define("rolereason","주문 사유",reasonEdit);
define("rolecapacity","생산 가능 물량",production);
define("roletransfers","계획 전달·수신",transfers);
define("roleexceptions","예외 협의",exceptionsList);
define("roleexceptionnew","예외 등록",exceptionNew);
define("roleexceptiondetail","협의 상세",exceptionDetail);
define("rolereport","핵심 지표",report);
window.roleTabs=()=>{
 const icon=id=>TABS.find(t=>t.id===id)?.icon||TABS[2].icon;
 const b=(id,label,base)=>({id,label,icon:icon(base)});
 const common=[b("home","홈","home")],last=[b("settings","설정","settings")];
 if(teamRole()===SALES)return [...common,b("roleorder","주문","merge"),b("roleexceptions","협의","records"),b("rolestatus","내 주문","records"),...last];
 if(teamRole()===PROD)return [...common,b("rolecapacity","생산","merge"),b("roleexceptions","협의","records"),b("roletransfers","계획","records"),...last];
 return [...common,b("roleoverview","현황","records"),b("roleforecast","예측","merge"),b("roleexceptions","협의","records"),...last];
};
window.roleTabActive=id=>{
 if(["settings","logtable","changePin","server"].includes(id))return "settings";
 if(["roleorder","rolereason"].includes(id))return "roleorder";
 if(["rolecapacity"].includes(id))return "rolecapacity";
 if(["roletransfers"].includes(id))return "roletransfers";
 if(["rolestatus"].includes(id))return "rolestatus";
 if(["roleexceptions","roleexceptionnew","roleexceptiondetail"].includes(id))return "roleexceptions";
 if(["roleoverview","rolereport"].includes(id))return "roleoverview";
 if(["roleforecast","roleforecastedit","merge","fix","loading","result","detail","exception","confirm"].includes(id))return "roleforecast";
 return "home";
};
document.addEventListener("click",async e=>{
 const t=e.target.closest("[data-work-submit],[data-work-demo-role],[data-work-forecast],[data-work-new-exception],[data-work-exception],[data-work-edit-reason],[data-work-transfer]");
 if(!t)return;
 const d=t.dataset;
 if(d.workDemoRole){
   if(!demo())return;
   S.role=d.workDemoRole;S.workspace=noData();S.workAt=0;nav.reset("home");return;
 }
 if(d.workForecast){S.workModel=d.workForecast;nav.push("roleforecastedit");return;}
 if(d.workNewException){S.workModel=d.workNewException;nav.push("roleexceptionnew");return;}
 if(d.workException){S.workExceptionId=d.workException;nav.push("roleexceptiondetail");return;}
 if(d.workEditReason){S.workOrderId=d.workEditReason;nav.push("rolereason");return;}
 if(d.workTransfer){
   const [id,status]=d.workTransfer.split("|");
   await submit("transfer.ack",{id,status}, "roletransfers");return;
 }
 const action=d.workSubmit;
 if(!action)return;
 const val=id=>v("wf-"+id);
 let data={};
 try{
   if(action==="order.create"){data={dealer:val("dealer"),model:val("model"),spec:val("spec"),region:val("region"),targetMonth:val("targetMonth"),quantity:Number(val("quantity")),reason:val("reason")};}
   if(action==="order.reason"){data={id:val("id"),reason:val("reason")};}
   if(action==="inventory.save"){data={model:val("stock-model"),finished:Number(val("finished")),parts:Number(val("parts"))};}
   if(action==="capacity.save"){data={model:val("cap-model"),month:val("cap-month"),line:val("cap-line"),capacity:Number(val("capacity")),partsLimit:Number(val("partsLimit")),note:val("cap-note")};}
   if(action==="forecast.save"){data={model:val("model"),month:val("month"),region:val("region"),forecast:Number(val("forecast")),actual:Number(val("actual")),revised:Number(val("revised")),reason:val("reason")};}
   if(action==="rules.save"){data={threshold:Number(val("threshold"))};}
   if(action==="exception.create"){data={model:val("model"),month:val("month"),region:val("region"),forecast:Number(val("forecast")),actual:Number(val("actual")),reason:val("reason")};}
   if(action==="exception.reply"){data={id:S.workExceptionId,proposal:Number(val("proposal")),note:val("note")};}
   if(action==="exception.decide"){data={id:S.workExceptionId,finalQty:Number(val("finalQty")),decision:val("decision")};}
   if(action==="transfer.send"){data={month:val("month")};}
   const next={
    "order.create":"rolestatus","order.reason":"rolestatus","inventory.save":"rolecapacity","capacity.save":"rolecapacity",
    "forecast.save":"roleforecast","rules.save":"rolerules","exception.create":"roleexceptions","exception.reply":"roleexceptiondetail",
    "exception.decide":"roleexceptions","transfer.send":"roletransfers"
   }[action]||"home";
   if(!Object.keys(data).length)return;
   await submit(action,data,next);
 }catch(err){toast(err.message||"입력을 확인해 주세요");}
});
window.addEventListener("focus",()=>{if(S.account&&!demo())syncWorkspace(true);});
})();