(function () {
  var SUPABASE_URL = "https://bzzrpmzemevlechwrdtn.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_6h6t9SyuFmfnY30rafSIDQ_GahT1GKs";

  if (typeof window.supabase === "undefined") return;

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var needsLock = !!(document.currentScript && document.currentScript.getAttribute("data-lock") === "true");

  var ICON_LOGIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';
  var ICON_ACCOUNT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7"/></svg>';

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "style") e.style.cssText = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function getWidgetRoot() {
    var navColumn = document.getElementById("navColumn");
    if (navColumn) return navColumn;
    var root = document.getElementById("authWidgetRoot");
    if (!root) {
      root = el("div", { id: "authWidgetRoot", style: "position:fixed;top:14px;right:14px;z-index:9999;" });
      document.body.appendChild(root);
    }
    return root;
  }

  function showHomeIcon() {
    if (document.getElementById("authHomeBtn")) return;
    var link = el("a", {
      id: "authHomeBtn",
      href: "index.html",
      title: "메인으로",
      style: "position:fixed;top:14px;left:14px;z-index:9999;" +
        "display:flex;align-items:center;justify-content:center;" +
        "width:34px;height:34px;background:#101A2A;color:#F2F5FA;" +
        "border:1px solid #2C3B57;border-radius:8px;font-size:16px;" +
        "text-decoration:none;line-height:1;"
    }, "🏠");
    document.body.appendChild(link);
  }

  function showLockOverlay() {
    if (document.getElementById("authLockOverlay")) return;
    var overlay = el("div", {
      id: "authLockOverlay",
      style: "position:fixed;inset:0;z-index:500;background:rgba(5,8,15,.82);" +
        "display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;"
    });
    var box = el("div", { style: "max-width:320px;color:#F2F5FA;font-family:inherit;" });
    box.appendChild(el("div", { style: "font-size:15px;font-weight:600;margin-bottom:8px;" }, "로그인 후 이용 가능합니다"));
    box.appendChild(el("div", { style: "font-size:13px;color:#92A1BC;margin-bottom:16px;" }, "우측 상단 아이콘으로 로그인해 주세요."));
    var btn = el("button", {
      type: "button",
      style: "padding:10px 18px;background:#00E5D8;color:#05080F;border:0;" +
        "border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;"
    }, "로그인하기");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      openMenu();
    });
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function hideLockOverlay() {
    var overlay = document.getElementById("authLockOverlay");
    if (overlay) overlay.remove();
  }

  var trigger, menu;

  function openMenu() {
    if (menu) menu.hidden = false;
  }
  function closeMenu() {
    if (menu) menu.hidden = true;
  }

  function renderLoggedOutMenu() {
    menu.innerHTML = "";
    var form = el("form", { style: "display:flex;flex-direction:column;gap:8px;min-width:200px;" });
    var errorBox = el("div", { style: "color:#FF7A29;font-size:11px;min-height:14px;" });
    var emailInput = el("input", {
      type: "email", placeholder: "이메일", required: "required", autocomplete: "username",
      style: "padding:8px 9px;background:#05080F;border:1px solid #1E2A3F;border-radius:6px;color:#F2F5FA;font-size:12px;"
    });
    var passInput = el("input", {
      type: "password", placeholder: "비밀번호", required: "required", autocomplete: "current-password",
      style: "padding:8px 9px;background:#05080F;border:1px solid #1E2A3F;border-radius:6px;color:#F2F5FA;font-size:12px;"
    });
    var submitBtn = el("button", {
      type: "submit",
      style: "padding:8px;background:#00E5D8;color:#05080F;border:0;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;"
    }, "로그인");
    form.appendChild(errorBox);
    form.appendChild(emailInput);
    form.appendChild(passInput);
    form.appendChild(submitBtn);
    form.addEventListener("click", function (e) { e.stopPropagation(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorBox.textContent = "";
      submitBtn.disabled = true;
      client.auth.signInWithPassword({ email: emailInput.value.trim(), password: passInput.value }).then(function (result) {
        submitBtn.disabled = false;
        if (result.error) {
          errorBox.textContent = "이메일 또는 비밀번호가 올바르지 않습니다.";
          return;
        }
        closeMenu();
      }).catch(function () {
        submitBtn.disabled = false;
        errorBox.textContent = "로그인 중 오류가 발생했습니다.";
      });
    });
    menu.appendChild(form);
  }

  function renderLoggedInMenu() {
    menu.innerHTML = "";
    var logoutBtn = el("button", {
      type: "button",
      style: "display:block;width:100%;text-align:left;padding:8px 10px;border:0;" +
        "background:transparent;color:#92A1BC;font-size:13px;border-radius:6px;cursor:pointer;"
    }, "로그아웃");
    logoutBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      client.auth.signOut();
    });
    menu.appendChild(logoutBtn);
  }

  function updateTrigger(hasSession) {
    trigger.innerHTML = hasSession ? ICON_ACCOUNT : ICON_LOGIN;
    trigger.title = hasSession ? "계정" : "로그인";
    if (hasSession) renderLoggedInMenu();
    else renderLoggedOutMenu();
  }

  function buildWidget() {
    var root = getWidgetRoot();
    var wrap = el("div", { style: "position:relative;display:inline-block;" });
    trigger = el("button", {
      type: "button", id: "authWidgetTrigger",
      style: "display:flex;align-items:center;justify-content:center;width:30px;height:30px;" +
        "border:1px solid #2C3B57;border-radius:8px;background:#101A2A;color:#92A1BC;cursor:pointer;"
    });
    menu = el("div", {
      id: "authWidgetMenu",
      style: "position:absolute;top:36px;right:0;background:#0C1420;border:1px solid #1E2A3F;" +
        "border-radius:8px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:50;"
    });
    menu.hidden = true;
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) openMenu(); else closeMenu();
    });
    document.addEventListener("click", function () { closeMenu(); });
    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    root.appendChild(wrap);
  }

  function applySessionState(session) {
    var hasSession = !!session;
    updateTrigger(hasSession);
    if (needsLock) {
      if (hasSession) hideLockOverlay();
      else showLockOverlay();
    }
  }

  function init() {
    buildWidget();
    showHomeIcon();

    client.auth.getSession().then(function (result) {
      applySessionState(result.data.session);
    });

    client.auth.onAuthStateChange(function (event, session) {
      applySessionState(session);
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }

  window.AuthWidget = { client: client };
})();
