/* ══════════════════════════════════════════════════════════════════
   feedback.js — Feedback Form Modal + Feedback Viewer Modal
   Storage: Azure Blob Storage (metadata.json + attachments per folder)
══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════
     FEEDBACK FORM MODAL
  ═══════════════════════════════════════ */
  const ISSUE_TYPES = [
    'Wrong Tool', 'Poor Output', 'Missing Feature',
    'Slow Response', 'UI Issue', 'Other'
  ];

  const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  let formOverlay, formModal, formBody, formSuccess;
  let selectedRating  = 0;
  let selectedIssue   = '';
  let currentAuditId  = '';
  let selectedFiles   = [];

  function initForm() {
    formOverlay = document.getElementById('fbOverlay');
    formModal   = document.getElementById('fbFormModal');
    formBody    = document.getElementById('fbFormBody');
    formSuccess = document.getElementById('fbFormSuccess');

    if (!formModal) return;

    document.getElementById('fbCloseBtn')?.addEventListener('click', closeForm);
    formOverlay?.addEventListener('click', closeForm);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && formModal.classList.contains('open')) closeForm();
    });

    buildFormBody();
  }

  function buildFormBody() {
    if (!formBody) return;
    selectedFiles  = [];
    selectedRating = 0;
    selectedIssue  = '';

    formBody.innerHTML = `
      <div class="fb-field">
        <label>Email Address</label>
        <input type="email" id="fbEmail" placeholder="you@company.com" autocomplete="email"/>
      </div>

      <div class="fb-field">
        <label>Rating <span style="color:#ef4444">*</span></label>
        <div class="fb-stars-row" id="fbStarsRow">
          ${[1,2,3,4,5].map(n => `<span class="fb-star" data-val="${n}" role="button" aria-label="${n} star">★</span>`).join('')}
          <span class="fb-star-label" id="fbStarLabel">Select a rating</span>
        </div>
      </div>

      <div class="fb-field">
        <label>Issue Type</label>
        <div class="fb-issue-pills" id="fbIssuePills">
          ${ISSUE_TYPES.map(t => `<button class="fb-pill" data-issue="${t}">${t}</button>`).join('')}
        </div>
      </div>

      <div class="fb-field">
        <label>Comments</label>
        <textarea id="fbComment" placeholder="Tell us what you think — any detail helps…" maxlength="1000"></textarea>
      </div>

      <div class="fb-field">
        <label>Attachments <span style="color:#64748b;font-weight:400;font-size:11px;">(screenshots, logs, any files)</span></label>
        <div class="fb-dropzone" id="fbDropzone">
          <div class="fb-dropzone-icon">📎</div>
          <div class="fb-dropzone-text">Drop files here or <span class="fb-dropzone-browse">browse</span></div>
          <div class="fb-dropzone-hint">Multiple files supported · PNG, JPG, PDF, DOCX, TXT, ZIP…</div>
          <input type="file" id="fbFileInput" multiple accept="image/*,.pdf,.doc,.docx,.txt,.log,.zip,.xlsx,.csv" style="display:none"/>
        </div>
        <div class="fb-file-preview" id="fbFilePreview"></div>
      </div>

      <div class="fb-submit-row">
        <button class="fb-btn-cancel" id="fbCancelBtn2">Cancel</button>
        <button class="fb-btn-submit" id="fbSubmitBtn" disabled>Submit Feedback</button>
      </div>
    `;

    /* Stars */
    const stars = formBody.querySelectorAll('.fb-star');
    const label = formBody.querySelector('#fbStarLabel');
    stars.forEach(star => {
      star.addEventListener('mouseenter', () => highlightStars(stars, +star.dataset.val));
      star.addEventListener('mouseleave', () => highlightStars(stars, selectedRating));
      star.addEventListener('click', () => {
        selectedRating = +star.dataset.val;
        highlightStars(stars, selectedRating);
        label.textContent = STAR_LABELS[selectedRating];
        label.style.color = '#f59e0b';
        updateSubmitBtn();
      });
    });

    /* Issue pills */
    formBody.querySelectorAll('.fb-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        formBody.querySelectorAll('.fb-pill').forEach(p => p.classList.remove('selected'));
        if (selectedIssue === pill.dataset.issue) {
          selectedIssue = '';
        } else {
          pill.classList.add('selected');
          selectedIssue = pill.dataset.issue;
        }
      });
    });

    /* File upload — dropzone */
    const dropzone  = formBody.querySelector('#fbDropzone');
    const fileInput = formBody.querySelector('#fbFileInput');

    dropzone.addEventListener('click', e => {
      if (e.target === fileInput) return;
      fileInput.click();
    });

    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      addFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener('change', () => {
      addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });

    /* Cancel */
    formBody.querySelector('#fbCancelBtn2')?.addEventListener('click', closeForm);

    /* Submit */
    formBody.querySelector('#fbSubmitBtn').addEventListener('click', submitFeedback);
  }

  function addFiles(newFiles) {
    newFiles.forEach(f => {
      if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) {
        selectedFiles.push(f);
      }
    });
    renderFilePreviews();
  }

  function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFilePreviews();
  }

  function renderFilePreviews() {
    const preview = formBody?.querySelector('#fbFilePreview');
    if (!preview) return;
    if (!selectedFiles.length) { preview.innerHTML = ''; return; }

    preview.innerHTML = selectedFiles.map((f, i) => {
      const isImage = f.type.startsWith('image/');
      const icon    = isImage ? '🖼️' : fileIcon(f.name);
      const size    = formatBytes(f.size);
      return `
        <div class="fb-file-chip" data-index="${i}">
          <span class="fb-file-chip-icon">${icon}</span>
          <span class="fb-file-chip-name" title="${escFb(f.name)}">${escFb(f.name)}</span>
          <span class="fb-file-chip-size">${size}</span>
          <button class="fb-file-chip-remove" data-idx="${i}" aria-label="Remove">✕</button>
        </div>`;
    }).join('');

    preview.querySelectorAll('.fb-file-chip-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        removeFile(+btn.dataset.idx);
      });
    });
  }

  function fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = { pdf: '📄', doc: '📝', docx: '📝', txt: '📃', log: '📃', zip: '🗜️', xlsx: '📊', csv: '📊' };
    return map[ext] || '📎';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function highlightStars(stars, val) {
    stars.forEach(s => s.classList.toggle('active', +s.dataset.val <= val));
  }

  function updateSubmitBtn() {
    const btn = formBody?.querySelector('#fbSubmitBtn');
    if (btn) btn.disabled = selectedRating === 0;
  }

  function openForm(auditId) {
    currentAuditId = auditId || '';
    if (!formModal) return;
    buildFormBody();
    formSuccess.classList.remove('show');
    formBody.style.display = '';
    formOverlay.classList.add('open');
    formModal.classList.add('open');
    setTimeout(() => formModal.querySelector('#fbEmail')?.focus(), 120);
  }

  function closeForm() {
    formOverlay?.classList.remove('open');
    formModal?.classList.remove('open');
  }

  async function submitFeedback() {
    const btn     = formBody.querySelector('#fbSubmitBtn');
    const email   = formBody.querySelector('#fbEmail')?.value.trim() || '';
    const comment = formBody.querySelector('#fbComment')?.value.trim() || '';

    if (!selectedRating) return;

    btn.disabled    = true;
    btn.textContent = 'Submitting…';

    try {
      const fd = new FormData();
      fd.append('email',      email);
      fd.append('rating',     selectedRating);
      fd.append('comment',    comment);
      fd.append('issue_type', selectedIssue);
      fd.append('audit_id',   currentAuditId);
      fd.append('source',     'form');
      selectedFiles.forEach(f => fd.append('files', f, f.name));

      const res = await fetch('/api/feedback', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Server error');

      formBody.style.display = 'none';
      formSuccess.classList.add('show');
      setTimeout(closeForm, 2200);
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = 'Submit Feedback';
      alert('Could not submit feedback. Please try again.');
    }
  }

  function escFb(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.openFeedbackForm = openForm;


  /* ═══════════════════════════════════════
     FEEDBACK VIEWER MODAL
  ═══════════════════════════════════════ */
  let viewerOverlay, viewerModal, viewerBody;
  let vPage = 1, vPerPage = 15, vTotal = 0;
  let vRating = 0, vSearch = '', vLoading = false;

  function initViewer() {
    viewerOverlay = document.getElementById('fbvOverlay');
    viewerModal   = document.getElementById('fbvModal');
    viewerBody    = document.getElementById('fbvBody');

    if (!viewerModal) return;

    document.getElementById('fbvCloseBtn')?.addEventListener('click', closeViewer);
    viewerOverlay?.addEventListener('click', closeViewer);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && viewerModal.classList.contains('open')) closeViewer();
    });

    document.getElementById('fbvRefreshBtn')?.addEventListener('click', () => {
      vPage = 1; fetchFeedbacks();
    });
    document.getElementById('fbvRatingFilter')?.addEventListener('change', e => {
      vRating = +e.target.value; vPage = 1; fetchFeedbacks();
    });

    let searchTimer;
    document.getElementById('fbvSearch')?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { vSearch = e.target.value; vPage = 1; fetchFeedbacks(); }, 350);
    });

    document.getElementById('dropFeedbackView')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('menuDrawer')?.classList.remove('open');
      document.getElementById('menuDrawerOverlay')?.classList.remove('open');
      openViewer();
    });

    document.getElementById('sidebarFeedbackView')?.addEventListener('click', openViewer);
  }

  function openViewer() {
    if (!viewerModal) return;
    vPage = 1; vRating = 0; vSearch = '';
    const rf = document.getElementById('fbvRatingFilter');
    const sr = document.getElementById('fbvSearch');
    if (rf) rf.value = '0';
    if (sr) sr.value = '';
    viewerOverlay.classList.add('open');
    viewerModal.classList.add('open');
    fetchFeedbacks();
  }

  function closeViewer() {
    viewerOverlay?.classList.remove('open');
    viewerModal?.classList.remove('open');
    closeAttachmentViewer();
  }

  async function fetchFeedbacks() {
    if (vLoading) return;
    vLoading = true;
    showViewerLoading();
    try {
      const params = new URLSearchParams({ page: vPage, per_page: vPerPage, rating: vRating, search: vSearch });
      const res  = await fetch(`/api/feedback-list?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      vTotal = data.total;
      renderViewer(data);
    } catch (err) {
      viewerBody.innerHTML = `<div class="fbv-empty"><div class="fbv-empty-icon">⚠️</div>Could not load feedbacks: ${escFbv(err.message)}</div>`;
    } finally {
      vLoading = false;
    }
  }

  function showViewerLoading() {
    if (!viewerBody) return;
    viewerBody.innerHTML = `
      <div class="fbv-loading">
        <div class="fbv-spinner"></div>
        <span>Loading feedbacks…</span>
      </div>`;
  }

  function renderViewer(data) {
    if (!viewerBody) return;

    const avg   = data.avg_rating;
    const dist  = data.distribution || [];
    const rows  = data.feedbacks    || [];
    const total = data.total        || 0;
    const maxDistCount = Math.max(...dist.map(d => d.count), 1);

    const kpiHtml = `
      <div class="fbv-kpi-row">
        <div class="fbv-kpi">
          <div class="fbv-kpi-label">Total Feedbacks</div>
          <div class="fbv-kpi-value">${total}</div>
          <div class="fbv-kpi-sub">all time</div>
        </div>
        <div class="fbv-kpi">
          <div class="fbv-kpi-label">Avg Rating</div>
          <div class="fbv-kpi-value" style="color:#f59e0b;">${avg ? avg.toFixed(1) : '—'}</div>
          <div class="fbv-kpi-sub">out of 5 ★</div>
        </div>
        <div class="fbv-kpi">
          <div class="fbv-kpi-label">5-Star Reviews</div>
          <div class="fbv-kpi-value" style="color:#10b981;">${dist.find(d => d.rating === 5)?.count || 0}</div>
          <div class="fbv-kpi-sub">excellent ratings</div>
        </div>
        <div class="fbv-kpi">
          <div class="fbv-kpi-label">Low Ratings (≤2)</div>
          <div class="fbv-kpi-value" style="color:#ef4444;">${dist.filter(d => d.rating <= 2).reduce((s, d) => s + d.count, 0)}</div>
          <div class="fbv-kpi-sub">need attention</div>
        </div>
      </div>`;

    const distHtml = `
      <div class="fbv-dist-card">
        <div class="fbv-dist-title">Rating Distribution</div>
        ${[5,4,3,2,1].map(r => {
          const item  = dist.find(d => d.rating === r);
          const count = item ? item.count : 0;
          const pct   = Math.round(count / maxDistCount * 100);
          return `
            <div class="fbv-dist-row">
              <span class="fbv-dist-star">${r} ★</span>
              <div class="fbv-dist-track"><div class="fbv-dist-fill" style="width:${pct}%;background:${r >= 4 ? '#10b981' : r === 3 ? '#f59e0b' : '#ef4444'};"></div></div>
              <span class="fbv-dist-count">${count}</span>
            </div>`;
        }).join('')}
      </div>`;

    let tableHtml;
    if (!rows.length) {
      tableHtml = `<div class="fbv-table-card"><div class="fbv-empty"><div class="fbv-empty-icon">📭</div>No feedbacks found</div></div>`;
    } else {
      const totalPages = Math.ceil(total / vPerPage);
      tableHtml = `
        <div class="fbv-table-card">
          <div class="fbv-table-header">
            <span class="fbv-table-title">All Feedbacks</span>
            <span class="fbv-table-count">Showing ${rows.length} of ${total}</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="fbv-table">
              <thead>
                <tr>
                  <th>Rating</th>
                  <th>Email</th>
                  <th>Issue Type</th>
                  <th>Comment</th>
                  <th>Files</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td><span class="fbv-stars-display">${renderStars(r.rating)}</span></td>
                    <td style="font-size:12.5px;color:#374151;">${escFbv(r.email || '—')}</td>
                    <td>${r.issue_type ? `<span class="fbv-issue-pill">${escFbv(r.issue_type)}</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
                    <td><div class="fbv-comment-text">${escFbv(r.comment || '—')}</div></td>
                    <td>
                      ${r.files && r.files.length
                        ? `<button class="fbv-view-files-btn" data-id="${escFbv(r.id)}" data-count="${r.files.length}">
                             📎 ${r.files.length} file${r.files.length > 1 ? 's' : ''}
                           </button>`
                        : '<span style="color:#d1d5db;">—</span>'}
                    </td>
                    <td class="fbv-date-cell">${fmtDate(r.created_at)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${totalPages > 1 ? renderPagination(totalPages) : ''}
        </div>`;
    }

    viewerBody.innerHTML = kpiHtml + distHtml + tableHtml;

    viewerBody.querySelectorAll('.fbv-page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => { vPage = +btn.dataset.page; fetchFeedbacks(); });
    });

    viewerBody.querySelectorAll('.fbv-view-files-btn').forEach(btn => {
      btn.addEventListener('click', () => openAttachmentViewer(btn.dataset.id));
    });
  }

  /* ── Attachment Viewer ── */
  function openAttachmentViewer(feedbackId) {
    let panel = document.getElementById('fbvAttachPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fbvAttachPanel';
      panel.className = 'fbv-attach-panel';
      panel.innerHTML = `
        <div class="fbv-attach-header">
          <span class="fbv-attach-title">📎 Attachments</span>
          <button class="fbv-attach-close" id="fbvAttachClose">✕</button>
        </div>
        <div class="fbv-attach-body" id="fbvAttachBody">
          <div class="fbv-loading"><div class="fbv-spinner"></div><span>Loading…</span></div>
        </div>`;
      document.getElementById('fbvModal')?.appendChild(panel);
      document.getElementById('fbvAttachClose')?.addEventListener('click', closeAttachmentViewer);
    }
    panel.classList.add('open');

    fetch(`/api/feedback-attachments/${encodeURIComponent(feedbackId)}`)
      .then(r => r.json())
      .then(data => {
        const body = document.getElementById('fbvAttachBody');
        if (!body) return;
        const files = data.files || [];
        if (!files.length) {
          body.innerHTML = `<div class="fbv-attach-empty">No attachments found</div>`;
          return;
        }
        body.innerHTML = files.map(f => {
          const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(f.name);
          if (isImage) {
            return `
              <div class="fbv-attach-item">
                <a href="${escFbv(f.url)}" target="_blank" rel="noopener">
                  <img src="${escFbv(f.url)}" alt="${escFbv(f.name)}" class="fbv-attach-img" loading="lazy"/>
                </a>
                <div class="fbv-attach-name">${escFbv(f.name)}</div>
              </div>`;
          }
          return `
            <div class="fbv-attach-item fbv-attach-file">
              <a href="${escFbv(f.url)}" target="_blank" rel="noopener" class="fbv-attach-dl">
                <span class="fbv-attach-file-icon">${fileIconFromName(f.name)}</span>
                <span class="fbv-attach-file-name">${escFbv(f.name)}</span>
                <span class="fbv-attach-dl-arrow">↓ Download</span>
              </a>
            </div>`;
        }).join('');
      })
      .catch(() => {
        const body = document.getElementById('fbvAttachBody');
        if (body) body.innerHTML = `<div class="fbv-attach-empty">Failed to load attachments</div>`;
      });
  }

  function closeAttachmentViewer() {
    document.getElementById('fbvAttachPanel')?.classList.remove('open');
  }

  function fileIconFromName(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = { pdf: '📄', doc: '📝', docx: '📝', txt: '📃', log: '📃', zip: '🗜️', xlsx: '📊', csv: '📊' };
    return map[ext] || '📎';
  }

  function renderPagination(totalPages) {
    const pages = [];
    for (let p = 1; p <= totalPages; p++) pages.push(p);
    return `
      <div class="fbv-pagination">
        <button class="fbv-page-btn" data-page="${vPage - 1}" ${vPage === 1 ? 'disabled' : ''}>‹ Prev</button>
        ${pages.slice(Math.max(0, vPage - 3), Math.min(totalPages, vPage + 2)).map(p =>
          `<button class="fbv-page-btn ${p === vPage ? 'active' : ''}" data-page="${p}">${p}</button>`
        ).join('')}
        <button class="fbv-page-btn" data-page="${vPage + 1}" ${vPage === totalPages ? 'disabled' : ''}>Next ›</button>
        <span class="fbv-page-info">Page ${vPage} of ${totalPages}</span>
      </div>`;
  }

  function renderStars(rating) {
    return [1,2,3,4,5].map(i =>
      `<span class="${i <= rating ? '' : 'empty'}">★</span>`
    ).join('');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
             + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function escFbv(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.openFeedbackViewer = openViewer;


  /* ── Boot ── */
  function boot() {
    initForm();
    initViewer();

    document.querySelectorAll('.fb-open-form-trigger').forEach(el => {
      el.addEventListener('click', e => { e.preventDefault(); openForm(''); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
