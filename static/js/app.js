/* ══════════════════════════════════════════════════════
   app.js — API config, state, home page / generate,
            render result, refine, feedback, history,
            tools, analytics, policies, sidebar stats
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════
   API ENDPOINTS
══════════════════════════════════════ */
const API = {
  run:                '/api/run',
  clarify:            '/api/clarify',
  clarifyMerge:       '/api/clarify-merge',
  refine:             '/api/refine',
  feedback:           '/api/feedback',
  audit:              '/api/audit',
  analytics:          '/api/analytics',
  tools:              '/api/tools',
  toolsRegister:      '/api/tools/register',
  toolsExtract:       '/api/tools/extract-files',
  toolsRegistered:    '/api/tools/registered',
  toolsDelete:        (id) => `/api/tools/registered/${encodeURIComponent(id)}`,
  toolsGetOne:        (name) => `/api/tools/registered/${encodeURIComponent(name)}`,
  toolDocsUpload:     '/api/tool-docs/upload',
  toolDocsUploadFor:  (name) => `/api/tool-docs/upload/${encodeURIComponent(name)}`,
  toolDocsStatus:     '/api/tool-docs/status',
  toolDocsClear:      '/api/tool-docs/clear',
  toolDocsClearTool:  (name) => `/api/tool-docs/clear/${encodeURIComponent(name)}`,
  toolDocDeleteFile:  '/api/tool-docs/file',
  toolChangeLog:      '/api/tool-change-log',
  policies:           '/api/policies',
  uploadPolicy:       '/api/upload-policy',
  deletePolicy:       (f) => `/api/policies/${encodeURIComponent(f)}`,
  promptVersions:     '/api/prompt-versions',
};


/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let currentAuditId     = null;
let currentOutput      = '';   // latest llm output — updated on each refinement too
let currentInput       = '';   // original user question
let currentCorlo       = '';   // CORLO prompt that generated the response
let currentRole        = 'general';
let currentTaskType    = 'general';
let currentIntent      = 'general';
let currentIndustry    = 'general';
let currentTool        = '';

function _getSessionEmail() {
  try { return (JSON.parse(sessionStorage.getItem('navigator_session')) || {}).email || ''; }
  catch { return ''; }
}
function _getSessionRole() {
  try { return (JSON.parse(sessionStorage.getItem('navigator_session')) || {}).role || 'user'; }
  catch { return 'user'; }
}


/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebar();
  initHomePage();
  initOutputTabs();
  initFeedback();
  initModal();
  initPoliciesPage();
  loadSidebarStats();
  // Toolbar hidden until a prompt is generated
  const t = document.getElementById('promptToolbar');
  if (t) t.style.display = 'none';

  // Init hamburger drawer AFTER everything else so the
  // button clone strips the sidebar-open listener added by initSidebar
  initHamburgerDrawer();

  // Init chat gather panel
  initChatPanel();


});




/* ══════════════════════════════════════
   HOME PAGE — Chat-driven flow
══════════════════════════════════════ */
function initHomePage() {


  document.getElementById('btnCopyOutput').addEventListener('click', () => {
    const panel = document.querySelector('.output-panel.active .output-content');
    if (panel) _copyToClipboard(panel.textContent, () => showToast('Copied!', 'success'));
  });

  document.getElementById('btnRefine')?.addEventListener('click', handleRefine);

  // ── Edit / Copy / Save prompt toolbar ──
  document.getElementById('btnEditPrompt')?.addEventListener('click', enterPromptEditMode);
  document.getElementById('btnCopyPrompt')?.addEventListener('click', copyPromptText);
  document.getElementById('btnSavePrompt')?.addEventListener('click', savePromptToFavorites);
  document.getElementById('btnPromptOk')?.addEventListener('click', applyPromptEdit);
  document.getElementById('btnPromptCancelEdit')?.addEventListener('click', cancelPromptEdit);
}


/* ══════════════════════════════════════
   PROMPT TOOLBAR — Edit / Copy / Save
══════════════════════════════════════ */

function enterPromptEditMode() {
  const display  = document.getElementById('resultPrompt');
  const textarea = document.getElementById('promptEditArea');
  const okBar    = document.getElementById('promptEditOk');
  const editBtn  = document.getElementById('btnEditPrompt');

  textarea.value        = display.textContent;
  display.style.display = 'none';
  textarea.style.display = 'block';
  okBar.style.display   = 'flex';
  editBtn.textContent   = '✎ Editing…';
  editBtn.disabled      = true;
  textarea.focus();
}

function applyPromptEdit() {
  const display  = document.getElementById('resultPrompt');
  const textarea = document.getElementById('promptEditArea');
  const okBar    = document.getElementById('promptEditOk');
  const editBtn  = document.getElementById('btnEditPrompt');

  display.textContent    = textarea.value;
  currentCorlo           = textarea.value;   // keep state in sync
  display.style.display  = 'block';
  textarea.style.display = 'none';
  okBar.style.display    = 'none';
  editBtn.textContent    = '✎ Edit';
  editBtn.disabled       = false;

  // Show revised banner
  const banner = document.getElementById('revisedBanner');
  if (banner) {
    banner.textContent   = '✅ Prompt updated manually.';
    banner.style.display = 'block';
  }
  showToast('Prompt updated!', 'success');
}

function cancelPromptEdit() {
  const display  = document.getElementById('resultPrompt');
  const textarea = document.getElementById('promptEditArea');
  const okBar    = document.getElementById('promptEditOk');
  const editBtn  = document.getElementById('btnEditPrompt');

  display.style.display  = 'block';
  textarea.style.display = 'none';
  okBar.style.display    = 'none';
  editBtn.textContent    = '✎ Edit';
  editBtn.disabled       = false;
}

/* ══════════════════════════════════════
   HTTP-SAFE CLIPBOARD HELPERS
   navigator.clipboard requires HTTPS — execCommand fallback for http://localhost
══════════════════════════════════════ */
function _copyToClipboard(text, onSuccess) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(onSuccess)
      .catch(() => _execCommandCopy(text, onSuccess));
  } else {
    _execCommandCopy(text, onSuccess);
  }
}

function _execCommandCopy(text, onSuccess) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    if (onSuccess) onSuccess();
  } catch(e) {
    showToast('Copy failed — please select and copy manually.', 'error');
  }
  document.body.removeChild(ta);
}

function copyPromptText() {
  const text = document.getElementById('resultPrompt').textContent;
  if (!text || text.startsWith('(')) { showToast('No prompt to copy yet.', 'error'); return; }
  _copyToClipboard(text, () => {
    const btn = document.getElementById('btnCopyPrompt');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1800);
    showToast('Prompt copied!', 'success');
  });
}

function savePromptToFavorites() {
  const text = document.getElementById('resultPrompt').textContent;
  if (!text || text.startsWith('(')) { showToast('No prompt to save yet.', 'error'); return; }

  // Build a title from the user input (first 50 chars)
  const title = (currentInput || 'Saved Prompt').substring(0, 50).trim()
              + (currentInput && currentInput.length > 50 ? '…' : '');

  // Read existing favorites from localStorage (same key as promptlib.js)
  let favs = [];
  try { favs = JSON.parse(localStorage.getItem('pl_favorites') || '[]'); } catch {}

  // Avoid exact duplicates by title
  if (favs.some(f => f.title === title)) {
    showToast('Already saved in Favorites.', 'info'); return;
  }

  favs.push({ title, body: currentInput, fromHome: true });
  localStorage.setItem('pl_favorites', JSON.stringify(favs));

  // Visual feedback
  const confirm = document.getElementById('saveConfirm');
  if (confirm) { confirm.style.display = 'inline'; setTimeout(() => { confirm.style.display = 'none'; }, 2500); }
  showToast('Saved to Favorites in Scenario Library!', 'success');
}


/* ══════════════════════════════════════
   COMBOBOX CUSTOM VALUE HIGHLIGHT
   — marks the input when user types a value not in the datalist
══════════════════════════════════════ */
function initComboboxHighlight() {
  const ROLE_OPTIONS = [
    'consultant / manager','executive / director','developer / technical',
    'business analyst','sales / bd','marketing / comms','hr / people ops','finance / accounting'
  ];
  const TASK_OPTIONS = [
    'research & analysis','writing & docs','strategy & planning','data analysis',
    'code & dev','creative content','communication','learning & training',
    'process automation','decision support'
  ];

  function bindComboHighlight(inputId, knownValues) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = el.value.trim().toLowerCase();
      if (!v) { el.classList.remove('custom-value'); return; }
      // Case-insensitive match — preset values chosen from the datalist won't be flagged
      const isKnown = knownValues.some(opt => opt.toLowerCase() === v);
      el.classList.toggle('custom-value', !isKnown);
    });
    // Also fire once on blur so pasted values are caught
    el.addEventListener('blur', () => el.dispatchEvent(new Event('input')));
  }

  bindComboHighlight('selRole',     ROLE_OPTIONS);
  bindComboHighlight('selTaskType', TASK_OPTIONS);
}

/* ══════════════════════════════════════
   CLARIFICATION MODAL STATE
══════════════════════════════════════ */
let _clarQuestions     = [];
let _clarInput         = '';
let _clarRole          = 'general';
let _clarTaskType      = 'general';
let _clarEnrichedInput = '';   // filled after /api/clarify-merge

function _openClarModal(questions, input, role, taskType) {
  _clarQuestions     = questions;
  _clarInput         = input;
  _clarRole          = role;
  _clarTaskType      = taskType;
  _clarEnrichedInput = '';

  const body = document.getElementById('clarBody');
  body.innerHTML = questions.map((q, i) => `
    <div class="clar-question-block" id="clar-qblock-${i}">
      <label class="clar-question-label" for="clar-ans-${i}">
        <span class="clar-q-num">${i + 1}</span>${escapeHtml(q)}
      </label>
      <input
        class="clar-answer-input"
        id="clar-ans-${i}"
        type="text"
        placeholder="Your answer… (leave blank to skip)"
        autocomplete="off"
        maxlength="120"
      />
    </div>
  `).join('');

  document.getElementById('clarOverlay').classList.add('open');

  const first = document.getElementById('clar-ans-0');
  if (first) setTimeout(() => first.focus(), 80);

  document.getElementById('clarSubmitBtn').onclick  = _handleClarSubmit;
  document.getElementById('clarSkipBtn').onclick    = _handleClarSkip;
  document.getElementById('clarSkipBtn2').onclick   = _handleClarSkip;

  document.getElementById('clarOverlay').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _handleClarSubmit(); }
    if (e.key === 'Escape') _handleClarSkip();
  };
}

function _closeClarModal() {
  document.getElementById('clarOverlay').classList.remove('open');
}

async function _handleClarSubmit() {
  const answers = _clarQuestions.map((_, i) =>
    (document.getElementById(`clar-ans-${i}`)?.value || '').trim()
  );

  _closeClarModal();

  const hasAnyAnswer = answers.some(a => a.length > 0);
  if (!hasAnyAnswer) {
    _runGenerate(_clarInput, _clarRole, _clarTaskType);
    return;
  }

  try {
    const mergeRes = await fetch(API.clarifyMerge, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_input: _clarInput,
        role:       _clarRole,
        task_type:  _clarTaskType,
        questions:  _clarQuestions,
        answers:    answers,
      }),
    });
    const mergeData = await mergeRes.json();
    _clarEnrichedInput = (mergeData.enriched_input || _clarInput).trim();
  } catch {
    _clarEnrichedInput = _clarInput;
  }

  _showEnrichedSuggestion(_clarEnrichedInput, _clarRole, _clarTaskType);
}

function _handleClarSkip() {
  _closeClarModal();
}

/* ── Enriched suggestion modal shown after clarification answers ── */
function _showEnrichedSuggestion(enriched, role, taskType) {
  const overlay   = document.getElementById('enrichedOverlay');
  const textarea  = document.getElementById('userInput');
  const charCount = document.getElementById('charCount');
  const descDisplay = document.getElementById('enrichedDescDisplay');
  const descTextarea = document.getElementById('enrichedDescText');
  const editBtn   = document.getElementById('enrichedEditBtn');

  descDisplay.textContent = enriched;
  descDisplay.style.display = '';
  descTextarea.value = enriched;
  descTextarea.style.display = 'none';
  editBtn.innerHTML = '&#9998; Edit';

  document.getElementById('enrichedOrigText').textContent = _clarInput;

  editBtn.onclick = () => {
    const isEditing = descTextarea.style.display !== 'none';
    if (isEditing) {
      const updated = descTextarea.value.trim() || enriched;
      descDisplay.textContent = updated;
      descDisplay.style.display = '';
      descTextarea.style.display = 'none';
      editBtn.innerHTML = '&#9998; Edit';
    } else {
      descTextarea.value = descDisplay.textContent;
      descDisplay.style.display = 'none';
      descTextarea.style.display = '';
      descTextarea.focus();
      editBtn.innerHTML = '&#10003; Done';
    }
  };

  overlay.classList.add('open');

  document.getElementById('enrichedBannerUse').onclick = () => {
    const finalText = (descTextarea.style.display !== 'none'
      ? descTextarea.value
      : descDisplay.textContent
    ).trim() || enriched;
    overlay.classList.remove('open');
    textarea.value = finalText;
    if (charCount) charCount.textContent = finalText.length;
    _runGenerate(finalText, role, taskType);
  };

  document.getElementById('enrichedBannerOriginal').onclick = () => {
    overlay.classList.remove('open');
    _runGenerate(_clarInput, role, taskType);
  };

  document.getElementById('enrichedBannerClose').onclick = () => {
    overlay.classList.remove('open');
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  };
}

