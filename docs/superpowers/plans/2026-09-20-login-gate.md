# 로그인 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 물동량 계산 프로그램 사이트(정적 HTML 10개 페이지)를 Supabase Auth 기반 로그인 게이트로 보호한다.

**Architecture:** 서버 코드 없이 클라이언트 사이드에서만 동작. 공용 `assets/js/auth-guard.js`가 Supabase 세션을 확인해 없으면 `login.html`로 리다이렉트하고, 있으면 페이지를 보여주며 우측 상단에 플로팅 로그아웃 버튼을 주입한다. 계정은 관리자가 Supabase 대시보드에서 수동으로 발급한다.

**Tech Stack:** Supabase (Auth만 사용), `@supabase/supabase-js@2` (jsDelivr CDN), 순수 HTML/CSS/Vanilla JS.

**Spec:** [docs/superpowers/specs/2026-09-20-login-gate-design.md](../specs/2026-09-20-login-gate-design.md)

## Global Constraints

- 서버 코드는 추가하지 않는다 (정적 호스팅 배포 가능 상태 유지).
- 클라이언트 코드에는 Supabase **publishable(anon) 키만** 넣는다. Service role 키는 절대 코드/커밋에 포함하지 않는다.
- 인증 확인/로드 실패 시 항상 **fail-closed**(로그인 페이지로 이동)로 처리한다.
- 회원가입 UI는 만들지 않는다. 계정은 Supabase 대시보드에서 관리자가 수동 발급한다.
- 보호 대상은 정확히 10개 파일이다: `index.html`, `guide.html`, `settings.html`, `스태커크레인_실행.html`, `직선RGV_실행.html`, `LoopRGV_실행.html`, `AGV_AMR_실행.html`, `셔틀_실행.html`, `컨베이어_실행.html`, `리프트_실행.html`.

---

### Task 1: Supabase 프로젝트 생성 및 관리자 계정 준비

**Files:** 없음 (인프라 작업, MCP 도구로 수행)

**Interfaces:**
- Produces: `SUPABASE_URL` (문자열, 예: `https://xxxxxxxx.supabase.co`), `SUPABASE_ANON_KEY` (문자열) — Task 2, 3에서 그대로 사용.

- [ ] **Step 1: 조직 확인**

`mcp__0f0a6cc7-b66e-4a1b-9991-b62046e18163__list_organizations` 호출해 조직 ID를 확인한다 (`shadowlee75@gmail.com's Org`).

- [ ] **Step 2: 비용 확인**

`mcp__0f0a6cc7-b66e-4a1b-9991-b62046e18163__confirm_cost`를 프로젝트 생성 타입으로 호출해 `confirm_cost_id`를 얻는다. 무료 티어라도 이 확인 절차를 거쳐야 `create_project`가 동작한다.

- [ ] **Step 3: 프로젝트 생성**

`mcp__0f0a6cc7-b66e-4a1b-9991-b62046e18163__create_project`를 다음 값으로 호출한다:
- `name`: `mulddongryang-login-gate`
- `region`: `ap-northeast-2` (서울, 목록에 없으면 `ap-northeast-1` 도쿄로 대체)
- `organization_id`: Step 1에서 확인한 ID
- `confirm_cost_id`: Step 2에서 얻은 ID

응답의 `id`를 `PROJECT_ID`로 기록한다.

- [ ] **Step 4: 프로젝트 준비 완료 대기**

`mcp__0f0a6cc7-b66e-4a1b-9991-b62046e18163__get_project`를 `PROJECT_ID`로 반복 호출해 상태가 `ACTIVE_HEALTHY`가 될 때까지 확인한다 (보통 1~2분 소요).

- [ ] **Step 5: URL과 anon 키 조회**

`mcp__0f0a6cc7-b66e-4a1b-9991-b62046e18163__get_project_url`와 `mcp__0f0a6cc7-b66e-4a1b-9991-b62046e18163__get_publishable_keys`를 `PROJECT_ID`로 호출한다. `disabled`가 아닌 publishable/anon 키를 `SUPABASE_ANON_KEY`로, URL을 `SUPABASE_URL`로 기록한다.

- [ ] **Step 6: 사용자에게 대시보드 수동 작업 안내**

