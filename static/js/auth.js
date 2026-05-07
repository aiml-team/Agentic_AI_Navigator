/* ═══════════════════════════════════════════════════════════════
   auth.js
   ─ Shows email login screen before the app loads.
   ─ POST /api/auth/identify  →  { email, role, permissions }
   ─ Session stored in sessionStorage (clears on tab close).

   BOTH admin and user see:
     • Profile icon (hdrMenuWrap) with Sign Out only

   ADMIN only sees (hidden for regular users):
     • Admin section in hamburger drawer (#drawerAdminSection)
     • Register Scenario button  (#slRegisterScenarioBtn)
     • Register Tool button      (#btnRegisterTool)
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SESSION_KEY = 'navigator_session';

  /* ── selectors that are ADMIN-ONLY (hidden for regular users) ── */
  const ADMIN_ONLY = [
    '#drawerAdminSection',    // admin options block in hamburger drawer
    '#slRegisterScenarioBtn', // Register Scenario button in Scenario Library
    '#btnRegisterTool',       // Register Tool button in AI Tools
  ];

  /* ── apply role to the UI ─────────────────────────────────── */
  function applyRole(role) {
    if (role === 'admin') return;

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

    /* Profile dropdown toggle — open/close on click */
    const toggleBtn = document.getElementById('hdrToggleBtn');
    const dropdown  = document.getElementById('hdrDropdown');
    if (toggleBtn && dropdown) {
      const freshBtn = toggleBtn.cloneNode(true);
      toggleBtn.parentNode.replaceChild(freshBtn, toggleBtn);
      freshBtn.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
    }
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
    if (typeof resetToStep1 === 'function') resetToStep1();

    const clear = (id, prop, val) => { const el = document.getElementById(id); if (el) el[prop] = val; };
    clear('resultMeta',           'innerHTML',      '');
    clear('toolRecBox',           'innerHTML',      '');
    clear('policyFlagsBox',       'innerHTML',      '');
    clear('alternativesBox',      'innerHTML',      '');
    clear('policyBlockedBox',     'innerHTML',      '');
    clear('resultPrompt',         'textContent',    '');
    clear('policyBlockedBox',     'style.display',  'none');
    clear('confidentialityNotice','style.display',  'none');
    clear('promptToolbar',        'style.display',  'none');
    clear('userInput',            'value',          '');

    if (typeof navigateTo === 'function') navigateTo('home');

    /* Restore admin-only elements so next admin login re-applies correctly */
    ADMIN_ONLY.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = ''; });
    });

    const badge = document.getElementById('authUserBadge');
    if (badge) badge.textContent = '';

    /* Close profile dropdown if open */
    document.getElementById('hdrDropdown')?.classList.remove('open');
  }

  /* ── logout ───────────────────────────────────────────────── */
  function logout() {
    clearSession();
    window.location.reload();
  }

  /* ── boot ─────────────────────────────────────────────────── */
  function boot() {
    document.getElementById('authForm')?.addEventListener('submit', handleLogin);

    /* Sign out — single binding on the static button */
    document.getElementById('authLogoutBtn')?.addEventListener('click', logout);

    /* Close profile dropdown when clicking anywhere else */
    document.addEventListener('click', () => {
      document.getElementById('hdrDropdown')?.classList.remove('open');
    });

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
