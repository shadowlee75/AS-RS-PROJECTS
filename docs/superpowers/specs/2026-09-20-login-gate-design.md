# 로그인 게이트 설계

## 배경
`물동량 계산 프로그램` 사이트는 index.html + guide.html + settings.html + 계산기 7종(스태커크레인, 직선RGV, LoopRGV, AGV/AMR, 셔틀, 컨베이어, 리프트)으로 구성된 순수 정적 HTML/JS 사이트다. 현재 백엔드나 인증이 전혀 없다. 정적 호스팅(Netlify/Vercel/GitHub Pages 등)에 배포하되, 비공개 배포를 위해 로그인한 사용자만 접근할 수 있도록 제한한다.

사용자별 프로젝트 클라우드 저장은 이번 범위에서 제외한다(각 계산기는 이미 로컬 JSON 파일 저장/불러오기를 지원함). 로그인 게이트만 우선 구현하고, 클라우드 저장은 별도 작업으로 진행한다.

## 목표
- Supabase Auth로 사이트 전체(10개 페이지) 접근을 로그인 사용자로 제한한다.
- 계정은 관리자(shadowlee75@gmail.com)가 Supabase 대시보드에서 직접 발급한다. 자가 회원가입 UI는 만들지 않는다.
- 서버 코드 없이 클라이언트 사이드에서만 동작하며 정적 호스팅에 그대로 배포 가능해야 한다.

## 아키텍처
- **Supabase 프로젝트**: 신규 생성(조직 `shadowlee75@gmail.com's Org`), Auth 기능만 사용. Auth 설정에서 이메일 자가가입(signup) 비활성화.
- **`login.html`** (신규, 루트): 이메일/비밀번호 폼 → `supabase.auth.signInWithPassword()`. 성공 시 `?redirect=` 쿼리로 받은 원래 경로로 이동(없으면 `index.html`). 실패 시 인라인 에러 메시지.
- **`assets/js/auth-guard.js`** (신규, 공용): Supabase JS(CDN) 클라이언트를 publishable(anon) 키로 초기화. `requireAuth()`는 `supabase.auth.getSession()`으로 세션을 확인하고 없으면 즉시 `login.html?redirect=<현재경로>`로 리다이렉트한다. `logout()`은 `supabase.auth.signOut()` 후 `login.html`로 이동.
- **보호 대상 10개 파일**의 `<head>` 최상단에서 `auth-guard.js`를 동기적으로 불러와 `requireAuth()`를 실행한다(페이지 콘텐츠 렌더 전에 체크해 깜빡임 방지). 대상: `index.html`, `guide.html`, `settings.html`, `스태커크레인_실행.html`, `직선RGV_실행.html`, `LoopRGV_실행.html`, `AGV_AMR_실행.html`, `셔틀_실행.html`, `컨베이어_실행.html`, `리프트_실행.html`.
- 각 페이지의 기존 상단 액션 영역에 "로그아웃" 버튼을 추가한다.

## 데이터 흐름
1. 사용자가 보호된 페이지에 접속 → `auth-guard.js`가 세션 유무 확인.
2. 세션 없음 → `login.html?redirect=<원래경로>`로 이동.
3. 로그인 성공 → Supabase가 세션을 `localStorage`에 저장 → `redirect` 파라미터의 경로로 이동.
4. 이후 다른 계산기로 이동해도 동일 오리진의 `localStorage` 세션을 공유하므로 재로그인 불필요.
5. 로그아웃 클릭 → 세션 삭제 → `login.html`로 이동, 이후 보호 페이지 접근 시 다시 1번부터 반복.

## 에러 처리 / 보안
- 세션 확인, Supabase CDN 로드 등에서 예외 발생 시 **fail-closed**(로그인 페이지로 이동)로 처리한다.
- 클라이언트에는 Supabase publishable(anon) 키만 넣는다. Service role 키는 절대 코드에 포함하지 않으며, 사용자 계정 생성은 Supabase 대시보드에서 수동으로 한다.
- 로그인 실패(잘못된 자격증명, 네트워크 오류)는 폼에 인라인 메시지로 표시한다.

## 테스트
- 세션 없이 10개 보호 페이지 각각 직접 접속 → 모두 `login.html`로 리다이렉트되는지 확인.
- 대시보드에서 만든 계정으로 로그인 → 원래 페이지로 복귀, 새로고침 및 다른 계산기 이동 시에도 로그인 유지되는지 확인.
- 잘못된 비밀번호 입력 → 인라인 에러 메시지 확인.
- 로그아웃 → 이후 보호 페이지 재접근 시 다시 차단되는지 확인.

## 범위 제외
- 사용자별 클라우드 프로젝트 저장/불러오기(추후 별도 작업).
- 회원가입 UI, 비밀번호 재설정 UI(대시보드에서 관리자가 처리).