async function handleGenerate() {
  const input    = document.getElementById('userInput').value.trim();
  const role     = (document.getElementById('selRole')?.value     || '').trim() || 'general';
  const taskType = (document.getElementById('selTaskType')?.value || '').trim() || 'general';

  if (!input) { showToast('Please describe your task first.', 'error'); return; }

  const existingBanner = document.getElementById('enrichedSuggestionBanner');
  if (existingBanner) existingBanner.remove();

  const btnGenerate = document.getElementById('btnGenerate');
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Checking…';

  const _resetBtn = () => {
    btnGenerate.disabled = false;
    btnGenerate.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Response`;
  };

  let needsClar = false;
  try {
    const clarRes = await fetch(API.clarify, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_input: input, role, task_type: taskType }),
    });

    if (clarRes.ok) {
      const clarData = await clarRes.json();
      if (clarData.needs_clarification && clarData.questions && clarData.questions.length > 0) {
        needsClar = true;
        _resetBtn();
        _openClarModal(clarData.questions, input, role, taskType);
      }
    }
  } catch {
    /* network error — skip clarification and generate directly */
  }

  if (needsClar) return;

  _resetBtn();
  await _runGenerate(input, role, taskType);
}

async function _runGenerate(input, role, taskType) {
  goToStep(2);
  startProcessingAnimation();

  try {
    const res = await fetch(API.run, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_input:       input,
        role:             role,
        task_type:        taskType,
        data_sensitivity: 'general',
        user_email:       _getSessionEmail(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();

    currentAuditId  = data.audit_id;
    currentOutput   = data.output           || '';
    currentCorlo    = data.corlo_prompt     || '';
    currentInput    = input;
    currentRole     = role;
    currentTaskType = taskType;
    currentIntent   = data.intent           || 'general';
    currentIndustry = data.industry         || 'general';
    currentTool     = data.recommended_tool || '';

    await finishProcessingAnimation();
    renderResult(data);
    goToStep(3);
    loadSidebarStats();

  } catch (err) {
    goToStep(1);
    showToast(`Error: ${err.message}`, 'error');
  }
}

function resetToStep1() {
  goToStep(1);
  const banner = document.getElementById('revisedBanner');
  if (banner) { banner.style.display = 'none'; banner.textContent = ''; }
  const ri = document.getElementById('refinementInput');
  if (ri) ri.value = '';
  const toolbar = document.getElementById('promptToolbar');
  if (toolbar) toolbar.style.display = 'none';
  document.getElementById('enrichedOverlay')?.classList.remove('open');
  _closeClarModal();
  cancelPromptEdit();
  currentAuditId     = null;
  currentOutput      = '';
  currentCorlo       = '';
  currentInput       = '';
  currentRole        = 'general';
  currentTaskType    = 'general';
  currentIntent      = 'general';
  currentIndustry    = 'general';
  currentTool        = '';
  document.querySelectorAll('.star').forEach(s => s.classList.remove('lit'));
  _chatReset();
}


/* ══════════════════════════════════════
   PROMPT BADGE HELPER
   Reads is_prompt_required from registry raw_data and returns a badge span.
   Values: "yes"/"required"/"true"/"1" → Required
           "no"/"not required"/"false"/"0" → No Prompt
           "optional" → Optional
══════════════════════════════════════ */
function buildPromptBadge(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  const val = String(raw).trim().toLowerCase();
  if (val === 'yes' || val === 'true' || val === '1' || val === 'required')
    return `<span class="tool-badge-prompt-req">✍️ Prompt Required</span>`;
  if (val === 'no' || val === 'false' || val === '0' || val === 'not required')
    return `<span class="tool-badge-prompt-no">⚡ No Prompt</span>`;
  if (val === 'optional')
    return `<span class="tool-badge-prompt-opt">💡 Prompt Optional</span>`;
  return '';
}


/* ══════════════════════════════════════
   RENDER RESULT
══════════════════════════════════════ */
function renderResult(data) {
  // ── Meta badges ──
  const confClass   = data.tool_confidence === 'high'   ? 'conf-high'
                    : data.tool_confidence === 'medium' ? 'conf-med' : 'conf-low';
  const role        = data.role      || '';
  const taskType    = data.task_type || '';

  document.getElementById('resultMeta').innerHTML = `
    ${data.recommended_tool ? `<span class="meta-badge tool">${escapeHtml(data.tool_icon || '🤖')} ${escapeHtml(data.recommended_tool)}</span>` : ''}
    ${data.intent    ? `<span class="meta-badge intent">Intent: ${capitalize(data.intent)}</span>` : ''}
    ${data.industry  ? `<span class="meta-badge intent">Industry: ${capitalize(data.industry)}</span>` : ''}
    ${data.tool_confidence ? `<span class="meta-badge ${confClass}">${capitalize(data.tool_confidence)} confidence</span>` : ''}
    ${role     ? `<span class="meta-badge role">👤 ${capitalize(role)}</span>`     : ''}
    ${taskType ? `<span class="meta-badge role">📌 ${capitalize(taskType)}</span>` : ''}
  `;

  // ── Policy blocked banner — shown prominently above everything if blocked ──
  const blockedBox = document.getElementById('policyBlockedBox');
  if (data.policy_blocked) {
    blockedBox.style.display = 'block';
    blockedBox.innerHTML = `
      <div class="safety-banner bad" style="margin-bottom:12px">
        <span>🚫</span>
        <div>
          <strong>Task blocked by company policy</strong>
          <span>${escapeHtml(data.policy_summary || 'This request conflicts with one or more company policies.')}</span>
        </div>
      </div>`;
  } else {
    blockedBox.style.display = 'none';
    blockedBox.innerHTML = '';
  }

  // ── Tool recommendation box ──
  const toolBox = document.getElementById('toolRecBox');
  if (data.recommended_tool && !data.policy_blocked) {
    toolBox.innerHTML = `
      <div class="tool-rec-box">
        <div class="tool-rec-header">
          <div class="tool-rec-icon">${escapeHtml(data.tool_icon || '🤖')}</div>
          <div>
            <div class="tool-rec-name">${escapeHtml(data.recommended_tool)}</div>
            <div class="tool-rec-category">${escapeHtml(data.tool_category || '')}</div>
          </div>
          <div class="tool-rec-badges" id="toolRecBadges"></div>
        </div>
        <div class="tool-rec-reason">${escapeHtml(data.tool_reason || '')}</div>

        ${(typeof data.tool_confidence_pct === 'number' && data.tool_confidence_pct > 0) ? (() => {
          const confPct    = data.tool_confidence_pct;
          const confExpl   = data.tool_confidence_explanation || '';
          const confLabel  = confPct >= 85 ? 'Excellent fit' : confPct >= 75 ? 'Strong fit' : confPct >= 55 ? 'Good fit' : confPct >= 35 ? 'Partial fit' : 'Weak fit';
          const confColor  = confPct >= 85 ? '#10B981' : confPct >= 75 ? '#00A3E0' : confPct >= 55 ? '#3B82F6' : confPct >= 35 ? '#F59E0B' : '#EF4444';
          const confBg     = confPct >= 85 ? '#ECFDF5' : confPct >= 75 ? '#E8F7FD' : confPct >= 55 ? '#EFF6FF' : confPct >= 35 ? '#FFFBEB' : '#FEF2F2';
          const confBorder = confPct >= 85 ? '#6EE7B7' : confPct >= 75 ? '#BAE6FD' : confPct >= 55 ? '#BFDBFE' : confPct >= 35 ? '#FCD34D' : '#FCA5A5';
          return `
        <div style="margin-top:14px;padding:14px 16px;border-radius:10px;background:${confBg};border:1px solid ${confBorder};">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${confColor};">Match Confidence</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:13px;font-weight:800;color:${confColor};">${confPct}%</span>
              <span style="font-size:11px;font-weight:600;color:${confColor};padding:2px 8px;border-radius:999px;background:${confBorder};opacity:0.85">${confLabel}</span>
            </div>
          </div>
          <div style="height:8px;background:rgba(0,0,0,0.07);border-radius:999px;overflow:hidden;${confExpl ? 'margin-bottom:10px' : ''}">
            <div style="height:100%;width:${confPct}%;background:${confColor};border-radius:999px;transition:width 0.6s ease;"></div>
          </div>
          ${confExpl ? `<div style="font-size:12px;color:${confColor};line-height:1.6;opacity:0.9;">${escapeHtml(confExpl)}</div>` : ''}
        </div>`;
        })() : ''}

        <div class="tool-rec-footer" style="margin-top:12px;">
          ${data.tool_url ? `<a class="tool-url-btn" href="${escapeHtml(data.tool_url)}" target="_blank" rel="noopener">🚀 Open Tool</a>` : ''}
        </div>
      </div>`;

    // Async: inject prompt-required badge once registry is available
    fetch(API.tools).then(r => r.json()).then(registry => {
      const key  = Object.keys(registry).find(k => k.toLowerCase() === (data.recommended_tool || '').toLowerCase());
      const info = key ? registry[key] : null;
      const badgesEl = document.getElementById('toolRecBadges');
      if (badgesEl && info) {
        const rawPrompt = (info.raw_data?.is_prompt_required ?? info.is_prompt_required ?? '');
        const promptBadge = buildPromptBadge(rawPrompt);
        if (promptBadge) badgesEl.insertAdjacentHTML('afterbegin', promptBadge);
      }
    }).catch(() => {});
  } else {
    toolBox.innerHTML = '';
  }

  // ── Policy flags ──
  const flagsBox = document.getElementById('policyFlagsBox');
  const flags    = data.policy_flags || [];
  if (flags.length) {
    flagsBox.innerHTML = `
      <div class="policy-flag-list">
        ${flags.map(f => `<div class="policy-flag">⚠ ${escapeHtml(f)}</div>`).join('')}
      </div>`;
  } else {
    flagsBox.innerHTML = '';
  }

  const altBox        = document.getElementById('alternativesBox');
  const CONF_THRESHOLD = 60;
  const _altsRaw      = (data.tool_alternatives || []);
  const _altReasons   = data.tool_alternative_reasons || [];
  const _altConfPcts  = data.tool_alternative_confidence_pcts || [];
  const _altUrls      = data.tool_alternative_urls || [];

  // Keep only alternatives at or above the confidence threshold
  const filteredIdxs  = _altsRaw
    .map((a, i) => i)
    .filter(i => _altsRaw[i] && _altsRaw[i].trim() && (typeof _altConfPcts[i] === 'number' ? _altConfPcts[i] >= CONF_THRESHOLD : true));

  const alts        = filteredIdxs.map(i => _altsRaw[i]);
  const altReasons  = filteredIdxs.map(i => _altReasons[i] || '');
  const altConfPcts = filteredIdxs.map(i => _altConfPcts[i]);
  const altUrls     = filteredIdxs.map(i => _altUrls[i] || '');

  const ALT_VISIBLE = 2;

  if (alts.length > 0 && !data.policy_blocked) {
    // Skeleton cards — enriched async from registry below
    altBox.innerHTML = `
      <div class="alt-section-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Also Consider
      </div>
      <div class="alt-cards-row" id="altCardsRow">
        ${alts.map((a, i) => `
          <div class="alt-card${i >= ALT_VISIBLE ? ' alt-card-hidden' : ''}" id="alt-card-${CSS.escape(a)}">
            <div class="alt-card-header">
              <div class="alt-card-icon">🤖</div>
              <div class="alt-card-body">
                <div class="alt-card-name">${escapeHtml(a)}</div>
                <div class="alt-card-cat">Loading…</div>
              </div>
              <div class="alt-card-right">
                <button class="alt-card-btn" onclick="openAlternativeTool('${escapeHtml(a)}')" title="Open ${escapeHtml(a)}">
                  ↗ Open
                </button>
              </div>
            </div>
            <div class="alt-card-content" id="alt-card-content-${CSS.escape(a)}"></div>
          </div>`).join('')}
      </div>
      ${alts.length > ALT_VISIBLE ? `
      <button class="alt-see-more-btn" id="altSeeMoreBtn" onclick="(function(){
        var hidden = document.querySelectorAll('#altCardsRow .alt-card-hidden');
        var btn = document.getElementById('altSeeMoreBtn');
        if(hidden.length){
          hidden.forEach(function(c){ c.classList.remove('alt-card-hidden'); });
          btn.textContent = 'See less ▲';
        } else {
          var all = document.querySelectorAll('#altCardsRow .alt-card');
          all.forEach(function(c,i){ if(i >= ${ALT_VISIBLE}) c.classList.add('alt-card-hidden'); });
          btn.textContent = 'See more (${alts.length - ALT_VISIBLE} more) ▼';
        }
      })()">See more (${alts.length - ALT_VISIBLE} more) ▼</button>` : ''}`;

    // Enrich cards asynchronously — fills icon, category, description, confidence bar, reason, Open URL
    fetch(API.tools).then(r => r.json()).then(registry => {
      alts.forEach((a, i) => {
        const key       = Object.keys(registry).find(k => k.toLowerCase() === a.toLowerCase());
        const info      = key ? registry[key] : null;
        const card      = document.getElementById(`alt-card-${CSS.escape(a)}`);
        if (!card) return;

        const pctVal    = typeof altConfPcts[i] === 'number' ? altConfPcts[i] : null;
        const reason    = altReasons[i] || '';
        const toolUrl   = altUrls[i] || (info ? info.url : '') || '';
        const contentEl = document.getElementById(`alt-card-content-${CSS.escape(a)}`);

        // Icon + category
        if (info) {
          card.querySelector('.alt-card-icon').textContent = info.icon || '🤖';
          card.querySelector('.alt-card-cat').textContent  = info.category || '';
        } else {
          card.querySelector('.alt-card-cat').textContent = 'AI Tool';
        }

        // Open button URL
        if (toolUrl) {
          card.querySelector('.alt-card-btn').onclick = () =>
            window.open(toolUrl, '_blank', 'noopener');
        }

        // Content area: description + confidence bar + reason
        if (contentEl) {
          const confLabel  = pctVal >= 85 ? 'Excellent fit' : pctVal >= 75 ? 'Strong fit' : pctVal >= 55 ? 'Good fit' : pctVal >= 35 ? 'Partial fit' : 'Weak fit';
          const confColor  = pctVal >= 85 ? '#10B981' : pctVal >= 75 ? '#00A3E0' : pctVal >= 55 ? '#3B82F6' : pctVal >= 35 ? '#F59E0B' : '#EF4444';
          const confBg     = pctVal >= 85 ? '#ECFDF5' : pctVal >= 75 ? '#E8F7FD' : pctVal >= 55 ? '#EFF6FF' : pctVal >= 35 ? '#FFFBEB' : '#FEF2F2';
          const confBorder = pctVal >= 85 ? '#6EE7B7' : pctVal >= 75 ? '#BAE6FD' : pctVal >= 55 ? '#BFDBFE' : pctVal >= 35 ? '#FCD34D' : '#FCA5A5';

          contentEl.innerHTML = `
            ${info && info.description ? `<div class="alt-card-desc" style="margin:0 0 10px 0;font-size:13px;line-height:1.5;color:#374151;">${escapeHtml(info.description)}</div>` : ''}
            ${pctVal !== null || reason ? `
            <div style="padding:12px 14px;border-radius:10px;background:${confBg};border:1px solid ${confBorder};width:100%;box-sizing:border-box;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:${confColor};">Match Confidence</span>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:13px;font-weight:800;color:${confColor};">${pctVal}%</span>
                  <span style="font-size:11px;font-weight:600;color:${confColor};padding:2px 7px;border-radius:999px;background:${confBorder};opacity:0.85">${confLabel}</span>
                </div>
              </div>
              <div style="height:7px;background:rgba(0,0,0,0.07);border-radius:999px;overflow:hidden;${reason ? 'margin-bottom:8px;' : ''}">
                <div style="height:100%;width:${pctVal}%;background:${confColor};border-radius:999px;transition:width 0.6s ease;"></div>
              </div>
              ${reason ? `<div style="font-size:12px;color:${confColor};line-height:1.6;opacity:0.9;">${escapeHtml(reason)}</div>` : ''}
            </div>` : ''}
          `;
        }
      });
    }).catch(() => {});
  } else {
    altBox.innerHTML = '';
  }


  // ── Confidentiality Notice (only when NOT blocked) ──
  const confNoticeBox = document.getElementById('confidentialityNotice');
  if (confNoticeBox) {
    if (!data.policy_blocked) {
      confNoticeBox.style.display = 'flex';
    } else {
      confNoticeBox.style.display = 'none';
    }
  }

  // ── Output panels ──
  document.getElementById('resultPrompt').textContent = data.policy_blocked
    ? '(Prompt not generated — task was blocked by company policy.)'
    : (data.corlo_prompt || '(No prompt generated)');

// Policies Applied tab — rich HTML for both blocked and allowed cases
  const policySummary = data.policy_summary || '';
  const policyFlags   = data.policy_flags   || [];
  const policiesEl    = document.getElementById('resultPolicies');

  if (data.policy_blocked) {
    // ── BLOCKED: show a clear violation breakdown ──
    const flagItems = policyFlags.length
      ? policyFlags.map(f => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
               background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-bottom:8px;">
            <span style="font-size:16px;flex-shrink:0;">🚫</span>
            <span style="font-size:13px;color:#991B1B;font-weight:600;">${escapeHtml(f)}</span>
          </div>`).join('')
      : `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;
              background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-bottom:8px;">
           <span style="font-size:16px;flex-shrink:0;">🚫</span>
           <span style="font-size:13px;color:#991B1B;font-weight:600;">Prohibited content detected</span>
         </div>`;

    policiesEl.innerHTML = `
      <div style="padding:4px 2px;">

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:20px;">🛡️</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:#991B1B;">Request Blocked by Company Policy</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">This task cannot proceed — one or more policy violations were detected.</div>
          </div>
        </div>

        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
             color:var(--text3);margin-bottom:8px;">Policy Violations Detected</div>
        ${flagItems}

        <div style="margin-top:16px;padding:12px 14px;background:#FFF7ED;border:1px solid #FCD34D;
             border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:#92400E;margin-bottom:6px;">📋 Policy Explanation</div>
          <div style="font-size:13px;color:#78350F;line-height:1.6;">
            ${escapeHtml(policySummary || 'This request conflicts with your company\'s acceptable use policy. Prohibited topics include harmful content, dangerous instructions, and restricted subject matter.')}
          </div>
        </div>

        <div style="margin-top:14px;padding:12px 14px;background:#F0F9FF;border:1px solid #BAE6FD;
             border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:#075985;margin-bottom:6px;">💡 What you can do instead</div>
          <div style="font-size:13px;color:#0C4A6E;line-height:1.6;">
            Please rephrase your request to focus on a permitted topic. If you believe this was flagged in error, contact your policy administrator. You can also try a different task type or industry context.
          </div>
        </div>

      </div>`;

  } else {
    // ── ALLOWED: show a green clearance summary ──
    const flagItems = policyFlags.length
      ? `<div style="margin-bottom:14px;">
           <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
                color:var(--text3);margin-bottom:8px;">⚠️ Soft Warnings (non-blocking)</div>
           ${policyFlags.map(f => `
             <div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;
                  background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;margin-bottom:6px;">
               <span style="font-size:14px;flex-shrink:0;">⚠️</span>
               <span style="font-size:12px;color:#92400E;">${escapeHtml(f)}</span>
             </div>`).join('')}
         </div>`
      : '';

    policiesEl.innerHTML = `
      <div style="padding:4px 2px;">

        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:20px;">✅</span>
          <div>
            <div style="font-size:14px;font-weight:800;color:#065F46;">Request Cleared — Safe to Proceed</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">No prohibited content was detected. Your request is within policy guidelines.</div>
          </div>
        </div>

        <div style="padding:12px 14px;background:#ECFDF5;border:1px solid #6EE7B7;
             border-radius:8px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:#065F46;margin-bottom:6px;">📋 Policy Assessment</div>
          <div style="font-size:13px;color:#064E3B;line-height:1.6;">
            ${escapeHtml(policySummary || 'This request was reviewed against applicable company policies and no violations were found. You may proceed using the generated CORLO prompt.')}
          </div>
        </div>

        ${flagItems}

        <div style="padding:12px 14px;background:var(--bg-secondary);border:1px solid var(--border);
             border-radius:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;
               color:var(--text3);margin-bottom:8px;">🔒 Enterprise Policy Reminders</div>
          <div style="display:flex;flex-direction:column;gap:7px;">
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Use only approved AI tools listed in your organisation's registry.
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Do not include credentials, passwords, or confidential client data in prompts.
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Review all AI-generated output before sharing externally.
            </div>
            <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--text2);">
              <span style="color:var(--success);font-weight:700;flex-shrink:0;">✓</span>
              Sensitive data classifications must follow your data governance framework.
            </div>
          </div>
        </div>

      </div>`;
  }

  // ── Show/hide revised prompt box based on whether task is blocked ──
  const refinementBox = document.getElementById('refinementBox');
  if (refinementBox) {
    refinementBox.style.display = data.policy_blocked ? 'none' : '';
  }

  // Show/hide Edit-Copy-Save toolbar
  const promptToolbar = document.getElementById('promptToolbar');
  if (promptToolbar) {
    promptToolbar.style.display = data.policy_blocked ? 'none' : 'flex';
  }
  // Reset edit mode if re-generating
  cancelPromptEdit();

  // Reset revised banner
  const revisedBanner = document.getElementById('revisedBanner');
  if (revisedBanner) {
    revisedBanner.style.display = 'none';
    revisedBanner.textContent   = '';
  }
  const refinementInput = document.getElementById('refinementInput');
  if (refinementInput) refinementInput.value = '';

  // Reset active tab to CORLO Prompt (first tab)
  document.querySelectorAll('.output-tab').forEach((t, i)  => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.output-panel').forEach((p, i) => p.classList.toggle('active', i === 0));
}


