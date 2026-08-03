/* global chrome, jpStudyShared, jpStudySettings */

const SH = jpStudyShared;
const SET = jpStudySettings;

const statusEl = document.getElementById('status');
let statusTimer = null;

function showStatus(text, cls) {
  statusEl.textContent = text || '';
  statusEl.className = 'show ' + (cls || '');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2600);
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
  ['hover-delay', 'hover-delay-val', (v) => `${v} ms`],
  ['scan-length', 'scan-length-val', (v) => `${v} chars`],
  ['ai-min-chars', 'ai-min-chars-val', (v) => `${v} chars`],
  ['popup-width', 'popup-width-val', (v) => `${v} px`],
  ['popup-font', 'popup-font-val', (v) => `${v} px`],
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
  top: 'Top',
  'upper-right': 'Upper right',
  'lower-right': 'Lower right',
  bottom: 'Bottom',
  'lower-left': 'Lower left',
  'upper-left': 'Upper left',
};

function renderWheelEditor() {
  const host = $('wheel-positions');
  host.innerHTML = '';
  const commands = SH.wheelAssignableCommands();
  SET.WHEEL_POSITIONS.forEach((pos, i) => {
    const row = document.createElement('div');
    row.className = 'wheel-pos';
    const lab = document.createElement('span');
    lab.textContent = POSITION_LABELS[pos] || pos;
    const sel = document.createElement('select');
    sel.dataset.index = String(i);
    sel.setAttribute('aria-label', `Command for the ${POSITION_LABELS[pos] || pos} position`);
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
  pv.innerHTML = '<div class="pv-center">Cancel</div>';
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
    table.innerHTML = '<tr><td>Could not read browser shortcuts.</td></tr>';
    return;
  }
  const NAMES = {
    'save-page': 'Save page to GrammarX',
    'dictionary-popup': 'Look up selection / word under cursor',
    'mine-selection': 'Save selection (word or sentence)',
    'action-wheel': 'Open the action wheel',
    'bulk-tabs': 'Open the reading list',
    _execute_action: 'Open the toolbar popup',
  };
  table.innerHTML = res.commands
    .map((c) => {
      const name = NAMES[c.name] || c.description || c.name;
      return `<tr>
        <td><div>${name}</div><div class="cmd-desc">${c.description && NAMES[c.name] !== c.description ? c.description : ''}</div></td>
        <td>${c.shortcut ? `<kbd>${c.shortcut}</kbd>` : '<span class="cmd-desc">not set</span>'}</td>
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
    state.textContent = 'app reachable';
    state.className = 'conn-state ok';
    if (!silent) showStatus('GrammarX is reachable.', 'ok');
    return true;
  } catch {
    state.textContent = 'app not running';
    state.className = 'conn-state err';
    if (!silent) showStatus('GrammarX is not running or the port is wrong.', 'err');
    return false;
  }
}

document.getElementById('save-pair').addEventListener('click', async () => {
  const f = readForm();
  await SET.save({ token: f.token, port: f.port });
  showStatus('Pairing saved.', 'ok');
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
      showStatus('Need a valid token first — copy it from the app, save, then pull again.', 'err');
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data?.token) {
      $('token').value = data.token;
      if (data.port) $('port').value = String(data.port);
      await SET.save({ token: data.token, port: Number(data.port) || f.port });
      showStatus('Pulled pairing from the app.', 'ok');
      void testConnection(true);
    } else {
      showStatus('App responded but sent no token — copy it manually from Settings.', 'err');
    }
  } catch {
    showStatus('Could not pull — open GrammarX and paste the token manually.', 'err');
  }
});

document.querySelectorAll('button[data-open]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = btn.dataset.open;
    const res = await bg({ type: 'ui-open', target });
    showStatus(
      res?.ok ? 'Opened in GrammarX.' : res?.error || 'GrammarX is not running.',
      res?.ok ? 'ok' : 'err',
    );
  });
});

/* ------------------------------ import / export ----------------------------- */

document.getElementById('export-settings').addEventListener('click', async () => {
  const s = await SET.load();
  const redacted = { ...s };
  delete redacted.token; // never export the pairing secret
  const blob = new Blob([JSON.stringify(redacted, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grammarx-extension-settings.json';
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Settings exported (token excluded).', 'ok');
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
    showStatus('Settings imported.', 'ok');
  } catch {
    showStatus('Could not import — the file is not a valid settings export.', 'err');
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
  showStatus('Settings reset to defaults (pairing kept).', 'ok');
});

document.getElementById('fab-clear-hidden').addEventListener('click', async () => {
  await SET.save({ fabHiddenOrigins: [] });
  showStatus('The panel will show on all sites again.', 'ok');
});

/* -------------------------------- auto-save --------------------------------- */

let saveTimer = null;
async function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await SET.save(readForm());
    showStatus('Saved.', 'ok');
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
