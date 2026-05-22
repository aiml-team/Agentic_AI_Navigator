/* ══════════════════════════════════════════════════════════════════
   analytics.js — Analytics Dashboard
   Reads from /api/analytics-dashboard (time + role filtered)
   Supports: Today / This Week / This Month / Custom Date Range
══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── State ── */
  let currentPeriod    = 'day';
  let currentRole      = 'all';
  let currentStartDate = '';
  let currentEndDate   = '';
  let chartInstances   = {};
  let isLoading        = false;

  /* ── User Activity pagination state ── */
  let uaPage   = 1;
  const UA_PER = 5;

  /* ── DOM refs ── */
  let anOverlay, anModal, anCloseBtn, anDropTrigger;
  let periodTabs, roleSelect, refreshBtn;
  let dateRangeBox, startDateInput, endDateInput, applyRangeBtn;
  let bodyEl;

  /* ── Color palette ── */
  const COLORS = [
    '#1565c0','#0288d1','#00897b','#f57c00','#7b1fa2',
    '#c62828','#2e7d32','#ad1457','#4527a0','#37474f',
  ];

  /* ════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════ */
  function init() {
    anOverlay      = document.getElementById('anOverlay');
    anModal        = document.getElementById('anModal');
    anCloseBtn     = document.getElementById('anCloseBtn');
    anDropTrigger  = document.getElementById('dropAnalytics');
    bodyEl         = document.getElementById('anBody');
    dateRangeBox   = document.getElementById('anDateRangeBox');
    startDateInput = document.getElementById('anStartDate');
    endDateInput   = document.getElementById('anEndDate');
    applyRangeBtn  = document.getElementById('anApplyRange');

    if (!anOverlay || !anModal) return;

    /* Set default end date = today, start date = 7 days ago */
    const today = new Date();
    const week  = new Date(today); week.setDate(today.getDate() - 7);
    if (startDateInput) startDateInput.value = _fmtDate(week);
    if (endDateInput)   endDateInput.value   = _fmtDate(today);

    /* Open from dropdown / rail */
    anDropTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('menuDrawer')?.classList.remove('open');
      document.getElementById('menuDrawerOverlay')?.classList.remove('open');
      openDashboard();
    });

    /* Close */
    anCloseBtn?.addEventListener('click', closeDashboard);
    anOverlay?.addEventListener('click', closeDashboard);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && anModal?.classList.contains('open')) closeDashboard();
    });

    /* Period tabs */
    periodTabs = document.querySelectorAll('.an-period-tab');
    periodTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        periodTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentPeriod = tab.dataset.period;

        if (currentPeriod === 'custom') {
          if (dateRangeBox) dateRangeBox.style.display = 'flex';
        } else {
          if (dateRangeBox) dateRangeBox.style.display = 'none';
          currentStartDate = '';
          currentEndDate   = '';
          fetchAndRender();
        }
      });
    });

    /* Apply custom range button */
    applyRangeBtn?.addEventListener('click', () => {
      currentStartDate = startDateInput?.value || '';
      currentEndDate   = endDateInput?.value   || '';
      if (!currentStartDate || !currentEndDate) {
        alert('Please select both a start and end date.');
        return;
      }
      if (currentStartDate > currentEndDate) {
        alert('Start date must be before end date.');
        return;
      }
      fetchAndRender();
    });

    /* Role select */
    roleSelect = document.getElementById('anRoleSelect');
    roleSelect?.addEventListener('change', () => {
      currentRole = roleSelect.value;
      fetchAndRender();
    });

    /* Refresh */
    refreshBtn = document.getElementById('anRefreshBtn');
    refreshBtn?.addEventListener('click', fetchAndRender);
  }

  /* ════════════════════════════════════════════
     OPEN / CLOSE
  ════════════════════════════════════════════ */
  function openDashboard() {
    anOverlay.classList.add('open');
    anModal.classList.add('open');
    fetchAndRender();
  }

  function closeDashboard() {
    anOverlay.classList.remove('open');
    anModal.classList.remove('open');
    destroyCharts();
  }

  function destroyCharts() {
    Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch(e) {} });
    chartInstances = {};
  }

  /* ════════════════════════════════════════════
     FETCH DATA
  ════════════════════════════════════════════ */
  async function fetchAndRender() {
    if (isLoading) return;
    isLoading = true;
    uaPage = 1;

    showLoading();
    destroyCharts();

    try {
      const params = new URLSearchParams({ period: currentPeriod, role: currentRole });

      if (currentPeriod === 'custom') {
        if (!currentStartDate || !currentEndDate) {
          showError('Please select a start and end date, then click Apply.');
          isLoading = false;
          return;
        }
        params.set('start_date', currentStartDate);
        params.set('end_date',   currentEndDate);
      }

      const res  = await fetch(`/api/analytics-dashboard?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderDashboard(data);
    } catch (err) {
      showError(err.message);
    } finally {
      isLoading = false;
    }
  }

  async function fetchUserActivity(page) {
    try {
      const res = await fetch(`/api/analytics/user-activity?page=${page}&per_page=${UA_PER}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  function renderDashboard(d) {
    const total    = d.total_runs   || 0;
    const byRole   = d.by_role      || [];
    const byIntent = d.by_intent    || [];
    const byTool   = d.by_tool      || [];
    const timeline = d.timeline     || [];
    const blocked  = d.blocked_runs || 0;

    bodyEl.innerHTML = `
      <!-- KPI Row -->
      <div class="an-kpi-row">
        ${kpiCard('🚀', 'Total Runs', fmtNum(total), periodLabel(), '#1565c0', '#e8f0fe', trendBadge(d.change_pct))}
        ${kpiCard('🚫', 'Blocked Runs', fmtNum(blocked), `${total ? Math.round(blocked/total*100) : 0}% of total`, '#c62828', '#fef2f2', '')}
      </div>

      <!-- Timeline + Role Donut -->
      <div class="an-chart-grid">
        <div class="an-card">
          <div class="an-card-header">
            <span class="an-card-title">📈 Runs Over Time</span>
            <span class="an-card-badge">${periodLabel()}</span>
          </div>
          <div class="an-timechart-wrap">
            <canvas id="anTimelineChart"></canvas>
          </div>
        </div>
        <div class="an-card">
          <div class="an-card-header">
            <span class="an-card-title">🎭 By Role</span>
            <span class="an-card-badge">${byRole.length} roles</span>
          </div>
          <div class="an-donut-wrap" id="anRoleDonutWrap" style="min-height:160px;">
            <canvas id="anRoleDonut" width="140" height="140" class="an-donut-canvas"></canvas>
            <div class="an-donut-legend" id="anRoleLegend"></div>
          </div>
        </div>
      </div>

      <!-- Intent Bars + Tool Bars + Role Table -->
      <div class="an-chart-grid-3">
        <div class="an-card">
          <div class="an-card-header">
            <span class="an-card-title">🎯 By Intent</span>
          </div>
          <div class="an-bar-list" id="anIntentBars"></div>
        </div>
        <div class="an-card">
          <div class="an-card-header">
            <span class="an-card-title">🛠 Top AI Tools</span>
          </div>
          <div class="an-bar-list" id="anToolBars"></div>
        </div>
        <div class="an-card">
          <div class="an-card-header">
            <span class="an-card-title">📊 Role Activity</span>
          </div>
          <div id="anRoleTableWrap"></div>
        </div>
      </div>

      <!-- User Activity KPI -->
      <div class="an-card" style="margin-top:18px;">
        <div class="an-card-header">
          <span class="an-card-title">👥 User Activity</span>
          <span class="an-card-badge" id="uaBadge">Loading…</span>
        </div>
        <div id="uaTableWrap" style="min-height:80px;"></div>
        <div class="ua-pagination" id="uaPagination" style="display:none;">
          <button class="ua-pg-btn" id="uaPrevBtn">← Prev</button>
          <span class="ua-pg-info" id="uaPageInfo"></span>
          <button class="ua-pg-btn" id="uaNextBtn">Next →</button>
        </div>
      </div>
    `;

    drawTimeline(timeline);
    drawRoleDonut(byRole, total);
    drawBarList('anIntentBars', byIntent, 'blue');
    drawBarList('anToolBars',   byTool,   'green');
    drawRoleTable(byRole, total);
    loadUserActivity(1);
  }

  /* ── KPI card ── */
  function kpiCard(icon, label, value, sub, color, pale, extra) {
    return `
      <div class="an-kpi" style="--kpi-color:${color};--kpi-pale:${pale};">
        <div class="an-kpi-icon">${icon}</div>
        <div class="an-kpi-body">
          <div class="an-kpi-label">${label}</div>
          <div class="an-kpi-value">${value}</div>
          <div class="an-kpi-sub">${sub}</div>
          ${extra}
        </div>
      </div>`;
  }

  function trendBadge(pct) {
    if (pct == null) return '';
    const cls   = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neu';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    return `<span class="an-kpi-trend ${cls}">${arrow} ${Math.abs(pct)}% vs prev</span>`;
  }

  /* ── Timeline Chart ── */
  function drawTimeline(timeline) {
    const canvas = document.getElementById('anTimelineChart');
    if (!canvas || !timeline.length) {
      const wrap = canvas?.closest('.an-timechart-wrap');
      if (wrap) wrap.innerHTML = emptyState('No timeline data yet');
      return;
    }
    loadChartJs(() => {
      const labels = timeline.map(t => t.label);
      const values = timeline.map(t => t.count);
      chartInstances.timeline = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets: [{
          data: values, borderColor: '#1565c0',
          backgroundColor: 'rgba(21,101,192,0.08)',
          borderWidth: 2.5, pointBackgroundColor: '#1565c0',
          pointRadius: values.length > 48 ? 1 : 4, pointHoverRadius: 6,
          tension: 0.4, fill: true,
        }]},
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            callbacks: { label: ctx => ` ${ctx.raw} run${ctx.raw !== 1 ? 's' : ''}` }
          }},
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#8a9bb0', maxTicksLimit: 10 } },
            y: { beginAtZero: true, grid: { color: '#f0f4f9' }, ticks: { font: { size: 11 }, color: '#8a9bb0', precision: 0 } },
          },
        },
      });
    });
  }

  /* ── Role Donut ── */
  function drawRoleDonut(byRole, total) {
    const canvas = document.getElementById('anRoleDonut');
    const legend = document.getElementById('anRoleLegend');
    if (!canvas || !byRole.length) {
      const wrap = document.getElementById('anRoleDonutWrap');
      if (wrap) wrap.innerHTML = emptyState('No role data');
      return;
    }
    const labels = byRole.slice(0,8).map(r => r.role || 'unknown');
    const values = byRole.slice(0,8).map(r => r.count);
    const colors = labels.map((_, i) => COLORS[i % COLORS.length]);
    legend.innerHTML = labels.map((l, i) => `
      <div class="an-legend-item">
        <div class="an-legend-dot" style="background:${colors[i]};"></div>
        <span class="an-legend-label">${escapeHtml(l)}</span>
        <span class="an-legend-count">${values[i]}</span>
      </div>`).join('');
    loadChartJs(() => {
      chartInstances.donut = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }]},
        options: {
          responsive: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw/total*100) : 0}%)`
          }}},
        },
      });
    });
  }

  /* ── Bar Lists ── */
  function drawBarList(containerId, items, colorClass) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!items.length) { el.innerHTML = emptyState('No data'); return; }
    const max = items[0].count || 1;
    el.innerHTML = items.slice(0, 8).map(item => {
      const pct      = Math.round((item.count / max) * 100);
      const totalPct = item.total_pct ? `${item.total_pct}%` : '';
      return `
        <div class="an-bar-row">
          <div class="an-bar-name" title="${escapeHtml(item.label || '—')}">${escapeHtml(item.label || '—')}</div>
          <div class="an-bar-track"><div class="an-bar-fill ${colorClass}" style="width:${pct}%"></div></div>
          <div class="an-bar-count">${item.count}</div>
          ${totalPct ? `<div class="an-bar-pct">${totalPct}</div>` : ''}
        </div>`;
    }).join('');
  }

  /* ── Role Table ── */
  function drawRoleTable(byRole, total) {
    const el = document.getElementById('anRoleTableWrap');
    if (!el) return;
    if (!byRole.length) { el.innerHTML = emptyState('No role data'); return; }
    const max = byRole[0]?.count || 1;
    el.innerHTML = `
      <table class="an-role-table">
        <thead><tr><th>Role</th><th>Runs</th><th>Share</th></tr></thead>
        <tbody>
          ${byRole.slice(0,8).map((r, i) => {
            const roleLower = (r.role || 'general').toLowerCase().split('/')[0].trim().split(' ')[0];
            const pct    = total ? Math.round(r.count / total * 100) : 0;
            const barPct = Math.round(r.count / max * 100);
            return `<tr>
              <td><span class="an-role-pill role-${roleLower}">${escapeHtml(r.role || 'Unknown')}</span></td>
              <td style="font-weight:700;color:#0f1e2d;">${r.count}</td>
              <td>
                <div class="an-role-bar-inline">
                  <div class="an-role-bar-track"><div class="an-role-bar-fill" style="width:${barPct}%;background:${COLORS[i % COLORS.length]};"></div></div>
                  <span style="font-size:11px;color:#8a9bb0;width:28px;text-align:right;">${pct}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  /* ── User Activity table ── */
  async function loadUserActivity(page) {
    uaPage = page;
    const wrap       = document.getElementById('uaTableWrap');
    const badge      = document.getElementById('uaBadge');
    const pagination = document.getElementById('uaPagination');
    if (!wrap) return;

    wrap.innerHTML = `<div class="an-loading" style="padding:20px 0;"><div class="an-spinner"></div><span>Loading users…</span></div>`;

    const data = await fetchUserActivity(page);
    if (!data) { wrap.innerHTML = emptyState('Could not load user data'); return; }

    if (badge) badge.textContent = `${data.total} user${data.total !== 1 ? 's' : ''}`;

    if (!data.items.length) {
      wrap.innerHTML = emptyState('No users yet');
      if (pagination) pagination.style.display = 'none';
      return;
    }

    wrap.innerHTML = `
      <table class="ua-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th style="text-align:center;">Runs</th>
            <th>Last Login</th>
            <th>Last Run</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(u => {
            const initials    = _initials(u.email);
            const displayName = _displayName(u.email);
            const roleCls     = u.role === 'admin' ? 'ua-role-admin' : 'ua-role-user';
            const runsBadge   = u.run_count > 0
              ? `<span class="ua-runs-badge">${u.run_count}</span>`
              : `<span class="ua-runs-zero">0</span>`;
            return `
              <tr>
                <td>
                  <div class="ua-user-cell">
                    <div class="ua-avatar">${escapeHtml(initials)}</div>
                    <div class="ua-user-info">
                      <div class="ua-user-name">${escapeHtml(displayName)}</div>
                      <div class="ua-user-email">${escapeHtml(u.email)}</div>
                    </div>
                  </div>
                </td>
                <td><span class="ua-role-pill ${roleCls}">${escapeHtml(u.role)}</span></td>
                <td style="text-align:center;">${runsBadge}</td>
                <td class="ua-date">${escapeHtml(u.last_seen)}</td>
                <td class="ua-date">${escapeHtml(u.last_run)}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    if (pagination) {
      const prevBtn  = document.getElementById('uaPrevBtn');
      const nextBtn  = document.getElementById('uaNextBtn');
      const pageInfo = document.getElementById('uaPageInfo');

      pagination.style.display = data.pages > 1 ? 'flex' : 'none';
      if (pageInfo) pageInfo.textContent = `Page ${data.page} of ${data.pages}`;
      if (prevBtn) { prevBtn.disabled = data.page <= 1; prevBtn.onclick = () => loadUserActivity(data.page - 1); }
      if (nextBtn) { nextBtn.disabled = data.page >= data.pages; nextBtn.onclick = () => loadUserActivity(data.page + 1); }
    }
  }

  /* ── Helpers ── */
  function _initials(email) {
    const local = (email || '').split('@')[0] || '';
    const parts = local.split(/[^a-zA-Z]+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function _displayName(email) {
    const local = (email || '').split('@')[0] || '';
    return local.split(/[._-]+/).filter(Boolean)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  function _fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function fmtNum(n) {
    if (n == null) return '—';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  function periodLabel() {
    if (currentPeriod === 'custom') {
      return currentStartDate && currentEndDate
        ? `${currentStartDate} → ${currentEndDate}`
        : 'Custom Range';
    }
    return { day: 'Today', week: 'This Week', month: 'This Month' }[currentPeriod] || 'Today';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Loading / Error states ── */
  function showLoading() {
    bodyEl.innerHTML = `
      <div class="an-loading">
        <div class="an-spinner"></div>
        <span>Loading analytics…</span>
      </div>`;
  }

  function showError(msg) {
    bodyEl.innerHTML = `
      <div class="an-empty" style="padding:80px 20px;">
        <div class="an-empty-icon">⚠️</div>
        <div style="font-size:16px;font-weight:700;color:#dc2626;margin-bottom:8px;">Could not load analytics</div>
        <div style="font-size:13px;color:#8a9bb0;">${escapeHtml(msg)}</div>
        <button onclick="window._anRefetch&&window._anRefetch()" style="margin-top:16px;padding:8px 20px;background:#1565c0;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Retry</button>
      </div>`;
    window._anRefetch = fetchAndRender;
  }

  function emptyState(msg) {
    return `<div class="an-empty"><div class="an-empty-icon">📭</div>${msg}</div>`;
  }

  /* ── Lazy-load Chart.js ── */
  let chartJsLoaded     = false;
  let chartJsCallbacks  = [];

  function loadChartJs(cb) {
    if (chartJsLoaded) { cb(); return; }
    chartJsCallbacks.push(cb);
    if (document.getElementById('chartjsScript')) return;
    const s = document.createElement('script');
    s.id    = 'chartjsScript';
    s.src   = '/static/js/chart.umd.min.js';
    s.onload = () => {
      chartJsLoaded = true;
      chartJsCallbacks.forEach(fn => fn());
      chartJsCallbacks = [];
    };
    document.head.appendChild(s);
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
