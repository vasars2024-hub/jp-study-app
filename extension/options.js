/* global chrome, jpStudyShared, jpStudySettings */

const SH = jpStudyShared;
const SET = jpStudySettings;
const t = (key, subs) => SH.msg(key, subs);
const tn = (key, count, subs) => SH.msgCount(key, count, subs);
SH.applyI18n(document);

const statusEl = document.getElementById('status');
let statusTimer = null;

function showStatus(text, cls) {
  statusEl.textContent = text || '';
  statusEl.className = 'show ' + (cls || '');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2600);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(res || { ok: false }));
  });
}

/* ------------------------------- navigation -------------------------------- */

const navEl = document.getElementById('nav');
const navButtons = [...navEl.querySelectorAll('button[data-pane]')];
const panes = [...document.querySelectorAll('section.pane')];

function activatePane(name) {
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.pane === name));
  panes.forEach((p) => p.classList.toggle('active', p.id === `pane-${name}`));
  try {
    history.replaceState(null, '', `#${name}`);
  } catch {
    /* ignore */
  }
}

navEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-pane]');
  if (btn) activatePane(btn.dataset.pane);
});

/* --------------------------------- search ---------------------------------- */

// Aliases so old terminology still finds the right place.
const SEARCH_ALIASES = {
  mine: 'saving',
  mining: 'saving',
  anki: 'saving connection',
  yt: 'media',
  youtube: 'media',
  download: 'media',
  wheel: 'wheel',
  slot: 'wheel',
  fab: 'panel',
  token: 'connection',
  pairing: 'connection',
  clipboard: 'connection',
  ocr: 'panel shortcuts',
  dictionary: 'lookup',
  shift: 'lookup',
};

const searchEmpty = document.getElementById('search-empty');
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    navButtons.forEach((b) => (b.hidden = false));
    searchEmpty.style.display = 'none';
    return;
  }
  const aliasHit = Object.keys(SEARCH_ALIASES).filter((k) => k.startsWith(q));
  const aliasPanes = aliasHit.flatMap((k) => SEARCH_ALIASES[k].split(' '));
  let any = false;
  let firstVisible = null;
  navButtons.forEach((b) => {
    const hay = `${b.textContent} ${b.dataset.keywords || ''}`.toLowerCase();
    const match = hay.includes(q) || aliasPanes.includes(b.dataset.pane);
    b.hidden = !match;
    if (match) {
      any = true;
      if (!firstVisible) firstVisible = b;
    }
  });
  searchEmpty.style.display = any ? 'none' : 'block';
  if (firstVisible) activatePane(firstVisible.dataset.pane);
});

/* ------------------------------ form plumbing ------------------------------- */

const $ = (id) => document.getElementById(id);

const RANGES = [
  ['hover-delay', 'hover-delay-val', (v) => t('opt_unitMs', v)],
  ['scan-length', 'scan-length-val', (v) => tn('opt_unitChars', Number(v))],
  ['ai-min-chars', 'ai-min-chars-val', (v) => tn('opt_unitChars', Number(v))],
  ['popup-width', 'popup-width-val', (v) => t('opt_unitPx', v)],
  ['popup-font', 'popup-font-val', (v) => t('opt_unitPx', v)],
];
for (const [id, valId, fmt] of RANGES) {
  $(id).addEventListener('input', () => {
    $(valId).textContent = fmt($(id).value);
  });
}