/* ══════════════════════════════════════
   REFINEMENT — user adds a comment to revise the CORLO prompt
   The LLM rewrites the prompt based on the user's feedback.
══════════════════════════════════════ */
async function handleRefine() {
  const comment = document.getElementById('refinementInput').value.trim();
  if (!comment)        { showToast('Please enter a comment first.', 'error'); return; }
  if (!currentAuditId) { showToast('No result to refine yet.', 'error');     return; }

  const spinner = document.getElementById('refineSpinner');
  const btn     = document.getElementById('btnRefine');
  btn.disabled  = true;
  if (spinner) spinner.style.display = 'inline';

  try {
    const res = await fetch(API.refine, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        audit_id:         currentAuditId,
        user_input:       currentInput,
        corlo_prompt:     currentCorlo,
        llm_output:       currentOutput,
        comment:          comment,
        role:             currentRole,
        task_type:        currentTaskType,
        data_sensitivity: 'general',
        intent:           currentIntent,
        industry:         currentIndustry,
        recommended_tool: currentTool,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();

    // Update tracked corlo so a second refinement builds on this version
    currentCorlo  = data.revised_output;
    currentOutput = data.revised_output;

    // Show the revised prompt in the CORLO Prompt panel
    const promptPanel = document.getElementById('resultPrompt');
    if (promptPanel) promptPanel.textContent = data.revised_output;

    // Show revised banner
    const banner = document.getElementById('revisedBanner');
    if (banner) {
      banner.textContent     = '✅ CORLO Prompt revised based on your feedback.';
      banner.style.display   = 'block';
    }

    // Switch to CORLO Prompt tab to show the revision
    document.querySelectorAll('.output-tab').forEach((t, i)  => t.classList.toggle('active', i === 0));
    document.querySelectorAll('.output-panel').forEach((p, i) => p.classList.toggle('active', i === 0));

    document.getElementById('refinementInput').value = '';
    showToast('CORLO Prompt revised successfully!', 'success');

  } catch (err) {
    showToast(`Refinement failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
}


/* ══════════════════════════════════════
   FEEDBACK
══════════════════════════════════════ */
function initFeedback() {
  const stars = document.querySelectorAll('.star');
  stars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const r = parseInt(star.dataset.rating);
      stars.forEach(s => s.classList.toggle('lit', parseInt(s.dataset.rating) <= r));
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('lit'));
    });
    star.addEventListener('click', () => submitFeedback(parseInt(star.dataset.rating)));
  });
}

async function submitFeedback(rating) {
  if (!currentAuditId) return;
  try {
    await fetch(API.feedback, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ audit_id: currentAuditId, rating, comment: '', issue_type: '', source: 'rl' }),
    });
    showToast(`Thanks for rating! (${rating}★)`, 'success');
    document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('lit', i < rating));
  } catch {
    showToast('Failed to submit feedback.', 'error');
  }
}




/* ══════════════════════════════════════
   HISTORY
══════════════════════════════════════ */
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  const sessionRole  = _getSessionRole();
  const sessionEmail = _getSessionEmail();
  const isAdmin      = sessionRole === 'admin';

  const titleEl    = document.getElementById('historyPageTitle');
  const subtitleEl = document.getElementById('historyPageSubtitle');
  if (titleEl)    titleEl.textContent    = isAdmin ? 'All Run History' : 'My Run History';
  if (subtitleEl) subtitleEl.textContent = isAdmin
    ? 'All orchestration runs across all users.'
    : `Showing runs for ${sessionEmail || 'your account'}.`;

  try {
    const url = isAdmin
      ? `${API.audit}?limit=50`
      : `${API.audit}?limit=50&user_email=${encodeURIComponent(sessionEmail)}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    if (!data.length) {
      list.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>${isAdmin ? 'No history yet.' : 'No history found for your account.'}</p>
        </div>`;
      return;
    }

    list.innerHTML = data.map(row => `
      <div class="history-item">
        <div class="history-item-icon">🤖</div>
        <div class="history-item-body">
          <div class="history-item-input" title="${escapeHtml(row.raw_input || '')}">${escapeHtml(row.raw_input || '—')}</div>
          <div class="history-item-meta">
            ${isAdmin && row.user_email ? `<span class="history-email-badge">👤 ${escapeHtml(row.user_email)}</span>` : ''}
            <span>🎯 ${capitalize(row.intent || '—')}</span>
            <span>🏭 ${capitalize(row.industry || '—')}</span>
            <span>🔧 ${escapeHtml(row.recommended_tool || '—')}</span>
            <span>🕐 ${formatDate(row.created_at)}</span>
          </div>
        </div>
        <div class="history-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="openLogModal('${row.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            View
          </button>
          <button class="btn btn-primary btn-sm" onclick="openHistoryRegenerateModal('${encodeURIComponent(row.raw_input || '')}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Regenerate
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>Failed to load history: ${err.message}</p></div>`;
  }
}

document.getElementById('btnRefreshHistory')?.addEventListener('click', loadHistory);


/* ══════════════════════════════════════
   AI TOOLS PAGE
══════════════════════════════════════ */
/* ── Tool role mapping ── */
const TOOL_ROLE_MAP = {
  sales:      ['axet.gaia','cassidy','chatgpt','microsoft copilot','loopio','hubspot','partner copilot','clay','sales research assistant'],
  consulting: ['genai amplifier (poc)','sales research assistant','sherlock ai','strategic insights ai','axet.gaia','axet.wise','axet.talk','cassidy','chatgpt','microsoft copilot','synthesia'],
  hr:         ['hr chatbot','axet.gaia','chatgpt','microsoft copilot','synthesia'],
  finance:    ['icertis','axet.gaia','axet.wise','chatgpt','microsoft copilot'],
  marketing:  ['axet.gaia','chatgpt','microsoft copilot','hubspot','jasper','synthesia'],
  ams:        ['ams process assistant','ai ticket bot','strategic insights ai','axet.talk','genai amplifier (poc)','axet.gaia','cassidy','chatgpt','microsoft copilot'],
  developer:  ['axet.gaia','axet.plugin','axet.oasis','axet.flows','chatgpt','microsoft copilot'],
  operations: ['cassidy','axet.flows','axet.gaia','chatgpt','microsoft copilot','synthesia'],
};

let _toolsData        = null;
let _toolsView        = 'tile';
let _toolsTab         = 'all';
let _toolsSearch      = '';
let _toolsCategory    = '';

/* ── Update sidebar nav counts and active state ── */
function _updateToolsNav() {
  if (!_toolsData) return;
  const allEntries = Object.entries(_toolsData);

  /* update "All Tools" count */
  const countBadge = document.getElementById('toolsCountBadge');
  if (countBadge) countBadge.textContent = allEntries.length;

  /* update per-role counts */
  document.querySelectorAll('#toolsNavRoles .tools-nav-item').forEach(item => {
    const role    = item.dataset.role;
    const allowed = TOOL_ROLE_MAP[role] || [];
    const count   = allEntries.filter(([n]) => allowed.includes(n.toLowerCase())).length;
    const badge   = item.querySelector('.tools-nav-count');
    if (badge) badge.textContent = count;
  });

  /* active state */
  document.querySelectorAll('.tools-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.role === _toolsTab);
  });
}

/* ── Populate category dropdown ── */
function _updateToolsCategoryFilter() {
  const sel = document.getElementById('toolsCategoryFilter');
  if (!sel || !_toolsData) return;
  let entries = Object.entries(_toolsData);
  if (_toolsTab !== 'all') {
    const allowed = TOOL_ROLE_MAP[_toolsTab] || [];
    entries = entries.filter(([n]) => allowed.includes(n.toLowerCase()));
  }
  const cats = [...new Set(entries.map(([, v]) => v.category || '').filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${escapeHtml(c)}"${_toolsCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
}

async function loadTools() {
  const grid = document.getElementById('toolsGrid');
  if (!grid) return;
  if (!_toolsData) {
    grid.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    try {
      const res  = await fetch(API.tools, { signal: AbortSignal.timeout(10000) });
      _toolsData = await res.json();
    } catch (err) {
      grid.innerHTML = `<div class="empty-state"><p>Failed to load tools. Please try again.</p></div>`;
      return;
    }
  }

  _updateToolsNav();
  _updateToolsCategoryFilter();

  /* role filter */
  let entries = Object.entries(_toolsData);
  if (_toolsTab !== 'all') {
    const allowed = TOOL_ROLE_MAP[_toolsTab] || [];
    entries = entries.filter(([name]) => allowed.includes(name.toLowerCase()));
  }

  /* category filter */
  if (_toolsCategory) {
    entries = entries.filter(([, info]) => (info.category || '') === _toolsCategory);
  }

  /* search filter */
  if (_toolsSearch.trim()) {
    const q = _toolsSearch.toLowerCase();
    entries = entries.filter(([name, info]) =>
      name.toLowerCase().includes(q) ||
      (info.desc_content || info.description || '').toLowerCase().includes(q) ||
      (info.category || '').toLowerCase().includes(q)
    );
  }

  if (!entries.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3);">No tools found</div>`;
    return;
  }

  grid.innerHTML = entries.map(([name, info]) => {
    const isDbTool   = info._source === 'db';
    const deleteItem = isDbTool
      ? `<button class="te-dots-item te-delete-item danger" data-tool-name="${escapeHtml(name)}">🗑 Delete Tool</button>`
      : '';
    return `
      <div class="tool-card" data-tool-name="${escapeHtml(name.toLowerCase())}">
        <div class="tool-card-header" style="display:flex;align-items:flex-start;gap:10px;position:relative;">
          <div class="tool-icon">${info.icon || '🤖'}</div>
          <div style="flex:1;min-width:0;">
            <span class="tool-name">${escapeHtml(name)}</span>
            <div class="tool-category">${escapeHtml(info.category || '')}</div>
          </div>
          <div class="te-dots-wrap">
            <button class="te-dots-btn" data-tool-name="${escapeHtml(name)}" title="Options">&#8942;</button>
            <div class="te-dots-dropdown">
              <button class="te-dots-item te-edit-item" data-tool-name="${escapeHtml(name)}">✏️ Edit Tool</button>
              ${deleteItem}
            </div>
          </div>
        </div>
        <p class="tool-desc">${escapeHtml(info.desc_content || info.description || '')}</p>
        ${info.url ? `<a href="${escapeHtml(info.url)}" target="_blank" rel="noopener" class="tool-link">Visit →</a>` : ''}
      </div>`;
  }).join('');

  if (typeof attachToolCardDots === 'function') attachToolCardDots(grid);
}

function initToolsPage() {
  /* ── sidebar nav clicks ── */
  document.querySelectorAll('.tools-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      _toolsTab      = item.dataset.role;
      _toolsCategory = '';
      const catSel = document.getElementById('toolsCategoryFilter');
      if (catSel) catSel.value = '';
      loadTools();
    });
  });

  /* ── search ── */
  const searchEl = document.getElementById('toolsSearch');
  if (searchEl) {
    const fresh = searchEl.cloneNode(true);
    searchEl.parentNode.replaceChild(fresh, searchEl);
    let t;
    fresh.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { _toolsSearch = fresh.value; loadTools(); }, 250);
    });
  }

  /* ── category filter ── */
  const catSel = document.getElementById('toolsCategoryFilter');
  if (catSel) {
    catSel.addEventListener('change', () => {
      _toolsCategory = catSel.value;
      loadTools();
    });
  }

  /* ── view toggle ── */
  const tileBtn = document.getElementById('btnTileView');
  const rowBtn  = document.getElementById('btnRowView');
  if (tileBtn) {
    const fresh = tileBtn.cloneNode(true);
    tileBtn.parentNode.replaceChild(fresh, tileBtn);
    fresh.addEventListener('click', () => {
      _toolsView = 'tile';
      document.getElementById('toolsGrid')?.classList.remove('row-view');
      fresh.classList.add('active');
      document.getElementById('btnRowView')?.classList.remove('active');
    });
  }
  if (rowBtn) {
    const fresh = rowBtn.cloneNode(true);
    rowBtn.parentNode.replaceChild(fresh, rowBtn);
    fresh.addEventListener('click', () => {
      _toolsView = 'row';
      document.getElementById('toolsGrid')?.classList.add('row-view');
      fresh.classList.add('active');
      document.getElementById('btnTileView')?.classList.remove('active');
    });
  }
}


