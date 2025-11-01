// Content script: injects FAB + overlay UI and handles anonymize/de-anonymize

(() => {
  const MSG = {
    TOGGLE: 'SAFE_MASK_TOGGLE',
    ANON_SELECTION: 'SAFE_MASK_ANON_SELECTION',
    DEANON_SELECTION: 'SAFE_MASK_DEANON_SELECTION',
    OPEN_SETTINGS: 'SAFE_MASK_OPEN_SETTINGS'
  };

  const state = {
    overlay: null,
    originalTA: null,
    anonymizedTA: null,
    diffPane: null,
    statusEl: null,
    settings: null,
    vault: null,
    isOpen: false,
  };

  const importModules = async () => {
    const base = chrome.runtime.getURL('src/');
    const crypto = await import(base + 'crypto.js');
    const detectors = await import(base + 'detectors.js');
    const anonymizer = await import(base + 'anonymizer.js');
    const ai = await import(base + 'ai.js');
    const diff = await import(base + 'diff.js');
    return { crypto, detectors, anonymizer, ai, diff };
  };

  const ensureStyles = () => {
    if (document.getElementById('safemask-style')) return;
    const link = document.createElement('link');
    link.id = 'safemask-style';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/ui.css');
    document.documentElement.appendChild(link);
  };

  const defaultSettings = () => ({
    profile: 'Legal',
    autoLockMinutes: 10,
    useProofreader: true,
    modes: {
      FULL_NAME: 'pseudo',
      ORGANIZATION: 'pseudo',
      EMAIL: 'pseudo',
      PHONE: 'pseudo',
      ADDRESS: 'pseudo',
      IBAN: 'redact',
      RIB: 'redact',
      BIC: 'redact',
      CREDIT_CARD: 'redact',
      SIREN: 'pseudo',
      SIRET: 'pseudo',
      VAT: 'pseudo',
      API_KEY: 'redact',
      TOKEN: 'redact',
      OTHER: 'ignore'
    }
  });

  const profiles = {
    Legal: {
      FULL_NAME: 'pseudo', ORGANIZATION: 'pseudo', EMAIL: 'pseudo', PHONE: 'pseudo', ADDRESS: 'pseudo',
      IBAN: 'redact', RIB: 'redact', BIC: 'redact', CREDIT_CARD: 'redact',
      SIREN: 'pseudo', SIRET: 'pseudo', VAT: 'pseudo', API_KEY: 'redact', TOKEN: 'redact', OTHER: 'ignore'
    },
    Sales: {
      FULL_NAME: 'pseudo', ORGANIZATION: 'pseudo', EMAIL: 'pseudo', PHONE: 'pseudo', ADDRESS: 'redact',
      IBAN: 'redact', RIB: 'redact', BIC: 'redact', CREDIT_CARD: 'redact',
      SIREN: 'ignore', SIRET: 'ignore', VAT: 'ignore', API_KEY: 'redact', TOKEN: 'redact', OTHER: 'ignore'
    },
    Dev: {
      FULL_NAME: 'ignore', ORGANIZATION: 'ignore', EMAIL: 'pseudo', PHONE: 'ignore', ADDRESS: 'ignore',
      IBAN: 'redact', RIB: 'redact', BIC: 'redact', CREDIT_CARD: 'redact',
      SIREN: 'ignore', SIRET: 'ignore', VAT: 'ignore', API_KEY: 'redact', TOKEN: 'redact', OTHER: 'ignore'
    }
  };

  const loadSettings = async () => {
    const res = await chrome.storage.sync.get(['safemask_settings']);
    const s = res.safemask_settings || defaultSettings();
    // Ensure modes keys exist even after updates
    const def = defaultSettings();
    s.modes = Object.assign({}, def.modes, s.modes);
    return s;
  };

  const saveSettings = async (s) => {
    await chrome.storage.sync.set({ safemask_settings: s });
  };

  const createFAB = () => {
    if (document.getElementById('safemask-fab')) return;
    const btn = document.createElement('button');
    btn.id = 'safemask-fab';
    btn.title = 'SafeMask';
    const img = document.createElement('img');
    img.alt = 'SafeMask';
    img.src = chrome.runtime.getURL('icons/icon48.png');
    btn.appendChild(img);
    btn.setAttribute('aria-label', 'SafeMask');
    // Force bottom-right in case page CSS interferes
    btn.setAttribute('style', 'position:fixed;bottom:20px;right:20px;left:auto;z-index:2147483647;');
    btn.addEventListener('click', toggleOverlay);
    document.documentElement.appendChild(btn);
  };

  const buildOverlay = async () => {
    if (state.overlay) return;
    ensureStyles();
    const root = document.createElement('div');
    root.id = 'safemask-root';
    root.innerHTML = `
      <div class="sm-panel">
        <div class="sm-header">
          <div class="sm-title">SafeMask</div>
          <div class="sm-status" id="sm-status">Local</div>
          <div class="sm-actions">
            <button class="sm-btn" id="sm-settings">Settings</button>
            <button class="sm-btn" id="sm-close">✕</button>
          </div>
        </div>
        <div class="sm-tabs">
          <button class="sm-tab sm-tab-active" data-tab="orig">Original</button>
          <button class="sm-tab" data-tab="anon">Anonymized</button>
          <button class="sm-tab" data-tab="diff">Diff</button>
          <button class="sm-tab" data-tab="settings">Settings</button>
        </div>
        <div class="sm-body">
          <div class="sm-pane" data-pane="orig">
            <textarea id="sm-orig" placeholder="Paste your text here..."></textarea>
            <div class="sm-row">
              <button class="sm-btn" id="sm-anonymize">Anonymize</button>
              <button class="sm-btn" id="sm-copy-orig">Copy</button>
              <button class="sm-btn" id="sm-clear">Clear</button>
            </div>
          </div>
          <div class="sm-pane sm-hidden" data-pane="anon">
            <textarea id="sm-anon" placeholder="Anonymized result..."></textarea>
            <div class="sm-row">
              <button class="sm-btn" id="sm-deanonymize">De-anonymize</button>
              <button class="sm-btn" id="sm-copy-anon">Copy</button>
            </div>
          </div>
          <div class="sm-pane sm-hidden" data-pane="diff">
            <div id="sm-diff" class="sm-diff"></div>
            <div id="sm-insights" class="sm-row" style="margin-top:8px;color:#5f6368"></div>
          </div>
          <div class="sm-pane sm-hidden" data-pane="settings">
            <div class="sm-settings"></div>
          </div>
        </div>
      </div>
      <div class="sm-backdrop"></div>
    `;
    document.documentElement.appendChild(root);
    state.overlay = root;
    state.originalTA = root.querySelector('#sm-orig');
    state.anonymizedTA = root.querySelector('#sm-anon');
    state.diffPane = root.querySelector('#sm-diff');
    state.statusEl = root.querySelector('#sm-status');

    const { crypto, detectors, anonymizer, ai, diff } = await importModules();
    state.vault = new crypto.Vault();
    await state.vault.init(() => updateLockStatus());

    // Events
    root.querySelector('#sm-close').addEventListener('click', toggleOverlay);
    root.querySelector('#sm-anonymize').addEventListener('click', async () => {
      await runAnonymize(detectors, anonymizer, diff);
    });
    root.querySelector('#sm-deanonymize').addEventListener('click', async () => {
      await runDeAnonymize(anonymizer);
    });
    root.querySelector('#sm-copy-orig').addEventListener('click', () => copyText(state.originalTA.value));
    root.querySelector('#sm-copy-anon').addEventListener('click', () => copyText(state.anonymizedTA.value));
    root.querySelector('#sm-clear').addEventListener('click', () => { state.originalTA.value = ''; state.anonymizedTA.value = ''; state.diffPane.innerHTML=''; });
    root.querySelector('#sm-settings').addEventListener('click', () => showTab('settings'));

    root.querySelectorAll('.sm-tab').forEach(btn => btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      showTab(tab);
    }));

    await renderSettings();
    enableRipples();
  };

  const updateLockStatus = () => {
    if (!state.statusEl) return;
    state.statusEl.textContent = 'Local';
  };

  const showTab = (tab) => {
    const root = state.overlay;
    if (!root) return;
    root.querySelectorAll('.sm-tab').forEach(t => t.classList.toggle('sm-tab-active', t.getAttribute('data-tab') === tab));
    root.querySelectorAll('.sm-pane').forEach(p => p.classList.toggle('sm-hidden', p.getAttribute('data-pane') !== tab));
  };

  const copyText = async (txt) => {
    try { await navigator.clipboard.writeText(txt || ''); } catch (_) {}
  };

  const toggleOverlay = async () => {
    if (!state.overlay) await buildOverlay();
    state.isOpen = !state.isOpen;
    state.overlay.classList.toggle('sm-open', state.isOpen);
    if (state.isOpen) showTab('orig');
  };

  const runAnonymize = async (detectors, anonymizer, diff) => {
    state.vault.touch();
    state.settings = await loadSettings();
    const text = state.originalTA.value || '';
    const { ai } = await importModules();
    const res = await anonymizer.anonymizeTextSmart(text, state.settings, state.vault, ai);
    let out = res.text;
    try { out = await ai.proofreadFreezeThaw(out); } catch (_) {}
    try { out = await ai.rewriteFreezeThaw(out); } catch (_) {}
    state.anonymizedTA.value = out;
    state.diffPane.innerHTML = diff.diffHtml(text, out);
    try {
      const summary = await ai.summarize(out);
      const el = state.overlay.querySelector('#sm-insights');
      if (el) el.textContent = summary ? `Insights: ${summary}` : '';
    } catch (_) {}
    showTab('anon');
    updateLockStatus();
  };

  const runDeAnonymize = async (anonymizer) => {
    state.vault.touch();
    const input = state.anonymizedTA.value || '';
    const out = await anonymizer.deanonymizeText(input, state.vault);
    state.originalTA.value = out;
    showTab('orig');
    updateLockStatus();
  };

  const renderSettings = async () => {
    state.settings = await loadSettings();
    const container = state.overlay.querySelector('.sm-settings');
    const modes = state.settings.modes;
    const mkRow = (label, key) => {
      return `
        <div class="sm-set-row">
          <div class="sm-set-label">${label}</div>
          <div class="sm-set-modes">
            <div class="sm-seg" data-key="${key}">
              <button type="button" class="sm-seg-btn" data-value="ignore">Ignore</button>
              <button type="button" class="sm-seg-btn" data-value="pseudo">Pseudo</button>
              <button type="button" class="sm-seg-btn" data-value="redact">Redact</button>
            </div>
          </div>
        </div>
      `;
    };
    container.innerHTML = `
      <div class="sm-set-grid">
        <div class="sm-set-section">
          <h4>Profiles</h4>
          <select id="sm-profile">
            ${Object.keys(profiles).map(p => `<option ${state.settings.profile===p?'selected':''}>${p}</option>`).join('')}
          </select>
          <button class="sm-btn" id="sm-apply-profile">Apply</button>
        </div>
        <div class="sm-set-section">
          <h4>Vault</h4>
          <div class="sm-row">
            <button class="sm-btn" id="sm-export">Export .safemap</button>
            <label class="sm-file"><input type="file" id="sm-import" accept=".safemap,application/json"/>Import</label>
            <button class="sm-btn" id="sm-clear">Clear mapping</button>
          </div>
        </div>
      </div>
      <h4>Detection Categories</h4>
      <div class="sm-help" style="margin-bottom:8px">
        <strong>Modes:</strong>
        <span><b>Ignore</b>: do not process this category.</span>
        <span><b>Pseudo</b>: replace with a reversible token (TYPE_XXXXXXXX).</span>
        <span><b>Redact</b>: replace with an irreversible mask.</span>
      </div>
      ${mkRow('Full Name','FULL_NAME')}
      ${mkRow('Organization','ORGANIZATION')}
      ${mkRow('Email','EMAIL')}
      ${mkRow('Phone','PHONE')}
      ${mkRow('Address','ADDRESS')}
      <hr/>
      ${mkRow('IBAN','IBAN')}
      ${mkRow('RIB','RIB')}
      ${mkRow('BIC/SWIFT','BIC')}
      ${mkRow('Credit Card','CREDIT_CARD')}
      <hr/>
      ${mkRow('SIREN','SIREN')}
      ${mkRow('SIRET','SIRET')}
      ${mkRow('VAT Number','VAT')}
      <hr/>
      ${mkRow('API Key','API_KEY')}
      ${mkRow('Token','TOKEN')}
      <hr/>
      ${mkRow('Other','OTHER')}
      <div class="sm-row" style="justify-content:flex-end;margin-top:8px">
        <button class="sm-btn" id="sm-save-settings">Save</button>
      </div>
    `;

    container.querySelector('#sm-apply-profile').addEventListener('click', async () => {
      const sel = container.querySelector('#sm-profile').value;
      state.settings.profile = sel;
      state.settings.modes = Object.assign({}, state.settings.modes, profiles[sel]);
      await saveSettings(state.settings);
      await renderSettings();
    });

    // Initialize segmented controls selection and wire events
    container.querySelectorAll('.sm-seg').forEach(seg => {
      const key = seg.getAttribute('data-key');
      const val = modes[key] || 'ignore';
      const btn = seg.querySelector(`.sm-seg-btn[data-value="${val}"]`);
      if (btn) btn.classList.add('sm-selected');
    });

    container.querySelectorAll('.sm-seg-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        const seg = b.closest('.sm-seg');
        seg.querySelectorAll('.sm-seg-btn').forEach(x => x.classList.remove('sm-selected'));
        b.classList.add('sm-selected');
      });
    });

    container.querySelector('#sm-save-settings').addEventListener('click', async () => {
      container.querySelectorAll('.sm-seg').forEach(seg => {
        const key = seg.getAttribute('data-key');
        const sel = seg.querySelector('.sm-seg-btn.sm-selected');
        if (key && sel) state.settings.modes[key] = sel.getAttribute('data-value');
      });
      await saveSettings(state.settings);
    });

    container.querySelector('#sm-export').addEventListener('click', async () => {
      const blob = new Blob([JSON.stringify(await state.vault.exportEncrypted(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'vault.safemap'; a.click(); URL.revokeObjectURL(url);
    });
    container.querySelector('#sm-import').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const txt = await file.text();
      await state.vault.importEncrypted(JSON.parse(txt));
      updateLockStatus();
    });
    container.querySelector('#sm-clear').addEventListener('click', async () => {
      await state.vault.clear();
    });
  };

  function enableRipples() {
    const add = (el) => {
      if (!el || el.__smRipple) return;
      el.__smRipple = true;
      el.addEventListener('click', (e) => {
        const rect = el.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'sm-ripple';
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        el.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
      }, { passive: true });
    };
    document.querySelectorAll('#safemask-fab, .sm-btn, .sm-tab').forEach(add);
  }

  const tryProofread = async () => {
    try {
      const avail = (globalThis.ai && typeof globalThis.ai.createProofreader === 'function');
      const use = state.settings?.useProofreader;
      if (!avail || !use) return;
      const proofreader = await globalThis.ai.createProofreader();
      const text = state.anonymizedTA.value || '';
      // Freeze tokens → placeholders ⟦Tn⟧
      const tokenRe = /\b([A-Z_]+_[0-9A-F]{8})\b/g;
      const tokens = [];
      const frozen = text.replace(tokenRe, (_, t) => { const id = tokens.push(t) - 1; return `⟦T${id}⟧`; });
      const corrected = await proofreader.proofread(frozen);
      const thawed = corrected.replace(/⟦T(\d+)⟧/g, (_, i) => tokens[Number(i)] || _);
      state.anonymizedTA.value = thawed;
    } catch (_) {}
  };

  // Message handling
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === MSG.TOGGLE) toggleOverlay();
    if (msg.type === MSG.OPEN_SETTINGS) { if (!state.overlay) buildOverlay().then(() => showTab('settings')); else showTab('settings'); state.overlay?.classList.add('sm-open'); state.isOpen = true; }
    if (msg.type === MSG.ANON_SELECTION) handleSelection(true);
    if (msg.type === MSG.DEANON_SELECTION) handleSelection(false);
  });

  const handleSelection = async (doAnon) => {
    const sel = window.getSelection();
    const text = sel && sel.toString();
    await toggleOverlay();
    if (text) {
      state.originalTA.value = text;
      if (doAnon) {
        const { detectors, anonymizer, diff } = await importModules();
        await runAnonymize(detectors, anonymizer, diff);
      }
    }
  };

  // Boot
  ensureStyles();
  createFAB();
})();


