/* ═══════════════════════════════════════════════════════════════
   auth.js
   ─ Shows email login screen before the app loads.
   ─ POST /api/auth/identify  →  { email, role, permissions }
   ─ Session stored in sessionStorage (clears on tab close).

   ADMIN sees everything as-is.
   USER  hides:
     • Entire toggle dropdown menu (hdrMenuWrap)
     • Register Scenario button  (#slRegisterScenarioBtn)
     • Register Tool button      (#btnRegisterTool)
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SESSION_KEY = 'navigator_session';

  /* ── selectors that are ADMIN-ONLY (hidden for users) ──────── */
  const ADMIN_ONLY = [
    '#hdrMenuWrap',           // entire toggle dropdown (Analytics, Feedback, Policy, Scenarios…)
    '#slRegisterScenarioBtn', // Register Scenario button in Scenario Library
    '#btnRegisterTool',       // Register Tool button in AI Tools
  ];

  /* ── apply role to the UI ─────────────────────────────────── */
  function applyRole(role) {
    if (role === 'admin') return; // admin sees everything — no changes needed

    /* user: hide every admin-only element */
    ADMIN_ONLY.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
    });
  }

  /* ── session helpers ──────────────────────────────────────── */
  function saveSession(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch { return null; }
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* ── show login / show app ────────────────────────────────── */
  function showLoginScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appShell').style.display   = 'none';
  }

  function showApp(session) {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appShell').style.display   = '';

    const badge = document.getElementById('authUserBadge');
    if (badge) badge.textContent = session.email;

    applyRole(session.role);
  }

  const ALLOWED_DOMAIN = '@bs.nttdata.com';

  /* ── login submit ─────────────────────────────────────────── */
  async function handleLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById('authEmailInput');
    const errorEl    = document.getElementById('authError');
    const submitBtn  = document.getElementById('authSubmitBtn');
    const email      = (emailInput.value || '').trim().toLowerCase();

    if (!email) {
      errorEl.textContent   = 'Please enter your email address.';
      errorEl.style.display = 'block';
      return;
    }

    if (!email.endsWith(ALLOWED_DOMAIN)) {
      errorEl.textContent   = `Access is restricted to NTT DATA work emails (${ALLOWED_DOMAIN}).`;
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Checking…';

    const fd = new FormData();
    fd.append('email', email);

    try {
      const res  = await fetch('/api/auth/identify', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      saveSession(data);
      showApp(data);
    } catch (err) {
      errorEl.textContent   = `❌ ${err.message}`;
      errorEl.style.display = 'block';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Sign In →';
    }
  }

  /* ── reset all visible app state so the next user starts fresh ── */
  function resetAppState() {
    /* 1. Go back to step 1 (clears result, chat, input) */
    if (typeof resetToStep1 === 'function') resetToStep1();

    /* 2. Clear the result area elements directly in case resetToStep1 misses any */
    const clear = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
    clear('resultMeta',          'innerHTML', '');
    clear('toolRecBox',          'innerHTML', '');
    clear('policyFlagsBox',      'innerHTML', '');
    clear('alternativesBox',     'innerHTML', '');
    clear('policyBlockedBox',    'innerHTML', '');
    clear('resultPrompt',        'textContent', '');
    clear('policyBlockedBox',    'style.display', 'none');
    clear('confidentialityNotice','style.display', 'none');
    clear('promptToolbar',       'style.display', 'none');
    clear('userInput',           'value', '');

    /* 3. Navigate to home page */
    if (typeof navigateTo === 'function') navigateTo('home');

    /* 4. Restore all admin-only elements so the next login can re-apply role */
    ADMIN_ONLY.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = ''; });
    });

    /* 5. Clear the user badge */
    const badge = document.getElementById('authUserBadge');
    if (badge) badge.textContent = '';
  }

  /* ── logout ───────────────────────────────────────────────── */
  function logout() {
    resetAppState();
    clearSession();
    const emailInput = document.getElementById('authEmailInput');
    if (emailInput) emailInput.value = '';
    showLoginScreen();
  }

  /* ── boot ─────────────────────────────────────────────────── */
  function boot() {
    document.getElementById('authForm')?.addEventListener('submit', handleLogin);
    document.getElementById('authLogoutBtn')?.addEventListener('click', logout);

    const session = loadSession();
    if (session && session.email && session.role) {
      showApp(session);
    } else {
      showLoginScreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window._navigatorAuth = { logout, loadSession };

})();