/* ══════════════════════════════════════
   OPEN ALTERNATIVE TOOL — looks up URL from registry or navigates to tools page
══════════════════════════════════════ */
async function openAlternativeTool(toolName) {
  try {
    const res  = await fetch(API.tools);
    const data = await res.json();
    // Case-insensitive lookup
    const key  = Object.keys(data).find(k => k.toLowerCase() === toolName.toLowerCase());
    if (key && data[key] && data[key].url) {
      window.open(data[key].url, '_blank', 'noopener');
    } else {
      // Fallback: navigate to AI Tools page so user can find it
      showToast(`Opening AI Tools page — search for "${toolName}"`, 'success');
      if (typeof navigateTo === 'function') navigateTo('tools');
      document.querySelectorAll('.nav-tab').forEach(n =>
        n.classList.toggle('active', n.dataset.page === 'tools'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-tools')?.classList.add('active');
      loadTools();
    }
  } catch {
    showToast(`Could not open "${toolName}". Please check AI Tools page.`, 'error');
  }
}


/* ══════════════════════════════════════
   REGISTER TOOL
══════════════════════════════════════ */
(function initRegisterTool() {
  const overlay    = () => document.getElementById('registerToolOverlay');
  const splitCsv   = s => (s || '').split(',').map(x => x.trim()).filter(Boolean);

  let _activeTab = 'manual';
  let _bulkSelectedFile = null;
  let _bulkUploading    = false;
  let _bulkAbortCtrl    = null;

  function _activateTab(tabName) {
    _activeTab = tabName;
    document.querySelectorAll('#registerToolOverlay .te-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.rttab === tabName);
    });
    document.querySelectorAll('#registerToolOverlay .te-panel').forEach(p => {
      const isActive = p.dataset.rtpanel === tabName;
      p.classList.toggle('active', isActive);
      p.style.display = isActive ? '' : 'none';
    });
    const saveBtn = document.getElementById('btnSaveRegisterTool');
    if (saveBtn) {
      if (tabName === 'fileupload') {
        saveBtn.style.display = 'none';
      } else {
        saveBtn.style.display = '';
      }
    }
    const bulkBtn = document.getElementById('rtBulkUploadBtn');
    if (bulkBtn) {
      bulkBtn.style.display = tabName === 'fileupload' ? '' : 'none';
    }
  }

  function _openModal(prefill = {}) {
    const ov = overlay();
    ov._editMode    = false;
    ov._editingName = null;
    document.getElementById('registerToolTitle').textContent = 'Register New Tool';
    document.getElementById('rtToolName').value      = prefill.tool_name     || '';
    document.getElementById('rtCategory').value      = prefill.category      || '';
    document.getElementById('rtUrl').value           = prefill.url           || '';
    document.getElementById('rtIcon').value          = prefill.icon          || '🤖';
    document.getElementById('rtDescription').value   = prefill.description   || '';
    document.getElementById('rtBestFor').value       = (prefill.best_for     || []).join(', ');
    document.getElementById('rtNotFor').value        = (prefill.not_for      || []).join(', ');
    document.getElementById('rtStrongSignals').value = (prefill.strong_signals|| []).join(', ');
    document.getElementById('rtWeakSignals').value   = (prefill.weak_signals  || []).join(', ');
    document.getElementById('rtRoles').value         = (prefill.roles         || []).join(', ');
    document.getElementById('rtOutputType').value    = prefill.output_type    || '';
    document.getElementById('rtIsInternal').checked  = !!prefill.is_internal;
    document.getElementById('rtExtractStatus').style.display = 'none';
    document.getElementById('rtFileChips').innerHTML = '';
    document.getElementById('rtFileInput').value = '';
    const editNote = document.getElementById('rtEditModeNote');
    if (editNote) editNote.style.display = 'none';
    const rd = prefill.raw_data || {};
    document.querySelectorAll('#registerToolOverlay [data-rd-key]').forEach(el => {
      el.value = rd[el.dataset.rdKey] !== undefined ? String(rd[el.dataset.rdKey]) : '';
    });
    _activateTab('manual');
    _resetBulk();
    ov.classList.add('open');
  }

  function _closeModal() {
    overlay().classList.remove('open');
    document.getElementById('registerToolTitle').textContent = 'Register New Tool';
    const ov = overlay();
    ov._editMode    = false;
    ov._editingName = null;
    const editNote = document.getElementById('rtEditModeNote');
    if (editNote) editNote.style.display = 'none';
    _resetBulk();
  }

  function _resetBulk() {
    if (_bulkUploading && _bulkAbortCtrl) { _bulkAbortCtrl.abort(); _bulkUploading = false; }
    _bulkSelectedFile = null;
    _bulkUploading    = false;
    _bulkAbortCtrl    = null;
    const fi = document.getElementById('rtBulkFileInput');
    if (fi) fi.value = '';
    const info = document.getElementById('rtBulkFileInfo');
    if (info) info.style.display = 'none';
    const dz = document.getElementById('rtBulkDropZone');
    if (dz) dz.style.display = '';
    const st = document.getElementById('rtBulkStatus');
    if (st) { st.style.display = 'none'; st.textContent = ''; }
    const bulkBtn = document.getElementById('rtBulkUploadBtn');
    if (bulkBtn) { bulkBtn.disabled = true; bulkBtn.textContent = 'Upload & Apply'; }
  }

  document.getElementById('btnRegisterTool')?.addEventListener('click', () => _openModal());
  document.getElementById('btnCloseRegisterTool')?.addEventListener('click', _closeModal);
  document.getElementById('btnCancelRegisterTool')?.addEventListener('click', _closeModal);
  overlay()?.addEventListener('click', e => { if (e.target === overlay()) _closeModal(); });

  document.querySelectorAll('#registerToolOverlay .te-tab').forEach(tab => {
    tab.addEventListener('click', () => { if (tab.dataset.rttab) _activateTab(tab.dataset.rttab); });
  });

  document.getElementById('btnBrowseToolFiles')?.addEventListener('click', () => {
    document.getElementById('rtFileInput')?.click();
  });

  const zone = document.getElementById('rtFileZone');
  zone?.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) _handleFiles(e.dataTransfer.files);
  });

  document.getElementById('rtFileInput')?.addEventListener('change', e => {
    if (e.target.files.length) _handleFiles(e.target.files);
  });

  async function _handleFiles(files) {
    const statusEl = document.getElementById('rtExtractStatus');
    const chipsEl  = document.getElementById('rtFileChips');
    const ov       = overlay();
    const isEdit   = ov._editMode;
    const editName = ov._editingName;

    chipsEl.innerHTML = Array.from(files).map(f =>
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:20px;font-size:12px;">
        📄 ${escapeHtml(f.name)}
      </span>`
    ).join('');

    statusEl.style.display = '';
    statusEl.style.color   = 'var(--text2)';
    statusEl.innerHTML     = '<span style="display:inline-flex;align-items:center;gap:8px;"><div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Extracting tool information from files…</span>';

    const form = new FormData();
    Array.from(files).forEach(f => form.append('files', f));

    if (isEdit && editName) {
      try {
        const kbForm = new FormData();
        Array.from(files).forEach(f => kbForm.append('files', f));
        const kbRes  = await fetch(API.toolDocsUpload, { method: 'POST', body: kbForm });
        const kbData = await kbRes.json();
        const total  = (kbData.files || []).reduce((s, f) => s + (f.chunks || 0), 0);
        statusEl.style.color = 'var(--success)';
        statusEl.innerHTML   = `✅ ${total} chunk(s) added to knowledge base for <strong>${escapeHtml(editName)}</strong>.`;
      } catch {
        statusEl.style.color = 'var(--danger)';
        statusEl.innerHTML   = '❌ Knowledge base upload failed. Fields below will still be extracted.';
      }
    }

    try {
      const res  = await fetch('/api/tools/extract-files', { method: 'POST', body: form });
      const data = await res.json();
      const ext  = data.extracted || {};

      if (Object.keys(ext).length) {
        if (isEdit) {
          const fields = [
            { id: 'rtDescription',   key: 'description',    type: 'text' },
            { id: 'rtCategory',      key: 'category',       type: 'text' },
            { id: 'rtUrl',           key: 'url',            type: 'text' },
            { id: 'rtIcon',          key: 'icon',           type: 'text' },
            { id: 'rtBestFor',       key: 'best_for',       type: 'list' },
            { id: 'rtNotFor',        key: 'not_for',        type: 'list' },
            { id: 'rtStrongSignals', key: 'strong_signals', type: 'list' },
            { id: 'rtWeakSignals',   key: 'weak_signals',   type: 'list' },
            { id: 'rtRoles',         key: 'roles',          type: 'list' },
            { id: 'rtOutputType',    key: 'output_type',    type: 'text' },
          ];
          fields.forEach(({ id, key, type }) => {
            const el = document.getElementById(id);
            if (!el || el.value.trim()) return;
            const val = ext[key];
            if (!val) return;
            el.value = type === 'list' ? (Array.isArray(val) ? val.join(', ') : val) : val;
          });
          statusEl.style.color = 'var(--success)';
          statusEl.innerHTML  += ' ℹ️ Empty fields pre-filled from document — review and save.';
        } else {
          _openModal(ext);
          statusEl.style.display = '';
          statusEl.style.color   = 'var(--success)';
          statusEl.innerHTML     = '✅ Information extracted — review and complete the fields below.';
        }
      } else {
        if (!isEdit) {
          statusEl.style.color = 'var(--text3)';
          statusEl.innerHTML   = 'ℹ️ Could not extract structured info. Please fill in the fields manually.';
        }
      }
    } catch {
      statusEl.style.color = 'var(--danger)';
      statusEl.innerHTML   = '❌ Extraction failed. Please fill in the fields manually.';
    }
  }

  /* ── Bulk (Excel) upload in File Upload tab ── */
  function _setBulkFile(file) {
    if (!file || !file.name.endsWith('.xlsx')) {
      _showBulkStatus('Please select a valid .xlsx file.', 'error'); return;
    }
    _bulkSelectedFile = file;
    const nameEl = document.getElementById('rtBulkFileName');
    if (nameEl) nameEl.textContent = file.name;
    const info = document.getElementById('rtBulkFileInfo');
    if (info) info.style.display = 'flex';
    const dz = document.getElementById('rtBulkDropZone');
    if (dz) dz.style.display = 'none';
    const bulkBtn = document.getElementById('rtBulkUploadBtn');
    if (bulkBtn) bulkBtn.disabled = false;
    const st = document.getElementById('rtBulkStatus');
    if (st) st.style.display = 'none';
  }

  function _showBulkStatus(msg, type) {
    const el = document.getElementById('rtBulkStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = '';
    el.style.display = 'block';
    el.style.background = type === 'error' ? 'var(--danger-pale,#fef2f2)' : 'var(--success-pale,#f0fdf4)';
    el.style.border = `1px solid ${type === 'error' ? 'var(--danger,#dc2626)' : 'var(--success,#16a34a)'}`;
    el.style.color  = type === 'error' ? '#991b1b' : '#065f46';
  }

  document.getElementById('btnBrowseBulkTools')?.addEventListener('click', () => {
    document.getElementById('rtBulkFileInput')?.click();
  });
  document.getElementById('rtBulkFileInput')?.addEventListener('change', e => {
    if (e.target.files[0]) _setBulkFile(e.target.files[0]);
  });
  document.getElementById('rtBulkClearBtn')?.addEventListener('click', () => {
    _bulkSelectedFile = null;
    const fi = document.getElementById('rtBulkFileInput');
    if (fi) fi.value = '';
    const info = document.getElementById('rtBulkFileInfo');
    if (info) info.style.display = 'none';
    const dz = document.getElementById('rtBulkDropZone');
    if (dz) dz.style.display = '';
    const bulkBtn = document.getElementById('rtBulkUploadBtn');
    if (bulkBtn) bulkBtn.disabled = true;
  });

  const bulkDz = document.getElementById('rtBulkDropZone');
  bulkDz?.addEventListener('dragover', e => { e.preventDefault(); bulkDz.classList.add('dragover'); });
  bulkDz?.addEventListener('dragleave', () => bulkDz.classList.remove('dragover'));
  bulkDz?.addEventListener('drop', e => {
    e.preventDefault();
    bulkDz.classList.remove('dragover');
    if (e.dataTransfer.files[0]) _setBulkFile(e.dataTransfer.files[0]);
  });
  bulkDz?.addEventListener('click', () => document.getElementById('rtBulkFileInput')?.click());

  document.addEventListener('DOMContentLoaded', () => {
    const footerRight = document.getElementById('rtFooterRight');
    if (footerRight && !document.getElementById('rtBulkUploadBtn')) {
      const bulkBtn = document.createElement('button');
      bulkBtn.id = 'rtBulkUploadBtn';
      bulkBtn.className = 'te-btn te-btn-primary';
      bulkBtn.disabled = true;
      bulkBtn.style.display = 'none';
      bulkBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload & Apply';
      footerRight.appendChild(bulkBtn);

      bulkBtn.addEventListener('click', async () => {
        if (!_bulkSelectedFile) return;
        _bulkUploading  = true;
        _bulkAbortCtrl  = new AbortController();
        bulkBtn.disabled    = true;
        bulkBtn.textContent = 'Uploading…';
        const formData = new FormData();
        formData.append('file', _bulkSelectedFile);
        try {
          const res  = await fetch('/api/upload-tools-registry', { method: 'POST', body: formData, signal: _bulkAbortCtrl.signal });
          const data = await res.json();
          _bulkUploading = false;
          if (res.ok) {
            _showBulkStatus(`✅ ${data.tools_loaded} tools loaded from "${_bulkSelectedFile.name}".`, 'success');
            bulkBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload & Apply';
            if (typeof loadTools === 'function') loadTools();
            setTimeout(() => _closeModal(), 1800);
          } else {
            throw new Error(data.detail || 'Upload failed');
          }
        } catch (err) {
          _bulkUploading = false;
          if (err.name === 'AbortError') {
            _showBulkStatus('⛔ Upload cancelled.', 'error');
          } else {
            _showBulkStatus(`❌ ${err.message}`, 'error');
          }
          bulkBtn.disabled = false;
          bulkBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload & Apply';
        }
      });
    }
  });

  // Save (Manual Input tab)
  document.getElementById('btnSaveRegisterTool')?.addEventListener('click', async () => {
    const toolName = document.getElementById('rtToolName').value.trim();
    if (!toolName) { showToast('Tool name is required.', 'error'); return; }

    const btn    = document.getElementById('btnSaveRegisterTool');
    const isEdit = overlay()._editMode;
    btn.disabled    = true;
    btn.textContent = isEdit ? 'Saving changes…' : 'Saving…';

    const rawData = {};
    document.querySelectorAll('#registerToolOverlay [data-rd-key]').forEach(el => {
      rawData[el.dataset.rdKey] = el.value.trim();
    });

    const payload = {
      tool_name:      toolName,
      description:    document.getElementById('rtDescription').value.trim(),
      category:       document.getElementById('rtCategory').value.trim(),
      url:            document.getElementById('rtUrl').value.trim(),
      icon:           document.getElementById('rtIcon').value.trim() || '🤖',
      best_for:       splitCsv(document.getElementById('rtBestFor').value),
      not_for:        splitCsv(document.getElementById('rtNotFor').value),
      strong_signals: splitCsv(document.getElementById('rtStrongSignals').value),
      weak_signals:   splitCsv(document.getElementById('rtWeakSignals').value),
      roles:          splitCsv(document.getElementById('rtRoles').value),
      output_type:    document.getElementById('rtOutputType').value.trim(),
      is_internal:    document.getElementById('rtIsInternal').checked,
      explicit_edit:  isEdit,
      raw_data:       rawData,
    };

    try {
      const res  = await fetch('/api/tools/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast(isEdit ? `"${toolName}" updated!` : `"${toolName}" registered successfully!`, 'success');
        _closeModal();
        _toolsData = null;
        loadTools();
      } else {
        throw new Error(data.detail || 'Save failed');
      }
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Tool';
    }
  });
})();


/* ══════════════════════════════════════
   TOOL KNOWLEDGE BASE
══════════════════════════════════════ */
(function initToolKnowledge() {

  async function loadStatus() {
    const tableWrap = document.getElementById('tkStatusTable');
    const body      = document.getElementById('tkStatusBody');
    const empty     = document.getElementById('tkEmptyState');
    if (!body) return;

    try {
      const res  = await fetch(API.toolDocsStatus);
      const data = await res.json();
      const rows = data.status || [];

      if (!rows.length) {
        tableWrap.style.display = 'none';
        empty.style.display     = '';
        return;
      }

      empty.style.display     = 'none';
      tableWrap.style.display = '';
      body.innerHTML = rows.map(r => `
        <tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 10px;font-weight:600;color:var(--text);">
            ${escapeHtml(r.tool_name === 'unclassified'
              ? '⚠️ Unclassified'
              : r.tool_name)}
          </td>
          <td style="padding:8px 10px;text-align:center;">
            <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${r.tool_name === 'unclassified' ? '#FEF3C7' : '#EFF6FF'};color:${r.tool_name === 'unclassified' ? '#92400E' : '#1D4ED8'};">
              ${r.chunk_count}
            </span>
          </td>
          <td style="padding:8px 10px;color:var(--text3);font-size:12px;">
            ${(r.source_files || []).map(f => `
              <span style="display:inline-flex;align-items:center;gap:4px;margin:1px 3px;padding:2px 6px 2px 8px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;">
                ${escapeHtml(f)}
                <button onclick="tkDeleteFile('${escapeHtml(f)}')"
                  title="Delete this file's chunks from vector DB"
                  style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:11px;padding:0 2px;line-height:1;"
                  onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text3)'">✕</button>
              </span>`).join('')}
          </td>
          <td style="padding:8px 10px;text-align:center;">
            ${r.tool_name !== 'unclassified' ? `
              <button onclick="tkClearTool('${escapeHtml(r.tool_name)}')"
                style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:13px;padding:3px 6px;border-radius:4px;"
                title="Clear all knowledge for this tool"
                onmouseover="this.style.color='var(--danger)'"
                onmouseout="this.style.color='var(--text3)'">🗑</button>` : ''}
          </td>
        </tr>
      `).join('');
    } catch {
      body.innerHTML = '<tr><td colspan="4" style="padding:12px;color:var(--text3);text-align:center;">Failed to load status.</td></tr>';
      tableWrap.style.display = '';
    }
  }

  window.tkClearTool = async function(toolName) {
    if (!confirm(`Clear all knowledge chunks for "${toolName}"?`)) return;
    try {
      await fetch(API.toolDocsClearTool(toolName), { method: 'DELETE' });
      showToast(`Knowledge cleared for "${toolName}".`, 'success');
      loadStatus();
    } catch {
      showToast('Failed to clear.', 'error');
    }
  };

  window.tkDeleteFile = async function(filename) {
    if (!confirm(`Remove all chunks from "${filename}" from the vector DB?`)) return;
    try {
      const res  = await fetch(`${API.toolDocDeleteFile}?filename=${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      showToast(`Removed ${data.deleted_chunks} chunk(s) from "${filename}".`, 'success');
      loadStatus();
    } catch {
      showToast('Delete failed.', 'error');
    }
  };

  async function handleFiles(files) {
    const statusEl = document.getElementById('tkUploadStatus');
    const chipsEl  = document.getElementById('tkFileChips');

    chipsEl.innerHTML = Array.from(files).map(f =>
      `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:20px;font-size:12px;">
        📄 ${escapeHtml(f.name)}
      </span>`
    ).join('');

    statusEl.style.display     = '';
    statusEl.style.borderColor = 'var(--border)';
    statusEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;">
      <div class="spinner" style="width:14px;height:14px;border-width:2px;flex-shrink:0;"></div>
      <span>Processing ${files.length} file${files.length > 1 ? 's' : ''}… The agent is reading and classifying chunks. This may take a moment.</span>
    </span>`;

    const form = new FormData();
    Array.from(files).forEach(f => form.append('files', f));

    try {
      const res  = await fetch(API.toolDocsUpload, { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();

      const toolLines = Object.entries(data.tool_summary || {})
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `<li><strong>${escapeHtml(t)}</strong>: ${c} chunk${c !== 1 ? 's' : ''}</li>`)
        .join('');

      const unclass = data.unclassified_chunks || 0;

      statusEl.style.borderColor = 'var(--success, #10B981)';
      statusEl.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="font-size:18px;flex-shrink:0;">✅</span>
          <div>
            <div style="font-weight:600;margin-bottom:6px;">
              ${data.files_processed} file${data.files_processed !== 1 ? 's' : ''} processed successfully
            </div>
            ${toolLines ? `<ul style="margin:0 0 6px 16px;padding:0;font-size:12px;line-height:1.8;">${toolLines}</ul>` : ''}
            ${unclass ? `<div style="font-size:12px;color:var(--text3);">⚠️ ${unclass} chunk${unclass !== 1 ? 's' : ''} could not be classified — stored as "unclassified"</div>` : ''}
          </div>
        </div>`;

      document.getElementById('tkFileInput').value = '';
      loadStatus();
    } catch(err) {
      statusEl.style.borderColor = 'var(--danger)';
      statusEl.innerHTML = `❌ Upload failed: ${escapeHtml(err.message)}`;
    }
  }

  // Wire drop zone
  const zone = document.getElementById('tkFileZone');
  zone?.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'var(--primary)';
    zone.style.background  = 'var(--primary-light, #eff6ff)';
  });
  zone?.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
    zone.style.background  = '';
  });
  zone?.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background  = '';
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  zone?.addEventListener('click', e => {
    if (e.target.id !== 'btnBrowseKnowledgeFiles') return;
    document.getElementById('tkFileInput').click();
  });

  document.getElementById('btnBrowseKnowledgeFiles')?.addEventListener('click', () => {
    document.getElementById('tkFileInput').click();
  });

  document.getElementById('tkFileInput')?.addEventListener('change', e => {
    if (e.target.files.length) handleFiles(e.target.files);
  });

  document.getElementById('btnRefreshKnowledge')?.addEventListener('click', loadStatus);

  document.getElementById('btnClearAllKnowledge')?.addEventListener('click', async () => {
    if (!confirm('Delete ALL tool knowledge chunks from the database? This cannot be undone.')) return;
    try {
      const res  = await fetch(API.toolDocsClear, { method: 'DELETE' });
      const data = await res.json();
      showToast(`Cleared ${data.deleted} chunks.`, 'success');
      document.getElementById('tkFileChips').innerHTML = '';
      document.getElementById('tkUploadStatus').style.display = 'none';
      loadStatus();
    } catch {
      showToast('Failed to clear.', 'error');
    }
  });

  // Load status when tools page is activated
  document.querySelectorAll('.nav-item[data-page="tools"], .nav-tab[data-page="tools"]').forEach(el => {
    el.addEventListener('click', () => setTimeout(loadStatus, 200));
  });

})();


