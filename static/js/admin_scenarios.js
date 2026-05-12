/* ═══════════════════════════════════════════════════════════════
   admin_scenarios.js
   1. Suggest Scenario modal  — hamburger drawer link
   2. Admin Scenarios page    — Review tab + Log tab
   3. Toggle dropdown wiring  — Scenarios group (Review / Log)
   4. window.adminScenariosNavigate(tab) — called by ui.js
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const DELIVER_MEGA = 'Deliver Projects';

  /* ── tiny helpers ─────────────────────────────────────────── */
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function statusBadge(status) {
    const map = {
      pending:  ['as-badge-pending',  'Pending'],
      approved: ['as-badge-approved', 'Approved'],
      rejected: ['as-badge-rejected', 'Rejected'],
    };
    const [cls, label] = map[status] || ['as-badge-pending', status];
    return `<span class="as-badge ${cls}">${label}</span>`;
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  /* ══════════════════════════════════════════════════════════
     1. SUGGEST SCENARIO MODAL
  ══════════════════════════════════════════════════════════ */
  function initSuggestModal() {
    const overlay   = document.getElementById('suggestScenarioOverlay');
    const closeBtn  = document.getElementById('btnCloseSuggestScenario');
    const cancelBtn = document.getElementById('btnCancelSuggestScenario');
    const submitBtn = document.getElementById('btnSubmitSuggestScenario');
    const statusEl  = document.getElementById('ssStatus');

    if (!overlay || !submitBtn) return;

    /* fetch from API — same data the scenario library uses */
    async function _populate() {
      try {
        const res  = await fetch('/api/scenarios');
        const data = await res.json();
        const scenarios = data.scenarios || data || [];

        const megaSet = new Set(), catSet = new Set(), personaSet = new Set();
        scenarios.forEach(s => {
          if (s.mega_group) megaSet.add(s.mega_group);
          if (s.category)   catSet.add(s.category);
          if (s.persona)    personaSet.add(s.persona);
        });

        const mg = document.getElementById('ssMegaGroup');
        const ca = document.getElementById('ssCategory');
        const pe = document.getElementById('ssPersona');

        if (mg) mg.innerHTML = '<option value="">— Select Group —</option>' +
          [...megaSet].map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        if (ca) ca.innerHTML = '<option value="">— Select Category —</option>' +
          [...catSet].map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        if (pe) pe.innerHTML = '<option value="">— Select Persona / Role —</option>' +
          [...personaSet].map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
      } catch (e) {
        console.error('Could not load scenario options', e);
      }
    }

    /* show/hide Activate Phase exactly like Add scenario does */
    function _toggleActivatePhase() {
      const mg  = document.getElementById('ssMegaGroup');
      const row = document.getElementById('ssActivatePhaseRow');
      const ph  = document.getElementById('ssActivatePhase');
      if (!row) return;
      const show = mg && mg.value === DELIVER_MEGA;
      row.style.display = show ? '' : 'none';
      if (!show && ph) ph.value = '';
    }

    function _showStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.display = 'block';
      if (type === 'error') {
        statusEl.style.background = '#fef2f2';
        statusEl.style.border     = '1.5px solid #dc2626';
        statusEl.style.color      = '#991b1b';
      } else {
        statusEl.style.background = '#e8f5e9';
        statusEl.style.border     = '1.5px solid #16a34a';
        statusEl.style.color      = '#065f46';
      }
      statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function _reset() {
      ['ssTitle', 'ssScenario'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      ['ssMegaGroup', 'ssCategory', 'ssPersona', 'ssActivatePhase'].forEach(id => {
        const el = document.getElementById(id); if (el) el.selectedIndex = 0;
      });
      const row = document.getElementById('ssActivatePhaseRow');
      if (row) row.style.display = 'none';
      if (statusEl) statusEl.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Suggest a scenario';
    }

    function openModal() {
      _reset();
      overlay.classList.add('open');
      _populate();
    }

    function closeModal() {
      overlay.classList.remove('open');
      _reset();
    }

    document.querySelectorAll('.ss-open-trigger').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('menuDrawer').classList.remove('open');
        document.getElementById('menuDrawerOverlay').classList.remove('open');
        openModal();
      });
    });

    closeBtn.addEventListener('click',  closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.getElementById('ssMegaGroup').addEventListener('change', _toggleActivatePhase);

    submitBtn.addEventListener('click', async () => {
      const title         = (document.getElementById('ssTitle').value         || '').trim();
      const megaGroup     = (document.getElementById('ssMegaGroup').value     || '').trim();
      const category      = (document.getElementById('ssCategory').value      || '').trim();
      const persona       = (document.getElementById('ssPersona').value       || '').trim();
      const scenario      = (document.getElementById('ssScenario').value      || '').trim();

      if (!title)     { _showStatus('Scenario Title is required.', 'error'); return; }
      if (!megaGroup) { _showStatus('Group is required.', 'error'); return; }
      if (!category)  { _showStatus('Category is required.', 'error'); return; }
      if (!persona)   { _showStatus('Persona / Role is required.', 'error'); return; }
      if (!scenario)  { _showStatus('Scenario body is required.', 'error'); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      try {
        const session = (() => { try { return JSON.parse(sessionStorage.getItem('navigator_session')); } catch { return null; } })();
        const submittedBy = (session && session.email) ? session.email : '';
        const res = await fetch(`/api/scenario-suggestions/submit?submitted_by=${encodeURIComponent(submittedBy)}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            mega_group:     megaGroup,
            category:       category,
            persona:        persona,
            activate_phase: document.getElementById('ssActivatePhase').value || '',
            scenario,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Submission failed');
        _showStatus('✅ Scenario submitted! An admin will review it shortly.', 'success');
        setTimeout(closeModal, 1800);
      } catch (err) {
        _showStatus(`❌ ${err.message}`, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Suggest a scenario';
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     2. TOGGLE DROPDOWN — Scenarios group
  ══════════════════════════════════════════════════════════ */
  function initDropdownScenarios() {
    document.getElementById('dropScenarios')?.addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('menuDrawer')?.classList.remove('open');
      document.getElementById('menuDrawerOverlay')?.classList.remove('open');
      navigateTo('admin-scenarios');
      window.adminScenariosNavigate('review');
    });
  }

  /* ══════════════════════════════════════════════════════════
     3. ADMIN SCENARIOS PAGE
  ══════════════════════════════════════════════════════════ */
  function initAdminScenariosPage() {
    const page = document.getElementById('page-admin-scenarios');
    if (!page) return;

    let _activeTab = 'review';

    function _switchTab(name) {
      _activeTab = name;
      page.querySelectorAll('.as-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.astab === name));
      page.querySelectorAll('.as-panel').forEach(p => {
        const on = p.dataset.aspanel === name;
        p.classList.toggle('active', on);
        p.style.display = on ? '' : 'none';
      });
      if (name === 'review') _loadReview();
      if (name === 'log')    _loadLog();
    }

    page.querySelectorAll('.as-tab').forEach(t =>
      t.addEventListener('click', () => t.dataset.astab && _switchTab(t.dataset.astab)));

    document.getElementById('btnRefreshAdminScenarios')?.addEventListener('click', () =>
      _activeTab === 'review' ? _loadReview() : _loadLog());

    /* ── Review tab ── */
    let _rPage = 1, _rSearch = '', _rTimer = null;

    document.getElementById('asReviewSearch')?.addEventListener('input', e => {
      clearTimeout(_rTimer);
      _rTimer = setTimeout(() => { _rSearch = e.target.value; _rPage = 1; _loadReview(); }, 300);
    });
    document.getElementById('asReviewPrev')?.addEventListener('click', () => {
      if (_rPage > 1) { _rPage--; _loadReview(); }
    });
    document.getElementById('asReviewNext')?.addEventListener('click', () => {
      _rPage++; _loadReview();
    });

    async function _loadReview() {
      const el = document.getElementById('asReviewList');
      if (!el) return;
      el.innerHTML = '<div class="as-loading"><div class="spinner"></div></div>';
      try {
        const p = new URLSearchParams({ status: 'pending', search: _rSearch, page: _rPage, per_page: 10 });
        const r = await fetch(`/api/scenario-suggestions?${p}`);
        const d = await r.json();
        const badge = document.getElementById('asPendingBadge');
        if (badge) badge.textContent = d.total;
        _renderCards(el, d.items);
        _renderPager('asReviewPagination','asReviewPageInfo','asReviewPrev','asReviewNext', d.total, _rPage, 10);
      } catch (err) {
        el.innerHTML = `<div class="as-empty">Error: ${esc(err.message)}</div>`;
      }
    }

    function _renderCards(container, items) {
      if (!items?.length) {
        container.innerHTML = '<div class="as-empty">No pending suggestions. All caught up!</div>';
        return;
      }
      container.innerHTML = items.map(item => `
        <div class="as-review-card" data-id="${esc(item.id)}">

          <div class="as-card-title">${esc(item.title)}</div>

          <div class="as-card-kv">
            <div class="as-kv-row">
              <span class="as-kv-key">Group</span>
              <span class="as-kv-val">${esc(item.mega_group)}</span>
            </div>
            ${item.category ? `<div class="as-kv-row">
              <span class="as-kv-key">Category</span>
              <span class="as-kv-val">${esc(item.category)}</span>
            </div>` : ''}
            ${item.persona ? `<div class="as-kv-row">
              <span class="as-kv-key">Persona / Role</span>
              <span class="as-kv-val">${esc(item.persona)}</span>
            </div>` : ''}
            ${item.activate_phase ? `<div class="as-kv-row">
              <span class="as-kv-key">Activate Phase</span>
              <span class="as-kv-val">${esc(item.activate_phase)}</span>
            </div>` : ''}
            <div class="as-kv-row">
              <span class="as-kv-key">Submitted By</span>
              <span class="as-kv-val">${esc(item.submitted_by || 'Anonymous')} &nbsp;·&nbsp; ${fmtDate(item.submitted_at)}</span>
            </div>
          </div>

          <div class="as-card-scenario-label">Scenario</div>
          <div class="as-card-body">${esc(item.scenario)}</div>

          <div class="as-card-footer">
            <div class="as-card-actions">
              <input class="as-note-input" type="text" placeholder="Optional admin note…" id="note-${esc(item.id)}"/>
              <button class="as-btn-approve" data-action="approve" data-id="${esc(item.id)}">✓ Approve</button>
              <button class="as-btn-reject"  data-action="reject"  data-id="${esc(item.id)}">✕ Reject</button>
            </div>
          </div>

        </div>`).join('');

      container.querySelectorAll('[data-action]').forEach(btn =>
        btn.addEventListener('click', () => _doAction(btn.dataset.action, btn.dataset.id)));
    }

    async function _doAction(action, id) {
      const note = (document.getElementById(`note-${id}`)?.value || '').trim();
      const card = document.querySelector(`.as-review-card[data-id="${id}"]`);
      if (card) card.style.opacity = '0.5';
      try {
        const r = await fetch(
          `/api/scenario-suggestions/${id}/${action}?admin_note=${encodeURIComponent(note)}`,
          { method: 'POST' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail || `${action} failed`);
        _loadReview();
      } catch (err) {
        if (card) card.style.opacity = '1';
        alert(`Error: ${err.message}`);
      }
    }

    /* ── Log tab ── */
    let _lPage = 1, _lSearch = '', _lStatus = 'all', _lTimer = null;

    document.getElementById('asLogStatus')?.addEventListener('change', e => {
      _lStatus = e.target.value; _lPage = 1; _loadLog();
    });
    document.getElementById('asLogSearch')?.addEventListener('input', e => {
      clearTimeout(_lTimer);
      _lTimer = setTimeout(() => { _lSearch = e.target.value; _lPage = 1; _loadLog(); }, 300);
    });
    document.getElementById('asLogPrev')?.addEventListener('click', () => {
      if (_lPage > 1) { _lPage--; _loadLog(); }
    });
    document.getElementById('asLogNext')?.addEventListener('click', () => {
      _lPage++; _loadLog();
    });

    async function _loadLog() {
      const el = document.getElementById('asLogTable');
      if (!el) return;
      el.innerHTML = '<div class="as-loading"><div class="spinner"></div></div>';
      try {
        const p = new URLSearchParams({ status: _lStatus, search: _lSearch, page: _lPage, per_page: 15 });
        const r = await fetch(`/api/scenario-suggestions?${p}`);
        const d = await r.json();
        _renderTable(el, d.items);
        _renderPager('asLogPagination','asLogPageInfo','asLogPrev','asLogNext', d.total, _lPage, 15);
      } catch (err) {
        el.innerHTML = `<div class="as-empty">Error: ${esc(err.message)}</div>`;
      }
    }

    function _renderTable(container, items) {
      if (!items?.length) {
        container.innerHTML = '<div class="as-empty">No scenarios found.</div>';
        return;
      }
      container.innerHTML = `
        <table class="as-table">
          <thead><tr>
            <th>Title</th><th>Group</th><th>Category</th><th>Persona</th>
            <th>Submitted By</th><th>Submitted At</th><th>Status</th>
            <th>Admin Note</th><th>Reviewed At</th>
          </tr></thead>
          <tbody>${items.map(item => `<tr>
            <td class="as-td-title" title="${esc(item.scenario)}">${esc(item.title)}</td>
            <td>${esc(item.mega_group)}</td>
            <td>${esc(item.category || '—')}</td>
            <td>${esc(item.persona  || '—')}</td>
            <td>${esc(item.submitted_by || '—')}</td>
            <td class="as-td-date">${fmtDate(item.submitted_at)}</td>
            <td>${statusBadge(item.status)}</td>
            <td class="as-td-note">${esc(item.admin_note || '—')}</td>
            <td class="as-td-date">${fmtDate(item.reviewed_at)}</td>
          </tr>`).join('')}</tbody>
        </table>`;
    }

    function _renderPager(wrapId, infoId, prevId, nextId, total, page, perPage) {
      const wrap = document.getElementById(wrapId);
      if (!wrap) return;
      const pages = Math.max(1, Math.ceil(total / perPage));
      wrap.style.display = pages > 1 ? 'flex' : 'none';
      const info = document.getElementById(infoId);
      if (info) info.textContent = `Page ${page} of ${pages} (${total} total)`;
      const prev = document.getElementById(prevId);
      const next = document.getElementById(nextId);
      if (prev) prev.disabled = page <= 1;
      if (next) next.disabled = page >= pages;
    }

    /* auto-load when page becomes visible */
    new MutationObserver(() => {
      if (page.classList.contains('active')) _switchTab(_activeTab);
    }).observe(page, { attributes: true, attributeFilter: ['class'] });

    /* expose globally */
    window.adminScenariosNavigate = function (tab) { _switchTab(tab || 'review'); };
  }

  /* ── boot ─────────────────────────────────────────────────── */
  function boot() {
    initSuggestModal();
    initDropdownScenarios();
    initAdminScenariosPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();