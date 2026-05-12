/* ══════════════════════════════════════════════════════════════════
   analytics.js — Unauthorized Analytics Dashboard
   Reads from /api/analytics-dashboard (time + role filtered)
══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── State ── */
  let currentPeriod = 'day';
  let currentRole   = 'all';
  let chartInstances = {};
  let isLoading = false;

  /* ── DOM refs (resolved after DOMContentLoaded) ── */
  let anOverlay, anModal, anCloseBtn, anDropTrigger;
  let periodTabs, roleSelect, refreshBtn;
  let bodyEl;

  /* ── Color palette ── */
  const COLORS = [
    '#1565c0','#0288d1','#00897b','#f57c00','#7b1fa2',
    '#c62828','#2e7d32','#ad1457','#4527a0','#37474f',
  ];

  const ROLE_COLORS = {
    'consultant': '#3730a3', 'executive': '#065f46',
    'developer': '#075985',  'analyst': '#7c2d12',
    'sales': '#6b21a8',      'marketing': '#991b1b',
    'hr': '#14532d',         'finance': '#78350f',
    'general': '#4a5f73',
  };

  /* ════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════ */
  function init() {
    anOverlay   = document.getElementById('anOverlay');
    anModal     = document.getElementById('anModal');
    anCloseBtn  = document.getElementById('anCloseBtn');
    anDropTrigger = document.getElementById('dropAnalytics');
    bodyEl      = document.getElementById('anBody');

    if (!anOverlay || !anModal) return;

    /* Open from dropdown */
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
      if (e.key === 'Escape' && anModal.classList.contains('open')) closeDashboard();
    });

    /* Period tabs */
    periodTabs = document.querySelectorAll('.an-period-tab');
    periodTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        periodTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentPeriod = tab.dataset.period;
        fetchAndRender();
      });
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

    showLoading();
    destroyCharts();

    try {
      const url = `/api/analytics-dashboard?period=${currentPeriod}&role=${encodeURIComponent(currentRole)}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderDashboard(data);
    } catch (err) {
      showError(err.message);
    } finally {
      isLoading = false;
    }
  }

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  function renderDashboard(d) {
    const total      = d.total_runs     || 0;
    const byRole     = d.by_role        || [];
    const byIntent   = d.by_intent      || [];
    const byTool     = d.by_tool        || [];
    const timeline   = d.timeline       || [];
    const blocked    = d.blocked_runs   || 0;

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

    `;

    /* Now populate each section */
    drawTimeline(timeline);
    drawRoleDonut(byRole, total);
    drawBarList('anIntentBars', byIntent, 'blue');
    drawBarList('anToolBars',   byTool,   'green');
    drawRoleTable(byRole, total);
  }

  /* ── KPI card HTML ── */
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
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'neu';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '→';
    return `<span class="an-kpi-trend ${cls}">${arrow} ${Math.abs(pct)}% vs prev</span>`;
  }

  /* ── Timeline Chart (Chart.js) ── */
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
        data: {
          labels,
          datasets: [{
            data: values,
            borderColor: '#1565c0',
            backgroundColor: 'rgba(21,101,192,0.08)',
            borderWidth: 2.5,
            pointBackgroundColor: '#1565c0',
            pointRadius: values.length > 48 ? 1 : 4,
            pointHoverRadius: 6,
            tension: 0.4,
            fill: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
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

    /* Legend */
    legend.innerHTML = labels.map((l, i) => `
      <div class="an-legend-item">
        <div class="an-legend-dot" style="background:${colors[i]};"></div>
        <span class="an-legend-label">${escapeHtml(l)}</span>
        <span class="an-legend-count">${values[i]}</span>
      </div>`).join('');

    loadChartJs(() => {
      chartInstances.donut = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
        },
        options: {
          responsive: false,
          cutout: '65%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw/total*100) : 0}%)`
            }}
          },
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
      const pct = Math.round((item.count / max) * 100);
      const total_pct = item.total_pct ? `${item.total_pct}%` : '';
      return `
        <div class="an-bar-row">
          <div class="an-bar-name" title="${escapeHtml(item.label || '—')}">${escapeHtml(item.label || '—')}</div>
          <div class="an-bar-track">
            <div class="an-bar-fill ${colorClass}" style="width:${pct}%"></div>
          </div>
          <div class="an-bar-count">${item.count}</div>
          ${total_pct ? `<div class="an-bar-pct">${total_pct}</div>` : ''}
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
        <thead>
          <tr><th>Role</th><th>Runs</th><th>Share</th></tr>
        </thead>
        <tbody>
          ${byRole.slice(0,8).map((r, i) => {
            const roleLower = (r.role || 'general').toLowerCase().split('/')[0].trim().split(' ')[0];
            const pct = total ? Math.round(r.count / total * 100) : 0;
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
        <button onclick="window._anRefetch && window._anRefetch()" style="margin-top:16px;padding:8px 20px;background:#1565c0;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Retry</button>
      </div>`;
    window._anRefetch = fetchAndRender;
  }

  function emptyState(msg) {
    return `<div class="an-empty"><div class="an-empty-icon">📭</div>${msg}</div>`;
  }

  /* ── Helpers ── */
  function fmtNum(n) {
    if (n == null) return '—';
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  function periodLabel() {
    return { day: 'Today', week: 'This Week', month: 'This Month' }[currentPeriod] || 'Today';
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Lazy-load Chart.js ── */
  let chartJsLoaded = false;
  let chartJsCallbacks = [];

  function loadChartJs(cb) {
    if (chartJsLoaded) { cb(); return; }
    chartJsCallbacks.push(cb);
    if (document.getElementById('chartjsScript')) return;
    const s = document.createElement('script');
    s.id  = 'chartjsScript';
    s.src = '/static/js/chart.umd.min.js';
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