function readForm() {
  const dest = document.querySelector('input[name="dest"]:checked');
  return {
    token: $('token').value.trim(),
    port: Number($('port').value) || 18765,
    hoverLookup: $('hover-enabled').checked,
    hoverKey: $('hover-key').value,
    hoverDelayMs: Number($('hover-delay').value),
    scanLength: Number($('scan-length').value),
    closeOnRelease: $('close-on-release').checked,
    clickLookup: $('click-lookup').checked,
    lookupInEditable: $('lookup-editable').checked,
    aiOnHighlight: $('ai-on-highlight').checked,
    aiOnOcr: $('ai-on-ocr').checked,
    aiMinChars: Number($('ai-min-chars').value),
    popupWidth: Number($('popup-width').value),
    popupFontSize: Number($('popup-font').value),
    popupCompact: $('popup-compact').checked,
    popupPinOnClick: $('popup-pin-click').checked,
    saveDestination: dest ? dest.value : 'both',
    confirmBeforeCard: $('confirm-card').checked,
    folderLabel: $('folder-label').value.trim() || 'Extension',
    wheelEnabled: $('wheel-enabled').checked,
    wheelSlots: currentWheelSlots.slice(),
    fabVisible: $('fab-visible').checked,
    fabStartCollapsed: $('fab-collapsed').checked,
    fabCorner: $('fab-corner').value,
    fabShowLevel: $('fab-level').checked,
    fabShowComprehensibility: $('fab-comp').checked,
    fabShowTheme: $('fab-theme').checked,
    fabShowHighlight: $('fab-hl').checked,
    fabShowLearn: $('fab-learn').checked,
    fabShowOcr: $('fab-ocr').checked,
    youtubeMode: $('yt-mode').value,
    youtubeAudioOnly: $('yt-audio').checked,
    logImmersion: $('log-immersion').checked,
    notes: $('notes').value,
  };
}

let currentWheelSlots = SET.DEFAULT_WHEEL_SLOTS.slice();

function fillForm(s) {
  $('token').value = s.token || '';
  $('port').value = String(s.port || 18765);
  $('hover-enabled').checked = s.hoverLookup !== false;
  $('hover-key').value = s.hoverKey || 'shift';
  $('hover-delay').value = String(s.hoverDelayMs);
  $('scan-length').value = String(s.scanLength);
  $('close-on-release').checked = !!s.closeOnRelease;
  $('click-lookup').checked = s.clickLookup !== false;
  $('lookup-editable').checked = !!s.lookupInEditable;
  $('ai-on-highlight').checked = !!s.aiOnHighlight;
  $('ai-on-ocr').checked = !!s.aiOnOcr;
  $('ai-min-chars').value = String(s.aiMinChars ?? 6);
  $('popup-width').value = String(s.popupWidth);
  $('popup-font').value = String(s.popupFontSize);
  $('popup-compact').checked = !!s.popupCompact;
  $('popup-pin-click').checked = s.popupPinOnClick !== false;
  document.querySelectorAll('input[name="dest"]').forEach((r) => {
    r.checked = r.value === s.saveDestination;
  });
  refreshDestCards();
  $('confirm-card').checked = s.confirmBeforeCard !== false;
  $('folder-label').value = s.folderLabel || 'Extension';
  $('wheel-enabled').checked = s.wheelEnabled !== false;
  currentWheelSlots = s.wheelSlots.slice();
  renderWheelEditor();
  $('fab-visible').checked = s.fabVisible !== false;
  $('fab-collapsed').checked = !!s.fabStartCollapsed;
  $('fab-corner').value = s.fabCorner || 'bottom-right';
  $('fab-level').checked = s.fabShowLevel !== false;
  $('fab-comp').checked = s.fabShowComprehensibility !== false;
  $('fab-theme').checked = s.fabShowTheme !== false;
  $('fab-hl').checked = s.fabShowHighlight !== false;
  $('fab-learn').checked = s.fabShowLearn !== false;
  $('fab-ocr').checked = s.fabShowOcr !== false;
  $('yt-mode').value = s.youtubeMode || 'download';
  $('yt-audio').checked = !!s.youtubeAudioOnly;
  $('log-immersion').checked = s.logImmersion !== false;
  $('notes').value = s.notes || '';
  for (const [id, valId, fmt] of RANGES) $(valId).textContent = fmt($(id).value);
}

function refreshDestCards() {
  document.querySelectorAll('.radio-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('selected', input && input.checked);
  });
}

document.getElementById('dest-group').addEventListener('change', () => {
  refreshDestCards();
  void autoSave();
});

/* ------------------------------- wheel editor ------------------------------- */

const POSITION_LABELS = {
  top: 'opt_posTop',
  'upper-right': 'opt_posUpperRight',
  'lower-right': 'opt_posLowerRight',
  bottom: 'opt_posBottom',
  'lower-left': 'opt_posLowerLeft',
  'upper-left': 'opt_posUpperLeft',
};