/* ══════════════════════════════════════
   ANALYTICS PAGE
══════════════════════════════════════ */
async function loadAnalytics() {
  const container = document.getElementById('analyticsContent');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res  = await fetch(API.analytics, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    const maxIntent = Math.max(...(data.intents || []).map(r => r.c), 1);
    const maxTool   = Math.max(...(data.tools   || []).map(r => r.c), 1);
    const maxUser   = Math.max(...(data.by_user || []).map(r => r.c), 1);

    const recentRunsHTML = (data.recent_runs || []).length ? `
      <div class="analytics-section-title">Recent Runs</div>
      <div class="an-table-wrap">
        <table class="an-table">
          <thead><tr>
            <th>User</th><th>Input</th><th>Tool</th><th>Intent</th><th>Status</th><th>Date</th>
          </tr></thead>
          <tbody>${(data.recent_runs || []).map(r => `<tr>
            <td><span class="an-email-badge">${escapeHtml(r.user_email || '—')}</span></td>
            <td class="an-td-input" title="${escapeHtml(r.raw_input || '')}">${escapeHtml((r.raw_input || '—').substring(0, 60))}${(r.raw_input || '').length > 60 ? '…' : ''}</td>
            <td>${escapeHtml(r.recommended_tool || '—')}</td>
            <td>${capitalize(r.intent || '—')}</td>
            <td>${r.policy_blocked ? '<span class="an-badge-blocked">Blocked</span>' : '<span class="an-badge-ok">OK</span>'}</td>
            <td class="an-td-date">${formatDate(r.created_at)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : '';

    const byUserHTML = (data.by_user || []).length ? `
      <div class="analytics-card">
        <div class="analytics-card-title">Runs by User</div>
        ${(data.by_user || []).map(r => `
          <div class="bar-row">
            <div class="bar-label an-email-label" title="${escapeHtml(r.user_email)}">${escapeHtml(r.user_email)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxUser*100)}%;background:#0b53b8"></div></div>
            <div class="bar-count">${r.c}</div>
          </div>`).join('')}
      </div>` : '';

    container.innerHTML = `
      <div class="analytics-stats">
        <div class="stat-card"><div class="stat-card-label">Total Runs</div><div class="stat-card-val accent">${data.total_runs ?? 0}</div></div>
        <div class="stat-card"><div class="stat-card-label">Avg Rating</div><div class="stat-card-val accent">${data.avg_rating ?? '—'}</div></div>
        <div class="stat-card"><div class="stat-card-label">Feedback Count</div><div class="stat-card-val">${data.feedback_count ?? 0}</div></div>
        <div class="stat-card"><div class="stat-card-label">Active Users</div><div class="stat-card-val">${(data.by_user || []).length}</div></div>
      </div>
      <div class="analytics-grid">
        <div class="analytics-card">
          <div class="analytics-card-title">Intent Breakdown</div>
          ${(data.intents || []).map(r => `
            <div class="bar-row">
              <div class="bar-label" title="${r.intent}">${capitalize(r.intent)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxIntent*100)}%"></div></div>
              <div class="bar-count">${r.c}</div>
            </div>`).join('') || '<p style="color:var(--text3);font-size:13px">No data yet.</p>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Tool Usage</div>
          ${(data.tools || []).map(r => `
            <div class="bar-row">
              <div class="bar-label" title="${r.recommended_tool}">${escapeHtml(r.recommended_tool)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxTool*100)}%;background:var(--success)"></div></div>
              <div class="bar-count">${r.c}</div>
            </div>`).join('') || '<p style="color:var(--text3);font-size:13px">No data yet.</p>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Top Industries</div>
          ${(data.industries || []).map(r => `
            <div class="bar-row">
              <div class="bar-label">${capitalize(r.industry)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.c/maxIntent*100)}%;background:#8B5CF6"></div></div>
              <div class="bar-count">${r.c}</div>
            </div>`).join('') || '<p style="color:var(--text3);font-size:13px">No data yet.</p>'}
        </div>
        <div class="analytics-card">
          <div class="analytics-card-title">Feedback Issues</div>
          ${(data.issue_types || []).length
            ? (data.issue_types || []).map(r => `
              <div class="bar-row">
                <div class="bar-label">${escapeHtml(r.issue_type || 'Other')}</div>
                <div class="bar-track"><div class="bar-fill" style="background:var(--danger)"></div></div>
                <div class="bar-count">${r.c}</div>
              </div>`).join('')
            : '<p style="color:var(--text3);font-size:13px">No issues reported yet.</p>'}
        </div>
        ${byUserHTML}
      </div>
      ${recentRunsHTML}`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Failed: ${err.message}</p></div>`;
  }
}

document.getElementById('btnRefreshAnalytics')?.addEventListener('click', loadAnalytics);


/* ══════════════════════════════════════
   POLICIES PAGE
══════════════════════════════════════ */
function initPoliciesPage() {
  const zone      = document.getElementById('uploadZone');
  const fileInput = document.getElementById('policyFileInput');
  const btnBrowse = document.getElementById('btnBrowseFile');

  btnBrowse.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadPolicyFile(fileInput.files[0]);
  });

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) uploadPolicyFile(e.dataTransfer.files[0]);
  });

  document.getElementById('btnRefreshPolicies')?.addEventListener('click', loadPolicies);
}

async function uploadPolicyFile(file) {
  const status = document.getElementById('uploadStatus');
  status.innerHTML = `<div style="color:var(--text2);display:flex;align-items:center;gap:8px">
    <div class="spinner" style="width:16px;height:16px;border-width:2px"></div>
    Uploading ${escapeHtml(file.name)}…
  </div>`;

  const form = new FormData();
  form.append('file', file);
  try {
    const res  = await fetch(API.uploadPolicy, { method: 'POST', body: form });
    const data = await res.json();
    if (data.status === 'ok') {
      status.innerHTML = `<span style="color:var(--success)">✅ Indexed ${data.chunks_indexed} chunks from <strong>${escapeHtml(data.filename)}</strong></span>`;
      loadPolicies();
      showToast('Policy uploaded!', 'success');
    } else { throw new Error(data.detail || 'Upload failed'); }
  } catch (err) {
    status.innerHTML = `<span style="color:var(--danger)">❌ ${err.message}</span>`;
    showToast(`Upload failed: ${err.message}`, 'error');
  }
}

async function loadPolicies() {
  const list = document.getElementById('policiesList');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const res  = await fetch(API.policies, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (!data.sources || !data.sources.length) {
      list.innerHTML = '<p style="padding:16px;color:var(--text3);font-size:13px">No policies indexed yet.</p>';
      updateStat('sbPolicies', 0);
      return;
    }
    updateStat('sbPolicies', data.sources.length);
    list.innerHTML = data.sources.map(src => `
      <div class="policy-item">
        <div class="policy-name">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
            style="display:inline;vertical-align:middle;color:var(--text3)">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          ${escapeHtml(src)}
        </div>
        <button class="btn-danger" onclick="deletePolicy('${escapeHtml(src)}')">Delete</button>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p style="padding:16px;color:var(--danger);font-size:13px">Error: ${err.message}</p>`;
  }
}

async function deletePolicy(filename) {
  if (!confirm(`Delete policy "${filename}"?`)) return;
  try {
    await fetch(API.deletePolicy(filename), { method: 'DELETE' });
    showToast('Policy deleted.', 'success');
    loadPolicies();
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  }
}


/* ══════════════════════════════════════
   SIDEBAR STATS
══════════════════════════════════════ */
async function loadSidebarStats() {
  try {
    const [ar, pr]   = await Promise.all([fetch(API.analytics), fetch(API.policies)]);
    const analytics  = await ar.json();
    const policies   = await pr.json();
    updateStat('sbTotalRuns', analytics.total_runs ?? 0);
    updateStat('sbAvgRating', analytics.avg_rating ? `${analytics.avg_rating}★` : '—');
    updateStat('sbPolicies',  (policies.sources || []).length);
  } catch {}
}


function openHistoryRegenerateModal(encodedInput) {
  const body = decodeURIComponent(encodedInput || '');

  // move to Home first
  if (typeof navigateTo === 'function') navigateTo('home');

  // switch visible nav/page state
  document.querySelectorAll('.nav-tab').forEach(n =>
    n.classList.toggle('active', n.dataset.page === 'home'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home')?.classList.add('active');

  // open same popup used by Scenario Library Generate button
  if (typeof plOpenScenarioGenModal === 'function') {
    plOpenScenarioGenModal({ body });
  } else {
    // fallback: just populate textarea if modal function is not available
    const textarea  = document.getElementById('userInput');
    const charCount = document.getElementById('charCount');
    if (textarea) {
      textarea.value = body;
      if (charCount) charCount.textContent = body.length;
      textarea.dispatchEvent(new Event('input'));
    }
  }
}


/* ══════════════════════════════════════════════════════
   CHAT GATHER PANEL — conversational task assistant
   State, rendering, drag handle, toggle
══════════════════════════════════════════════════════ */

const CHAT_API = {
  gather:    '/api/chat-gather',
  summarize: '/api/chat-summarize',
};

/* ── Chat State ── */
let _chatMessages       = [];          // [{role:'agent'|'user', content:'...'}]
let _chatReady          = false;       // true when agent has extracted enough info
let _chatExtracted      = { role: 'general', task_type: 'general', task_description: '' };
let _chatInitialInput   = '';
let _chatBusy           = false;
let _chatTurnCount      = 0;
let _chatPendingField   = null;        // 'role' | 'task_type' | null — set during skip flow

/* ── Init ── */
function initChatPanel() {
  _startNewChat();

  document.getElementById('chatSendBtn').addEventListener('click', _chatSend);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _chatSend(); }
  });
  document.getElementById('chatInput').addEventListener('input', _chatAutoResize);

  document.getElementById('chatSkipAllBtn').addEventListener('click', _chatSkipAll);
  document.getElementById('chatGenerateBtn').addEventListener('click', _chatTriggerGenerate);
  document.getElementById('chatResetBtn').addEventListener('click', resetToStep1);

  _initDragHandle();
  _initToggleBtn();
}

/* Auto-resize chat textarea */
function _chatAutoResize() {
  const el = document.getElementById('chatInput');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 90) + 'px';
}

/* ── Render a message bubble ── */
function _chatAddMessage(role, content) {
  _chatMessages.push({ role, content });
  _chatRenderMessage(role, content);
  _chatScrollBottom();
}

function _chatRenderMessage(role, content) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const avatar = role === 'agent' ? '🤖' : '👤';
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  const bubbleHtml = role === 'agent' ? _formatAgentMessage(content) : `<span>${escapeHtml(content)}</span>`;
  div.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-bubble">${bubbleHtml}</div>
  `;
  container.appendChild(div);
}