아래 두 가지는 MCP 도구로 자동화할 수 없는 대시보드 전용 작업이므로, 사용자에게 안내하고 완료 여부를 확인받는다:
1. Supabase 대시보드 → Authentication → Providers → Email에서 "Allow new users to sign up"을 **비활성화**한다 (자가 회원가입 차단).
2. Authentication → Users → "Add user"에서 관리자 본인 이메일(`shadowlee75@gmail.com`)로 로그인용 계정을 하나 생성한다 (비밀번호는 사용자가 직접 정함).

이 단계가 끝나야 Task 6의 로그인 테스트가 가능하다.

---

### Task 2: `assets/js/auth-guard.js` 작성

**Files:**
- Create: `assets/js/auth-guard.js`

**Interfaces:**
- Consumes: 전역 `window.supabase` (CDN에서 로드된 `@supabase/supabase-js@2` UMD 빌드), Task 1의 `SUPABASE_URL`/`SUPABASE_ANON_KEY`.
- Produces: 전역 `window.AuthGuard` 객체 — `{ client, requireAuth() }`. `requireAuth()`는 Promise를 반환하며, 세션이 있으면 `document.documentElement.style.visibility = "visible"`로 설정하고 우측 상단에 `id="authLogoutBtn"` 로그아웃 버튼을 주입한다. 세션이 없거나 오류가 나면 `login.html?redirect=<현재파일명>`으로 리다이렉트한다. Task 3(`login.html`)과 Task 4(보호 대상 페이지)에서 로드해 사용한다.

- [ ] **Step 1: 파일 작성**

`assets/js/auth-guard.js`를 다음 내용으로 작성한다. `__SUPABASE_URL__`과 `__SUPABASE_ANON_KEY__`는 Task 1에서 기록한 실제 값으로 바꿔 넣는다:

```javascript
(function () {
  var SUPABASE_URL = "__SUPABASE_URL__";
  var SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";

  function redirectToLogin() {
    var current = location.pathname.split("/").pop() || "index.html";
    window.location.replace("login.html?redirect=" + encodeURIComponent(current));
  }

  if (typeof window.supabase === "undefined") {
    redirectToLogin();
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function showLogoutButton() {
    if (document.getElementById("authLogoutBtn")) return;
    var btn = document.createElement("button");
    btn.id = "authLogoutBtn";
    btn.textContent = "로그아웃";
    btn.style.cssText = "position:fixed;top:14px;right:14px;z-index:9999;" +
      "padding:8px 14px;background:#101A2A;color:#F2F5FA;" +
      "border:1px solid #2C3B57;border-radius:8px;font-size:12px;" +
      "font-family:inherit;cursor:pointer;";
    btn.addEventListener("click", function () {
      client.auth.signOut().finally(function () {
        window.location.replace("login.html");
      });
    });
    if (document.body) {
      document.body.appendChild(btn);
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        document.body.appendChild(btn);
      });
    }
  }

  window.AuthGuard = {
    client: client,
    requireAuth: function () {
      return client.auth.getSession().then(function (result) {
        if (result.error || !result.data.session) {
          redirectToLogin();
          return false;
        }
        document.documentElement.style.visibility = "visible";
        showLogoutButton();
        return true;
      }).catch(function () {
        redirectToLogin();
        return false;
      });
    }
  };

  window.AuthGuard.requireAuth();
})();
```

- [ ] **Step 2: 문법 확인**

Run: `node --check assets/js/auth-guard.js`
Expected: 아무 출력 없이 종료(코드 0) — 문법 오류가 없다는 뜻.

- [ ] **Step 3: Commit**

```bash
git add assets/js/auth-guard.js
git commit -m "feat: add Supabase auth guard script"
```

---

### Task 3: `login.html` 작성

**Files:**
- Create: `login.html`

**Interfaces:**
- Consumes: 전역 `window.supabase` (CDN), Task 1의 `SUPABASE_URL`/`SUPABASE_ANON_KEY`. `auth-guard.js`는 사용하지 않는다(로그인 페이지 자체는 보호 대상이 아님).
- Produces: `login.html?redirect=<파일명>` 쿼리 규약 — Task 2의 `redirectToLogin()`이 만드는 URL 형식과 반드시 일치해야 한다.