function renderWheelEditor() {
  const host = $('wheel-positions');
  host.innerHTML = '';
  const commands = SH.wheelAssignableCommands();
  SET.WHEEL_POSITIONS.forEach((pos, i) => {
    const row = document.createElement('div');
    row.className = 'wheel-pos';
    const lab = document.createElement('span');
    const posLabel = POSITION_LABELS[pos] ? t(POSITION_LABELS[pos]) : pos;
    lab.textContent = posLabel;
    const sel = document.createElement('select');
    sel.dataset.index = String(i);
    sel.setAttribute('aria-label', t('opt_posAria', posLabel));
    for (const c of commands) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      if (currentWheelSlots[i] === c.id) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.index);
      const chosen = sel.value;
      const existingIdx = currentWheelSlots.findIndex((id, j) => id === chosen && j !== idx);
      if (existingIdx >= 0) {
        // Swap so every command appears at most once.
        currentWheelSlots[existingIdx] = currentWheelSlots[idx];
      }
      currentWheelSlots[idx] = chosen;
      renderWheelEditor();
      void autoSave();
    });
    row.appendChild(lab);
    row.appendChild(sel);
    host.appendChild(row);
  });
  renderWheelPreview();
}

function renderWheelPreview() {
  const pv = $('wheel-preview');
  pv.innerHTML = '';
  const center = document.createElement('div');
  center.className = 'pv-center';
  center.textContent = t('common_cancel');
  pv.appendChild(center);
  const n = 6;
  const slice = 360 / n;
  currentWheelSlots.slice(0, 6).forEach((id, i) => {
    const cmd = SH.getCommand(id);
    const el = document.createElement('span');
    el.className = 'pv-slice';
    el.textContent = cmd ? cmd.shortLabel : id;
    const mid = -90 + slice * i + slice / 2;
    const rad = (mid * Math.PI) / 180;
    const r = 78;
    el.style.transform = `translate(calc(${Math.cos(rad) * r}px - 50%), calc(${Math.sin(rad) * r}px - 50%))`;
    pv.appendChild(el);
  });
}

/* -------------------------------- shortcuts -------------------------------- */

async function renderShortcuts() {
  const res = await bg({ type: 'get-commands' });
  const table = $('shortcut-table');
  if (!res?.ok || !Array.isArray(res.commands)) {
    table.innerHTML = `<tr><td>${escapeHtml(t('opt_shortcutsFailed'))}</td></tr>`;
    return;
  }
  // Chrome hands back each command's manifest description already resolved
  // from _locales, so a named row only needs its own short title.
  const NAMES = {
    'save-page': 'opt_scSavePage',
    'dictionary-popup': 'opt_scLookup',
    'mine-selection': 'opt_scSaveSelection',
    'action-wheel': 'opt_scWheel',
    'bulk-tabs': 'opt_scBulkTabs',
    _execute_action: 'opt_scToolbarPopup',
  };
  table.innerHTML = res.commands
    .map((c) => {
      const name = NAMES[c.name] ? t(NAMES[c.name]) : c.description || c.name;
      const desc = c.description && name !== c.description ? c.description : '';
      return `<tr>
        <td><div>${escapeHtml(name)}</div><div class="cmd-desc">${escapeHtml(desc)}</div></td>
        <td>${c.shortcut ? `<kbd>${escapeHtml(c.shortcut)}</kbd>` : `<span class="cmd-desc">${escapeHtml(t('opt_scNotSet'))}</span>`}</td>
      </tr>`;
    })
    .join('');
}

