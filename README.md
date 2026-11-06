# SCM 수요예측 도우미 (HINT 2기 1조)

신입사원 관점 직무 개선 기획서(SCM 수요계획)를 토스형 모바일 앱으로 만든 시제품.

- 화면: `index.html` (현상인식 → 문제제기 → 목적 → 전략(수요예측 데모) → 기대효과)
- 서버: `api/*.js` Vercel Functions (로그인·세션·데이터·계획)
- 저장소: Vercel Blob (비공개) `db/*.json`
- 비밀번호: scrypt 해시, 세션: HttpOnly 쿠키

main 브랜치에 커밋하면 Vercel이 자동 배포합니다.