- [ ] **Step 1: 파일 작성**

`login.html`을 다음 내용으로 작성한다. `__SUPABASE_URL__`과 `__SUPABASE_ANON_KEY__`는 Task 1의 실제 값으로 바꿔 넣는다:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>로그인 · 물류자동화 통합 계산</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<style>
  :root{ --bg:#05080F; --surface:#0C1420; --border:#1E2A3F; --text-primary:#F2F5FA; --text-secondary:#92A1BC; --cyan:#00E5D8; --orange:#FF7A29; --sans:-apple-system,'Malgun Gothic',system-ui,sans-serif; }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{background:var(--bg);color:var(--text-primary);font-family:var(--sans);display:flex;align-items:center;justify-content:center;}
  .card{width:100%;max-width:360px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:32px;margin:16px;}
  h1{font-size:18px;margin-bottom:24px;font-weight:600;}
  label{display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px;}
  input{width:100%;padding:10px 12px;margin-bottom:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;}
  button{width:100%;padding:11px;background:var(--cyan);color:#05080F;border:none;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;}
  button:disabled{opacity:.6;cursor:default;}
  .error{color:var(--orange);font-size:13px;margin-bottom:12px;min-height:16px;}
</style>
</head>
<body>
  <form class="card" id="loginForm">
    <h1>물류자동화 통합 계산 · 로그인</h1>
    <div class="error" id="errorMsg"></div>
    <label for="email">이메일</label>
    <input type="email" id="email" required autocomplete="username">
    <label for="password">비밀번호</label>
    <input type="password" id="password" required autocomplete="current-password">
    <button type="submit" id="submitBtn">로그인</button>
  </form>
  <script>
    var SUPABASE_URL = "__SUPABASE_URL__";
    var SUPABASE_ANON_KEY = "__SUPABASE_ANON_KEY__";
    var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    function getRedirectTarget() {
      var params = new URLSearchParams(location.search);
      var target = params.get("redirect");
      if (!target || target.indexOf("://") !== -1 || target.indexOf("//") === 0) {
        return "index.html";
      }
      return target;
    }

    client.auth.getSession().then(function (result) {
      if (result.data.session) {
        window.location.replace(getRedirectTarget());
      }
    });

    document.getElementById("loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var errorEl = document.getElementById("errorMsg");
      var submitBtn = document.getElementById("submitBtn");
      errorEl.textContent = "";
      submitBtn.disabled = true;
      var email = document.getElementById("email").value.trim();
      var password = document.getElementById("password").value;
      client.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
        submitBtn.disabled = false;
        if (result.error) {
          errorEl.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
          return;
        }
        window.location.replace(getRedirectTarget());
      }).catch(function () {
        submitBtn.disabled = false;
        errorEl.textContent = "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.";
      });
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add login.html
git commit -m "feat: add login page"
```

---

### Task 4: 보호 대상 10개 페이지에 인증 게이트 삽입

**Files:**
- Modify: `index.html` (`<head>` 시작 부분)
- Modify: `guide.html` (`<head>` 시작 부분)
- Modify: `settings.html` (`<head>` 시작 부분)
- Modify: `스태커크레인_실행.html` (`<head>` 시작 부분)
- Modify: `직선RGV_실행.html` (`<head>` 시작 부분)
- Modify: `LoopRGV_실행.html` (`<head>` 시작 부분)
- Modify: `AGV_AMR_실행.html` (`<head>` 시작 부분)
- Modify: `셔틀_실행.html` (`<head>` 시작 부분)
- Modify: `컨베이어_실행.html` (`<head>` 시작 부분)
- Modify: `리프트_실행.html` (`<head>` 시작 부분)

**Interfaces:**
- Consumes: `assets/js/auth-guard.js`의 `window.AuthGuard.requireAuth()` (Task 2), CDN `@supabase/supabase-js@2`.

- [ ] **Step 1: 각 파일의 `<head>` 여는 태그 바로 다음 줄에 아래 3줄을 삽입한다**

10개 파일 모두 `<head>` 태그 바로 다음(기존 `<meta charset...>` 등보다 먼저)에 삽입한다:

```html
<style>html{visibility:hidden}</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/js/auth-guard.js"></script>
```

예를 들어 `index.html`은 현재:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
```
다음과 같이 바뀐다:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
<style>html{visibility:hidden}</style>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/js/auth-guard.js"></script>
<meta charset="UTF-8">
```

나머지 9개 파일도 각자의 `<head>` 바로 다음 줄에 동일하게 삽입한다. (파일마다 `<head>` 다음 첫 줄의 정확한 내용은 다를 수 있으니, 각 파일을 열어 `<head>` 태그를 찾아 그 바로 다음에 삽입할 것.)

- [ ] **Step 2: 10개 파일 모두에 삽입했는지 확인**

Run (PowerShell):
```powershell
Select-String -Path "index.html","guide.html","settings.html","스태커크레인_실행.html","직선RGV_실행.html","LoopRGV_실행.html","AGV_AMR_실행.html","셔틀_실행.html","컨베이어_실행.html","리프트_실행.html" -Pattern "auth-guard.js"
```
Expected: 10개 파일 모두 한 줄씩, 총 10개의 매치가 출력된다.

- [ ] **Step 3: Commit**

```bash
git add index.html guide.html settings.html 스태커크레인_실행.html 직선RGV_실행.html LoopRGV_실행.html AGV_AMR_실행.html 셔틀_실행.html 컨베이어_실행.html 리프트_실행.html
git commit -m "feat: gate all pages behind Supabase auth"
```

---

### Task 5: 로컬 미리보기 서버 설정

**Files:**
- Create: `.claude/launch.json` (없으면 새로 생성, 있으면 항목 추가)

**Interfaces:**
- Produces: `http://localhost:5500`에서 프로젝트 루트를 서빙하는 정적 서버 — Task 6의 브라우저 검증에서 사용.

- [ ] **Step 1: `.claude/launch.json` 작성**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "static-site",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "serve", "-l", "5500", "."],
      "port": 5500
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/launch.json
git commit -m "chore: add static preview server config"
```

---

### Task 6: 종단간 수동 검증

**Files:** 없음 (브라우저 수동 검증)

- [ ] **Step 1: 미리보기 서버 시작**

`preview_start`를 `{"name": "static-site"}`로 호출해 `http://localhost:5500`을 연다.

