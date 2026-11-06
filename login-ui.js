/* 로그인 첫 화면: '새 계정 만들기' 하나만 보여 줍니다.
   비밀번호를 이미 만든 계정만 아래 '내 계정으로 로그인'에 나오고,
   비밀번호 없는 미리 등록 이름·가상 체험 버튼은 숨깁니다. */
(function(){
"use strict";
if(typeof SCREENS==="undefined") return;

SCREENS.login.html=()=>{
  const mine=[...S.accounts].filter(a=>a.hasPin)
    .sort((a,b)=>(b.lastLoginAt||"").localeCompare(a.lastLoginAt||"")||(a.name||"").localeCompare(b.name||""));
  return `<div style="padding-top:36px">
    <div class="eyebrow">${TEAM} · SCM 수요예측 도우미</div>
    <h1>반가워요,<br>계정을 만들어 시작해요</h1>
    <p class="lead">${S.online?"이름 → 직무 → 비밀번호 순서로 1분이면 끝나요. 접속 기록은 설정 탭 로그테이블에 남아요.":"서버에 연결되지 않아 저장되지 않아요."}</p>
    <button class="btn" data-go="signup" style="width:100%;margin:6px 0 22px">+ 새 계정 만들기</button>
    ${mine.length?`<div class="sec">이미 계정이 있다면</div>
      ${mine.map(a=>`<button class="role" data-acc="${a.id}" style="padding:12px 14px">${avatarHTML(a,44)}<span style="flex:1"><b>${esc(a.name)}</b><br><span class="small">${esc(a.role||"")} · PIN 입력</span></span><span class="chev">›</span></button>`).join("")}`:""}
  </div>`;
};

// 미리 등록된 이름(비밀번호 없음)으로 새 계정을 만들면 그 이름에 직무·비밀번호를 설정해 줍니다.
const baseCta=SCREENS.signup.cta;
SCREENS.signup.cta=()=>{
  const c=baseCta();
  return {...c,go:()=>{
    const n=(document.getElementById("suName")?.value||"").trim();
    const pre=S.accounts.find(a=>a.name===n&&!a.hasPin);
    if(pre){
      S.suName=n; S.suRole=pre.role||null;
      S.pinFor=pre; S.pin=""; S.pinStage="set"; S.pinRole=pre.role||null; S.pinErr="";
      return nav.push("signuprole");
    }
    return c.go();
  }};
};

if(typeof refresh==="function" && nav?.cur?.()==="login") refresh();
})();
