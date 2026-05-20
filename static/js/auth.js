/* ═══════════════════════════════════════════════════════════════
   auth.js
   ─ Okta SAML SSO authentication for AI Navigator.
   ─ On page load: checks ?sso=1 param → fetches /api/auth/me
     to restore session after Okta redirect.
   ─ Falls back to sessionStorage for tab-refresh continuity.
   ─ "Sign in with Okta" button → browser goes to /saml/login.
   ─ Sign Out → /saml/logout (clears server session + JS state).
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SESSION_KEY = 'navigator_session';

  /* ── selectors that are ADMIN-ONLY (hidden for regular users) ── */
  const ADMIN_ONLY = [
    '#drawerAdminSection',
    '#adminRail',
    '#slRegisterScenarioBtn',
    '#btnRegisterTool',
  ];

  /* ── selectors that are USER-ONLY (hidden for admins) ── */
  const USER_ONLY = [
    '#slSuggestScenarioBtn',
  ];

  /* ── apply role to the UI ─────────────────────────────────── */
  function applyRole(role) {
    if (role === 'admin') {
      document.body.classList.add('has-admin-rail');
      const drawerAdmin = document.getElementById('drawerAdminSection');
      if (drawerAdmin) drawerAdmin.style.display = '';
      USER_ONLY.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.style.setProperty('display', 'none', 'important');
        });
      });
      _wireAdminRail();
      return;
    }
    document.body.classList.remove('has-admin-rail');
    document.body.classList.remove('admin-rail-collapsed');

    const adminRail = document.getElementById('adminRail');
    if (adminRail) adminRail.style.setProperty('display', 'none', 'important');

    const main = document.getElementById('mainContent');
    if (main) main.style.paddingLeft = '0px';

    ADMIN_ONLY.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    });
  }

  function _wireAdminRail() {
    const map = [
      ['railAnalytics',  'dropAnalytics'],
      ['railScenarios',  'dropScenarios'],
      ['railPolicies',   'dropPolicyUpload'],
      ['railToolsLog',   'dropToolChangeLog'],
      ['railFeedback',   'dropFeedbackView'],
    ];
    map.forEach(([railId, drawerId]) => {
      const railBtn   = document.getElementById(railId);
      const drawerBtn = document.getElementById(drawerId);
      if (!railBtn || !drawerBtn || railBtn._wired) return;
      railBtn._wired = true;
      railBtn.addEventListener('click', () => {
        document.querySelectorAll('#adminRail .rail-item').forEach(i => i.classList.remove('active'));
        railBtn.classList.add('active');
        drawerBtn.click();
      });
    });
  }

  function _initialsFromEmail(email) {
    const local = (email || '').split('@')[0] || '';
    if (!local) return '';
    const parts = local.split(/[^a-zA-Z]+/).filter(Boolean);
    if (!parts.length) return local.slice(0, 1).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
    document.getElementById('homeRecentList')?.replaceChildren();
    const recentBlock = document.getElementById('homeRecentBlock');
    if (recentBlock) recentBlock.style.display = 'none';
  }

  /* ── show login / show app ────────────────────────────────── */
  function showLoginScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appShell').style.display   = 'none';
  }

  function showApp(session) {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appShell').style.display   = '';

    const email = session.email || '';
    const username = email.includes('@') ? email.split('@')[0] : email;
    const displayName = username
      .split(/[._-]+/)
      .filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    const initials = _initialsFromEmail(email);

    const dropAvatar = document.getElementById('dropUserAvatar');
    const dropName   = document.getElementById('dropUserName');
    const dropEmail  = document.getElementById('dropUserEmail');
    if (dropAvatar) dropAvatar.textContent = initials || '?';
    if (dropName)   dropName.textContent   = displayName || 'Signed in';
    if (dropEmail)  dropEmail.textContent  = email;

    const initialsEl = document.querySelector('.hdr-avatar-text');
    const fallbackEl = document.querySelector('.hdr-avatar-fallback');
    if (initialsEl) {
      if (initials) {
        initialsEl.textContent = initials;
        if (fallbackEl) fallbackEl.style.display = 'none';
      } else if (fallbackEl) {
        initialsEl.textContent = '';
        fallbackEl.style.display = '';
      }
    }

    applyRole(session.role);

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

  /* ── reset app state on sign-out ─────────────────────────── */
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

    ADMIN_ONLY.concat(USER_ONLY).forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        el.style.removeProperty('display');
      });
    });

    const dropAvatar = document.getElementById('dropUserAvatar');
    const dropName   = document.getElementById('dropUserName');
    const dropEmail  = document.getElementById('dropUserEmail');
    if (dropAvatar) dropAvatar.textContent = '';
    if (dropName)   dropName.textContent   = '';
    if (dropEmail)  dropEmail.textContent  = '';

    document.getElementById('hdrDropdown')?.classList.remove('open');
  }

  /* ── logout → server clears session → reload ─────────────── */
  function logout() {
    clearSession();
    window.location.href = '/saml/logout';
  }

  /* ── fetch user from server session (after Okta redirect) ─── */
  async function fetchServerSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /* ── boot ─────────────────────────────────────────────────── */
  async function boot() {
    document.getElementById('authLogoutBtn')?.addEventListener('click', logout);

    document.addEventListener('click', () => {
      document.getElementById('hdrDropdown')?.classList.remove('open');
    });

    const params = new URLSearchParams(window.location.search);
    const justLoggedIn = params.get('sso') === '1';

    if (justLoggedIn) {
      const serverUser = await fetchServerSession();
      if (serverUser && serverUser.email) {
        saveSession(serverUser);
        history.replaceState(null, '', '/');
        showApp(serverUser);
        if (typeof initRecentRuns === 'function') initRecentRuns();
        if (typeof loadHistory === 'function') loadHistory();
        return;
      }
    }

    const cached = loadSession();
    if (cached && cached.email && cached.role) {
      const serverUser = await fetchServerSession();
      if (serverUser && serverUser.email) {
        saveSession(serverUser);
        showApp(serverUser);
      } else {
        showApp(cached);
      }
      if (typeof initRecentRuns === 'function') initRecentRuns();
      if (typeof loadHistory === 'function') loadHistory();
      return;
    }

    showLoginScreen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window._navigatorAuth = { logout, loadSession };

})();
