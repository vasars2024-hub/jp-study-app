/* global chrome, jpStudyShared, jpStudySettings */
(function () {
  if (window.__jpStudyContentLoaded) return;
  window.__jpStudyContentLoaded = true;

  const S = globalThis.jpStudyShared || {};
  const SET = globalThis.jpStudySettings || null;
  const THEMES = ['', 'night', 'sepia', 'paper', 'gray'];
  const HL_COLORS = ['jp-study-hl', 'jp-study-hl-yellow', 'jp-study-hl-blue', 'jp-study-hl-green'];
  const ENDERS = new Set(['。', '．', '！', '？', '!', '?', '…', '‥']);
  const TRAIL_CLOSE = new Set(['」', '』', '）', ')', '"', "'", '”', '’']);
  const WK_LABELS = ['content_wkNew', 'content_wkLearning', 'content_wkFamiliar', 'content_wkKnown'];
  const POPUP_TABS = ['meaning', 'grammar', 'sentence', 'kanji', 'examples', 'more'];
  const TAB_LABEL_KEYS = {
    meaning: 'content_rpTab_meaning',
    grammar: 'content_rpTab_grammar',
    sentence: 'content_rpTab_sentence',
    kanji: 'content_rpTab_kanji',
    examples: 'content_rpTab_examples',
    more: 'content_rpTab_more',
  };

  /** Normalized v2 settings (defaults until storage loads). */
  let cfg = SET ? SET.normalize({}) : {
    hoverLookup: true,
    hoverKey: 'shift',
    hoverDelayMs: 140,
    closeOnRelease: false,
    clickLookup: true,
    scanLength: 12,
    lookupInEditable: false,
    popupWidth: 360,
    popupFontSize: 14,
    popupCompact: false,
    popupPinOnClick: true,
    saveDestination: 'both',
    confirmBeforeCard: true,
    wheelEnabled: true,
    wheelSlots: [],
    fabVisible: true,
    fabStartCollapsed: false,
    fabCorner: 'bottom-right',
    fabShowLevel: true,
    fabShowComprehensibility: true,
    fabShowTheme: true,
    fabShowHighlight: true,
    fabShowLearn: true,
    fabShowOcr: true,
    fabHiddenOrigins: [],
    logImmersion: true,
  };

  let themeIdx = 0;
  let hlColorIdx = 0;
  let highlightMode = false;
  let learningOn = false;
  let popup = null;
  let fab = null;
  let fabCollapsed = false;
  let fabStatusEl = null;
  let fabBusy = false;
  let toastEl = null;
  let extensionDead = false;

  let lastLevelBadge = '';
  let levelScanTimer = null;
  let levelScanInFlight = false;
  let lastLevelSampleHash = '';
  let lastCompPercent = null;
  let immersionTimer = null;
  let immersionSeconds = 0;

  let storageChangeListener = null;
  let runtimeMessageListener = null;

  let mediaRecorder = null;
  let recordChunks = [];
  let recording = false;
  let audioClipboardDataUrl = '';
  let audioClipboardMime = 'audio/webm';

  /* ------------------------- extension-alive guards ------------------------ */

  function isExtensionAlive() {
    try {
      return !extensionDead && typeof chrome !== 'undefined' && !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function isContextInvalidatedError(err) {
    const msg = err && (err.message || String(err));
    return typeof msg === 'string' && /extension context invalidated/i.test(msg);
  }

  function hideStaleUi() {
    try {
      hidePopup();
      closeWheel(false);
      closeMoreMenu();
      hideCardPreview();
      if (fab) {
        fab.remove();
        fab = null;
      }
      if (toastEl) {
        toastEl.remove();
        toastEl = null;
      }
      if (ocrOverlay) {
        ocrOverlay.remove();
        ocrOverlay = null;
      }
      if (ocrSelectEl) {
        ocrSelectEl.remove();
        ocrSelectEl = null;
      }
      document.documentElement.classList.remove('jp-study-hl-mode');
      for (const t of THEMES) {
        if (t) document.documentElement.classList.remove(`jp-study-theme-${t}`);
      }
    } catch {
      /* ignore DOM teardown failures */
    }
  }

  function markExtensionDead() {
    if (extensionDead) return;
    extensionDead = true;
    try {
      if (levelScanTimer) clearTimeout(levelScanTimer);
      if (hoverTimer) clearTimeout(hoverTimer);
      if (immersionTimer) clearInterval(immersionTimer);
    } catch {
      /* ignore */
    }
    hideStaleUi();
    try {
      document.removeEventListener('mousemove', onHoverMove, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('pointerdown', onGlobalPointerDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('blur', onWindowBlur);
    } catch {
      /* ignore */
    }
    try {
      if (runtimeMessageListener && chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      }
    } catch {
      /* ignore */
    }
    try {
      if (storageChangeListener && chrome?.storage?.onChanged) {
        chrome.storage.onChanged.removeListener(storageChangeListener);
      }
    } catch {
      /* ignore */
    }
  }

  /** Promise wrapper that never throws on invalidated context. */
  function safeRuntimeSend(message) {
    return new Promise((resolve) => {
      if (!isExtensionAlive()) {
        markExtensionDead();
        resolve({ ok: false, invalidated: true, error: reloadedMsg() });
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (res) => {
          let lastErr = null;
          try {
            lastErr = chrome.runtime.lastError;
          } catch (err) {
            if (isContextInvalidatedError(err)) {
              markExtensionDead();
              resolve({ ok: false, invalidated: true, error: reloadedMsg() });
              return;
            }
          }
          if (lastErr) {
            const msg = lastErr.message || '';
            if (/context invalidated/i.test(msg)) {
              markExtensionDead();
              resolve({ ok: false, invalidated: true, error: reloadedMsg() });
              return;
            }
            resolve({ ok: false, error: msg || uiMsg('content_extError') });
            return;
          }
          resolve(res);
        });
      } catch (err) {
        if (isContextInvalidatedError(err)) {
          markExtensionDead();
          resolve({ ok: false, invalidated: true, error: reloadedMsg() });
          return;
        }
        resolve({ ok: false, error: err?.message || String(err) });
      }
    });
  }

  async function safeStorageGet(keys) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return {};
    }
    try {
      return await chrome.storage.local.get(keys);
    } catch (err) {
      if (isContextInvalidatedError(err)) markExtensionDead();
      return {};
    }
  }

  function safeStorageSet(obj) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    try {
      void chrome.storage.local.set(obj);
    } catch (err) {
      if (isContextInvalidatedError(err)) markExtensionDead();
    }
  }

  /* --------------------------------- toast --------------------------------- */

  /** Toast / label text from _locales (shared.js jpMsg); the key if shared.js is missing. */
  function uiMsg(key, subs) {
    return S.msg ? S.msg(key, subs) : key;
  }

  /** uiMsg, escaped for markup assembled in template strings. */
  function uiHtml(key, subs) {
    return esc(uiMsg(key, subs));
  }

  /** A counted message (`<key>_one` / `_few` / `_many` / `_other`); `$1` is the count. */
  function tn(key, count, subs) {
    return S.msgCount ? S.msgCount(key, count, subs) : key;
  }

  /**
   * "Extension reloaded" is shown exactly when the extension context has died, and
   * chrome.i18n can die with it — then the key would reach the page. English is the
   * last resort, not the message.
   */
  function reloadedMsg() {
    const m = uiMsg('content_extReloaded');
    return m && m !== 'content_extReloaded' ? m : 'Extension reloaded — refresh this tab';
  }

  function toast(msg, variant, action) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'jp-study-toast';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = '';
    const text = document.createElement('span');
    text.className = 'jp-toast-text';
    text.textContent = msg;
    toastEl.appendChild(text);
    if (action && action.label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jp-toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (action.openTarget) {
          void safeRuntimeSend({ type: 'ui-open', target: action.openTarget });
        } else if (typeof action.onClick === 'function') {
          action.onClick();
        }
      });
      toastEl.appendChild(btn);
    }
    toastEl.classList.remove('err', 'ok', 'pending');
    if (variant === 'err') toastEl.classList.add('err');
    else if (variant === 'ok') toastEl.classList.add('ok');
    else if (variant === 'pending') toastEl.classList.add('pending');
    toastEl.classList.add('open');
    clearTimeout(toastEl._t);
    const ms = action ? 9000 : variant === 'pending' ? 12000 : 3800;
    toastEl._t = setTimeout(() => toastEl.classList.remove('open'), ms);
  }

  /* -------------------------------- settings ------------------------------- */

  async function loadCfg() {
    try {
      const data = await safeStorageGet(['jpStudySettings']);
      cfg = SET ? SET.normalize(data.jpStudySettings || {}) : { ...cfg, ...(data.jpStudySettings || {}) };
      fabCollapsed = cfg.fabStartCollapsed;
      rebuildFab();
      ensureImmersionHeartbeat();
      applyPopupSizing();
    } catch {
      /* keep defaults */
    }
  }

  function saveWorkingLabel(forceAnki) {
    return S.saveWorkingMessage
      ? S.saveWorkingMessage(cfg.saveDestination, forceAnki)
      : forceAnki || cfg.saveDestination === 'both'
        ? uiMsg('save_working_card')
        : uiMsg('save_working_app');
  }

  function formatSaveToast(res) {
    return S.formatSaveResultMessage ? S.formatSaveResultMessage(res) : res?.ok ? uiMsg('content_saved') : res?.error || uiMsg('content_failed');
  }

  /* --------------------------- text scanning core --------------------------- */

  function caretFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) return { node: range.startContainer, offset: range.startOffset };
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos && pos.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
    }
    return null;
  }

  function blockTextAndOffset(node, offset) {
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const block =
      el?.closest('p, li, td, th, h1, h2, h3, h4, h5, h6, article, section, blockquote, pre, div') ||
      el ||
      document.body;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        // Skip furigana readings so ruby text doesn't corrupt sentences.
        const p = n.parentElement;
        if (p && p.closest('rt, rp')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let text = '';
    let abs = 0;
    let found = false;
    const nodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      nodes.push({ node: n, start: text.length });
      if (!found && n === node) {
        abs = text.length + offset;
        found = true;
      }
      text += n.nodeValue || '';
    }
    if (!found && node.nodeType === Node.TEXT_NODE) {
      abs = Math.min(offset, text.length);
    }
    return { block, text, offset: abs, nodes };
  }

  function isCjkChar(ch) {
    return /[぀-ヿㇰ-ㇿ㐀-鿿ｦ-ﾟ々〆ヶ]/.test(ch || '');
  }

  // Any letter of an alphabetic script — Cyrillic and accented Latin included.
  // An ASCII `\w` made a hover over a Russian word resolve to nothing.
  function isLatinWordChar(ch) {
    return /[\p{L}\p{M}\p{N}'’.-]/u.test(ch || '');
  }

  function isSentencePunct(ch) {
    return ENDERS.has(ch) || TRAIL_CLOSE.has(ch) || ch === '、' || ch === ',' || ch === '，';
  }

  /**
   * Scan window at an offset. CJK text scans forward from the hovered
   * character (dictionary lookup trims the tail); latin expands to the word.
   */
  function scanWindowAt(text, offset) {
    const n = text.length;
    if (offset >= n) return null;
    const ch = text[offset];
    if (!ch || /\s/.test(ch)) return null;
    if (isCjkChar(ch)) {
      let end = offset;
      const max = Math.min(n, offset + Math.max(4, cfg.scanLength));
      while (end < max) {
        const c = text[end];
        if (!isCjkChar(c)) break;
        end++;
      }
      if (end === offset) return null;
      return { start: offset, end, text: text.slice(offset, end), script: 'cjk' };
    }
    if (isLatinWordChar(ch)) {
      let start = offset;
      let end = offset;
      while (start > 0 && isLatinWordChar(text[start - 1])) start--;
      while (end < n && isLatinWordChar(text[end])) end++;
      const slice = text.slice(start, end).trim();
      if (!slice) return null;
      return { start, end, text: slice, script: 'latin' };
    }
    return null;
  }

  function detectSentenceBounds(text, offset) {
    if (S.detectSentenceBounds) return S.detectSentenceBounds(text, offset);
    return { start: 0, end: text.length };
  }

  /* ------------------------- range highlight (mark) ------------------------- */

  function clearLookupMarks() {
    document.querySelectorAll('mark.jp-lookup-active').forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  /** Highlight [start,end) of a block's concatenated text using its node map. */
  function markBlockRange(blockInfo, start, end) {
    clearLookupMarks();
    if (!blockInfo || !Array.isArray(blockInfo.nodes)) return;
    try {
      let startNode = null;
      let startOff = 0;
      let endNode = null;
      let endOff = 0;
      for (const item of blockInfo.nodes) {
        const len = (item.node.nodeValue || '').length;
        if (!startNode && start >= item.start && start < item.start + len) {
          startNode = item.node;
          startOff = start - item.start;
        }
        if (end > item.start && end <= item.start + len) {
          endNode = item.node;
          endOff = end - item.start;
        }
      }
      if (!startNode || !endNode) return;
      const range = document.createRange();
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      const mark = document.createElement('mark');
      mark.className = 'jp-lookup-active';
      range.surroundContents(mark);
    } catch {
      /* complex ranges (across elements) — skip the highlight */
    }
  }

  /* ------------------------------ lookup cache ------------------------------ */

  const lookupCache = new Map(); // query → response
  const LOOKUP_CACHE_MAX = 120;

  async function cachedLookup(query) {
    if (lookupCache.has(query)) {
      const hit = lookupCache.get(query);
      lookupCache.delete(query);
      lookupCache.set(query, hit); // LRU bump
      return hit;
    }
    // The page's language (kana → ja, Cyrillic → ru, Han → the page hint) so the
    // app answers from that language's dictionary, not Japanese by default.
    const res = await safeRuntimeSend({ type: 'lookup', query, lang: lookupLangFor(query) });
    if (res?.invalidated) return res;
    // Cache only definitive answers (hits and true misses) — never offline
    // errors, so results recover as soon as the app starts.
    if (res && res.ok) {
      lookupCache.set(query, res);
      while (lookupCache.size > LOOKUP_CACHE_MAX) {
        lookupCache.delete(lookupCache.keys().next().value);
      }
    }
    return res;
  }

  /**
   * Longest-prefix dictionary match. The bridge de-inflects but does not trim,
   * so try progressively shorter prefixes of the scan window.
   * Returns { matched, entries, deinflection, offline } — matched '' on miss.
   */
  async function prefixLookup(windowText, script) {
    const full = String(windowText || '').trim();
    if (!full) return { matched: '', entries: [] };
    if (script !== 'cjk') {
      const res = await cachedLookup(full);
      if (res?.invalidated) return { matched: '', entries: [], invalidated: true };
      if (res?.ok && res.entries?.length) {
        return { matched: full, entries: res.entries, deinflection: res.deinflection };
      }
      return { matched: '', entries: [], offline: !!res?.offline, error: res?.error };
    }
    const maxAttempts = 10;
    let attempts = 0;
    for (let len = Math.min(full.length, cfg.scanLength); len >= 1 && attempts < maxAttempts; len--) {
      attempts++;
      const q = full.slice(0, len);
      const res = await cachedLookup(q);
      if (res?.invalidated) return { matched: '', entries: [], invalidated: true };
      if (res?.offline) return { matched: '', entries: [], offline: true, error: res?.error };
      if (res?.ok && res.entries?.length) {
        return { matched: q, entries: res.entries, deinflection: res.deinflection };
      }
    }
    return { matched: '', entries: [] };
  }

  /* ----------------------------- reader popup ------------------------------ */

  /**
   * currentHit: the expression the popup is showing.
   * { term, mode, x, y, entries, deinflection, block, blockText, start, end,
   *   sentence: { text, start, end }, knownLevel }
   */
  let currentHit = null;
  let popupPinned = false;
  let popupTab = 'meaning';
  let hitHistory = [];
  let lookupToken = 0;
  let pointerOverPopup = false;
  let lastSavedSelection = '';
  const tabLoaded = { grammar: false, kanji: false, examples: false, more: false };

  function applyPopupSizing() {
    if (!popup) return;
    popup.style.setProperty('--rp-width', `${cfg.popupWidth}px`);
    popup.style.setProperty('--rp-font', `${cfg.popupFontSize}px`);
    popup.classList.toggle('compact', !!cfg.popupCompact);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'jp-study-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', uiMsg('content_popupLabel'));
    popup.innerHTML = `
      <div class="rp-head">
        <button type="button" class="rp-back" data-act="back" title="${uiHtml('content_rpBackTitle')}" aria-label="${uiHtml('content_rpBack')}" hidden>‹</button>
        <div class="rp-headline">
          <span class="rp-term" lang="ja"></span>
          <span class="rp-reading" lang="ja"></span>
        </div>
        <div class="rp-head-actions">
          <button type="button" class="rp-icon" data-act="tts" title="${uiHtml('content_rpPronounce')}" aria-label="${uiHtml('content_rpPronounce')}">&#9835;</button>
          <button type="button" class="rp-icon rp-pin" data-act="pin" title="${uiHtml('content_rpPinTitle')}" aria-label="${uiHtml('content_rpPin')}">&#8859;</button>
          <button type="button" class="rp-icon" data-act="close" title="${uiHtml('content_rpCloseTitle')}" aria-label="${uiHtml('content_close')}">×</button>
        </div>
      </div>
      <div class="rp-sub"></div>
      <div class="rp-known" role="group" aria-label="${uiHtml('content_rpKnownGroup')}">
        <span class="rp-known-label">${uiHtml('content_rpKnownLabel')}</span>
        <button type="button" class="rp-known-btn" data-act="wk" data-level="0">${uiHtml('content_rpLevel0')}</button>
        <button type="button" class="rp-known-btn" data-act="wk" data-level="1">${uiHtml('content_rpLevel1')}</button>
        <button type="button" class="rp-known-btn" data-act="wk" data-level="2">${uiHtml('content_rpLevel2')}</button>
        <button type="button" class="rp-known-btn" data-act="wk" data-level="3">${uiHtml('content_rpLevel3')}</button>
      </div>
      <div class="rp-tabs" role="tablist">
        ${POPUP_TABS.map(
          (t) =>
            `<button type="button" role="tab" class="rp-tab" data-tab="${t}" aria-selected="false">${uiHtml(TAB_LABEL_KEYS[t])}</button>`,
        ).join('')}
      </div>
      <div class="rp-body" tabindex="-1"></div>
      <div class="rp-foot">
        <button type="button" class="rp-act" data-act="save-word">${uiHtml('content_rpSaveWord')}</button>
        <button type="button" class="rp-act" data-act="save-sentence">${uiHtml('content_rpSaveSentence')}</button>
        <button type="button" class="rp-act rp-primary" data-act="create-card">${uiHtml('content_rpCreateCard')}</button>
        <button type="button" class="rp-icon rp-overflow" data-act="overflow" title="${uiHtml('content_rpMoreActions')}" aria-label="${uiHtml('content_rpMoreActions')}">⋯</button>
      </div>
      <div class="rp-overflow-menu" hidden>
        <button type="button" data-act="clip">${uiHtml('content_rpAddClip')}</button>
        <button type="button" data-act="translate">${uiHtml('content_rpTranslateSentence')}</button>
        <button type="button" data-act="copy">${uiHtml('content_rpCopySentence')}</button>
        <button type="button" data-act="open-app">${uiHtml('content_rpOpenGum')}</button>
      </div>
    `;
    popup.addEventListener('pointerenter', () => {
      pointerOverPopup = true;
    });
    popup.addEventListener('pointerleave', () => {
      pointerOverPopup = false;
    });
    popup.addEventListener('mousedown', (e) => {
      // Keep page selection; allow dragging when pinned via header.
      const head = e.target.closest('.rp-head');
      if (popupPinned && head && !e.target.closest('button')) {
        startPopupDrag(e);
      }
      e.stopPropagation();
    });
    popup.addEventListener('click', onPopupClick);
    popup.addEventListener('keydown', onPopupKeyDown);
    document.documentElement.appendChild(popup);
    applyPopupSizing();
    return popup;
  }

  function startPopupDrag(e) {
    const el = popup;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const move = (ev) => {
      el.style.left = `${Math.max(4, rect.left + ev.clientX - startX)}px`;
      el.style.top = `${Math.max(4, rect.top + ev.clientY - startY)}px`;
    };
    const up = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    e.preventDefault();
  }

  function hidePopup() {
    if (popup) {
      popup.classList.remove('open');
      const menu = popup.querySelector('.rp-overflow-menu');
      if (menu) menu.hidden = true;
    }
    popupPinned = false;
    updatePinButton();
    hitHistory = [];
    clearLookupMarks();
  }

  function updatePinButton() {
    const btn = popup && popup.querySelector('.rp-pin');
    if (btn) btn.classList.toggle('on', popupPinned);
    if (popup) popup.classList.toggle('pinned', popupPinned);
  }

  function positionPopup(el, x, y) {
    const pad = 8;
    const w = Math.min(cfg.popupWidth, window.innerWidth - pad * 2);
    const maxH = Math.min(Math.floor(window.innerHeight * 0.72), 560);
    el.style.maxHeight = `${maxH}px`;
    el.style.width = `${w}px`;
    let left = x + 10;
    if (left + w + pad > window.innerWidth) left = Math.max(pad, x - w - 10);
    left = Math.min(Math.max(pad, left), window.innerWidth - w - pad);
    // Prefer below the cursor; flip above when it would clip.
    const estH = Math.min(maxH, el.offsetHeight || 320);
    let top = y + 18;
    if (top + estH + pad > window.innerHeight) top = Math.max(pad, y - estH - 12);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function setActiveTab(tab) {
    popupTab = POPUP_TABS.includes(tab) ? tab : 'meaning';
    if (!popup) return;
    popup.querySelectorAll('.rp-tab').forEach((btn) => {
      const on = btn.dataset.tab === popupTab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderActiveTab();
  }

  function renderActiveTab() {
    if (!popup || !currentHit) return;
    const body = popup.querySelector('.rp-body');
    if (popupTab === 'meaning') renderMeaningTab(body);
    else if (popupTab === 'grammar') void renderGrammarTab(body);
    else if (popupTab === 'sentence') void renderSentenceTab(body);
    else if (popupTab === 'kanji') void renderKanjiTab(body);
    else if (popupTab === 'examples') void renderExamplesTab(body);
    else if (popupTab === 'more') renderMoreTab(body);
  }

  /* ----- header / sub ----- */

  function renderPopupHeader() {
    const hit = currentHit;
    const termEl = popup.querySelector('.rp-term');
    const readingEl = popup.querySelector('.rp-reading');
    const backBtn = popup.querySelector('.rp-back');
    const sub = popup.querySelector('.rp-sub');
    const first = hit.entries && hit.entries[0];
    termEl.textContent = hit.term;
    readingEl.textContent = first && first.reading && first.reading !== hit.term ? first.reading : '';
    backBtn.hidden = hitHistory.length === 0;

    const bits = [];
    if (hit.deinflection && hit.deinflection.term && hit.deinflection.term !== hit.term) {
      const reasons = Array.isArray(hit.deinflection.reasons) ? hit.deinflection.reasons.join(' ‹ ') : '';
      bits.push(
        `<span class="rp-base">${uiHtml('content_rpBase')} <b lang="ja">${esc(hit.deinflection.term)}</b>${
          reasons ? ` <span class="rp-deinf" title="${uiHtml('content_rpDeinfTitle')}">${esc(reasons)}</span>` : ''
        }</span>`,
      );
    }
    if (first) {
      const pos = first.senses && first.senses[0] && first.senses[0].partsOfSpeech;
      if (Array.isArray(pos) && pos.length) bits.push(`<span class="rp-pos">${esc(pos.slice(0, 2).join(', '))}</span>`);
      if (first.isCommon) bits.push(`<span class="rp-badge common">${uiHtml('content_rpCommon')}</span>`);
      const jlpt = Array.isArray(first.jlpt) ? first.jlpt[0] : first.jlpt;
      if (jlpt) bits.push(`<span class="rp-badge jlpt" title="${uiHtml('content_rpJlptTitle')}">${esc(jlpt)}</span>`);
      if (first.frequency != null && first.frequency !== '') {
        bits.push(`<span class="rp-badge freq" title="${uiHtml('content_rpFreqTitle')}">#${esc(first.frequency)}</span>`);
      }
    }
    sub.innerHTML = bits.join(' ');
    sub.hidden = !bits.length;
    refreshKnownButtons(hit.knownLevel);
  }

  function refreshKnownButtons(activeLevel) {
    if (!popup) return;
    popup.querySelectorAll('.rp-known-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.level) === activeLevel);
    });
  }

  /* ----- Meaning tab ----- */

  function renderMeaningTab(body) {
    const hit = currentHit;
    if (!hit.entries || !hit.entries.length) {
      const offlineNote = hit.lookupOffline
        ? uiMsg('content_rpDictOffline')
        : uiMsg('content_rpNoEntries');
      body.innerHTML = `<div class="rp-empty">${esc(offlineNote)}</div>`;
      return;
    }
    body.innerHTML = '';
    hit.entries.slice(0, 5).forEach((entry, idx) => {
      const block = document.createElement('div');
      block.className = 'rp-entry' + (idx === 0 ? ' first' : '');
      const word = entry.word || entry.term || hit.term;
      const reading = entry.reading || '';
      let sensesHtml = '';
      if (entry.glossaryHtml) {
        sensesHtml = `<div class="rp-gloss-html">${entry.glossaryHtml}</div>`;
      } else if (Array.isArray(entry.senses) && entry.senses.length) {
        sensesHtml =
          '<ol class="rp-senses">' +
          entry.senses
            .slice(0, cfg.popupCompact ? 3 : 6)
            .map((s) => {
              const defs = Array.isArray(s.definitions) ? s.definitions.join('; ') : '';
              const pos =
                Array.isArray(s.partsOfSpeech) && s.partsOfSpeech.length
                  ? `<span class="rp-sense-pos">${esc(s.partsOfSpeech.join(', '))}</span> `
                  : '';
              return `<li>${pos}${esc(defs)}</li>`;
            })
            .join('') +
          '</ol>';
      } else if (Array.isArray(entry.meanings) && entry.meanings.length) {
        sensesHtml =
          '<ol class="rp-senses">' + entry.meanings.map((m) => `<li>${esc(m)}</li>`).join('') + '</ol>';
      } else {
        sensesHtml = `<div class="rp-empty">${uiHtml('content_rpNoGloss')}</div>`;
      }
      const pitch = entry.pitchHtml
        ? `<div class="rp-pitch"><span class="rp-pitch-label">${uiHtml('content_rpPitch')}</span> ${entry.pitchHtml}</div>`
        : '';
      block.innerHTML = `
        <div class="rp-entry-head">
          <span class="rp-entry-word" lang="ja">${esc(word)}</span>
          ${reading && reading !== word ? `<span class="rp-entry-reading" lang="ja">${esc(reading)}</span>` : ''}
          ${entry.source ? `<span class="rp-entry-src" title="${uiHtml('content_rpDictSource')}">${esc(entry.source)}</span>` : ''}
        </div>
        ${idx === 0 ? pitch : ''}
        ${sensesHtml}
      `;
      body.appendChild(block);
    });
    if (hit.entries.length > 5) {
      const more = document.createElement('div');
      more.className = 'rp-note';
      more.textContent = tn('content_rpMoreEntries', hit.entries.length - 5);
      body.appendChild(more);
    }
  }

  /* ----- Grammar tab ----- */

  async function renderGrammarTab(body) {
    const hit = currentHit;
    const sentence = hit.sentence?.text || '';
    if (!sentence) {
      body.innerHTML = `<div class="rp-empty">${uiHtml('content_rpNoSentence')}</div>`;
      return;
    }
    body.innerHTML = `<div class="rp-loading">${uiHtml('content_rpMatchingGrammar')}</div>`;
    const token = lookupToken;
    const res = await safeRuntimeSend({ type: 'grammar-match', text: sentence });
    if (token !== lookupToken || popupTab !== 'grammar') return;
    if (res?.invalidated) return;
    if (!res?.ok) {
      body.innerHTML = `<div class="rp-empty">${esc(
        res?.offline
          ? uiMsg('content_rpGrammarOffline')
          : res?.error || uiMsg('content_rpGrammarFailed'),
      )}</div><div class="rp-row"><button type="button" class="rp-mini" data-act="retry-grammar">${uiHtml('content_rpRetry')}</button></div>`;
      return;
    }
    const matches = Array.isArray(res.matches) ? res.matches : [];
    if (!matches.length) {
      body.innerHTML = `
        <div class="rp-sentence-line" lang="ja">${highlightTermInSentence(sentence, hit.term)}</div>
        <div class="rp-empty">${uiHtml('content_rpNoGrammar')}</div>`;
      return;
    }
    const items = matches
      .slice(0, 6)
      .map((m) => {
        const pattern = String(m.title || m.id || '');
        const span = grammarSpanInSentence(sentence, pattern);
        return `
        <div class="rp-grammar" data-pattern="${esc(pattern)}">
          <div class="rp-grammar-head">
            <span class="rp-grammar-title" lang="ja">${esc(pattern)}</span>
            ${m.level ? `<span class="rp-badge jlpt">${esc(m.level)}</span>` : ''}
            ${span ? `<span class="rp-badge span-ok" title="${uiHtml('content_rpInSentenceTitle')}">${uiHtml('content_rpInSentence')}</span>` : `<span class="rp-badge span-guess" title="${uiHtml('content_rpPatternMatchTitle')}">${uiHtml('content_rpPatternMatch')}</span>`}
          </div>
          ${m.meaning ? `<div class="rp-grammar-meaning">${esc(m.meaning)}</div>` : ''}
        </div>`;
      })
      .join('');
    body.innerHTML = `
      <div class="rp-sentence-line" lang="ja">${highlightGrammarSpans(sentence, matches, hit.term)}</div>
      ${items}
      <div class="rp-note">${uiHtml('content_rpGrammarNote')}</div>
      <div class="rp-row">
        <button type="button" class="rp-mini" data-act="open-grammar">${uiHtml('content_rpOpenGrammar')}</button>
        <button type="button" class="rp-mini" data-act="save-sentence">${uiHtml('content_rpSaveSentence')}</button>
      </div>`;
  }

  function normalizePattern(p) {
    return String(p || '').replace(/[～〜~…]/g, '').trim();
  }

  function grammarSpanInSentence(sentence, pattern) {
    const p = normalizePattern(pattern);
    if (!p || p.length < 1) return null;
    const idx = sentence.indexOf(p);
    if (idx < 0) return null;
    return { start: idx, end: idx + p.length };
  }

  function highlightTermInSentence(sentence, term) {
    if (!term) return esc(sentence);
    const idx = sentence.indexOf(term);
    if (idx < 0) return esc(sentence);
    return (
      esc(sentence.slice(0, idx)) +
      `<b class="rp-hl-term">${esc(term)}</b>` +
      esc(sentence.slice(idx + term.length))
    );
  }

  /** Render the sentence with grammar spans underlined and the term bolded. */
  function highlightGrammarSpans(sentence, matches, term) {
    const spans = [];
    for (const m of matches) {
      const span = grammarSpanInSentence(sentence, m.title || m.id || '');
      if (span && !spans.some((s) => span.start < s.end && s.start < span.end)) {
        spans.push({ ...span, kind: 'grammar' });
      }
    }
    if (term) {
      const idx = sentence.indexOf(term);
      const collides = spans.some((s) => idx < s.end && s.start < idx + term.length);
      if (idx >= 0 && !collides) spans.push({ start: idx, end: idx + term.length, kind: 'term' });
    }
    spans.sort((a, b) => a.start - b.start);
    let html = '';
    let pos = 0;
    for (const s of spans) {
      if (s.start < pos) continue;
      html += esc(sentence.slice(pos, s.start));
      html +=
        s.kind === 'term'
          ? `<b class="rp-hl-term">${esc(sentence.slice(s.start, s.end))}</b>`
          : `<u class="rp-hl-grammar">${esc(sentence.slice(s.start, s.end))}</u>`;
      pos = s.end;
    }
    html += esc(sentence.slice(pos));
    return html;
  }

  /* ----- Sentence tab ----- */

  async function renderSentenceTab(body) {
    const hit = currentHit;
    if (!hit.sentence || !hit.sentence.text) {
      body.innerHTML = `<div class="rp-empty">${uiHtml('content_rpNoSentenceAround')}</div>`;
      return;
    }
    const sentence = hit.sentence.text;
    body.innerHTML = `
      <div class="rp-sentence-line big" lang="ja">${highlightTermInSentence(sentence, hit.term)}</div>
      <div class="rp-row rp-sentence-tools">
        <button type="button" class="rp-mini" data-act="sent-extend-left" title="${uiHtml('content_rpExtendPrevTitle')}">${uiHtml('content_rpExtendPrev')}</button>
        <button type="button" class="rp-mini" data-act="sent-extend-right" title="${uiHtml('content_rpExtendNextTitle')}">${uiHtml('content_rpExtendNext')}</button>
        <button type="button" class="rp-mini" data-act="sent-reset">${uiHtml('content_rpReset')}</button>
        <button type="button" class="rp-mini" data-act="sent-edit">${uiHtml('content_rpEdit')}</button>
      </div>
      <textarea class="rp-sentence-edit" hidden rows="3"></textarea>
      <div class="rp-sentence-stats"><span class="rp-loading-inline">${uiHtml('content_rpAnalyzing')}</span></div>
      <div class="rp-row">
        <button type="button" class="rp-mini" data-act="copy">${uiHtml('content_rpCopy')}</button>
        <button type="button" class="rp-mini" data-act="save-sentence">${uiHtml('content_rpSaveSentence')}</button>
        <button type="button" class="rp-mini" data-act="card-sentence">${uiHtml('content_rpCreateCard')}</button>
      </div>`;
    const statsEl = body.querySelector('.rp-sentence-stats');
    const token = lookupToken;
    const [level, comp] = await Promise.all([
      safeRuntimeSend({ type: 'level-estimate', text: sentence }),
      safeRuntimeSend({ type: 'comprehensibility', text: sentence }),
    ]);
    if (token !== lookupToken || popupTab !== 'sentence' || !statsEl.isConnected) return;
    const bits = [];
    if (level?.badge && level.badge !== '—' && level.badge !== 'X') {
      bits.push(`<span class="rp-stat">${uiHtml('content_rpDifficulty')} <b>${esc(level.badge)}</b> <span class="rp-dim">${uiHtml('content_rpEstimate')}</span></span>`);
    }
    if (comp?.ok && typeof comp.percent === 'number') {
      bits.push(`<span class="rp-stat">${uiHtml('content_rpKnownWords')} <b>${Math.round(comp.percent)}%</b></span>`);
    }
    bits.push(`<span class="rp-stat">${esc(tn('content_rpChars', sentence.length))}</span>`);
    if ((level && level.offline) || (comp && !comp.ok && !level?.badge)) {
      bits.push(`<span class="rp-dim">${uiHtml('content_rpStatsOffline')}</span>`);
    }
    statsEl.innerHTML = bits.join(' · ');
  }

  function extendSentence(direction) {
    const hit = currentHit;
    if (!hit || !hit.blockText || !hit.sentence) return;
    const text = hit.blockText;
    if (direction < 0 && hit.sentence.start > 0) {
      const prev = detectSentenceBounds(text, Math.max(0, hit.sentence.start - 2));
      hit.sentence.start = prev.start;
    } else if (direction > 0 && hit.sentence.end < text.length) {
      const next = detectSentenceBounds(text, Math.min(text.length - 1, hit.sentence.end + 1));
      hit.sentence.end = Math.max(hit.sentence.end, next.end);
    }
    hit.sentence.text = text.slice(hit.sentence.start, hit.sentence.end).trim();
    tabLoaded.grammar = false;
    renderActiveTab();
  }

  function resetSentence() {
    const hit = currentHit;
    if (!hit || !hit.blockText) return;
    const b = detectSentenceBounds(hit.blockText, hit.start);
    hit.sentence = { text: hit.blockText.slice(b.start, b.end).trim(), start: b.start, end: b.end };
    tabLoaded.grammar = false;
    renderActiveTab();
  }

  /* ----- Kanji tab ----- */

  async function renderKanjiTab(body) {
    const hit = currentHit;
    const kanji = [...new Set((hit.term.match(/[㐀-鿿]/g) || []))].slice(0, 6);
    if (!kanji.length) {
      body.innerHTML = `<div class="rp-empty">${uiHtml('content_rpNoKanji')}</div>`;
      return;
    }
    body.innerHTML = `<div class="rp-loading">${uiHtml('content_rpLoadingKanji')}</div>`;
    const token = lookupToken;
    const results = [];
    for (const ch of kanji) {
      const res = await cachedLookup(ch);
      if (token !== lookupToken || popupTab !== 'kanji') return;
      if (res?.invalidated) return;
      results.push({ ch, entry: res?.ok && res.entries && res.entries[0] ? res.entries[0] : null, offline: !!res?.offline });
    }
    if (results.every((r) => r.offline)) {
      body.innerHTML = `<div class="rp-empty">${uiHtml('content_rpKanjiOffline')}</div>`;
      return;
    }
    body.innerHTML = results
      .map((r) => {
        const meanings = r.entry
          ? (r.entry.meanings || []).slice(0, 4).join('; ') ||
            (r.entry.senses || [])
              .flatMap((s) => s.definitions || [])
              .slice(0, 4)
              .join('; ')
          : '';
        return `
        <div class="rp-kanji">
          <button type="button" class="rp-kanji-char" data-act="lookup-nested" data-term="${esc(r.ch)}" lang="ja" title="${uiHtml('content_rpLookUpChar', r.ch)}">${esc(r.ch)}</button>
          <div class="rp-kanji-meta">
            ${r.entry && r.entry.reading ? `<div class="rp-kanji-reading" lang="ja">${esc(r.entry.reading)}</div>` : ''}
            <div class="rp-kanji-meanings">${esc(meanings || uiMsg('content_rpNoKanjiEntry'))}</div>
          </div>
        </div>`;
      })
      .join('');
  }

  /* ----- Examples tab ----- */

  async function renderExamplesTab(body) {
    const hit = currentHit;
    body.innerHTML = `<div class="rp-loading">${uiHtml('content_rpSearchingExamples')}</div>`;
    const token = lookupToken;
    const query = hit.deinflection?.term || hit.term;
    const res = await safeRuntimeSend({ type: 'examples', query, limit: 8 });
    if (token !== lookupToken || popupTab !== 'examples') return;
    if (res?.invalidated) return;
    if (!res?.ok || !Array.isArray(res.examples) || !res.examples.length) {
      body.innerHTML = `<div class="rp-empty">${esc(res?.error || uiMsg('content_rpNoExamples'))}</div>`;
      return;
    }
    // These come from `/v1/examples`, which is `searchExamples` in the app's
    // main process — the same Tatoeba corpus the desktop Dictionary and Grammar
    // panels credit. The obligation travels with the sentences, so the tab that
    // shows them carries the credit too.
    body.innerHTML =
      res.examples
        .map(
          (ex, i) => `
        <div class="rp-example" data-idx="${i}">
          <div class="rp-example-jp" lang="ja">${highlightTermInSentence(String(ex.jp || ''), query)}</div>
          ${ex.en ? `<div class="rp-example-en">${esc(ex.en)}</div>` : ''}
          <div class="rp-example-tools">
            <button type="button" class="rp-mini" data-act="example-tts" data-text="${esc(ex.jp || '')}">${uiHtml('content_rpPlayExample')}</button>
            <button type="button" class="rp-mini" data-act="example-save" data-text="${esc(ex.jp || '')}">${uiHtml('content_rpSaveSentence')}</button>
          </div>
        </div>`,
        )
        .join('') +
      '<p class="rp-example-credit"><a href="https://tatoeba.org" target="_blank" rel="noreferrer">' +
      uiHtml('content_rpTatoeba') +
      '</a></p>';
  }

  /* ----- More tab ----- */

  function renderMoreTab(body) {
    const hit = currentHit;
    const first = hit.entries && hit.entries[0];
    const sources = [...new Set((hit.entries || []).map((e) => e.source).filter(Boolean))];
    const rows = [];
    if (first && first.pitchHtml) {
      rows.push(`<div class="rp-more-row"><span class="rp-more-k">${uiHtml('content_rpPitchAccent')}</span><span class="rp-more-v">${first.pitchHtml}</span></div>`);
    }
    if (hit.deinflection && hit.deinflection.term) {
      const reasons = Array.isArray(hit.deinflection.reasons) ? hit.deinflection.reasons.join(' ‹ ') : '';
      rows.push(
        `<div class="rp-more-row"><span class="rp-more-k">${uiHtml('content_rpDeconjugation')}</span><span class="rp-more-v" lang="ja">${esc(hit.deinflection.source || hit.term)} → ${esc(hit.deinflection.term)}${reasons ? ` <span class="rp-dim">(${esc(reasons)})</span>` : ''}</span></div>`,
      );
    }
    rows.push(
      `<div class="rp-more-row"><span class="rp-more-k">${uiHtml('content_rpEntries')}</span><span class="rp-more-v">${uiHtml('content_rpEntriesFrom', [(hit.entries || []).length, sources.length ? sources.join(', ') : uiMsg('content_rpYourDicts')])}</span></div>`,
    );
    rows.push(
      `<div class="rp-more-row"><span class="rp-more-k">${uiHtml('content_rpSourcePage')}</span><span class="rp-more-v rp-ellipsis" title="${esc(location.href)}">${esc(document.title || location.href)}</span></div>`,
    );
    body.innerHTML = `
      ${rows.join('')}
      <div class="rp-more-translate"></div>
      <div class="rp-row">
        <button type="button" class="rp-mini" data-act="translate">${uiHtml('content_rpTranslateSentence')}</button>
        <button type="button" class="rp-mini" data-act="clip">${uiHtml('content_rpAddClip')}</button>
        <button type="button" class="rp-mini" data-act="open-app">${uiHtml('content_rpOpenGum')}</button>
      </div>
      <div class="rp-note">${uiHtml('content_rpBridgeNote')}</div>`;
  }

  /* ----- popup event handling ----- */

  function onPopupClick(e) {
    e.stopPropagation();
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    const act = btn.getAttribute('data-act');
    const tabBtn = btn.classList.contains('rp-tab') ? btn.dataset.tab : null;
    if (tabBtn) {
      setActiveTab(tabBtn);
      return;
    }
    if (!act) return;
    handlePopupAction(act, btn);
  }

  function handlePopupAction(act, btn) {
    const hit = currentHit;
    if (!hit) return;
    switch (act) {
      case 'close':
        hidePopup();
        return;
      case 'back':
        popHitHistory();
        return;
      case 'pin':
        popupPinned = !popupPinned;
        updatePinButton();
        return;
      case 'tts':
        speak(hit.term);
        return;
      case 'wk': {
        const level = Number(btn.getAttribute('data-level'));
        if ([0, 1, 2, 3].includes(level)) void setKnownLevel(hit.deinflection?.term || hit.term, level);
        return;
      }
      case 'overflow': {
        const menu = popup.querySelector('.rp-overflow-menu');
        if (menu) menu.hidden = !menu.hidden;
        return;
      }
      case 'save-word':
        void doSave(hit.deinflection?.term || hit.term, 'word', false);
        return;
      case 'save-sentence':
        void doSave(hit.sentence?.text || hit.term, 'sentence', false);
        return;
      case 'create-card':
        openCardPreview();
        return;
      case 'card-sentence':
        openCardPreview('sentence');
        return;
      case 'copy':
        void copyText(hit.sentence?.text || hit.term);
        return;
      case 'clip':
        void doClipboard(hit.sentence?.text || hit.term);
        return;
      case 'translate':
        void doTranslate();
        return;
      case 'open-app':
        void safeRuntimeSend({ type: 'ui-open', target: 'inbox' }).then((res) => {
          if (!res?.ok) toast(res?.error || uiMsg('common_gumNotRunning'), 'err');
        });
        return;
      case 'open-grammar':
        void safeRuntimeSend({ type: 'ui-open', target: 'grammar' }).then((res) => {
          if (!res?.ok) toast(res?.error || uiMsg('common_gumNotRunning'), 'err');
        });
        return;
      case 'retry-grammar':
        renderActiveTab();
        return;
      case 'sent-extend-left':
        extendSentence(-1);
        return;
      case 'sent-extend-right':
        extendSentence(1);
        return;
      case 'sent-reset':
        resetSentence();
        return;
      case 'sent-edit': {
        const ta = popup.querySelector('.rp-sentence-edit');
        if (!ta) return;
        if (ta.hidden) {
          ta.hidden = false;
          ta.value = hit.sentence?.text || '';
          ta.focus();
          ta.addEventListener(
            'change',
            () => {
              if (hit.sentence) {
                hit.sentence.text = ta.value.trim();
                tabLoaded.grammar = false;
              }
            },
            { once: false },
          );
        } else {
          if (hit.sentence) hit.sentence.text = ta.value.trim();
          ta.hidden = true;
          renderActiveTab();
        }
        return;
      }
      case 'example-tts':
        speak(btn.getAttribute('data-text') || '');
        return;
      case 'example-save':
        void doSave(btn.getAttribute('data-text') || '', 'sentence', false);
        return;
      case 'lookup-nested': {
        const term = btn.getAttribute('data-term') || '';
        if (term) void nestedLookup(term);
        return;
      }
      default:
        break;
    }
  }

  function onPopupKeyDown(e) {
    if (!popup || !popup.classList.contains('open')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hidePopup();
      return;
    }
    // Don't hijack typing inside the sentence editor.
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    const idx = POPUP_TABS.indexOf(popupTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? (idx + 1) % POPUP_TABS.length : (idx - 1 + POPUP_TABS.length) % POPUP_TABS.length;
      setActiveTab(POPUP_TABS[next]);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 's' && !e.shiftKey) {
      e.preventDefault();
      handlePopupAction('save-word', popup);
    } else if (k === 's' && e.shiftKey) {
      e.preventDefault();
      handlePopupAction('save-sentence', popup);
    } else if (k === 'c' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handlePopupAction('create-card', popup);
    } else if (k === 'p') {
      e.preventDefault();
      handlePopupAction('pin', popup);
    } else if (k === 'a') {
      e.preventDefault();
      handlePopupAction('tts', popup);
    } else if (e.key === 'Backspace' && hitHistory.length) {
      e.preventDefault();
      popHitHistory();
    }
  }

  /** The study language a looked-up string is in: its script, else the page's hint. */
  function lookupLangFor(text) {
    const s = String(text || '');
    if (/[぀-ヿ]/.test(s)) return 'ja';
    if (/[Ѐ-ӿ]/.test(s)) return 'ru';
    const hint = currentLangHint();
    if (/[㐀-鿿]/.test(s)) return hint === 'zh' ? 'zh' : 'ja';
    return hint || '';
  }

  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(String(text || ''));
      // Spoken in its own language: a Chinese word read by a Japanese voice is noise.
      const lang = lookupLangFor(text);
      u.lang = lang === 'zh' ? 'zh-CN' : lang === 'ru' ? 'ru-RU' : 'ja-JP';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      toast(uiMsg('content_copied'), 'ok');
    } catch {
      toast(uiMsg('content_copyBlocked'), 'err');
    }
  }

  async function setKnownLevel(term, level) {
    const t = String(term || '').trim();
    if (!t) return;
    const res = await safeRuntimeSend({ type: 'known-level', term: t, level });
    if (res?.invalidated) return;
    if (!res?.ok) {
      toast(res?.error || uiMsg('content_knownFailed'), 'err');
      return;
    }
    if (currentHit) currentHit.knownLevel = level;
    refreshKnownButtons(level);
    toast(uiMsg('content_knownSet', [uiMsg(WK_LABELS[level]), t.slice(0, 24)]), 'ok');
  }

  async function doSave(text, mode, forceAnki) {
    const t = String(text || '').trim();
    if (!t) {
      toast(uiMsg('content_nothingToSave'), 'err');
      return;
    }
    const working = saveWorkingLabel(forceAnki);
    toast(working, 'pending');
    setFabBusy(working);
    const res = await safeRuntimeSend({ type: 'save-text', text: t, mode, forceAnki });
    setFabBusy('');
    if (res?.invalidated) return;
    toast(formatSaveToast(res), res?.ok || res?.queued ? 'ok' : 'err');
  }

  async function doClipboard(text) {
    const t = String(text || '').trim();
    if (!t) return;
    toast(uiMsg('content_addingClip'), 'pending');
    const res = await safeRuntimeSend({
      type: 'clipboard-text',
      text: t,
      entryType: S.classifyMineSelection ? S.classifyMineSelection(t) : 'text',
    });
    if (res?.invalidated) return;
    const msg = S.formatClipboardResultMessage ? S.formatClipboardResultMessage(res) : res?.ok ? uiMsg('content_added') : uiMsg('content_failed');
    toast(msg, res?.ok || res?.queued ? 'ok' : 'err');
  }

  async function doTranslate() {
    const hit = currentHit;
    const text = hit?.sentence?.text || hit?.term || '';
    if (!text) return;
    const host = popup && popup.querySelector('.rp-more-translate');
    if (host) host.innerHTML = `<div class="rp-loading-inline">${uiHtml('content_translating')}</div>`;
    else toast(uiMsg('content_translating'), 'pending');
    const res = await safeRuntimeSend({ type: 'translate', text, source: 'ja', target: 'en' });
    if (res?.invalidated) return;
    const out = String(res?.text || '').trim();
    if (host && host.isConnected) {
      host.innerHTML = res?.ok
        ? `<div class="rp-more-row"><span class="rp-more-k">${uiHtml('content_rpTranslation')}</span><span class="rp-more-v">${esc(out || uiMsg('content_rpEmpty'))}</span></div>`
        : `<div class="rp-empty">${esc(res?.error || uiMsg('content_rpTranslateFailed'))}</div>`;
    } else if (res?.ok) {
      toast(out.slice(0, 140) || uiMsg('content_translated'), 'ok');
    } else {
      toast(res?.error || uiMsg('content_translationFailed'), 'err');
    }
  }

  /* ----- opening the popup ----- */

  function pushHitHistory() {
    if (currentHit) hitHistory.push(currentHit);
    if (hitHistory.length > 12) hitHistory.shift();
  }

  function popHitHistory() {
    const prev = hitHistory.pop();
    if (!prev) return;
    currentHit = prev;
    lookupToken++;
    renderPopupHeader();
    setActiveTab('meaning');
    popup.querySelector('.rp-back').hidden = hitHistory.length === 0;
  }

  async function nestedLookup(term) {
    const token = ++lookupToken;
    const res = await cachedLookup(term);
    if (token !== lookupToken || res?.invalidated) return;
    pushHitHistory();
    currentHit = {
      term,
      mode: 'word',
      x: currentHit?.x || window.innerWidth / 2,
      y: currentHit?.y || 120,
      entries: res?.ok ? res.entries || [] : [],
      deinflection: res?.deinflection,
      lookupOffline: !!res?.offline,
      block: null,
      blockText: '',
      start: 0,
      end: 0,
      sentence: currentHit?.sentence || null,
      knownLevel: undefined,
    };
    renderPopupHeader();
    setActiveTab('meaning');
    void loadKnownLevel();
  }

  async function loadKnownLevel() {
    const hit = currentHit;
    if (!hit) return;
    const term = hit.deinflection?.term || hit.term;
    const res = await safeRuntimeSend({ type: 'known-levels', terms: [term] });
    if (res?.invalidated || !res?.ok || currentHit !== hit) return;
    const n = Number(res.levels?.[term]);
    hit.knownLevel = [0, 1, 2, 3].includes(n) ? n : 0;
    refreshKnownButtons(hit.knownLevel);
  }

  /**
   * Open the reader popup for a resolved hit.
   * `hitInfo`: { term, entries, deinflection, block, blockText, start, end, x, y, mode, lookupOffline }
   */
  function openPopupForHit(hitInfo) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    const el = ensurePopup();
    lookupToken++;
    hitHistory = [];
    let sentence = null;
    if (hitInfo.blockText) {
      const b = detectSentenceBounds(hitInfo.blockText, hitInfo.start);
      sentence = {
        text: hitInfo.blockText.slice(b.start, b.end).trim(),
        start: b.start,
        end: b.end,
      };
    } else if (hitInfo.mode === 'sentence') {
      sentence = { text: hitInfo.term, start: 0, end: hitInfo.term.length };
    }
    currentHit = { ...hitInfo, sentence, knownLevel: undefined };
    lastSavedSelection = hitInfo.term;
    tabLoaded.grammar = false;
    tabLoaded.kanji = false;
    tabLoaded.examples = false;
    renderPopupHeader();
    el.classList.add('open');
    positionPopup(el, hitInfo.x, hitInfo.y);
    setActiveTab(hitInfo.mode === 'sentence' ? 'sentence' : 'meaning');
    // Re-position after content renders (height changes).
    requestAnimationFrame(() => positionPopup(el, hitInfo.x, hitInfo.y));
    void loadKnownLevel();
  }

  /** Look up arbitrary text (selection, context menu, command) and show the popup. */
  async function lookupText(text, x, y) {
    const t = String(text || '').trim();
    if (!t) {
      toast(uiMsg('content_selectText'), 'err');
      return;
    }
    const mode = S.classifyMineSelection ? S.classifyMineSelection(t) : 'word';
    const px = typeof x === 'number' ? x : window.innerWidth / 2;
    const py = typeof y === 'number' ? y : 120;
    if (mode === 'sentence') {
      // Look up the first word of the sentence for the Meaning tab, keep the
      // sentence itself for the Sentence/Grammar tabs.
      const win = scanWindowAt(t, 0);
      const token = ++lookupToken;
      const found = win ? await prefixLookup(win.text, win.script) : { matched: '', entries: [] };
      if (token !== lookupToken || found.invalidated) return;
      openPopupForHit({
        term: found.matched || t.slice(0, 24),
        mode: 'sentence',
        x: px,
        y: py,
        entries: found.entries || [],
        deinflection: found.deinflection,
        lookupOffline: !!found.offline,
        block: null,
        blockText: t,
        start: 0,
        end: t.length,
      });
      return;
    }
    const token = ++lookupToken;
    const found = await prefixLookup(t, isCjkChar(t[0]) ? 'cjk' : 'latin');
    if (token !== lookupToken || found.invalidated) return;
    openPopupForHit({
      term: found.matched || t,
      mode: 'word',
      x: px,
      y: py,
      entries: found.entries || [],
      deinflection: found.deinflection,
      lookupOffline: !!found.offline,
      block: null,
      blockText: '',
      start: 0,
      end: 0,
    });
  }

  /* ------------------------------ hover engine ------------------------------ */

  let hoverKeyDown = false;
  let hoverTimer = null;
  let lastHoverPoint = { x: 0, y: 0 };
  let lastShownKey = '';
  let hoverScanBusy = false;

  function hoverKeyMatches(e) {
    if (cfg.hoverKey === 'shift') return e.key === 'Shift';
    if (cfg.hoverKey === 'alt') return e.key === 'Alt';
    if (cfg.hoverKey === 'ctrl') return e.key === 'Control';
    return false;
  }

  function eventHasHoverKey(e) {
    if (cfg.hoverKey === 'shift') return e.shiftKey;
    if (cfg.hoverKey === 'alt') return e.altKey;
    if (cfg.hoverKey === 'ctrl') return e.ctrlKey;
    return false;
  }

  function onKeyDown(e) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    if (e.key === 'Escape') {
      if (ocrSelectActive) {
        e.preventDefault();
        e.stopPropagation();
        cancelOcrRegionSelect(true);
        return;
      }
      if (wheelActive) {
        e.preventDefault();
        e.stopPropagation();
        closeWheel(false);
        return;
      }
      if (moreMenuEl && !moreMenuEl.hidden) {
        closeMoreMenu();
        return;
      }
      if (cardPreviewEl && cardPreviewEl.classList.contains('open')) {
        hideCardPreview();
        return;
      }
      hidePopup();
      if (ocrOverlay) ocrOverlay.classList.remove('open');
      return;
    }
    if (wheelActive) {
      handleWheelKey(e);
      return;
    }
    // Route popup shortcuts globally while the popup is open, but never
    // interfere with typing on the page or inside the popup's own inputs.
    if (
      popup &&
      popup.classList.contains('open') &&
      !popup.contains(e.target) &&
      !(e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'))
    ) {
      onPopupKeyDown(e);
      if (e.defaultPrevented) return;
    }
    if (hoverKeyMatches(e) && !hoverKeyDown) {
      hoverKeyDown = true;
      // Immediate scan at the current pointer position.
      scheduleHoverScan(0);
    }
  }

  function onKeyUp(e) {
    if (!hoverKeyMatches(e)) return;
    hoverKeyDown = false;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (cfg.closeOnRelease && !popupPinned && !pointerOverPopup) {
      hidePopup();
    }
  }

  function onWindowBlur() {
    hoverKeyDown = false;
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  }

  function onHoverMove(e) {
    lastHoverPoint = { x: e.clientX, y: e.clientY };
    if (!cfg.hoverLookup || !hoverKeyDown) return;
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    if (e.target && e.target.closest && e.target.closest('#jp-study-popup, #jp-study-fab, #jp-study-wheel, #jp-study-toast, #jp-study-ocr-overlay, #jp-study-ocr-select, #jp-study-more-menu, #jp-study-card-preview')) {
      return;
    }
    scheduleHoverScan(cfg.hoverDelayMs);
  }

  function scheduleHoverScan(delay) {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      hoverTimer = null;
      void runHoverScan();
    }, Math.max(0, delay));
  }

  async function runHoverScan() {
    if (!cfg.hoverLookup || !hoverKeyDown || hoverScanBusy) return;
    if (ocrSelectActive || wheelActive) return;
    const { x, y } = lastHoverPoint;
    const caret = caretFromPoint(x, y);
    if (!caret || !caret.node || caret.node.nodeType !== Node.TEXT_NODE) return;
    const parent = caret.node.parentElement;
    if (parent && parent.closest('#jp-study-popup, #jp-study-fab, #jp-study-wheel, #jp-study-toast, #jp-study-ocr-overlay, #jp-study-more-menu, #jp-study-card-preview')) return;
    if (!cfg.lookupInEditable && parent && parent.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) return;
    const blockInfo = blockTextAndOffset(caret.node, caret.offset);
    if (!blockInfo.text.trim()) return;
    const win = scanWindowAt(blockInfo.text, blockInfo.offset);
    if (!win) return;
    const key = `${blockInfo.text.length}:${win.start}:${win.text}`;
    if (key === lastShownKey && popup && popup.classList.contains('open')) return;
    hoverScanBusy = true;
    try {
      const token = ++lookupToken;
      const found = await prefixLookup(win.text, win.script);
      if (token !== lookupToken || found.invalidated) return;
      if (!hoverKeyDown && cfg.closeOnRelease) return;
      if (!found.matched && !found.offline) return; // no dictionary hit — don't flicker a popup
      const matched = found.matched || win.text;
      const end = win.start + matched.length;
      lastShownKey = key;
      markBlockRange(blockInfo, win.start, end);
      openPopupForHit({
        term: matched,
        mode: 'word',
        x,
        y,
        entries: found.entries || [],
        deinflection: found.deinflection,
        lookupOffline: !!found.offline,
        block: blockInfo.block,
        blockText: blockInfo.text,
        start: win.start,
        end,
      });
    } finally {
      hoverScanBusy = false;
    }
  }

  /* --------------------------- click / selection --------------------------- */

  let downX = 0;
  let downY = 0;

  function onGlobalPointerDown(e) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    downX = e.clientX;
    downY = e.clientY;
    if (moreMenuEl && !moreMenuEl.hidden && !e.target.closest('#jp-study-more-menu')) {
      closeMoreMenu();
    }
    if (wheelActive && !e.target.closest('#jp-study-wheel')) {
      closeWheel(false);
    }
  }

  function onClick(e) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    if (ocrSelectActive) return;
    if (e.button !== 0) return;
    if (
      e.target.closest(
        '#jp-study-popup, #jp-study-fab, #jp-study-toast, #jp-study-ocr-overlay, #jp-study-ocr-select, #jp-study-wheel, #jp-study-more-menu, #jp-study-card-preview',
      )
    ) {
      return;
    }
    // Plain clicks pass through (links, buttons). Lookup needs the hover key.
    if (!eventHasHoverKey(e) || !cfg.clickLookup) {
      if (!popupPinned) hidePopup();
      return;
    }
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (dx * dx + dy * dy > 64) return; // drag/select — not a click

    const sel = String(window.getSelection() || '').trim();
    if (sel && sel.length > 1) return; // selection handled on mouseup

    e.preventDefault();
    e.stopPropagation();
    lastHoverPoint = { x: e.clientX, y: e.clientY };
    if (cfg.popupPinOnClick) popupPinned = true;
    void runHoverScan().then(() => updatePinButton());
  }

  function onMouseUp(e) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    if (ocrSelectActive) return;
    if (
      e.target.closest(
        '#jp-study-popup, #jp-study-fab, #jp-study-toast, #jp-study-ocr-overlay, #jp-study-ocr-select, #jp-study-wheel, #jp-study-more-menu, #jp-study-card-preview',
      )
    ) {
      return;
    }
    const text = String(window.getSelection() || '').trim();
    if (!text) return;
    lastSavedSelection = text;
    if (highlightMode) {
      wrapSelection(HL_COLORS[hlColorIdx % HL_COLORS.length]);
      hlColorIdx += 1;
      toast(uiMsg('content_highlighted'));
      return;
    }
    // Selection lookup also requires the hover key so drag-select stays normal.
    if (!eventHasHoverKey(e) || !cfg.clickLookup) return;
    // AI OCR mode: a selection long enough to be a sentence gets the full
    // annotation instead of a dictionary entry. Short selections still go to the
    // dictionary — a one-word cloud call is slower and costs money for an answer
    // the offline dictionary already has.
    if (aiWantsSelection(text)) {
      void runSentenceAnalysis(text, { anchorY: e.clientY, context: document.title || '' });
      return;
    }
    void lookupText(text, e.clientX, e.clientY);
  }

  /**
   * Highlight the current selection. Works on any selection — including ones
   * spanning links, ruby, or multiple paragraphs — by wrapping each text node
   * (or the selected slice of it) in its own <mark> instead of moving nodes.
   */
  function wrapSelection(className) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const marks = [];

    const wrapSlice = (textNode, start, end) => {
      const len = (textNode.nodeValue || '').length;
      const s = Math.max(0, Math.min(start, len));
      const e = Math.max(s, Math.min(end, len));
      if (e - s === 0) return;
      let target = textNode;
      if (s > 0) target = target.splitText(s);
      if (e - s < (target.nodeValue || '').length) target.splitText(e - s);
      if (!(target.nodeValue || '').trim()) return;
      const mark = document.createElement('mark');
      mark.className = className;
      mark.dataset.jpStudy = '1';
      target.parentNode?.replaceChild(mark, target);
      mark.appendChild(target);
      marks.push(mark);
    };

    try {
      if (
        range.startContainer === range.endContainer &&
        range.startContainer.nodeType === Node.TEXT_NODE
      ) {
        wrapSlice(range.startContainer, range.startOffset, range.endOffset);
      } else {
        // Collect intersecting text nodes first — wrapping mutates the tree.
        const root =
          range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentNode
            : range.commonAncestorContainer;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
            const p = node.parentElement;
            if (!p || p.closest('script,style,noscript,mark[data-jp-study],#jp-study-popup,#jp-study-fab,#jp-study-toast,#jp-study-wheel')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          const start = node === range.startContainer ? range.startOffset : 0;
          const end = node === range.endContainer ? range.endOffset : (node.nodeValue || '').length;
          wrapSlice(node, start, end);
        }
      }
    } catch {
      /* leave partial marks in place — still useful */
    }
    sel.removeAllRanges();
    return marks.length > 0;
  }

  /** Payload for background saves: live selection first, then current popup hit. */
  function getSavePayload() {
    const sel = String(window.getSelection() || '').trim();
    if (sel) {
      lastSavedSelection = sel;
      return { text: sel, mode: S.classifyMineSelection ? S.classifyMineSelection(sel) : 'word' };
    }
    if (currentHit && popup && popup.classList.contains('open')) {
      return { text: currentHit.term, mode: currentHit.mode || 'word' };
    }
    if (lastSavedSelection) {
      return {
        text: lastSavedSelection,
        mode: S.classifyMineSelection ? S.classifyMineSelection(lastSavedSelection) : 'word',
      };
    }
    return { text: '', mode: 'word' };
  }

  /* ------------------------------ card preview ------------------------------ */

  let cardPreviewEl = null;

  function ensureCardPreview() {
    if (cardPreviewEl) return cardPreviewEl;
    cardPreviewEl = document.createElement('div');
    cardPreviewEl.id = 'jp-study-card-preview';
    cardPreviewEl.setAttribute('role', 'dialog');
    cardPreviewEl.setAttribute('aria-label', uiMsg('content_rpCreateCard'));
    cardPreviewEl.innerHTML = `
      <div class="cp-panel">
        <div class="cp-head">
          <strong>${uiHtml('content_rpCreateCard')}</strong>
          <button type="button" class="rp-icon" data-act="cancel" aria-label="${uiHtml('content_close')}">×</button>
        </div>
        <div class="cp-kind" role="group" aria-label="${uiHtml('content_cpKind')}">
          <button type="button" class="cp-kind-btn" data-kind="word">${uiHtml('content_cpWord')}</button>
          <button type="button" class="cp-kind-btn" data-kind="sentence">${uiHtml('content_cpSentence')}</button>
        </div>
        <textarea class="cp-text" rows="3" lang="ja" aria-label="${uiHtml('content_cpText')}"></textarea>
        <div class="cp-source"></div>
        <div class="cp-dest"></div>
        <div class="cp-note">${uiHtml('content_cpNote')}</div>
        <div class="cp-actions">
          <button type="button" class="rp-act" data-act="cancel">${uiHtml('common_cancel')}</button>
          <button type="button" class="rp-act rp-primary" data-act="send">${uiHtml('content_rpCreateCard')}</button>
        </div>
      </div>`;
    cardPreviewEl.addEventListener('mousedown', (e) => e.stopPropagation());
    cardPreviewEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === cardPreviewEl) {
        hideCardPreview();
        return;
      }
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.kind) {
        setCardKind(btn.dataset.kind);
        return;
      }
      const act = btn.getAttribute('data-act');
      if (act === 'cancel') hideCardPreview();
      else if (act === 'send') void sendCardFromPreview();
    });
    cardPreviewEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        hideCardPreview();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void sendCardFromPreview();
      }
    });
    document.documentElement.appendChild(cardPreviewEl);
    return cardPreviewEl;
  }

  let cardKind = 'word';
  /** Source snapshot for the open preview: { hit } or { text } — never stale popup state. */
  let cardSource = null;

  function setCardKind(kind) {
    cardKind = kind === 'sentence' ? 'sentence' : 'word';
    const el = ensureCardPreview();
    el.querySelectorAll('.cp-kind-btn').forEach((b) => b.classList.toggle('active', b.dataset.kind === cardKind));
    const ta = el.querySelector('.cp-text');
    if (cardSource?.hit) {
      const hit = cardSource.hit;
      ta.value = cardKind === 'sentence' ? hit.sentence?.text || hit.term : hit.deinflection?.term || hit.term;
    } else if (cardSource?.text) {
      ta.value = cardSource.text;
    }
  }

  function openCardPreview(kindOverride) {
    // Only trust the popup hit while the popup is actually open; otherwise
    // fall back to the live selection so the wheel/menu never sends stale text.
    const hit = popup && popup.classList.contains('open') ? currentHit : null;
    const payload = hit ? null : getSavePayload();
    if (!hit && !payload?.text) {
      toast(uiMsg('content_selectWordOrSentence'), 'err');
      return;
    }
    if (!cfg.confirmBeforeCard) {
      const text = kindOverride === 'sentence'
        ? hit?.sentence?.text || hit?.term || payload.text
        : hit?.deinflection?.term || hit?.term || payload.text;
      void doSave(text, kindOverride || (hit ? hit.mode : payload.mode), true);
      return;
    }
    const el = ensureCardPreview();
    cardSource = hit ? { hit } : { text: payload.text };
    setCardKind(kindOverride || (hit ? (hit.mode === 'sentence' ? 'sentence' : 'word') : payload.mode));
    el.querySelector('.cp-source').textContent = uiMsg('content_cardSource', document.title || location.href);
    el.querySelector('.cp-dest').innerHTML =
      cfg.saveDestination === 'both'
        ? uiMsg('content_cpDestBoth')
        : uiMsg('content_cpDestGum');
    el.classList.add('open');
    el.querySelector('.cp-text').focus();
  }

  function hideCardPreview() {
    if (cardPreviewEl) cardPreviewEl.classList.remove('open');
  }

  async function sendCardFromPreview() {
    const el = ensureCardPreview();
    const text = el.querySelector('.cp-text').value.trim();
    if (!text) {
      toast(uiMsg('content_cardEmpty'), 'err');
      return;
    }
    hideCardPreview();
    await doSave(text, cardKind, true);
  }

  /* ------------------------------ radial wheel ------------------------------ */

  let wheelEl = null;
  let wheelActive = false;
  let wheelHoverIdx = -1;
  let wheelPageInfo = { kind: 'article', category: 'other' };

  /**
   * Page kind/category computed from this frame, with no background round-trip.
   * YouTube is an SPA, so `chrome.tabs.query` in the background can report a
   * stale url right after a navigation — and if the `detect` message fails
   * outright we used to fall back to 'article', which silently disables
   * Download. location.href here is always current.
   */
  function localPageInfo() {
    const url = location.href;
    return {
      kind: S.detectPageKind ? S.detectPageKind(url) : 'article',
      category: S.detectContentCategory
        ? S.detectContentCategory(url, { title: document.title })
        : 'other',
    };
  }

  /** Best available page info: the background's answer, else this frame's. */
  function resolvePageInfo(detect) {
    const local = localPageInfo();
    if (!detect?.ok) return local;
    // A local YouTube match beats a stale 'article' from the background.
    return {
      kind: detect.kind === 'article' && local.kind !== 'article' ? local.kind : detect.kind,
      category: detect.category === 'other' ? local.category : detect.category,
    };
  }

  const WHEEL_RADIUS = 118; // px — compact; labels sit inside

  function wheelCommands() {
    const slots = Array.isArray(cfg.wheelSlots) && cfg.wheelSlots.length ? cfg.wheelSlots : [];
    return slots.slice(0, 6);
  }

  function ensureWheel() {
    if (wheelEl) return wheelEl;
    wheelEl = document.createElement('div');
    wheelEl.id = 'jp-study-wheel';
    wheelEl.setAttribute('role', 'menu');
    wheelEl.setAttribute('aria-label', uiMsg('content_wheelLabel'));
    document.documentElement.appendChild(wheelEl);
    wheelEl.addEventListener('pointermove', onWheelPointerMove);
    wheelEl.addEventListener('pointerup', onWheelPointerUp);
    return wheelEl;
  }

  function renderWheel() {
    const el = ensureWheel();
    const cmds = wheelCommands();
    const n = Math.max(cmds.length, 1);
    const slice = 360 / n;
    el.innerHTML = `<button type="button" class="jp-wheel-center" data-idx="-1" aria-label="${esc(uiMsg('common_cancel'))}">${esc(uiMsg('common_cancel'))}</button>`;
    cmds.forEach((id, i) => {
      const cmd = S.getCommand ? S.getCommand(id) : null;
      const available = S.commandAvailableOnPage
        ? S.commandAvailableOnPage(id, wheelPageInfo.kind, wheelPageInfo.category)
        : true;
      const lab = document.createElement('button');
      lab.type = 'button';
      lab.className = 'jp-wheel-slice' + (available ? '' : ' disabled');
      lab.dataset.idx = String(i);
      lab.setAttribute('role', 'menuitem');
      lab.disabled = !available;
      lab.title = cmd
        ? available
          ? `${cmd.label} (${i + 1})`
          : uiMsg('content_wheelUnavailable', cmd.label)
        : id;
      lab.innerHTML = `<span class="jp-wheel-key">${i + 1}</span><span class="jp-wheel-label">${esc(cmd ? cmd.shortLabel : id)}</span>`;
      const mid = -90 + slice * i + slice / 2;
      const rad = (mid * Math.PI) / 180;
      const r = WHEEL_RADIUS * 0.66;
      lab.style.transform = `translate(calc(${Math.cos(rad) * r}px - 50%), calc(${Math.sin(rad) * r}px - 50%))`;
      el.appendChild(lab);
    });
    el.style.setProperty('--wheel-size', `${WHEEL_RADIUS * 2}px`);
    el.style.setProperty('--wheel-slices', String(n));
  }

  function updateWheelHover(idx) {
    wheelHoverIdx = idx;
    if (!wheelEl) return;
    wheelEl.querySelectorAll('.jp-wheel-slice').forEach((node) => {
      node.classList.toggle('active', Number(node.dataset.idx) === idx);
    });
    const center = wheelEl.querySelector('.jp-wheel-center');
    if (center) {
      const cmds = wheelCommands();
      const cmd = idx >= 0 && S.getCommand ? S.getCommand(cmds[idx]) : null;
      center.textContent = cmd ? cmd.shortLabel : uiMsg('common_cancel');
      center.classList.toggle('previewing', !!cmd);
    }
  }

  function angleIndex(clientX, clientY, cx, cy, count) {
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 30) return -1; // dead zone → center / cancel
    if (dist > WHEEL_RADIUS + 40) return -2; // outside
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    ang = (ang + 90 + 360) % 360;
    const slice = 360 / count;
    return Math.floor(ang / slice) % count;
  }

  function wheelSliceAvailable(idx) {
    const cmds = wheelCommands();
    const id = cmds[idx];
    if (!id) return false;
    if (!S.commandAvailableOnPage) return true;
    return S.commandAvailableOnPage(id, wheelPageInfo.kind, wheelPageInfo.category);
  }

  function activateWheelIndex(idx, activatingEvent) {
    if (typeof idx !== 'number' || idx < 0) {
      closeWheel(false);
      return;
    }
    if (!wheelSliceAvailable(idx)) {
      // Never fail silently: a disabled slice used to swallow the click, which
      // reads as "the button is broken" (most often Download on a YouTube tab
      // whose kind failed to detect).
      const cmd = S.getCommand ? S.getCommand(wheelCommands()[idx]) : null;
      closeWheel(false);
      toast(cmd ? uiMsg('content_notAvailable', cmd.label) : uiMsg('content_actionNotAvailable'), 'err');
      return;
    }
    closeWheel(true, idx, activatingEvent || null);
  }

  function onWheelPointerMove(e) {
    if (!wheelActive || !wheelEl) return;
    const rect = wheelEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const idx = angleIndex(e.clientX, e.clientY, cx, cy, wheelCommands().length);
    updateWheelHover(idx >= 0 ? idx : -1);
  }

  function onWheelPointerUp(e) {
    if (!wheelActive || !wheelEl) return;
    e.preventDefault();
    e.stopPropagation();

    // Prefer the sector under the pointer. Slice pills are tiny hit targets; the
    // center also previews the hovered command label, so users release there
    // expecting confirm — not cancel.
    const rect = wheelEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angleIdx = angleIndex(e.clientX, e.clientY, cx, cy, wheelCommands().length);

    if (angleIdx === -2) {
      // Outside the wheel disc.
      closeWheel(false);
      return;
    }
    if (angleIdx >= 0) {
      activateWheelIndex(angleIdx, e);
      return;
    }

    // Dead-zone / center: confirm the currently previewed command when one is
    // highlighted; otherwise cancel.
    if (wheelHoverIdx >= 0) {
      activateWheelIndex(wheelHoverIdx, e);
      return;
    }
    const target = e.target && e.target.closest ? e.target.closest('.jp-wheel-slice, .jp-wheel-center') : null;
    if (target && target.classList.contains('jp-wheel-slice') && !target.disabled) {
      activateWheelIndex(Number(target.dataset.idx), e);
      return;
    }
    closeWheel(false);
  }

  function handleWheelKey(e) {
    const cmds = wheelCommands();
    const n = cmds.length;
    if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (idx < n) {
        e.preventDefault();
        e.stopPropagation();
        activateWheelIndex(idx, e);
      }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      updateWheelHover((wheelHoverIdx + 1 + n) % n);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      updateWheelHover((wheelHoverIdx - 1 + n) % n);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (wheelHoverIdx >= 0) activateWheelIndex(wheelHoverIdx, e);
      else closeWheel(false);
    }
  }

  async function openActionWheel(x, y) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    if (!cfg.wheelEnabled) {
      openMoreMenu(x, y);
      return;
    }
    await loadCfg();
    hidePopup();
    const detect = await safeRuntimeSend({ type: 'detect' });
    wheelPageInfo = resolvePageInfo(detect);
    const el = ensureWheel();
    renderWheel();
    const half = WHEEL_RADIUS + 10;
    const cx = Math.min(Math.max(typeof x === 'number' ? x : window.innerWidth / 2, half), window.innerWidth - half);
    const cy = Math.min(Math.max(typeof y === 'number' ? y : window.innerHeight / 2, half), window.innerHeight - half);
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.classList.add('open');
    wheelActive = true;
    updateWheelHover(-1);
  }

  function closeWheel(select, idx, activatingEvent) {
    if (!wheelActive && !(wheelEl && wheelEl.classList.contains('open'))) return;
    wheelActive = false;
    if (wheelEl) wheelEl.classList.remove('open');
    const cmds = wheelCommands();
    const chosen = select && typeof idx === 'number' && idx >= 0 && idx < cmds.length ? cmds[idx] : null;
    wheelHoverIdx = -1;
    if (chosen) void runLocalOrRemoteCommand(chosen, activatingEvent || null);
  }

  /* --------------------------- more (secondary) menu ------------------------ */

  let moreMenuEl = null;

  const MORE_MENU_COMMANDS = [
    'capture.ocr',
    'media.download',
    'capture.manga',
    'capture.audio.record',
    'capture.audio.save',
    'clipboard.send',
    'translate.selection',
    'grammar.match',
    'reader.theme',
    'reader.highlight',
    'reader.knownTint',
    'tabs.picker',
    'app.open',
    'settings.special',
  ];

  function ensureMoreMenu() {
    if (moreMenuEl) return moreMenuEl;
    moreMenuEl = document.createElement('div');
    moreMenuEl.id = 'jp-study-more-menu';
    moreMenuEl.setAttribute('role', 'menu');
    moreMenuEl.hidden = true;
    moreMenuEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.dataset.cmd;
      closeMoreMenu();
      if (id) void runLocalOrRemoteCommand(id, e);
    });
    document.documentElement.appendChild(moreMenuEl);
    return moreMenuEl;
  }

  function openMoreMenu(x, y) {
    const el = ensureMoreMenu();
    void safeRuntimeSend({ type: 'detect' }).then((detect) => {
      const { kind, category } = resolvePageInfo(detect);
      el.innerHTML = MORE_MENU_COMMANDS.filter((id) =>
        S.commandAvailableOnPage ? S.commandAvailableOnPage(id, kind, category) : true,
      )
        .map((id) => {
          const cmd = S.getCommand ? S.getCommand(id) : null;
          let label = cmd ? cmd.label : id;
          if (id === 'capture.audio.record' && recording) label = uiMsg('content_stopRecording');
          if (id === 'reader.highlight' && highlightMode) label = uiMsg('content_highlightModeOn');
          if (id === 'reader.knownTint' && learningOn) label = uiMsg('content_tintModeOn');
          return `<button type="button" role="menuitem" data-cmd="${esc(id)}">${esc(label)}</button>`;
        })
        .join('');
      el.hidden = false;
      const pad = 8;
      const w = 220;
      const left = Math.min(Math.max(pad, (x ?? window.innerWidth / 2) - w / 2), window.innerWidth - w - pad);
      const top = Math.min(Math.max(pad, (y ?? window.innerHeight / 2) - 10), window.innerHeight - 320);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    });
  }

  function closeMoreMenu() {
    if (moreMenuEl) moreMenuEl.hidden = true;
  }

  /** Run a command: page-side ones locally, everything else via the background. */
  async function runLocalOrRemoteCommand(commandId, activatingEvent) {
    const id = S.resolveCommandId ? S.resolveCommandId(commandId) : commandId;
    if (!id) return;
    switch (id) {
      case 'lookup.selection': {
        const payload = getSavePayload();
        if (!payload.text) {
          toast(uiMsg('content_selectOrHover'), 'err');
          return;
        }
        void lookupText(payload.text, lastHoverPoint.x || window.innerWidth / 2, lastHoverPoint.y || 120);
        return;
      }
      case 'save.word': {
        const payload = getSavePayload();
        void doSave(payload.text, 'word', false);
        return;
      }
      case 'save.sentence': {
        const payload = getSavePayload();
        const text =
          currentHit && currentHit.sentence && popup && popup.classList.contains('open')
            ? currentHit.sentence.text
            : payload.text;
        void doSave(text, 'sentence', false);
        return;
      }
      case 'card.create':
        openCardPreview();
        return;
      case 'translate.selection': {
        const payload = getSavePayload();
        if (!payload.text) {
          toast(uiMsg('content_selectToTranslate'), 'err');
          return;
        }
        toast(uiMsg('content_translating'), 'pending');
        const res = await safeRuntimeSend({ type: 'translate', text: payload.text, source: 'ja', target: 'en' });
        if (res?.invalidated) return;
        if (res?.ok) toast(String(res.text || '').slice(0, 140) || uiMsg('content_translated'), 'ok', { label: uiMsg('content_openInApp'), openTarget: 'translate' });
        else toast(res?.error || uiMsg('content_translationFailed'), 'err');
        return;
      }
      case 'grammar.match': {
        const payload = getSavePayload();
        if (!payload.text) {
          toast(uiMsg('content_selectSentence'), 'err');
          return;
        }
        void lookupText(payload.text, lastHoverPoint.x, lastHoverPoint.y);
        return;
      }
      case 'clipboard.send': {
        const payload = getSavePayload();
        void doClipboard(payload.text);
        return;
      }
      case 'reader.theme':
        cycleTheme();
        return;
      case 'reader.highlight':
        toggleHighlightMode();
        return;
      case 'reader.knownTint':
        toggleLearning();
        return;
      case 'capture.ocr':
        startOcrRegionSelect(activatingEvent || null);
        return;
      case 'capture.audio.record':
        void toggleRecording();
        return;
      case 'wheel.more':
        openMoreMenu(lastHoverPoint.x, lastHoverPoint.y);
        return;
      default: {
        // Background-owned command.
        const pending =
          id === 'capture.page'
            ? uiMsg('content_savingPage')
            : id === 'media.download'
              ? uiMsg('content_queueingDownload')
              : id === 'capture.manga'
                ? uiMsg('content_scanningManga')
                : id === 'capture.audio.save'
                  ? uiMsg('content_savingAudio')
                  : '';
        if (pending) {
          toast(pending, 'pending');
          setFabBusy(pending);
        }
        const res = await safeRuntimeSend({ type: 'run-command', command: id });
        if (pending) setFabBusy('');
        if (res?.invalidated) return;
        if (id === 'capture.page') {
          const msg = S.formatCaptureResultMessage ? S.formatCaptureResultMessage(res) : res?.ok ? uiMsg('content_saved') : res?.error;
          toast(msg, res?.ok || res?.queued ? 'ok' : 'err', captureToastAction(res));
        } else if (id === 'capture.manga') {
          toast(
            res?.ok ? uiMsg('content_mangaImported', res.pageCount ?? res.imageCount ?? '?') : res?.error || uiMsg('content_importFailed'),
            res?.ok ? 'ok' : 'err',
          );
        } else if (id === 'media.download') {
          toast(res?.ok ? uiMsg('content_downloadQueued') : res?.error || uiMsg('content_downloadFailed'), res?.ok ? 'ok' : 'err');
        } else if (id === 'tabs.picker') {
          if (!res?.ok) toast(res?.error || uiMsg('common_readingListFailed'), 'err');
        } else if (id === 'app.open') {
          if (!res?.ok) toast(res?.error || uiMsg('common_gumNotRunning'), 'err');
        } else {
          toast(res?.ok || res?.queued ? uiMsg('content_done') : res?.error || uiMsg('content_failed'), res?.ok || res?.queued ? 'ok' : 'err');
        }
      }
    }
  }

  function captureToastAction(res) {
    if (!res || (!res.ok && !res.queued)) return null;
    const t =
      res.openTarget ||
      (res.action === 'playlist' || res.action === 'video' || String(res.kind || '').includes('youtube')
        ? 'youtube'
        : 'inbox');
    return {
      label: t === 'youtube' ? uiMsg('content_openInApp') : uiMsg('content_openInbox'),
      openTarget: t,
    };
  }

  /* ------------------------------ page tools ------------------------------- */

  function setTheme(name) {
    for (const t of THEMES) {
      if (t) document.documentElement.classList.remove(`jp-study-theme-${t}`);
    }
    if (name) document.documentElement.classList.add(`jp-study-theme-${name}`);
    safeStorageSet({ [`jpTheme:${location.origin}`]: name || '' });
  }

  function cycleTheme() {
    themeIdx = (themeIdx + 1) % THEMES.length;
    const name = THEMES[themeIdx];
    setTheme(name);
    toast(name ? uiMsg('content_themeOn', uiMsg(`content_theme_${name}`)) : uiMsg('content_themeOff'));
    updateFab();
    return name || 'off';
  }

  function toggleHighlightMode() {
    highlightMode = !highlightMode;
    document.documentElement.classList.toggle('jp-study-hl-mode', highlightMode);
    safeStorageSet({ [`jpHlMode:${location.origin}`]: highlightMode });
    toast(highlightMode ? uiMsg('content_highlightOn') : uiMsg('content_highlightOff'), 'ok');
    updateFab();
  }

  function toggleLearning() {
    learningOn = !learningOn;
    safeStorageSet({ [`jpLearn:${location.origin}`]: learningOn });
    if (learningOn) void applyLearningHighlights();
    else clearLearningHighlights();
    toast(learningOn ? uiMsg('content_tintOn') : uiMsg('content_tintOff'), 'ok');
    updateFab();
  }

  async function loadTheme() {
    const data = await safeStorageGet([
      `jpTheme:${location.origin}`,
      `jpHlMode:${location.origin}`,
      `jpLearn:${location.origin}`,
    ]);
    const name = data[`jpTheme:${location.origin}`] || '';
    themeIdx = Math.max(0, THEMES.indexOf(name));
    setTheme(name);
    highlightMode = !!data[`jpHlMode:${location.origin}`];
    learningOn = !!data[`jpLearn:${location.origin}`];
    document.documentElement.classList.toggle('jp-study-hl-mode', highlightMode);
    if (learningOn) void applyLearningHighlights();
    updateFab();
  }

  function clearLearningHighlights() {
    document.querySelectorAll('span[data-jp-wk]').forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
  }

  async function applyLearningHighlights() {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    clearLearningHighlights();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || p.closest('script,style,noscript,#jp-study-fab,#jp-study-popup,#jp-study-ocr-overlay,#jp-study-wheel,#jp-study-more-menu,#jp-study-card-preview')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    const texts = [];
    while (walker.nextNode() && nodes.length < 100) {
      const t = walker.currentNode.nodeValue || '';
      if (/[぀-ヿ㐀-鿿]{2,}/.test(t)) {
        nodes.push(walker.currentNode);
        const parts = t.match(/[぀-ヿ㐀-鿿]{2,}/g) || [];
        texts.push(...parts.slice(0, 15));
      }
    }
    const unique = [...new Set(texts)].slice(0, 250);
    if (!unique.length) return;
    const res = await safeRuntimeSend({ type: 'known-levels', terms: unique });
    if (res?.invalidated) return;
    const levels = (res && res.levels) || {};
    for (const node of nodes) {
      if (!node.parentNode) continue;
      const raw = node.nodeValue || '';
      const frag = document.createDocumentFragment();
      let last = 0;
      const re = /[぀-ヿ㐀-鿿]{2,}/g;
      let m;
      while ((m = re.exec(raw))) {
        if (m.index > last) frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
        const term = m[0];
        const level = levels[term];
        if (typeof level === 'number' && level >= 0 && level <= 3) {
          const span = document.createElement('span');
          span.className = `jp-wk-${level}`;
          span.dataset.jpWk = String(level);
          span.textContent = term;
          frag.appendChild(span);
        } else {
          frag.appendChild(document.createTextNode(term));
        }
        last = m.index + term.length;
      }
      if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  /* --------------------------- page panel (FAB) ----------------------------- */

  function isFabHiddenHere() {
    if (!cfg.fabVisible) return true;
    return (cfg.fabHiddenOrigins || []).includes(location.origin);
  }

  function rebuildFab() {
    if (fab) {
      fab.remove();
      fab = null;
      fabStatusEl = null;
    }
    if (isFabHiddenHere()) return null;
    return ensureFab();
  }

  function ensureFab() {
    if (isFabHiddenHere()) {
      if (fab) {
        fab.remove();
        fab = null;
      }
      return null;
    }
    if (fab) return fab;
    fab = document.createElement('div');
    fab.id = 'jp-study-fab';
    fab.dataset.corner = cfg.fabCorner || 'bottom-right';
    fab.innerHTML = `
      <div class="jp-fab-pills">
        <span id="jp-study-level-badge" title="${uiHtml('content_fabLevelTitle')}">—</span>
        <span id="jp-study-comp-badge" title="${uiHtml('content_fabCompTitle')}">—</span>
        <button type="button" class="jp-fab-toggle" data-act="toggle" title="${uiHtml('content_fabExpand')}" aria-label="${uiHtml('content_fabExpand')}">▾</button>
      </div>
      <div id="jp-study-fab-status" hidden></div>
      <div class="jp-fab-actions">
        <button type="button" data-act="theme">${uiHtml('content_themeButton', uiMsg('content_theme_off'))}</button>
        <button type="button" data-act="hlmode">${uiHtml('content_fabHighlight')}</button>
        <button type="button" data-act="learn">${uiHtml('content_fabKnownTint')}</button>
        <button type="button" data-act="ocr">${uiHtml('content_fabOcr')}</button>
        <button type="button" data-act="hide-site" title="${uiHtml('content_fabHideTitle')}">${uiHtml('content_fabHide')}</button>
      </div>
    `;
    fab.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isExtensionAlive()) {
        markExtensionDead();
        return;
      }
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'toggle') {
        fabCollapsed = !fabCollapsed;
        updateFab();
      } else if (act === 'hide-site') {
        const origins = (cfg.fabHiddenOrigins || []).slice();
        if (!origins.includes(location.origin)) origins.push(location.origin);
        cfg.fabHiddenOrigins = origins;
        void safeStorageGet(['jpStudySettings']).then((data) => {
          const raw = data.jpStudySettings || {};
          void safeStorageSet({ jpStudySettings: { ...raw, fabHiddenOrigins: origins } });
        });
        toast(uiMsg('content_panelHidden'), 'ok');
        rebuildFab();
      } else if (act === 'theme') cycleTheme();
      else if (act === 'hlmode') toggleHighlightMode();
      else if (act === 'learn') toggleLearning();
      else if (act === 'ocr') startOcrRegionSelect(e);
    });
    document.documentElement.appendChild(fab);
    fabStatusEl = fab.querySelector('#jp-study-fab-status');
    updateFab();
    return fab;
  }

  function setFabBusy(msg) {
    fabBusy = !!msg;
    const el = ensureFab();
    if (!el) return;
    el.classList.toggle('busy', fabBusy);
    if (!fabStatusEl) fabStatusEl = el.querySelector('#jp-study-fab-status');
    if (fabStatusEl) {
      fabStatusEl.hidden = !fabBusy;
      fabStatusEl.textContent = msg || '';
    }
  }

  function updateFab() {
    if (isFabHiddenHere()) {
      if (fab) {
        fab.remove();
        fab = null;
      }
      return;
    }
    const el = ensureFab();
    if (!el) return;
    el.dataset.corner = cfg.fabCorner || 'bottom-right';
    el.classList.toggle('collapsed', !!fabCollapsed);
    const toggle = el.querySelector('[data-act="toggle"]');
    if (toggle) toggle.textContent = fabCollapsed ? '▴' : '▾';
    const levelEl = el.querySelector('#jp-study-level-badge');
    const compEl = el.querySelector('#jp-study-comp-badge');
    const actions = el.querySelector('.jp-fab-actions');
    if (levelEl) levelEl.hidden = !cfg.fabShowLevel;
    if (compEl) {
      compEl.hidden = !cfg.fabShowComprehensibility;
      compEl.textContent = lastCompPercent == null ? '—' : `${lastCompPercent}%`;
    }
    if (actions) actions.hidden = !!fabCollapsed;
    const themeBtn = el.querySelector('[data-act="theme"]');
    const hlBtn = el.querySelector('[data-act="hlmode"]');
    const learnBtn = el.querySelector('[data-act="learn"]');
    const ocrBtn = el.querySelector('[data-act="ocr"]');
    if (themeBtn) {
      themeBtn.hidden = !cfg.fabShowTheme;
      themeBtn.textContent = uiMsg('content_themeButton', uiMsg(THEMES[themeIdx] ? `content_theme_${THEMES[themeIdx]}` : 'content_theme_off'));
    }
    if (hlBtn) {
      hlBtn.hidden = !cfg.fabShowHighlight;
      hlBtn.textContent = uiMsg(highlightMode ? 'content_fabHighlightOn' : 'content_fabHighlight');
      hlBtn.classList.toggle('on', highlightMode);
    }
    if (learnBtn) {
      learnBtn.hidden = !cfg.fabShowLearn;
      learnBtn.textContent = uiMsg(learningOn ? 'content_fabKnownTintOn' : 'content_fabKnownTint');
      learnBtn.classList.toggle('on', learningOn);
    }
    if (ocrBtn) ocrBtn.hidden = !cfg.fabShowOcr;
  }

  /* -------------------- level / comprehensibility scan ---------------------- */

  const LEVEL_SAMPLE_MAX = 40000;
  const LEVEL_SCAN_DEBOUNCE_MS = 1200;

  function pageHasJapanese(text) {
    return /[぀-ヿㇰ-ㇿ]/.test(text);
  }

  function pageHasChinese(text) {
    return /[㐀-䶿一-鿿]/.test(text) && !/[぀-ヿㇰ-ㇿ]/.test(text);
  }

  function samplePageText(maxChars) {
    const limit = maxChars || LEVEL_SAMPLE_MAX;
    if (!document.body) return '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (
          !p ||
          p.closest(
            'script,style,noscript,textarea,input,#jp-study-fab,#jp-study-popup,#jp-study-ocr-overlay,#jp-study-toast,#jp-study-wheel,#jp-study-more-menu,#jp-study-card-preview',
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let out = '';
    while (walker.nextNode()) {
      out += (walker.currentNode.nodeValue || '') + '\n';
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
  }

  function hashSample(text) {
    // Cheap change detector — length + ends — avoids hashing full 40k every idle tick.
    const t = text || '';
    return `${t.length}:${t.slice(0, 48)}:${t.slice(-48)}`;
  }

  function setLevelBadge(badge, meta) {
    const next = badge || '—';
    if (next !== '—' && next !== 'X') lastLevelBadge = next;
    const el = fab && fab.querySelector('#jp-study-level-badge');
    if (!el) return;
    el.textContent = next === 'X' ? '—' : next;
    el.dataset.empty = meta?.empty ? '1' : '0';
    el.dataset.offline = meta?.offline ? '1' : '0';
    el.dataset.lang = meta?.lang || '';
    el.classList.toggle('offline', next === '—' || !!meta?.offline);
    el.title = meta?.offline
      ? uiMsg('content_levelOffline')
      : next === 'X' || next === '—'
        ? uiMsg('content_levelNoText')
        : uiMsg('content_levelTitle', next);
  }

  async function refreshComprehensibility() {
    if (isFabHiddenHere() || !cfg.fabShowComprehensibility) return;
    const sample = samplePageText(6000);
    if (!sample || sample.length < 40 || !pageHasJapanese(sample)) {
      lastCompPercent = null;
      updateFab();
      return;
    }
    const res = await safeRuntimeSend({ type: 'comprehensibility', text: sample });
    if (res?.invalidated) return;
    lastCompPercent = res?.ok && typeof res.percent === 'number' ? Math.round(res.percent) : null;
    updateFab();
  }

  async function runLevelScan() {
    if (levelScanInFlight) return;
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    levelScanInFlight = true;
    try {
      const sample = samplePageText(LEVEL_SAMPLE_MAX);
      const hash = hashSample(sample);
      if (hash === lastLevelSampleHash && lastLevelBadge) return;
      lastLevelSampleHash = hash;

      if (!pageHasJapanese(sample) && !pageHasChinese(sample)) {
        setLevelBadge('X', { empty: true });
        return;
      }

      const res = await safeRuntimeSend({ type: 'level-estimate', text: sample });
      if (res?.invalidated) return;
      if (res?.offline || (res?.ok === false && !res?.badge)) {
        if (lastLevelBadge) setLevelBadge(lastLevelBadge, { offline: true, lang: res?.lang });
        else setLevelBadge('—', { offline: true });
        return;
      }
      const badge = typeof res?.badge === 'string' && res.badge ? res.badge : '—';
      setLevelBadge(badge, { empty: !!res?.empty, offline: false, lang: res?.lang });
      void refreshComprehensibility();
    } catch (err) {
      if (isContextInvalidatedError(err)) {
        markExtensionDead();
        return;
      }
      if (lastLevelBadge) setLevelBadge(lastLevelBadge, { offline: true });
      else setLevelBadge('—', { offline: true });
    } finally {
      levelScanInFlight = false;
    }
  }

  function scheduleLevelScan(immediate) {
    if (!isExtensionAlive()) return;
    if (levelScanTimer) clearTimeout(levelScanTimer);
    const delay = immediate ? 80 : LEVEL_SCAN_DEBOUNCE_MS;
    levelScanTimer = setTimeout(() => {
      levelScanTimer = null;
      const run = () => void runLevelScan();
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 2000 });
      } else {
        run();
      }
    }, delay);
  }

  function startLevelDetector() {
    ensureFab();
    scheduleLevelScan(true);
    let observer = null;
    try {
      observer = new MutationObserver(() => scheduleLevelScan(false));
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      } else {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            if (document.body && observer) {
              observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            }
            scheduleLevelScan(false);
          },
          { once: true },
        );
      }
    } catch {
      /* ignore observer failures */
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleLevelScan(false);
    });
  }

  /* ------------------------------- immersion -------------------------------- */

  function flushImmersionVisit() {
    if (!cfg.logImmersion || immersionSeconds < 5) {
      immersionSeconds = 0;
      return;
    }
    const secs = immersionSeconds;
    immersionSeconds = 0;
    const chars = samplePageText(8000).length;
    void safeRuntimeSend({
      type: 'immersion-visit',
      url: location.href,
      title: document.title || '',
      seconds: secs,
      chars,
    });
  }

  function onImmersionVisibility() {
    if (document.visibilityState === 'hidden') flushImmersionVisit();
  }

  function ensureImmersionHeartbeat() {
    if (immersionTimer) {
      clearInterval(immersionTimer);
      immersionTimer = null;
    }
    document.removeEventListener('visibilitychange', onImmersionVisibility);
    if (!cfg.logImmersion || !isExtensionAlive()) return;
    immersionTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      immersionSeconds += 15;
      if (immersionSeconds >= 60) flushImmersionVisit();
    }, 15000);
    document.addEventListener('visibilitychange', onImmersionVisibility, { passive: true });
  }

  /* ------------------------------ audio record ------------------------------ */

  async function toggleRecording() {
    if (recording && mediaRecorder) {
      mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast(uiMsg('content_micUnavailable'), 'err');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      audioClipboardMime = mime.split(';')[0] || 'audio/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) recordChunks.push(ev.data);
      };
      mediaRecorder.onstop = () => {
        recording = false;
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorder = null;
        const blob = new Blob(recordChunks, { type: audioClipboardMime });
        recordChunks = [];
        if (!blob.size) {
          toast(uiMsg('content_recordingEmpty'), 'err');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          audioClipboardDataUrl = String(reader.result || '');
          toast(uiMsg('content_recordingReady'), 'ok');
        };
        reader.onerror = () => toast(uiMsg('content_recordingUnreadable'), 'err');
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      recording = true;
      toast(uiMsg('content_recording'), 'ok');
    } catch (err) {
      toast(String(err.message || err || uiMsg('content_micDenied')), 'err');
    }
  }

  /* ----------------------------------- OCR ---------------------------------- */

  let ocrOverlay = null;
  let ocrSelectEl = null;
  let ocrSelectActive = false;
  let ocrSelectArmed = false;
  let ocrSelectDrag = null;
  let ocrSelectPointerId = null;
  let ocrSelectIgnorePointerId = null;
  let ocrSelectArmTimer = null;
  let ocrSelectArmCleanup = null;
  let ocrCaptureHidden = [];

  const OCR_SELECT_MIN_PX = 20;

  function ocrSelectBoxFromDrag(drag) {
    const left = Math.min(drag.startX, drag.currentX);
    const top = Math.min(drag.startY, drag.currentY);
    const width = Math.abs(drag.currentX - drag.startX);
    const height = Math.abs(drag.currentY - drag.startY);
    return { left, top, width, height };
  }

  function updateOcrSelectRect(box) {
    if (!ocrSelectEl) return;
    const rect = ocrSelectEl.querySelector('.jp-ocr-select-rect');
    if (!rect) return;
    if (!box || box.width < 1 || box.height < 1) {
      rect.classList.remove('visible');
      return;
    }
    rect.style.left = `${box.left}px`;
    rect.style.top = `${box.top}px`;
    rect.style.width = `${box.width}px`;
    rect.style.height = `${box.height}px`;
    rect.classList.add('visible');
  }

  function setExtensionUiHiddenForCapture(hide) {
    const ids = [
      '#jp-study-fab',
      '#jp-study-popup',
      '#jp-study-ocr-overlay',
      '#jp-study-toast',
      '#jp-study-wheel',
      '#jp-study-ocr-select',
      '#jp-study-more-menu',
      '#jp-study-card-preview',
    ];
    if (hide) {
      ocrCaptureHidden = [];
      for (const sel of ids) {
        const el = document.querySelector(sel);
        if (!el) continue;
        ocrCaptureHidden.push({ el, display: el.style.display, visibility: el.style.visibility });
        el.style.visibility = 'hidden';
      }
      return;
    }
    for (const item of ocrCaptureHidden) {
      item.el.style.display = item.display;
      item.el.style.visibility = item.visibility;
    }
    ocrCaptureHidden = [];
  }

  function clearOcrSelectArmTimer() {
    if (ocrSelectArmTimer != null) {
      clearTimeout(ocrSelectArmTimer);
      ocrSelectArmTimer = null;
    }
  }

  function clearOcrSelectArmPending() {
    if (typeof ocrSelectArmCleanup === 'function') {
      const fn = ocrSelectArmCleanup;
      ocrSelectArmCleanup = null;
      fn();
    }
    clearOcrSelectArmTimer();
  }

  function cancelOcrRegionSelect(showToast) {
    if (!ocrSelectActive && !ocrSelectEl) return;
    clearOcrSelectArmPending();
    ocrSelectActive = false;
    ocrSelectArmed = false;
    ocrSelectDrag = null;
    ocrSelectPointerId = null;
    ocrSelectIgnorePointerId = null;
    document.documentElement.classList.remove('jp-study-ocr-selecting');
    if (ocrSelectEl) {
      ocrSelectEl.classList.remove('open');
      updateOcrSelectRect(null);
    }
    if (showToast) toast(uiMsg('content_ocrCancelled'), 'ok');
  }

  function armOcrRegionSelect() {
    if (!ocrSelectActive) return;
    ocrSelectArmed = true;
    ocrSelectIgnorePointerId = null;
    ocrSelectArmTimer = null;
  }

  /** Wait until the menu-activating pointer/click is fully done, then enable drag listeners. */
  function scheduleOcrSelectArm(activatingEvent) {
    clearOcrSelectArmPending();
    ocrSelectArmed = false;
    const ignoreId =
      activatingEvent && typeof activatingEvent.pointerId === 'number'
        ? activatingEvent.pointerId
        : null;
    ocrSelectIgnorePointerId = ignoreId;

    let done = false;
    const onPointerSettled = (e) => {
      if (ignoreId != null && e.pointerId !== ignoreId) return;
      finishArm();
    };
    const cleanup = () => {
      document.removeEventListener('pointerup', onPointerSettled, true);
      document.removeEventListener('pointercancel', onPointerSettled, true);
      clearOcrSelectArmTimer();
      if (ocrSelectArmCleanup === cleanup) ocrSelectArmCleanup = null;
    };
    const finishArm = () => {
      if (done || !ocrSelectActive) return;
      done = true;
      cleanup();
      // Two rAFs: past the current event stack and compatibility mouse/click events.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          armOcrRegionSelect();
        });
      });
    };

    ocrSelectArmCleanup = cleanup;
    document.addEventListener('pointerup', onPointerSettled, true);
    document.addEventListener('pointercancel', onPointerSettled, true);
    // The wheel selects OCR inside its own pointerup — that event will not
    // retrigger listeners added mid-dispatch — so always fall back to a short
    // timer that also clears past the following click.
    ocrSelectArmTimer = setTimeout(finishArm, 48);
  }

  function ensureOcrSelectOverlay() {
    if (ocrSelectEl) return ocrSelectEl;
    ocrSelectEl = document.createElement('div');
    ocrSelectEl.id = 'jp-study-ocr-select';
    ocrSelectEl.innerHTML = `
      <div class="jp-ocr-select-rect"></div>
      <div class="jp-ocr-select-hint">Drag a box around the text · Esc cancels</div>
    `;
    // Swallow events while unarmed so the menu click cannot fall through or finish a drag.
    ocrSelectEl.addEventListener('pointerdown', (e) => {
      if (!ocrSelectActive) return;
      e.preventDefault();
      e.stopPropagation();
      if (!ocrSelectArmed || e.button !== 0) return;
      if (ocrSelectIgnorePointerId != null && e.pointerId === ocrSelectIgnorePointerId) return;
      ocrSelectPointerId = e.pointerId;
      try {
        ocrSelectEl.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ocrSelectDrag = {
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      };
      updateOcrSelectRect(ocrSelectBoxFromDrag(ocrSelectDrag));
    });
    ocrSelectEl.addEventListener('pointermove', (e) => {
      if (!ocrSelectActive || !ocrSelectArmed || !ocrSelectDrag || ocrSelectPointerId !== e.pointerId) {
        if (ocrSelectActive) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      ocrSelectDrag.currentX = e.clientX;
      ocrSelectDrag.currentY = e.clientY;
      updateOcrSelectRect(ocrSelectBoxFromDrag(ocrSelectDrag));
    });
    ocrSelectEl.addEventListener('pointerup', (e) => {
      if (!ocrSelectActive) return;
      e.preventDefault();
      e.stopPropagation();
      if (!ocrSelectArmed || ocrSelectPointerId !== e.pointerId) return;
      try {
        ocrSelectEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ocrSelectPointerId = null;
      const drag = ocrSelectDrag;
      ocrSelectDrag = null;
      if (!drag) return;
      const box = ocrSelectBoxFromDrag(drag);
      if (box.width < OCR_SELECT_MIN_PX || box.height < OCR_SELECT_MIN_PX) {
        updateOcrSelectRect(null);
        toast(uiMsg('common_dragLarger'), 'err');
        return;
      }
      void finishOcrRegionSelect(box);
    });
    ocrSelectEl.addEventListener('pointercancel', (e) => {
      if (ocrSelectPointerId !== e.pointerId) return;
      ocrSelectPointerId = null;
      ocrSelectDrag = null;
      updateOcrSelectRect(null);
    });
    ocrSelectEl.addEventListener(
      'click',
      (e) => {
        if (!ocrSelectActive) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
    document.documentElement.appendChild(ocrSelectEl);
    return ocrSelectEl;
  }

  function startOcrRegionSelect(activatingEvent) {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    if (ocrOverlay) ocrOverlay.classList.remove('open');
    hidePopup();
    closeMoreMenu();
    ensureOcrSelectOverlay();
    ocrSelectActive = true;
    ocrSelectDrag = null;
    ocrSelectPointerId = null;
    document.documentElement.classList.add('jp-study-ocr-selecting');
    ocrSelectEl.classList.add('open');
    updateOcrSelectRect(null);
    scheduleOcrSelectArm(activatingEvent || null);
  }

  function viewportCssSize() {
    const vv = window.visualViewport;
    // captureVisibleTab matches the layout viewport; prefer innerWidth/Height.
    const iw = window.innerWidth || document.documentElement.clientWidth || 1;
    const ih = window.innerHeight || document.documentElement.clientHeight || 1;
    if (vv && Math.abs(vv.width - iw) < 2 && Math.abs(vv.height - ih) < 2) {
      return { width: vv.width, height: vv.height, offsetLeft: vv.offsetLeft || 0, offsetTop: vv.offsetTop || 0 };
    }
    return { width: iw, height: ih, offsetLeft: 0, offsetTop: 0 };
  }

  function finishOcrRegionSelect(box) {
    const vp = viewportCssSize();
    const region = {
      left: box.left - vp.offsetLeft,
      top: box.top - vp.offsetTop,
      width: box.width,
      height: box.height,
      viewportWidth: vp.width,
      viewportHeight: vp.height,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
    cancelOcrRegionSelect(false);
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    toast(uiMsg('content_runningOcr'), 'pending');
    setFabBusy(uiMsg('content_runningOcr'));
    void safeRuntimeSend({
      type: 'ocr',
      region,
      // The app picks the OCR engine from these: manga pages go to manga-ocr,
      // everything else to the general web engine seeded with this language.
      category: currentPageCategory(),
      langHint: currentLangHint(),
    }).then((res) => {
      setFabBusy('');
      if (res?.invalidated) return;
      if (res?.selecting) return;
      if (!res?.ok) toast(res?.error || uiMsg('content_ocrFailed'), 'err');
      showOcrResult(res);
    });
  }

  /** Heuristic page category, shared with the capture pipeline (shared.js). */
  function currentPageCategory() {
    try {
      if (typeof S.detectContentCategory === 'function') {
        return S.detectContentCategory(location.href, { title: document.title }) || '';
      }
    } catch {
      /* fall through — the app defaults to the general engine */
    }
    return '';
  }

  /**
   * Language hint for web OCR. Prefers the level badge (ja/zh), then page HTML
   * lang, then a short page-text script heuristic, then browser languages.
   * Russian never comes from level-estimate, so the script heuristic is what
   * seeds its model download. The app still probes recognisers when the hint
   * is missing or wrong.
   */
  function currentLangHint() {
    const el = document.getElementById('jp-study-level-badge');
    const badgeLang = (el && el.dataset && el.dataset.lang) || '';
    if (typeof S.detectPageLangHint === 'function') {
      try {
        const langs =
          typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
            ? navigator.languages.slice(0, 4)
            : [];
        return (
          S.detectPageLangHint({
            badgeLang,
            htmlLang: (document.documentElement && document.documentElement.lang) || '',
            navigatorLanguages: langs,
            sampleText: samplePageText(2400),
          }) || ''
        );
      } catch {
        /* fall through */
      }
    }
    return badgeLang === 'ja' || badgeLang === 'zh' || badgeLang === 'ru' ? badgeLang : '';
  }

  function ensureOcrOverlay() {
    if (ocrOverlay) return ocrOverlay;
    ocrOverlay = document.createElement('div');
    ocrOverlay.id = 'jp-study-ocr-overlay';
    ocrOverlay.setAttribute('role', 'dialog');
    ocrOverlay.setAttribute('aria-label', uiMsg('content_ocrLabel'));
    ocrOverlay.innerHTML = `
      <div class="jp-ocr-head">
        <h3>${uiHtml('content_ocrLabel')}</h3>
        <button type="button" class="rp-icon" data-act="close" aria-label="${uiHtml('content_close')}">×</button>
      </div>
      <textarea class="jp-ocr-body" lang="ja" rows="4" aria-label="${uiHtml('content_ocrText')}"></textarea>
      <div class="jp-ocr-hint">${uiHtml('content_ocrHint')}</div>
      <div class="jp-actions">
        <button type="button" class="rp-act rp-primary" data-act="analyze">${uiHtml('content_ocrAnalyze')}</button>
        <button type="button" class="rp-act" data-act="lookup">${uiHtml('content_ocrLookUp')}</button>
        <button type="button" class="rp-act" data-act="save">${uiHtml('content_ocrSave')}</button>
        <button type="button" class="rp-act" data-act="retry">${uiHtml('content_ocrReselect')}</button>
      </div>
    `;
    ocrOverlay.addEventListener('mousedown', (e) => e.stopPropagation());
    ocrOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      const text = (ocrOverlay.querySelector('.jp-ocr-body').value || '').trim();
      if (act === 'close') {
        ocrOverlay.classList.remove('open');
        return;
      }
      if (act === 'retry') {
        ocrOverlay.classList.remove('open');
        startOcrRegionSelect(e);
        return;
      }
      if (!text) return;
      if (act === 'analyze') {
        // Read from the textarea, not the raw OCR result — the reader may have
        // just fixed a misrecognized character, and analyzing the uncorrected
        // text would explain a sentence that was never on screen.
        ocrOverlay.classList.remove('open');
        void runSentenceAnalysis(text, { anchorY: 80, context: document.title || '' });
      } else if (act === 'lookup') {
        ocrOverlay.classList.remove('open');
        void lookupText(text, window.innerWidth / 2, 120);
      } else if (act === 'save') {
        void doSave(text, 'auto', false);
      }
    });
    bindOcrBodyLookup(ocrOverlay.querySelector('.jp-ocr-body'));
    document.documentElement.appendChild(ocrOverlay);
    return ocrOverlay;
  }

  /**
   * Word lookup inside the OCR result.
   *
   * The result stays an editable textarea (recognition is never perfect and
   * fixing a character before saving matters), so words cannot be wrapped in
   * clickable spans. Double-click and drag-select are used instead — both are
   * the gestures that already mean "this word" in a text field, and neither
   * steals the plain click that positions the caret for editing.
   */
  function bindOcrBodyLookup(ta) {
    if (!ta || ta.dataset.jpLookupBound === '1') return;
    ta.dataset.jpLookupBound = '1';

    const lookupAtCaret = (e) => {
      const value = ta.value || '';
      if (!value.trim()) return;
      const selected = value.slice(ta.selectionStart, ta.selectionEnd).trim();
      // An explicit selection wins. Otherwise read forward from the caret and
      // let prefixLookup pick the longest dictionary match, which is how the
      // in-page dictionary behaves on CJK text with no word spacing.
      const query = selected || value.slice(ta.selectionStart, ta.selectionStart + 16).trim();
      if (!query) return;
      e.stopPropagation();
      void lookupText(query, e.clientX, e.clientY);
    };

    ta.addEventListener('dblclick', lookupAtCaret);
    ta.addEventListener('mouseup', (e) => {
      // Only a real drag-selection; a bare click is caret placement.
      if (ta.selectionEnd > ta.selectionStart) lookupAtCaret(e);
    });
  }

  function showOcrResult(res) {
    const el = ensureOcrOverlay();
    const body = el.querySelector('.jp-ocr-body');
    const hint = el.querySelector('.jp-ocr-hint');
    if (!res?.ok) {
      body.value = '';
      hint.textContent =
        res?.error ||
        (res?.available === false
          ? uiMsg('content_ocrNoModels')
          : uiMsg('content_ocrFailed'));
      el.classList.add('open');
      return;
    }
    body.value = (res.text || '').trim();
    hint.textContent = body.value
      ? uiMsg('content_ocrReadHint', describeOcrEngine(res))
      : uiMsg('content_ocrNothing');
    el.classList.add('open');
    // AI OCR mode analyses the read straight away. The overlay still opens first
    // so the recognized text — and the chance to correct it — stays reachable
    // behind the panel rather than being skipped.
    if (cfg.aiOnOcr && body.value) {
      el.classList.remove('open');
      void runSentenceAnalysis(body.value, { anchorY: 80, context: document.title || '' });
    }
  }

  /** Which engine and language actually read the capture — confirms auto-detection. */
  function describeOcrEngine(res) {
    if (res?.engine === 'manga-ocr') return uiMsg('content_ocrEngineManga');
    const names = { ja: 'content_langName_ja', zh: 'content_langName_zh', ru: 'content_langName_ru' };
    const lang = names[res?.lang];
    return lang ? uiMsg('content_ocrEngineLang', uiMsg(lang)) : uiMsg('content_ocrEngineWeb');
  }

  /* --------------------------- AI sentence analysis -------------------------- */
  //
  // The extension's half of "AI OCR / Dictionary AI". The app owns the prompt,
  // the preferences and the cache; this owns the panel, the gestures that open
  // it, and the keyboard. Annotations arrive already aligned (start/end are
  // offsets into `result.sentence`), so rendering is a straight walk — the
  // extension never tries to locate spans itself, which is what keeps the
  // highlight identical to the one the desktop app draws.

  /**
   * State for the panel. `renderAiAnalysis` hands this straight to
   * `S.aiPanelHtml`, so the markup lives in shared.js where it can be tested in
   * a sandbox without a browser (src/shared/__tests__/analysisPanelRender.test.ts).
   */
  let aiPanel = null;
  let aiState = null;
  let aiKeyHandler = null;
  let aiRequestToken = 0;

  /** Study language for the page, reusing the OCR language hint. */
  function aiStudyLang() {
    const hint = currentLangHint();
    return hint === 'zh' || hint === 'ru' ? hint : 'ja';
  }

  function aiUiLang() {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return ['en', 'ja', 'zh', 'ru'].includes(nav) ? nav : 'en';
  }

  /**
   * Is this selection a sentence worth a cloud call, or a word the offline
   * dictionary answers instantly and for free? Length is the only signal
   * available before the call, so it is the one the user gets to tune.
   */
  function aiWantsSelection(text) {
    return !!cfg.aiOnHighlight && String(text || '').trim().length >= (cfg.aiMinChars || 6);
  }

  function ensureAiPanel() {
    if (aiPanel) return aiPanel;
    aiPanel = document.createElement('div');
    aiPanel.id = 'jp-study-ai';
    aiPanel.setAttribute('role', 'dialog');
    aiPanel.setAttribute('aria-label', uiMsg('content_aiLabel'));
    aiPanel.innerHTML = `
      <div class="ai-head">
        <span class="ai-title">${uiHtml('content_aiTitle')}</span>
        <button type="button" class="rp-icon" data-act="reanalyze" title="${uiHtml('content_aiReanalyze')}" aria-label="${uiHtml('content_aiReanalyze')}">\u21bb</button>
        <button type="button" class="rp-icon" data-act="close" aria-label="${uiHtml('content_close')}">\u00d7</button>
      </div>
      <div class="ai-body"></div>`;
    aiPanel.addEventListener('mousedown', (e) => e.stopPropagation());
    aiPanel.addEventListener('click', onAiPanelClick);
    document.documentElement.appendChild(aiPanel);
    return aiPanel;
  }

  function onAiPanelClick(e) {
    e.stopPropagation();
    const seg = e.target.closest('.ai-seg');
    if (seg) {
      aiSelectSegment(Number(seg.dataset.index));
      return;
    }
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'close') closeAiPanel();
    else if (act) aiRunCommand(act);
  }

  function closeAiPanel() {
    if (aiPanel) aiPanel.classList.remove('open');
    aiState = null;
    if (aiKeyHandler) {
      window.removeEventListener('keydown', aiKeyHandler, true);
      aiKeyHandler = null;
    }
  }

  /**
   * Bind the keyboard while the panel is open.
   *
   * Capture phase and only unmodified keys: the page underneath keeps every
   * chord it had, and a single letter never fires while the reader is typing in
   * a field \u2014 which on a web page can be almost anything, hence the guard.
   */
  function bindAiKeys() {
    if (aiKeyHandler) return;
    aiKeyHandler = (e) => {
      if (!aiState) return;
      if (S.aiIsTextEntry && S.aiIsTextEntry(e.target)) return;
      const command = S.aiCommandForKey ? S.aiCommandForKey(e) : null;
      if (!command) return;
      if (aiRunCommand(command)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', aiKeyHandler, true);
  }

  function aiRunCommand(command) {
    if (!aiState) return false;
    const { result } = aiState;
    const count = result && result.annotations ? result.annotations.length : 0;
    if (command && typeof command === 'object' && command.select != null) {
      if (command.select >= count) return false;
      aiSelectSegment(command.select);
      return true;
    }
    const active = count ? result.annotations[aiState.selected] : null;
    switch (command) {
      case 'close':
        closeAiPanel();
        return true;
      case 'next':
        if (!count) return false;
        aiSelectSegment((aiState.selected + 1) % count);
        return true;
      case 'prev':
        if (!count) return false;
        aiSelectSegment((aiState.selected - 1 + count) % count);
        return true;
      case 'translations':
        aiState.showTranslations = !aiState.showTranslations;
        renderAiAnalysis();
        return true;
      case 'reanalyze':
        void runSentenceAnalysis(aiState.text, { force: true });
        return true;
      case 'copy': {
        if (!active) return false;
        const parts = [
          active.headword || active.text,
          active.meaning,
          active.explanation,
          result.sentence,
        ];
        void navigator.clipboard?.writeText(parts.filter(Boolean).join('\n'));
        toast(uiMsg('content_copied'));
        return true;
      }
      case 'listen': {
        const text = active ? active.text : result.sentence;
        try {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = aiState.lang === 'zh' ? 'zh-CN' : aiState.lang === 'ru' ? 'ru-RU' : 'ja-JP';
          speechSynthesis.cancel();
          speechSynthesis.speak(utter);
        } catch {
          toast(uiMsg('content_speechUnavailable'), 'err');
        }
        return true;
      }
      case 'dictionary':
        if (!active) return false;
        void lookupText(active.text, window.innerWidth / 2, 140);
        return true;
      case 'mine':
        if (!active) return false;
        void aiMine(aiState.selected, undefined);
        return true;
      case 'saveSentence':
        void aiMine(aiState.selected, 'sentence');
        return true;
      case 'snapshot':
        void aiSnapshot();
        return true;
      default:
        return false;
    }
  }

  async function aiMine(index, cardKind) {
    if (!aiState || !aiState.result) return;
    aiState.mine = 'busy';
    renderAiAnalysis();
    const res = await safeRuntimeSend({
      type: 'sentence-analysis-mine',
      result: aiState.result,
      annotationIndex: index,
      cardKind,
      lang: aiState.lang,
      uiLang: aiState.uiLang,
    });
    // A duplicate means the card the reader wanted is already in Anki, which is
    // the outcome they asked for \u2014 reporting it as a failure would be wrong.
    aiState.mine = res && (res.ok || res.error === 'duplicate') ? 'done' : 'error';
    renderAiAnalysis();
    if (aiState.mine === 'error') toast((res && res.error) || uiMsg('content_cardAddFailed'), 'err');
  }

  async function aiSnapshot() {
    if (!aiState || !aiState.result) return;
    aiState.snapshot = 'busy';
    renderAiAnalysis();
    const res = await safeRuntimeSend({
      type: 'sentence-analysis-snapshot',
      result: aiState.result,
      lang: aiState.lang,
      sourceLabel: uiMsg('content_aiCapturedFrom', document.title || location.hostname),
    });
    aiState.snapshot = res && res.ok ? 'done' : 'error';
    renderAiAnalysis();
    if (aiState.snapshot === 'error') toast((res && res.error) || uiMsg('content_snapshotFailed'), 'err');
  }

  function aiSelectSegment(index) {
    if (!aiState || !Number.isFinite(index)) return;
    aiState.selected = index;
    // Each span has its own action outcomes; carrying "Added" across to the next
    // word would claim a card that was never made.
    aiState.mine = 'idle';
    renderAiAnalysis();
  }

  /** Position the panel so it never covers the selection it is explaining. */
  function positionAiPanel(anchorY) {
    const el = ensureAiPanel();
    const pad = 12;
    const width = Math.min(560, window.innerWidth - pad * 2);
    el.style.width = `${width}px`;
    el.style.left = `${Math.max(pad, (window.innerWidth - width) / 2)}px`;
    const top = Math.max(pad, Math.min(typeof anchorY === 'number' ? anchorY + 24 : 80, window.innerHeight - 160));
    el.style.top = `${top}px`;
    el.style.maxHeight = `${window.innerHeight - top - pad}px`;
  }

  function renderAiAnalysis() {
    if (!aiState) return;
    const el = ensureAiPanel();
    el.querySelector('.ai-body').innerHTML = S.aiPanelHtml ? S.aiPanelHtml(aiState) : '';
  }

  /**
   * Analyze `text` and show the panel.
   *
   * The token guard matters more here than in the app: a reader drag-selecting
   * their way down a page fires this repeatedly, and an earlier, slower response
   * landing last would replace the sentence they are actually looking at.
   */
  async function runSentenceAnalysis(text, opts = {}) {
    const value = String(text || '').trim();
    if (!value) {
      toast(uiMsg('content_selectSentence'), 'err');
      return;
    }
    if (!isExtensionAlive()) {
      markExtensionDead();
      return;
    }
    hidePopup();
    const token = ++aiRequestToken;
    aiState = {
      text: value,
      lang: aiStudyLang(),
      uiLang: aiUiLang(),
      status: 'loading',
      selected: 0,
      showTranslations: false,
      mine: 'idle',
      snapshot: 'idle',
      result: null,
      error: '',
    };
    positionAiPanel(opts.anchorY);
    ensureAiPanel().classList.add('open');
    bindAiKeys();
    renderAiAnalysis();

    const res = await safeRuntimeSend({
      type: 'sentence-analysis',
      text: value,
      lang: aiState.lang,
      explainIn: aiState.uiLang,
      context: opts.context || '',
    });
    if (token !== aiRequestToken || !aiState) return;
    if (res && res.ok && res.result) {
      aiState.status = 'ready';
      aiState.result = res.result;
    } else {
      aiState.status = 'error';
      const rawErr = (res && res.error) || '';
      aiState.error =
        (res && res.needsKey
          ? uiMsg('content_aiNeedsKey')
          : res && res.needsLocalModel
            ? uiMsg('content_aiNeedsLocal')
            : rawErr === 'Not found'
              ? uiMsg('content_aiOutdated')
              : rawErr) || uiMsg('content_aiFailed');
    }
    renderAiAnalysis();
  }

  /* ------------------------------ message wiring ---------------------------- */

  document.addEventListener('pointerdown', onGlobalPointerDown, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('mousemove', onHoverMove, true);
  window.addEventListener('blur', onWindowBlur);

  runtimeMessageListener = (msg, _sender, sendResponse) => {
    if (!isExtensionAlive()) {
      markExtensionDead();
      return false;
    }
    if (msg?.type === 'jp-ping') {
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-get-save-payload' || msg?.type === 'jp-get-mine-payload') {
      sendResponse(getSavePayload());
      return true;
    }
    if (msg?.type === 'jp-get-audio-clipboard') {
      sendResponse({
        ok: !!audioClipboardDataUrl,
        dataUrl: audioClipboardDataUrl || '',
        mimeType: audioClipboardMime,
        recording,
      });
      return true;
    }
    if (msg?.type === 'jp-toast') {
      toast(String(msg.message || ''), msg.kind === 'err' ? 'err' : msg.kind === 'ok' ? 'ok' : undefined, msg.action);
      sendResponse({ ok: true });
      return true;
    }
    // AI analysis of whatever is selected, regardless of the highlight mode —
    // the command and the context-menu entry are the explicit ask, so they do
    // not consult cfg.aiOnHighlight the way a bare drag-select does.
    if (msg?.type === 'jp-analyze-selection') {
      const text = String(msg.text || '').trim() || getSavePayload().text;
      if (!text) toast(uiMsg('content_selectSentence'), 'err');
      else void runSentenceAnalysis(text, { anchorY: lastHoverPoint.y || 80, context: document.title || '' });
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-lookup-selection' || msg?.type === 'jp-dictionary') {
      const text = String(msg.text || '').trim() || getSavePayload().text;
      if (!text) {
        toast(uiMsg('content_selectOrHover'), 'err');
      } else {
        void lookupText(text, lastHoverPoint.x || window.innerWidth / 2, lastHoverPoint.y || 120);
      }
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-grammar') {
      const text = String(msg.text || '').trim() || getSavePayload().text;
      if (text) void lookupText(text, lastHoverPoint.x, lastHoverPoint.y);
      else toast(uiMsg('content_selectSentence'), 'err');
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-translate') {
      void runLocalOrRemoteCommand('translate.selection');
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-action-wheel') {
      void openActionWheel(
        lastHoverPoint.x || window.innerWidth / 2,
        lastHoverPoint.y || Math.min(240, window.innerHeight / 2),
      );
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-more-menu') {
      openMoreMenu(lastHoverPoint.x || window.innerWidth / 2, lastHoverPoint.y || 160);
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-toggle-theme') {
      sendResponse({ ok: true, theme: cycleTheme() });
      return true;
    }
    if (msg?.type === 'jp-highlight-mode-toggle') {
      toggleHighlightMode();
      sendResponse({ ok: true, on: highlightMode });
      return true;
    }
    if (msg?.type === 'jp-highlight-mode') {
      highlightMode = !!msg.on;
      document.documentElement.classList.toggle('jp-study-hl-mode', highlightMode);
      safeStorageSet({ [`jpHlMode:${location.origin}`]: highlightMode });
      updateFab();
      sendResponse({ ok: true, on: highlightMode });
      return true;
    }
    if (msg?.type === 'jp-learning-toggle') {
      toggleLearning();
      sendResponse({ ok: true, on: learningOn });
      return true;
    }
    if (msg?.type === 'jp-record-toggle') {
      void toggleRecording();
      sendResponse({ ok: true, recording });
      return true;
    }
    if (msg?.type === 'jp-show-fab') {
      cfg.fabVisible = true;
      cfg.fabHiddenOrigins = (cfg.fabHiddenOrigins || []).filter((o) => o !== location.origin);
      void safeStorageGet(['jpStudySettings']).then((data) => {
        const raw = data.jpStudySettings || {};
        void safeStorageSet({
          jpStudySettings: { ...raw, fabVisible: true, fabHiddenOrigins: cfg.fabHiddenOrigins },
        });
      });
      fabCollapsed = false;
      rebuildFab();
      updateFab();
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-show-ocr') {
      showOcrResult(msg.result || msg);
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-start-ocr-select') {
      startOcrRegionSelect();
      sendResponse({ ok: true, selecting: true });
      return true;
    }
    if (msg?.type === 'jp-ocr-prepare-capture') {
      setExtensionUiHiddenForCapture(true);
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-ocr-restore-capture') {
      setExtensionUiHiddenForCapture(false);
      sendResponse({ ok: true });
      return true;
    }
    if (msg?.type === 'jp-get-level-badge') {
      const el = document.getElementById('jp-study-level-badge');
      const badge = (el && el.textContent && el.textContent.trim()) || lastLevelBadge || '—';
      sendResponse({
        ok: true,
        badge,
        comprehensibility: lastCompPercent,
        offline: !!(el && el.dataset && el.dataset.offline === '1'),
        empty: !!(el && el.dataset && el.dataset.empty === '1'),
        lang: (el && el.dataset && el.dataset.lang) || '',
      });
      return true;
    }
    return false;
  };

  try {
    if (isExtensionAlive()) {
      chrome.runtime.onMessage.addListener(runtimeMessageListener);
    }
  } catch (err) {
    if (isContextInvalidatedError(err)) markExtensionDead();
  }

  if (isExtensionAlive()) {
    void loadCfg().then(() => {
      ensureFab();
      startLevelDetector();
      void loadTheme();
      void refreshComprehensibility();
    });
  }

  try {
    if (isExtensionAlive()) {
      storageChangeListener = (changes, area) => {
        if (!isExtensionAlive()) {
          markExtensionDead();
          return;
        }
        if (area !== 'local' || !changes.jpStudySettings) return;
        void loadCfg();
      };
      chrome.storage.onChanged.addListener(storageChangeListener);
    }
  } catch (err) {
    if (isContextInvalidatedError(err)) markExtensionDead();
  }
})();