/* ── Format agent message: convert bullet lines into <ul><li> ── */
function _formatAgentMessage(content) {
  const lines = content.split('\n');
  let html = '';
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const isBullet = /^[•\-\*]\s/.test(line.trimStart());

    if (isBullet) {
      if (!inList) { html += '<ul class="chat-bullet-list">'; inList = true; }
      html += `<li>${escapeHtml(line.replace(/^[\s]*[•\-\*]\s/, ''))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim() === '') {
        html += '<br/>';
      } else {
        html += `<span class="chat-line">${escapeHtml(line)}</span><br/>`;
      }
    }
  }
  if (inList) html += '</ul>';
  // clean up trailing <br/>
  html = html.replace(/(<br\/>)+$/, '');
  return html;
}

function _chatScrollBottom() {
  const el = document.getElementById('chatMessages');
  if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

/* ── Typing indicator ── */
function _chatShowTyping(visible) {
  document.getElementById('chatTyping')?.classList.toggle('visible', visible);
  _chatScrollBottom();
}

/* ── Update summary bar ── */
function _chatUpdateSummary() {
  const bar  = document.getElementById('chatSummaryBar');
  const tags = document.getElementById('chatSummaryTags');
  if (!bar || !tags) return;
  const parts = [];
  if (_chatExtracted.role && _chatExtracted.role !== 'general')
    parts.push(`👤 ${_chatExtracted.role}`);
  if (_chatExtracted.task_type && _chatExtracted.task_type !== 'general')
    parts.push(`📌 ${_chatExtracted.task_type}`);
  if (_chatExtracted.task_description)
    parts.push(`📝 Task captured`);
  if (parts.length) {
    tags.innerHTML = parts.map(p => `<span class="chat-summary-tag">${escapeHtml(p)}</span>`).join('');
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

/* ── Show task summary bubble in chat so user can see what was understood ── */
function _chatShowTaskSummary() {
  const role     = _chatExtracted.role             || 'general';
  const taskType = _chatExtracted.task_type        || 'general';
  const taskDesc = _chatExtracted.task_description || '';

  const summary =
    'Here\'s what I understood from our conversation:\n' +
    `• Role: ${capitalize(role)}\n` +
    `• Task Type: ${capitalize(taskType)}\n` +
    `• Task Description: ${taskDesc}\n\n` +
    'Click Generate Response below if this looks right, or keep chatting to refine.';

  _chatAddMessage('agent', summary);
}

/* ── Mark chat as ready (agent has enough info) ── */
function _chatMarkReady(extracted) {
  _chatReady    = true;
  _chatExtracted = {
    role:             extracted.role             || 'general',
    task_type:        extracted.task_type        || 'general',
    task_description: extracted.task_description || '',
  };
  _chatUpdateSummary();
  document.getElementById('chatReadyBanner')?.classList.add('visible');
  document.getElementById('chatGenerateBtn').disabled = false;
}

/* ── Send user message → intercept pending field OR call /api/chat-gather ── */
async function _chatSend() {
  if (_chatBusy) return;
  const inputEl = document.getElementById('chatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  inputEl.style.height = 'auto';
  inputEl.dispatchEvent(new Event('input'));

  _chatAddMessage('user', text);

  // If we're collecting a specific missing field (role or task_type after Skip)
  if (_chatPendingField === 'role') {
    _chatExtracted.role = text;
    _chatPendingField = null;
    _chatUpdateSummary();
    await _chatAskMissingThenGenerate();
    return;
  }
  if (_chatPendingField === 'task_type') {
    _chatExtracted.task_type = text;
    _chatPendingField = null;
    _chatUpdateSummary();
    await _chatAskMissingThenGenerate();
    return;
  }

  _chatBusy = true;
  _chatShowTyping(true);
  document.getElementById('chatSendBtn').disabled = true;
  _chatTurnCount++;

  try {
    const res = await fetch(CHAT_API.gather, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:   _chatMessages,
        user_input: _chatInitialInput,
        role:       _chatExtracted.role,
        task_type:  _chatExtracted.task_type,
      }),
    });
    const data = await res.json();

    _chatShowTyping(false);

    if (data.action === 'ready') {
      _chatMarkReady(data);
      _chatShowTaskSummary();
    } else {
      if (data.message) _chatAddMessage('agent', data.message);
    }
  } catch {
    _chatShowTyping(false);
    _chatAddMessage('agent', 'Sorry, I had trouble connecting. Please try again or type your task directly in the form.');
  } finally {
    _chatBusy = false;
    document.getElementById('chatSendBtn').disabled = false;
  }
}

/* ── Skip All: summarize conversation then ask missing role/task_type in-chat ── */
async function _chatSkipAll() {
  if (_chatBusy) return;
  _chatBusy = true;

  const skipBtn = document.getElementById('chatSkipAllBtn');
  skipBtn.disabled = true;
  skipBtn.textContent = '⏳ Summarizing…';

  try {
    const res = await fetch(CHAT_API.summarize, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:   _chatMessages,
        user_input: _chatInitialInput,
        role:       _chatExtracted.role,
        task_type:  _chatExtracted.task_type,
      }),
    });
    const data = await res.json();
    _chatExtracted.role             = data.role             || _chatExtracted.role;
    _chatExtracted.task_type        = data.task_type        || _chatExtracted.task_type;
    _chatExtracted.task_description = data.task_description || _chatExtracted.task_description;
  } catch {
    /* keep whatever was already extracted */
  } finally {
    _chatBusy = false;
    skipBtn.disabled = false;
    skipBtn.textContent = '⏭ Skip All & Proceed';
  }

  // Ask missing role/task_type through chat, then show task summary — user clicks Generate
  await _chatAskMissingThenGenerate();
}

/* ── Ask role and/or task_type in-chat if still missing, then show summary ── */
async function _chatAskMissingThenGenerate() {
  const roleMissing     = !_chatExtracted.role     || _chatExtracted.role     === 'general';
  const taskTypeMissing = !_chatExtracted.task_type || _chatExtracted.task_type === 'general';

  if (roleMissing) {
    _chatAddMessage('agent',
      'Almost there! Just a couple of quick details:\n' +
      '• What is your role?\n' +
      '  e.g. Consultant / Manager, Developer / Technical, Business Analyst, Sales / BD, HR / People Ops…'
    );
    _chatPendingField = 'role';
    return;
  }

  if (taskTypeMissing) {
    _chatAddMessage('agent',
      'One more thing:\n' +
      '• What type of task is this?\n' +
      '  e.g. Research & Analysis, Writing & Docs, Strategy & Planning, Data Analysis, Code & Dev…'
    );
    _chatPendingField = 'task_type';
    return;
  }

  // All collected — show summary and let user click Generate
  _chatPendingField = null;
  _chatShowTaskSummary();
  _chatMarkReady(_chatExtracted);
}


/* ══════════════════════════════════════
   TOOL CHANGE LOG MODAL
══════════════════════════════════════ */
(function initToolChangeLog() {
  let _tclPage    = 1;
  let _tclTotal   = 0;
  let _tclSearch  = '';
  const PER_PAGE  = 20;

  function _open() {
    document.getElementById('tclOverlay').classList.add('open');
    document.getElementById('tclModal').classList.add('open');
    _tclPage   = 1;
    _tclSearch = '';
    document.getElementById('tclSearch').value = '';
    _load();
  }

  function _close() {
    document.getElementById('tclOverlay').classList.remove('open');
    document.getElementById('tclModal').classList.remove('open');
  }

  async function _load() {
    const body = document.getElementById('tclBody');
    body.innerHTML = `<div class="tcl-loading"><div class="tcl-spinner"></div><span>Loading…</span></div>`;

    const params = new URLSearchParams({ page: _tclPage, per_page: PER_PAGE });
    if (_tclSearch.trim()) params.set('tool_name', _tclSearch.trim());

    try {
      const res  = await fetch(`${API.toolChangeLog}?${params}`);
      const data = await res.json();
      _tclTotal  = data.total || 0;
      const logs = data.logs  || [];

      if (!logs.length) {
        body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">No change log entries yet.</div>`;
        document.getElementById('tclFooter').style.display = 'none';
        return;
      }

      const ACTION_STYLE = {
        registered:   { bg: '#EFF6FF', color: '#1D4ED8', label: 'Tool Added'    },
        updated:      { bg: '#F5F3FF', color: '#5B21B6', label: 'Edited'        },
        deleted:      { bg: '#FEF2F2', color: '#991B1B', label: 'Tool Removed'  },
        file_deleted: { bg: '#FFF7ED', color: '#9A3412', label: 'File Removed'  },
      };

      body.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:10px 12px;color:var(--text3);font-weight:600;white-space:nowrap;">Date / Time</th>
              <th style="text-align:left;padding:10px 12px;color:var(--text3);font-weight:600;">Tool</th>
              <th style="text-align:center;padding:10px 12px;color:var(--text3);font-weight:600;">Action</th>
              <th style="text-align:left;padding:10px 12px;color:var(--text3);font-weight:600;">Changes</th>
            </tr>
          </thead>
          <tbody>
            ${logs.map(log => {
              let cf = {};
              try { cf = JSON.parse(log.changed_fields || '{}'); } catch {}
              const keys = Object.keys(cf);

              /* Determine action label — file events reuse action=updated */
              let actionStyle = ACTION_STYLE[log.action] || { bg: '#F9FAFB', color: '#374151', label: log.action };
              if (log.action === 'updated' && keys.includes('file_removed')) {
                actionStyle = { bg: '#FFF7ED', color: '#9A3412', label: 'Remove File' };
              } else if (log.action === 'updated' && keys.includes('files_uploaded')) {
                actionStyle = { bg: '#F0FDF4', color: '#166534', label: 'Upload File' };
              }

              /* Render changes */
              let changesHtml = '—';
              if (keys.length) {
                changesHtml = keys.map(k => {
                  const v = cf[k];
                  if (v && typeof v === 'object' && 'from' in v) {
                    return `<div style="font-size:11.5px;line-height:1.5;"><strong>${escapeHtml(k)}</strong>: <span style="color:var(--text3)">${escapeHtml(String(v.from).slice(0,60))}</span> → <span style="color:var(--text)">${escapeHtml(String(v.to).slice(0,60))}</span></div>`;
                  }
                  return `<div style="font-size:12px;line-height:1.7;"><strong>${escapeHtml(k)}</strong>: ${escapeHtml(String(v).slice(0,120))}</div>`;
                }).join('');
              }
              const ts = log.created_at ? new Date(log.created_at + 'Z').toLocaleString() : '—';
              return `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px 12px;color:var(--text3);white-space:nowrap;font-size:12px;">${escapeHtml(ts)}</td>
                  <td style="padding:10px 12px;font-weight:600;color:var(--text);">${escapeHtml(log.tool_name)}</td>
                  <td style="padding:10px 12px;text-align:center;">
                    <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${actionStyle.bg};color:${actionStyle.color};">${actionStyle.label}</span>
                  </td>
                  <td style="padding:10px 12px;">${changesHtml}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>`;

      const totalPages = Math.ceil(_tclTotal / PER_PAGE);
      const footer = document.getElementById('tclFooter');
      const info   = document.getElementById('tclPageInfo');
      footer.style.display = totalPages > 1 ? '' : 'none';
      info.textContent = `Page ${_tclPage} of ${totalPages} (${_tclTotal} entries)`;
      document.getElementById('tclPrevBtn').disabled = _tclPage <= 1;
      document.getElementById('tclNextBtn').disabled = _tclPage >= totalPages;

    } catch (err) {
      body.innerHTML = `<div style="padding:20px;color:var(--danger);font-size:13px;">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Wire controls
  document.getElementById('dropToolChangeLog')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('hdrDropdown')?.classList.remove('open');
    _open();
  });


  document.getElementById('tclCloseBtn')?.addEventListener('click', _close);
  document.getElementById('tclOverlay')?.addEventListener('click', _close);
  document.getElementById('tclRefreshBtn')?.addEventListener('click', () => { _tclPage = 1; _load(); });

  let _tclSearchTimer;
  document.getElementById('tclSearch')?.addEventListener('input', (e) => {
    clearTimeout(_tclSearchTimer);
    _tclSearchTimer = setTimeout(() => { _tclSearch = e.target.value; _tclPage = 1; _load(); }, 300);
  });

  document.getElementById('tclPrevBtn')?.addEventListener('click', () => { if (_tclPage > 1) { _tclPage--; _load(); } });
  document.getElementById('tclNextBtn')?.addEventListener('click', () => { _tclPage++; _load(); });
})();

/* ── Show task summary as a chat message — does NOT auto-generate ── */
function _chatShowSummaryAndGenerate() {
  const role     = _chatExtracted.role             || 'general';
  const taskType = _chatExtracted.task_type        || 'general';
  const taskDesc = _chatExtracted.task_description || '';

  _chatAddMessage('agent',
    'Here\'s what I understood from our conversation:\n' +
    `• Role: ${capitalize(role)}\n` +
    `• Task Type: ${capitalize(taskType)}\n` +
    `• Task Description: ${taskDesc}\n\n` +
    'You can add more details below, or click Generate Response when ready.'
  );
}

/* ── Lock the entire chat input area — called once Generate is clicked ── */
function _chatLockInput() {
  const chatInput       = document.getElementById('chatInput');
  const chatSendBtn     = document.getElementById('chatSendBtn');
  const chatGenerateBtn = document.getElementById('chatGenerateBtn');
  const chatSkipAllBtn  = document.getElementById('chatSkipAllBtn');

  if (chatInput) {
    chatInput.disabled    = true;
    chatInput.placeholder = 'Task concluded — start a new chat to change your task.';
  }
  if (chatSendBtn)     { chatSendBtn.disabled     = true; }
  if (chatGenerateBtn) { chatGenerateBtn.disabled  = true; }
  if (chatSkipAllBtn)  { chatSkipAllBtn.disabled   = true; }
}

/* ── Generate: fill hidden fields + run ── */
async function _chatTriggerGenerate() {
  if (!_chatReady && _chatMessages.filter(m => m.role === 'user').length === 0) {
    showToast('Please describe your task in the chat first.', 'error');
    return;
  }

  let role        = _chatExtracted.role             || 'general';
  let taskType    = _chatExtracted.task_type        || 'general';
  let taskDesc    = _chatExtracted.task_description || '';

  if (!taskDesc) { showToast('Please describe your task first.', 'error'); return; }

  // Populate the form fields so history + audit log capture correct values
  const roleEl     = document.getElementById('selRole');
  const taskTypeEl = document.getElementById('selTaskType');
  const inputEl    = document.getElementById('userInput');
  const charCount  = document.getElementById('charCount');
  if (roleEl)     { roleEl.value = role; roleEl.dispatchEvent(new Event('input')); }
  if (taskTypeEl) { taskTypeEl.value = taskType; taskTypeEl.dispatchEvent(new Event('input')); }
  if (inputEl)    { inputEl.value = taskDesc; if (charCount) charCount.textContent = taskDesc.length; }

  _chatLockInput();
  document.getElementById('chatReadyBanner')?.classList.remove('visible');
  _chatAddMessage('agent', '⚡ Generating your prompt now… The task has been concluded.');

  await _runGenerate(taskDesc, role, taskType);
}

/* ── Reset chat — re-enables all locked controls ── */
function _chatReset() {
  _chatMessages     = [];
  _chatReady        = false;
  _chatExtracted    = { role: 'general', task_type: 'general', task_description: '' };
  _chatInitialInput = '';
  _chatBusy         = false;
  _chatTurnCount    = 0;
  _chatPendingField = null;

  const container = document.getElementById('chatMessages');
  if (container) container.innerHTML = '';
  document.getElementById('chatSummaryBar')?.classList.remove('visible');
  document.getElementById('chatReadyBanner')?.classList.remove('visible');

  const chatInput       = document.getElementById('chatInput');
  const chatSendBtn     = document.getElementById('chatSendBtn');
  const chatGenerateBtn = document.getElementById('chatGenerateBtn');
  const chatSkipAllBtn  = document.getElementById('chatSkipAllBtn');

  if (chatInput) {
    chatInput.disabled    = false;
    chatInput.value       = '';
    chatInput.style.height = 'auto';
    chatInput.placeholder = 'Type your task here…';
  }
  if (chatSendBtn)     { chatSendBtn.disabled     = false; }
  if (chatGenerateBtn) { chatGenerateBtn.disabled  = true; }
  if (chatSkipAllBtn)  { chatSkipAllBtn.disabled   = false; }

  _startNewChat();
}

/* ── Start a fresh conversation ── */
function _startNewChat() {
  const greeting = `Hi! I'm your AI task assistant. Tell me what you'd like to do — what's your goal or task today?`;
  _chatAddMessage('agent', greeting);
}

/* ══════════════════════════════════════
   DRAG HANDLE — resize chat panel
══════════════════════════════════════ */
function _initDragHandle() {
  const handle    = document.getElementById('homeDragHandle');
  const chatPanel = document.getElementById('chatPanel');
  const outer     = document.getElementById('homeOuter');
  if (!handle || !chatPanel || !outer) return;

  let dragging = false;
  let startX   = 0;
  let startW   = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.target === document.getElementById('chatToggleBtn')) return;
    dragging = true;
    startX   = e.clientX;
    startW   = chatPanel.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const outerW  = outer.getBoundingClientRect().width;
    const delta   = e.clientX - startX;
    const newW    = Math.min(Math.max(startW + delta, 220), outerW * 0.82);
    const pct     = (newW / outerW * 100).toFixed(2);
    chatPanel.style.flex = `0 0 ${pct}%`;

    // Snap zones: 25%, 40%, 55%, 60%
    const snapPcts = [25, 40, 55, 60];
    const closest  = snapPcts.reduce((a, b) => Math.abs(b - parseFloat(pct)) < Math.abs(a - parseFloat(pct)) ? b : a);
    if (Math.abs(parseFloat(pct) - closest) < 2.5) {
      chatPanel.style.flex = `0 0 ${closest}%`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });

  // Touch support
  handle.addEventListener('touchstart', (e) => {
    if (e.target === document.getElementById('chatToggleBtn')) return;
    const t = e.touches[0];
    dragging = true;
    startX   = t.clientX;
    startW   = chatPanel.getBoundingClientRect().width;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t      = e.touches[0];
    const outerW = outer.getBoundingClientRect().width;
    const delta  = t.clientX - startX;
    const newW   = Math.min(Math.max(startW + delta, 220), outerW * 0.82);
    const pct    = (newW / outerW * 100).toFixed(2);
    chatPanel.style.flex = `0 0 ${pct}%`;
  }, { passive: true });

  document.addEventListener('touchend', () => { dragging = false; });
}

/* ══════════════════════════════════════
   TOGGLE BUTTON >> / << 
   Default: chat=40%, click >> → 60%, click << → 25%
══════════════════════════════════════ */
function _initToggleBtn() {
  const btn       = document.getElementById('chatToggleBtn');
  const chatPanel = document.getElementById('chatPanel');
  const outer     = document.getElementById('homeOuter');
  if (!btn || !chatPanel || !outer) return;

  let _state = 'normal'; // 'normal' (40%) | 'expanded' (60%) | 'collapsed' (25%)

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_state === 'normal') {
      _state = 'expanded';
      chatPanel.style.flex = '0 0 60%';
      btn.textContent = '«';
      btn.title = 'Shrink chat panel';
      outer.classList.add('chat-expanded');
    } else if (_state === 'expanded') {
      _state = 'collapsed';
      chatPanel.style.flex = '0 0 25%';
      btn.textContent = '»';
      btn.title = 'Expand chat panel';
      outer.classList.remove('chat-expanded');
    } else {
      _state = 'normal';
      chatPanel.style.flex = '0 0 40%';
      btn.textContent = '»';
      btn.title = 'Expand chat panel';
      outer.classList.remove('chat-expanded');
    }
  });
}

