/* global chrome */

const listEl = document.getElementById('tab-list');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const allWindowsEl = document.getElementById('all-windows');
const captureBtn = document.getElementById('capture');
const downloadBtn = document.getElementById('download');

/** @type {Array<{ id: number, title: string, url: string, favIconUrl: string, kind: string, category?: string, categoryLabel?: string, selectable: boolean }>} */
let tabs = [];
/** @type {Set<number>} */
const selected = new Set();
let busy = false;

function setStatus(text, cls) {
  statusEl.textContent = text || '';
  statusEl.className = cls || '';
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: 'No response' });
    });
  });
}

const CATEGORY_LABELS = {
  news: 'News',
  novel: 'Novel',
  manga: 'Manga',
  youtube: 'Video',
  article: 'Article',
  other: 'Webpage',
};

function categoryOf(tab) {
  const c = tab?.category;
  if (c && CATEGORY_LABELS[c]) return c;
  if (tab?.kind === 'youtube-video' || tab?.kind === 'youtube-playlist') return 'youtube';
  return 'other';
}

function categoryLabel(tab) {
  if (tab?.categoryLabel) return tab.categoryLabel;
  return CATEGORY_LABELS[categoryOf(tab)] || 'Webpage';
}

function isYt(kind) {
  return kind === 'youtube-video' || kind === 'youtube-playlist';
}

function updateChrome() {
  const n = selected.size;
  countEl.textContent = `${n} selected`;
  captureBtn.disabled = busy || n === 0;
  const ytSelected = [...selected].some((id) => {
    const t = tabs.find((x) => x.id === id);
    return t && isYt(t.kind);
  });
  downloadBtn.disabled = busy || !ytSelected;
}

function toggleTab(id, force) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab?.selectable) return;
  const on = force == null ? !selected.has(id) : !!force;
  if (on) selected.add(id);
  else selected.delete(id);
  const row = listEl.querySelector(`[data-tab-id="${id}"]`);
  if (row) {
    row.classList.toggle('selected', selected.has(id));
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selected.has(id);
  }
  updateChrome();
}

function renderList() {
  listEl.innerHTML = '';
  if (!tabs.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No tabs found in this scope.';
    listEl.appendChild(empty);
    updateChrome();
    return;
  }
  for (const tab of tabs) {
    const cat = categoryOf(tab);
    const row = document.createElement('div');
    row.className = 'tab-row cat-' + cat + (selected.has(tab.id) ? ' selected' : '');
    row.dataset.tabId = String(tab.id);
    row.dataset.category = cat;
    if (!tab.selectable) row.style.opacity = '0.45';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(tab.id);
    cb.disabled = !tab.selectable || busy;
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => toggleTab(tab.id, cb.checked));

    let fav;
    if (tab.favIconUrl && /^https?:/i.test(tab.favIconUrl)) {
      fav = document.createElement('img');
      fav.className = 'fav';
      fav.src = tab.favIconUrl;
      fav.alt = '';
      fav.referrerPolicy = 'no-referrer';
    } else {
      fav = document.createElement('span');
      fav.className = 'fav placeholder';
    }

    const meta = document.createElement('div');
    meta.className = 'tab-meta';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = tab.title || tab.url || `Tab ${tab.id}`;
    title.title = tab.title || '';
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = tab.url || '';
    url.title = tab.url || '';
    meta.appendChild(title);
    meta.appendChild(url);

    const badge = document.createElement('span');
    badge.className = 'cat-badge cat-' + cat;
    badge.textContent = categoryLabel(tab);
    badge.title = 'Detected source type (URL and title heuristics)';

    row.appendChild(cb);
    row.appendChild(fav);
    row.appendChild(meta);
    row.appendChild(badge);
    if (tab.selectable) {
      row.addEventListener('click', () => toggleTab(tab.id));
    }
    listEl.appendChild(row);
  }
  updateChrome();
}

async function refreshTabs() {
  setStatus('Loading tabs…');
  const res = await send({ type: 'list-tabs', allWindows: allWindowsEl.checked });
  if (!res?.ok) {
    setStatus(res?.error || 'Could not list tabs.', 'err');
    tabs = [];
    selected.clear();
    renderList();
    return;
  }
  tabs = Array.isArray(res.tabs) ? res.tabs : [];
  const valid = new Set(tabs.filter((t) => t.selectable).map((t) => t.id));
  for (const id of [...selected]) {
    if (!valid.has(id)) selected.delete(id);
  }
  renderList();
  setStatus(`${tabs.length} tab(s) · ${valid.size} can be saved`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBulk(action) {
  if (busy) return;
  let ids = [...selected];
  if (action === 'download') {
    ids = ids.filter((id) => {
      const t = tabs.find((x) => x.id === id);
      return t && isYt(t.kind);
    });
  }
  if (!ids.length) {
    setStatus(action === 'download' ? 'No YouTube tabs selected.' : 'Select at least one tab.', 'err');
    return;
  }

  busy = true;
  updateChrome();
  const labels = { capture: 'Saving', download: 'Queueing downloads' };
  let done = 0;
  let failures = 0;
  let queued = 0;
  const total = ids.length;

  for (const tabId of ids) {
    setStatus(`${labels[action] || 'Working'}… ${done + 1}/${total}` + (failures ? ` · ${failures} failed` : ''));
    const res = await send({ type: 'tab-action', action, tabId });
    done += 1;
    if (!res?.ok && !res?.queued) failures += 1;
    else if (res?.queued) queued += 1;
    if (done < total) await sleep(180);
  }

  busy = false;
  updateChrome();
  const queuedNote = queued ? ` (${queued} queued — will sync when GrammarX is open)` : '';
  if (failures === 0) {
    setStatus(`Done — ${done}/${total} saved${queuedNote}.`, 'ok');
  } else {
    setStatus(`Finished — ${done - failures}/${total} ok, ${failures} failed${queuedNote}.`, 'err');
  }
}

document.getElementById('select-all').addEventListener('click', () => {
  for (const t of tabs) {
    if (t.selectable) selected.add(t.id);
  }
  renderList();
});

document.getElementById('select-none').addEventListener('click', () => {
  selected.clear();
  renderList();
});

document.getElementById('refresh').addEventListener('click', () => void refreshTabs());
allWindowsEl.addEventListener('change', () => void refreshTabs());
captureBtn.addEventListener('click', () => void runBulk('capture'));
downloadBtn.addEventListener('click', () => void runBulk('download'));

void refreshTabs();