document.getElementById('open-shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

/* ------------------------------- connection -------------------------------- */

async function testConnection(silent) {
  const state = $('conn-state');
  const f = readForm();
  try {
    const res = await fetch(`http://127.0.0.1:${f.port}/v1/health`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.textContent = t('opt_connReachable');
    state.className = 'conn-state ok';
    if (!silent) showStatus(t('opt_statusReachable'), 'ok');
    return true;
  } catch {
    state.textContent = t('opt_connNotRunning');
    state.className = 'conn-state err';
    if (!silent) showStatus(t('opt_statusNotRunning'), 'err');
    return false;
  }
}

document.getElementById('save-pair').addEventListener('click', async () => {
  const f = readForm();
  await SET.save({ token: f.token, port: f.port });
  showStatus(t('opt_statusPairSaved'), 'ok');
  void testConnection(true);
});

document.getElementById('test').addEventListener('click', async () => {
  const f = readForm();
  await SET.save({ token: f.token, port: f.port });
  void testConnection(false);
});

document.getElementById('pull-app').addEventListener('click', async () => {
  const f = readForm();
  try {
    const res = await fetch(`http://127.0.0.1:${f.port}/v1/extension-settings`, {
      headers: f.token ? { Authorization: `Bearer ${f.token}` } : {},
    });
    if (res.status === 401) {
      showStatus(t('opt_statusPullNeedsPairNow'), 'err');
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data?.token) {
      $('token').value = data.token;
      if (data.port) $('port').value = String(data.port);
      await SET.save({ token: data.token, port: Number(data.port) || f.port });
      showStatus(t('opt_statusPulled'), 'ok');
      void testConnection(true);
    } else {
      showStatus(t('opt_statusPullNoToken'), 'err');
    }
  } catch {
    showStatus(t('opt_statusPullFailed'), 'err');
  }
});

document.querySelectorAll('button[data-open]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = btn.dataset.open;
    const res = await bg({ type: 'ui-open', target });
    showStatus(
      res?.ok ? t('opt_statusOpened') : res?.error || t('common_gumNotRunning'),
      res?.ok ? 'ok' : 'err',
    );
  });
});

/* ------------------------------ import / export ----------------------------- */

/**
 * The export's file name. It said `grammarx-…` (the app's old name) until
 * 3.2.x; import reads the JSON and never looks at the name, so files exported
 * under the old name still import.
 */
const EXPORT_FILENAME = 'gum-extension-settings.json';

document.getElementById('export-settings').addEventListener('click', async () => {
  const s = await SET.load();
  const redacted = { ...s };
  delete redacted.token; // never export the pairing secret
  const blob = new Blob([JSON.stringify(redacted, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = EXPORT_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
  showStatus(t('opt_statusExported'), 'ok');
});

document.getElementById('import-settings').addEventListener('click', () => {
  $('import-file').click();
});

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') throw new Error('not an object');
    const cur = await SET.load();
    const next = await SET.save({ ...raw, token: cur.token, port: raw.port || cur.port });
    fillForm(next);
    showStatus(t('opt_statusImported'), 'ok');
  } catch {
    showStatus(t('opt_statusImportFailed'), 'err');
  } finally {
    e.target.value = '';
  }
});

document.getElementById('reset-settings').addEventListener('click', async () => {
  const cur = await SET.load();
  const next = await SET.save({
    ...SET.DEFAULTS,
    token: cur.token,
    port: cur.port,
    wheelSlots: SET.DEFAULT_WHEEL_SLOTS.slice(),
    fabHiddenOrigins: [],
  });
  fillForm(next);
  showStatus(t('opt_statusReset'), 'ok');
});

document.getElementById('fab-clear-hidden').addEventListener('click', async () => {
  await SET.save({ fabHiddenOrigins: [] });
  showStatus(t('opt_statusPanelRestored'), 'ok');
});

/* -------------------------------- auto-save --------------------------------- */

let saveTimer = null;
async function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await SET.save(readForm());
    showStatus(t('opt_statusSaved'), 'ok');
  }, 250);
}

// Every control auto-saves; pairing fields save via their explicit buttons too.
for (const el of document.querySelectorAll('main input, main select, main textarea')) {
  if (el.id === 'import-file') continue;
  el.addEventListener('change', () => void autoSave());
}

/* ---------------------------------- init ------------------------------------ */

void (async () => {
  fillForm(await SET.load());
  const initial = (location.hash || '').replace('#', '');
  activatePane(
    navButtons.some((b) => b.dataset.pane === initial) ? initial : 'lookup',
  );
  void renderShortcuts();
  void testConnection(true);
})();