- [ ] **Step 2: 비로그인 상태에서 10개 페이지 모두 차단되는지 확인**

브라우저 도구로 `http://localhost:5500/index.html`, `/guide.html`, `/settings.html`, `/스태커크레인_실행.html`, `/직선RGV_실행.html`, `/LoopRGV_실행.html`, `/AGV_AMR_실행.html`, `/셔틀_실행.html`, `/컨베이어_실행.html`, `/리프트_실행.html`을 각각 방문한다.
Expected: 매번 `login.html?redirect=<원래파일명>`으로 리다이렉트된다.

- [ ] **Step 3: 잘못된 비밀번호로 로그인 시도**

`login.html`에서 존재하지 않는 이메일/비밀번호로 제출한다.
Expected: "이메일 또는 비밀번호가 올바르지 않습니다." 에러가 폼에 표시되고 페이지는 이동하지 않는다.

- [ ] **Step 4: Task 1에서 만든 관리자 계정으로 로그인**

올바른 이메일/비밀번호로 로그인한다.
Expected: `redirect` 파라미터로 지정된 원래 페이지로 이동하고, 우측 상단에 "로그아웃" 버튼이 보인다.

- [ ] **Step 5: 세션 유지 확인**

로그인된 상태에서 나머지 9개 페이지를 직접 방문한다.
Expected: 로그인 페이지로 리다이렉트되지 않고 바로 콘텐츠가 보인다.

- [ ] **Step 6: 로그아웃 확인**

"로그아웃" 버튼을 클릭한다.
Expected: `login.html`로 이동한다. 이후 `index.html`을 다시 방문하면 다시 `login.html`로 리다이렉트된다 (Step 2 재확인).

- [ ] **Step 7: 콘솔 에러 확인**

`read_console_messages`로 Step 2~6 동안 발생한 콘솔 에러를 확인한다.
Expected: Supabase 관련 에러(CORS, 잘못된 URL/키 등)가 없어야 한다.
