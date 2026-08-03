/* global chrome */
/*
 * Static ES-module imports, not importScripts().
 *
 * MV3 only permits importScripts() during the service worker's initial
 * installation. Every later wake-from-idle re-runs this top-level code, and
 * importing a script the installed worker didn't already have throws
 * "importScripts() of new scripts after service worker installation is not
 * allowed" — which then surfaced as "S.resolveCommandId is not a function" on
 * every command. Static imports are resolved at worker startup, so they are
 * immune to that. Requires "type": "module" in the manifest background block.
 *
 * Both files are side-effect only: they publish onto globalThis
 * (jpStudyShared / jpStudySettings), so module scoping hides nothing. Import
 * order matters — settings.js reads globalThis.jpStudyShared.
 */
import './shared.js';
import './settings.js';

const S = globalThis.jpStudyShared || {};
if (!S.resolveCommandId) {
  console.error('[GrammarX] shared.js did not publish jpStudyShared in the service worker.');
}

/** Throw a diagnosable error instead of a bare TypeError when shared.js is missing. */
function assertSharedLoaded() {
  if (S.resolveCommandId) return;
  throw new Error('Extension scripts failed to load — reload GrammarX in chrome://extensions');
}
const SETTINGS = globalThis.jpStudySettings || null;
const DEFAULT_PORT = S.DEFAULT_PORT || 18765;
const QUEUE_KEY = 'jpStudyRetryQueue';
const TOKEN_KEY = 'jpStudyToken';
const PORT_KEY = 'jpStudyPort';
const ACTIVITY_KEY = 'jpRecentActivity';
const MAX_QUEUE = 40;
const MAX_ACTIVITY = 6;
const ALARM_FLUSH = 'jpStudyFlushQueue';

function baseUrl(port) {
  return `http://127.0.0.1:${port || DEFAULT_PORT}`;
}

async function getConfig() {
  const data = await chrome.storage.local.get([TOKEN_KEY, PORT_KEY]);
  return {
    token: typeof data[TOKEN_KEY] === 'string' ? data[TOKEN_KEY] : '',
    port: typeof data[PORT_KEY] === 'number' ? data[PORT_KEY] : DEFAULT_PORT,
  };
}

async function getSettings() {
  if (SETTINGS) return SETTINGS.load();
  const data = await chrome.storage.local.get(['jpStudySettings']);
  return data.jpStudySettings || {};
}

/**
 * Routes that older GrammarX builds lack — a bare 404 means restart/update the app.
 *
 * The boundary is load-bearing: unanchored, this also claimed any future
 * `/v1/sentence-analysis-v2` or `-batch` route, so a 404 from a genuinely missing
 * NEW endpoint would tell the user their app is out of date when it isn't. Match
 * the segment, then end / a sub-path / a query string.
 */
const APP_UPDATE_PATHS = /^\/v1\/sentence-analysis(?:[/?]|$)/;

const APP_OUTDATED_MSG =
  'GrammarX is outdated or not fully started — restart the app, then reload this extension.';

/** A reachable app that rejects our token. Waiting never fixes it; re-pairing does. */
const AUTH_FAILED_MSG =
  'GrammarX rejected this extension — re-pair it from the app\'s Companions settings.';

async function apiFetch(path, opts = {}) {
  const { token, port } = await getConfig();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${baseUrl(port)}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
    });
  } catch (err) {
    const offline = new Error('GrammarX is not running — open the app, then retry.');
    offline.status = 0;
    offline.offline = true;
    offline.cause = err;
    throw offline;
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const raw = (json && json.error) || `HTTP ${res.status}`;
    const message =
      res.status === 404 && APP_UPDATE_PATHS.test(path) ? APP_OUTDATED_MSG : raw;
    const err = new Error(message);
    err.status = res.status;
    err.offline = false;
    // A reachable app that refuses us is not the same condition as no app at all,
    // and it is never fixed by waiting — see shouldQueue.
    err.auth = res.status === 401 || res.status === 403;
    // "Invalid token" is accurate and tells the user nothing they can act on.
    // Swap in the instruction, but keep what the app actually said — the
    // handlers that report a message all read err.message, so this is the only
    // place the substitution can happen without touching every one of them.
    err.serverError = raw;
    if (err.auth) err.message = AUTH_FAILED_MSG;
    err.payload = json;
    throw err;
  }
  return json;
}

/* ------------------------------- retry queue ------------------------------ */

/**
 * Is this failure one that retrying can actually fix?
 *
 * Only an unreachable app is. Everything else — a bad pairing token, a rejected
 * payload, a route the app doesn't have — fails identically on every retry, so
 * queueing it means telling the user "saved, will sync" about something that
 * will never sync and never surfacing the reason. Those are reported instead.
 */
function shouldQueue(err) {
  return !!(err && err.offline);
}

/**
 * Is this failure worth ONE MORE try for something already in the queue?
 *
 * Deliberately wider than shouldQueue. At the save site the user is watching a
 * toast, so anything but a closed app is better reported than swallowed. Once an
 * item is in the queue nobody is watching, and we have already promised it will
 * sync — so a 5xx, which is the app failing at something it agreed to do (a
 * locked database, a model still warming up) and which does clear on its own,
 * buys a retry. A 4xx never clears, and neither does a rejected token.
 */
function shouldRetryQueued(err) {
  if (!err) return false;
  if (err.offline) return true;
  return !err.auth && Number(err.status) >= 500;
}

/**
 * Retries are bounded on two axes, because the two failure shapes differ:
 * an app left closed over a weekend is age, a payload the app keeps refusing is
 * attempts. Either bound alone lets the other run forever.
 *
 * The axes must not be crossed. `attempts` counts only the failures where the
 * app ANSWERED — the flush alarm runs once a minute, so counting offline retries
 * against a bound of 10 would empty the whole queue after ten minutes of a shut
 * app, which is the exact case the queue exists for. Age is that case's bound.
 */
const MAX_QUEUE_ATTEMPTS = 10;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function enqueue(kind, payload) {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  const queue = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
  queue.push({ kind, payload, at: Date.now(), attempts: 0 });
  while (queue.length > MAX_QUEUE) queue.shift();
  // chrome.storage.local is 10 MB and this manifest does not request
  // unlimitedStorage. A queued audio save carries a base64 data URL, so the
  // quota is reachable in normal use — and an unhandled rejection here loses
  // the save silently, which is the one outcome the queue exists to prevent.
  try {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  } catch (err) {
    const quota = new Error(
      'Local storage is full — open GrammarX to sync the queued items, then retry.',
    );
    quota.quota = true;
    quota.cause = err;
    throw quota;
  }
  await updateBadge(queue.length);
  await ensureFlushAlarm();
}

/**
 * Queue on a genuinely offline app; report anything else.
 *
 * Returns true when the item was queued, so callers can pick their success or
 * failure shape without re-testing the error themselves.
 */
async function enqueueIfRetryable(kind, payload, err) {
  if (!shouldQueue(err)) return false;
  await enqueue(kind, payload);
  return true;
}

async function updateBadge(count) {
  const text = count > 0 ? String(count) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#946300' });
}

async function ensureFlushAlarm() {
  try {
    await chrome.alarms.create(ALARM_FLUSH, { periodInMinutes: 1 });
  } catch {
    /* ignore */
  }
}

const QUEUE_ENDPOINTS = {
  inbox: '/v1/inbox',
  mine: '/v1/mine',
  capture: '/v1/capture',
  playlist: '/v1/playlist',
  video: '/v1/video',
  download: '/v1/download',
  clipboard: '/v1/clipboard',
  'audio-save': '/v1/audio/save',
  'manga-import': '/v1/manga-import',
  immersion: '/v1/immersion/visit',
};

async function flushQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  const queue = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
  if (!queue.length) return { flushed: 0, left: 0, dropped: 0 };
  const left = [];
  const dropped = [];
  let flushed = 0;
  const now = Date.now();
  for (const item of queue) {
    const endpoint = QUEUE_ENDPOINTS[item.kind];
    if (!endpoint) {
      // Unknown legacy kind — there is no endpoint left to replay it to. Counted
      // as a drop rather than skipped silently, so flushed + left + dropped adds
      // up to what went in and the popup can say so.
      dropped.push({ ...item, reason: 'unknown-kind' });
      continue;
    }
    // `at` has been written on every item since the queue existed and read by
    // nothing. An item older than the age bound is past the point where silently
    // retrying it is doing the user any favours. Backfill it for the items an
    // older build stored without one, so the bound covers those too.
    const at = typeof item.at === 'number' ? item.at : now;
    if (now - at > MAX_QUEUE_AGE_MS) {
      dropped.push({ ...item, reason: 'expired' });
      continue;
    }
    try {
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(item.payload) });
      flushed += 1;
    } catch (err) {
      // Only an answered failure counts against the attempt bound — see the
      // comment on MAX_QUEUE_ATTEMPTS.
      const attempts = (typeof item.attempts === 'number' ? item.attempts : 0) + (err.offline ? 0 : 1);
      if (!shouldRetryQueued(err)) {
        // The app answered and refused. Retrying is not going to change its mind.
        dropped.push({ ...item, attempts, reason: err.auth ? 'auth' : 'rejected' });
        continue;
      }
      if (attempts >= MAX_QUEUE_ATTEMPTS) {
        dropped.push({ ...item, attempts, reason: 'attempts' });
        continue;
      }
      left.push({ ...item, at, attempts });
    }
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: left });
  // A drop is the queue failing at its one job, so it goes in the activity list
  // the popup shows rather than vanishing into a console nobody has open.
  for (const item of dropped) {
    await recordActivity({ kind: item.kind, label: queueItemLabel(item), dropped: item.reason });
  }
  await updateBadge(left.length);
  return { flushed, left: left.length, dropped: dropped.length };
}

/** Best-effort human label for a queued item, for the activity list. */
function queueItemLabel(item) {
  const p = item && item.payload ? item.payload : {};
  const raw = p.text || p.title || p.url || item.kind || '';
  return String(raw).slice(0, 48);
}

async function queueCount() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  return Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY].length : 0;
}

/* ----------------------------- recent activity ---------------------------- */

async function recordActivity(entry) {
  try {
    const data = await chrome.storage.local.get(ACTIVITY_KEY);
    const list = Array.isArray(data[ACTIVITY_KEY]) ? data[ACTIVITY_KEY] : [];
    list.unshift({ ...entry, at: Date.now() });
    await chrome.storage.local.set({ [ACTIVITY_KEY]: list.slice(0, MAX_ACTIVITY) });
  } catch {
    /* non-fatal */
  }
}

/* ----------------------------- page capture ------------------------------- */

async function capturePage(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      title: document.title || '',
      url: location.href,
      html: document.documentElement.outerHTML,
      selection: String(window.getSelection() || ''),
    }),
  });
  return result;
}

async function smartCapture(tab) {
  if (!tab?.id) throw new Error('No active tab');
  const page = await capturePage(tab.id);
  const kind = S.detectPageKind(page.url);
  const action = S.primaryAction(kind);
  const openTarget = action === 'inbox' ? 'inbox' : 'youtube';
  const payload = {
    title: page.title,
    url: page.url,
    html: action === 'inbox' ? page.html : undefined,
    selection: page.selection || undefined,
    action: 'auto',
  };
  try {
    const out = await apiFetch('/v1/capture', { method: 'POST', body: JSON.stringify(payload) });
    await flushQueue();
    await recordActivity({ kind: 'page', label: page.title || page.url, action: out.action || action });
    return { ...out, kind, action: out.action || action, openTarget };
  } catch (err) {
    if (!(await enqueueIfRetryable('capture', payload, err))) throw err;
    await recordActivity({ kind: 'page', label: page.title || page.url, queued: true });
    return { ok: true, queued: true, kind, action, openTarget };
  }
}

async function downloadCurrent(tab) {
  if (!tab?.url) throw new Error('No active tab');
  const kind = S.detectPageKind(tab.url);
  if (kind !== 'youtube-video' && kind !== 'youtube-playlist') {
    throw new Error('Open a YouTube video or playlist tab first');
  }
  const settings = await getSettings();
  const payload = {
    url: tab.url,
    playlist: kind === 'youtube-playlist',
    audioOnly: !!settings.youtubeAudioOnly,
  };
  try {
    const out = await apiFetch('/v1/download', { method: 'POST', body: JSON.stringify(payload) });
    await recordActivity({ kind: 'download', label: tab.title || tab.url });
    return { ...out, kind, openTarget: 'youtube' };
  } catch (err) {
    await enqueueIfRetryable('download', payload, err);
    throw err;
  }
}

async function saveCurrent(tab) {
  if (!tab?.url) throw new Error('No active tab');
  const kind = S.detectPageKind(tab.url);
  const settings = await getSettings();
  if (
    (kind === 'youtube-video' || kind === 'youtube-playlist') &&
    settings.youtubeMode !== 'metadata'
  ) {
    return downloadCurrent(tab);
  }
  return smartCapture(tab);
}

/* -------------------------------- saving ---------------------------------- */

function saveQueuedResponse(payload, mode, text) {
  const term = String(text || payload.text || '').trim().slice(0, 40);
  return {
    ok: true,
    queued: true,
    mode: mode || 'word',
    term,
    localFolder: payload.folder || 'Extension',
    preferAnki: payload.preferAnki !== false,
    forceAnki: !!payload.forceAnki,
  };
}

/**
 * Save text to the GrammarX library, optionally creating an Anki card.
 * The bridge always keeps the GrammarX copy; `preferAnki` additionally
 * attempts an Anki card, `forceAnki` requires the attempt.
 */
async function saveText(tab, text, mode, opts = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Nothing selected to save');
  const settings = await getSettings();
  const resolved = mode === 'auto' || !mode ? S.classifyMineSelection(trimmed) : mode;
  const forceAnki = opts.forceAnki === true;
  const preferAnki = forceAnki || settings.saveDestination !== 'app';
  const pageUrl = tab?.url || '';
  const pageTitle = tab?.title || '';
  const payload = {
    text: trimmed,
    url: pageUrl,
    title: pageTitle,
    mode: resolved,
    folder: settings.folderLabel || 'Extension',
    category: S.detectContentCategory(pageUrl, { title: pageTitle }),
    preferAnki,
    forceAnki,
  };
  try {
    const out = await apiFetch('/v1/mine', { method: 'POST', body: JSON.stringify(payload) });
    await flushQueue();
    await recordActivity({
      kind: forceAnki ? 'card' : resolved === 'sentence' ? 'sentence' : 'word',
      label: trimmed.slice(0, 48),
      anki: !!(out && out.anki && out.anki.ok),
    });
    return out;
  } catch (err) {
    if (!(await enqueueIfRetryable('mine', payload, err))) throw err;
    await recordActivity({
      kind: forceAnki ? 'card' : resolved === 'sentence' ? 'sentence' : 'word',
      label: trimmed.slice(0, 48),
      queued: true,
    });
    return saveQueuedResponse(payload, resolved, trimmed);
  }
}

/** Selection text from the page: stashed reader-popup hit first, then live selection. */
async function selectionFromTab(tab) {
  if (!tab?.id) throw new Error('No active tab');
  await ensureContentScript(tab.id);
  try {
    const stash = await chrome.tabs.sendMessage(tab.id, { type: 'jp-get-save-payload' });
    if (stash?.text) return { text: String(stash.text).trim(), mode: stash.mode || 'auto' };
  } catch {
    /* fall through */
  }
  const page = await capturePage(tab.id);
  const text = (page.selection || '').trim();
  if (!text) throw new Error('Select a word or sentence on the page first');
  return { text, mode: 'auto' };
}

async function saveSelection(tab, mode, opts = {}) {
  const sel = await selectionFromTab(tab);
  return saveText(tab, sel.text, mode === 'auto' || !mode ? sel.mode : mode, opts);
}

async function clipboardText(tab, text, entryType) {
  const payload = {
    text,
    type: entryType || 'text',
    url: tab?.url || '',
    title: tab?.title || '',
  };
  try {
    const out = await apiFetch('/v1/clipboard', { method: 'POST', body: JSON.stringify(payload) });
    return { ...out };
  } catch (err) {
    if (!(await enqueueIfRetryable('clipboard', payload, err))) throw err;
    return { ok: true, queued: true };
  }
}

async function saveAudioClipboard(tab) {
  if (!tab?.id) throw new Error('No active tab');
  await ensureContentScript(tab.id);
  const stash = await chrome.tabs.sendMessage(tab.id, { type: 'jp-get-audio-clipboard' });
  const dataUrl = stash?.dataUrl || '';
  if (!dataUrl) throw new Error('No recording yet — use Record audio first, then stop');
  const payload = {
    dataUrl,
    mimeType: stash.mimeType || 'audio/webm',
    url: tab.url || '',
    title: tab.title || '',
  };
  try {
    return await apiFetch('/v1/audio/save', { method: 'POST', body: JSON.stringify(payload) });
  } catch (err) {
    await enqueueIfRetryable('audio-save', payload, err);
    throw err;
  }
}

/* ------------------------- long-strip manga import ------------------------ */

/**
 * Long-strip/webtoon capture: find the real scroll container (often not
 * window), scroll it end-to-end while lazy images load, and collect panel
 * URLs (img / srcset / data-src / CSS backgrounds / blob→data).
 */
async function scanLongStrip(tab) {
  if (!tab?.id) throw new Error('No active tab');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const vw = Math.max(window.innerWidth, 320);
      /** @type {Map<string, { src: string, top: number }>} */
      const collected = new Map();

      function normalizeSrc(raw) {
        const s = String(raw || '').trim().replace(/^["']|["']$/g, '');
        if (!s) return '';
        if (s.startsWith('data:image/svg')) return '';
        if (/^url\(/i.test(s)) {
          const m = /^url\(\s*["']?([^"')]+)["']?\s*\)$/i.exec(s);
          return m ? normalizeSrc(m[1]) : '';
        }
        if (s.startsWith('blob:') || s.startsWith('data:image/')) return s;
        try {
          return new URL(s, location.href).href;
        } catch {
          return s;
        }
      }

      function consider(src, top, w, h) {
        const url = normalizeSrc(src);
        if (!url) return;
        const minW = Math.min(vw * 0.22, 180);
        // Keep wide/tall panels; drop tiny icons. Unknown size (0) still allowed —
        // lazy nodes often report 0 until decoded.
        if (w > 0 && h > 0 && w < minW && h < 100) return;
        if (h > 0 && h < 48 && w > 0 && w < minW) return;
        const prev = collected.get(url);
        if (!prev || top < prev.top) collected.set(url, { src: url, top });
      }

      function bestFromSrcset(srcset) {
        if (!srcset) return '';
        let best = '';
        let bestScore = -1;
        for (const part of String(srcset).split(',')) {
          const bits = part.trim().split(/\s+/);
          const u = bits[0];
          if (!u) continue;
          let score = 1;
          const desc = bits[1] || '';
          const w = /(\d+)w/i.exec(desc);
          const x = /([\d.]+)x/i.exec(desc);
          if (w) score = Number(w[1]);
          else if (x) score = Number(x[1]) * 1000;
          if (score >= bestScore) {
            bestScore = score;
            best = u;
          }
        }
        return best;
      }

      function gather() {
        for (const img of document.querySelectorAll('img')) {
          const r = img.getBoundingClientRect();
          const top = r.top + window.scrollY;
          const w = Math.max(r.width, img.naturalWidth || 0, Number(img.getAttribute('width')) || 0);
          const h = Math.max(r.height, img.naturalHeight || 0, Number(img.getAttribute('height')) || 0);
          const candidates = [
            img.currentSrc,
            img.src,
            img.getAttribute('data-src'),
            img.getAttribute('data-original'),
            img.getAttribute('data-url'),
            img.getAttribute('data-lazy-src'),
            img.getAttribute('data-srcset') && bestFromSrcset(img.getAttribute('data-srcset')),
            bestFromSrcset(img.getAttribute('srcset') || ''),
          ];
          for (const c of candidates) if (c) consider(c, top, w, h);
        }
        for (const source of document.querySelectorAll('picture source[srcset], source[data-srcset]')) {
          const best =
            bestFromSrcset(source.getAttribute('srcset') || '') ||
            bestFromSrcset(source.getAttribute('data-srcset') || '');
          const parent = source.closest('picture') || source.parentElement;
          const img = parent && parent.querySelector('img');
          const r = (img || source).getBoundingClientRect();
          consider(best, r.top + window.scrollY, r.width, r.height);
        }
        for (const el of document.querySelectorAll('[style*="background"], [data-bg], [data-background]')) {
          const r = el.getBoundingClientRect();
          if (r.height < 80 && r.width < vw * 0.3) continue;
          const styleBg = getComputedStyle(el).backgroundImage;
          const attrBg =
            el.getAttribute('data-bg') ||
            el.getAttribute('data-background') ||
            el.getAttribute('data-src') ||
            '';
          if (styleBg && styleBg !== 'none') {
            for (const part of styleBg.split(/,(?=url)/i)) {
              consider(part.trim(), r.top + window.scrollY, r.width, r.height);
            }
          }
          if (attrBg) consider(attrBg, r.top + window.scrollY, r.width, r.height);
        }
      }

      /** Prefer an inner overflow scroller (webtoon readers) over window. */
      function findScrollRoot() {
        let best = null;
        let bestDelta = 0;
        const candidates = [
          document.scrollingElement,
          document.documentElement,
          document.body,
          ...document.querySelectorAll('div, main, section, article, ul, ol'),
        ];
        for (const el of candidates) {
          if (!el || !(el instanceof Element)) continue;
          const style = getComputedStyle(el);
          const oy = style.overflowY;
          const canScroll =
            el === document.scrollingElement ||
            el === document.documentElement ||
            el === document.body ||
            oy === 'auto' ||
            oy === 'scroll' ||
            oy === 'overlay';
          if (!canScroll) continue;
          const delta = (el.scrollHeight || 0) - (el.clientHeight || 0);
          if (delta > bestDelta && (el.clientHeight || 0) >= 120) {
            bestDelta = delta;
            best = el;
          }
        }
        return best || document.scrollingElement || document.documentElement;
      }

      async function materialize(src) {
        if (!src.startsWith('blob:')) return src;
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          if (!blob || blob.size < 64 || blob.size > 12 * 1024 * 1024) return '';
          return await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '');
            fr.onerror = () => resolve('');
            fr.readAsDataURL(blob);
          });
        } catch {
          return '';
        }
      }

      const root = findScrollRoot();
      const startY = root.scrollTop || window.scrollY || 0;
      const step = Math.max(Math.floor((root.clientHeight || window.innerHeight) * 0.55), 280);

      function scrollToY(y) {
        if (root === document.scrollingElement || root === document.documentElement || root === document.body) {
          window.scrollTo(0, y);
          root.scrollTop = y;
        } else {
          root.scrollTop = y;
        }
      }

      gather();
      let stagnant = 0;
      let y = 0;
      let guard = 0;
      while (stagnant < 8 && collected.size < 500 && guard < 400) {
        guard += 1;
        const max = Math.max(
          root.scrollHeight || 0,
          document.documentElement.scrollHeight || 0,
          document.body?.scrollHeight || 0,
          y + step,
        );
        scrollToY(y);
        await sleep(180);
        const before = collected.size;
        gather();
        if (collected.size === before) {
          await sleep(220);
          gather();
        }
        if (collected.size === before) stagnant += 1;
        else stagnant = 0;
        y += step;
        if (y > max + step * 3 && stagnant >= 3) break;
      }
      scrollToY(startY);
      await sleep(100);
      gather();

      const ordered = [...collected.values()].sort((a, b) => a.top - b.top);
      const images = [];
      const seen = new Set();
      for (const entry of ordered) {
        const src = await materialize(entry.src);
        if (!src || seen.has(src)) continue;
        seen.add(src);
        images.push(src);
        if (images.length >= 500) break;
      }

      const isLongStrip =
        images.length >= 3 && ((root.scrollHeight || 0) > vw * 2.2 || images.length >= 6);

      return {
        title: document.title || '',
        url: location.href,
        images,
        isLongStrip,
        scanned: collected.size,
      };
    },
  });
  if (!result) throw new Error('Could not scan this page');
  if (!result.images.length) throw new Error('No panel images found on this page');
  const payload = { title: result.title, url: result.url, images: result.images };
  try {
    const out = await apiFetch('/v1/manga-import', { method: 'POST', body: JSON.stringify(payload) });
    await flushQueue();
    await recordActivity({ kind: 'manga', label: result.title || result.url });
    return {
      ...out,
      isLongStrip: result.isLongStrip,
      imageCount: result.images.length,
      scanned: result.scanned,
    };
  } catch (err) {
    await enqueueIfRetryable('manga-import', payload, err);
    throw err;
  }
}

/* --------------------------------- OCR ------------------------------------ */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to encode crop'));
    reader.readAsDataURL(blob);
  });
}

/** Crop a captureVisibleTab PNG to a CSS-viewport region (device-pixel aware). */
async function cropDataUrlToRegion(dataUrl, region) {
  const left = Number(region?.left) || 0;
  const top = Number(region?.top) || 0;
  const width = Number(region?.width) || 0;
  const height = Number(region?.height) || 0;
  const vw = Number(region?.viewportWidth) || 0;
  const vh = Number(region?.viewportHeight) || 0;
  if (width < 20 || height < 20 || vw < 1 || vh < 1) {
    throw new Error('Drag a larger area');
  }
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    // Prefer scale from capture pixels / CSS viewport (handles DPR + OS scaling).
    // Fall back toward devicePixelRatio only if viewport size looks wrong.
    let scaleX = bitmap.width / vw;
    let scaleY = bitmap.height / vh;
    const dpr = Number(region?.devicePixelRatio) || 0;
    if (dpr > 0) {
      // Per axis. The guard band is deliberate — the capture size and the CSS
      // viewport genuinely disagree on some machines — but applying it to BOTH
      // axes when only one is out of band throws away a measurement that was
      // fine. On Windows at 200% scaling a stale visualViewport.height alone
      // used to drag scaleX down with it, landing the crop at half the offset
      // and half the size.
      const inBand = (scale) => {
        const ratio = scale / dpr;
        return ratio >= 0.5 && ratio <= 2.5;
      };
      if (!inBand(scaleX)) scaleX = dpr;
      if (!inBand(scaleY)) scaleY = dpr;
    }
    let sx = Math.round(left * scaleX);
    let sy = Math.round(top * scaleY);
    let sw = Math.round(width * scaleX);
    let sh = Math.round(height * scaleY);
    sx = Math.max(0, Math.min(bitmap.width - 1, sx));
    sy = Math.max(0, Math.min(bitmap.height - 1, sy));
    sw = Math.max(1, Math.min(bitmap.width - sx, sw));
    sh = Math.max(1, Math.min(bitmap.height - sy, sh));
    if (sw < 20 || sh < 20) throw new Error('Drag a larger area');
    const canvas = new OffscreenCanvas(sw, sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const outBlob = await canvas.convertToBlob({ type: 'image/png' });
    return await blobToDataUrl(outBlob);
  } finally {
    bitmap.close();
  }
}

/**
 * OCR the visible tab. When `region` is provided (CSS viewport box + sizes),
 * crop the screenshot to that box before calling /v1/ocr. When omitted, asks
 * the content script to enter drag-to-select mode.
 */
async function ocrVisibleTab(tab, region, opts = {}) {
  if (!tab?.id) throw new Error('No active tab');
  await ensureContentScript(tab.id);
  if (!region) {
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-start-ocr-select' });
    return { ok: true, selecting: true };
  }
  let status;
  try {
    status = await apiFetch('/v1/ocr/status');
  } catch (err) {
    const result = { ok: false, available: false, error: String(err.message || err) };
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-show-ocr', result });
    return result;
  }
  if (!status.available) {
    const result = {
      ok: false,
      available: false,
      error: status.message || 'OCR models are not installed.',
    };
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-show-ocr', result });
    return result;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-ocr-prepare-capture' });
  } catch {
    /* content may not be ready */
  }
  await new Promise((r) => setTimeout(r, 40));
  // prepare-capture hides our own FAB so it stays out of the screenshot. If the
  // capture then throws — captureVisibleTab does exactly that on a protected page —
  // the restore below is skipped and the FAB is invisible until the user reloads
  // the tab. Restore on every exit path, but keep it idempotent so the success
  // path still sends restore-capture in its original position, before the crop
  // and before jp-show-ocr.
  let restored = false;
  const restoreOnce = async () => {
    if (restored) return;
    restored = true;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'jp-ocr-restore-capture' });
    } catch {
      /* ignore */
    }
  };
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (err) {
    await restoreOnce();
    const result = { ok: false, error: String(err.message || err), available: true };
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-show-ocr', result });
    return result;
  }
  await restoreOnce();
  try {
    dataUrl = await cropDataUrlToRegion(dataUrl, region);
  } catch (err) {
    const result = { ok: false, error: String(err.message || err), available: true };
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-show-ocr', result });
    return result;
  }
  let result;
  try {
    result = await apiFetch('/v1/ocr', {
      method: 'POST',
      // category/langHint pick the engine and seed language auto-detection.
      body: JSON.stringify({
        dataUrl,
        category: opts.category || '',
        langHint: opts.langHint || '',
      }),
    });
    if (result?.ok) await recordActivity({ kind: 'ocr', label: String(result.text || '').slice(0, 48) });
  } catch (err) {
    result = { ok: false, error: String(err.message || err), available: true, payload: err.payload };
  }
  await chrome.tabs.sendMessage(tab.id, { type: 'jp-show-ocr', result });
  return result;
}

/* ------------------------------- tab list --------------------------------- */

function isScriptableUrl(url) {
  const u = String(url || '');
  if (!u) return false;
  if (/^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(u)) return false;
  if (/^https?:\/\/chrome\.google\.com\/webstore/i.test(u)) return false;
  return /^https?:/i.test(u);
}

async function listOpenTabs(allWindows) {
  const selfPrefix = chrome.runtime.getURL('');
  let found = [];
  if (allWindows) {
    const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    found = wins.flatMap((w) => w.tabs || []);
  } else {
    let win = null;
    try {
      win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal'] });
    } catch {
      /* fall through */
    }
    if (!win) {
      const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
      win = wins[0] || null;
    }
    found = win?.tabs || [];
  }
  return found
    .filter((t) => t.id != null)
    .filter((t) => !(t.url || '').startsWith(selfPrefix))
    .map((t) => {
      const url = t.url || '';
      const title = t.title || '';
      const selectable = isScriptableUrl(url);
      const kind = selectable ? S.detectPageKind(url) : 'article';
      const category = selectable ? S.detectContentCategory(url, { title }) : 'other';
      return {
        id: t.id,
        windowId: t.windowId,
        title,
        url,
        favIconUrl: t.favIconUrl || '',
        kind,
        category,
        categoryLabel: S.contentCategoryLabel(category),
        selectable,
        active: !!t.active,
      };
    });
}

async function openTabPicker() {
  const url = chrome.runtime.getURL('tabs.html');
  const existing = await chrome.tabs.query({ url });
  if (existing.length && existing[0].id != null) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId != null) {
      try {
        await chrome.windows.update(existing[0].windowId, { focused: true });
      } catch {
        /* ignore */
      }
    }
    return { ok: true, reused: true };
  }
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 440,
    height: 620,
    focused: true,
  });
  return { ok: true, reused: false };
}

async function runTabAction(tabId, action) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.id) throw new Error('Tab not found');
  if (!isScriptableUrl(tab.url || '')) throw new Error('Cannot access this tab');
  if (action === 'capture' || action === 'save') return saveCurrent(tab);
  if (action === 'download') return downloadCurrent(tab);
  throw new Error('Unknown tab action');
}

/* ------------------------- content script helper -------------------------- */

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'jp-ping' });
    return;
  } catch {
    /* inject */
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['shared.js', 'settings.js', 'content.js'],
  });
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
}

async function toastOnTab(tab, message, kind = 'err') {
  if (!tab?.id || !message) return;
  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-toast', message: String(message), kind });
  } catch {
    /* tab may not accept content scripts */
  }
}

/* --------------------------- command dispatch ------------------------------
 * One entry point for every surface. Page-side commands are forwarded to the
 * content script; bridge commands run here.
 * -------------------------------------------------------------------------- */

const PAGE_SIDE_COMMANDS = new Set([
  'lookup.selection',
  'translate.selection',
  'grammar.match',
  'reader.theme',
  'reader.highlight',
  'reader.knownTint',
  'capture.ocr',
  'capture.audio.record',
  'wheel.more',
]);

const PAGE_SIDE_MESSAGES = {
  'lookup.selection': 'jp-lookup-selection',
  'translate.selection': 'jp-translate',
  'grammar.match': 'jp-grammar',
  'reader.theme': 'jp-toggle-theme',
  'reader.highlight': 'jp-highlight-mode-toggle',
  'reader.knownTint': 'jp-learning-toggle',
  'capture.ocr': 'jp-start-ocr-select',
  'capture.audio.record': 'jp-record-toggle',
  'wheel.more': 'jp-more-menu',
};

async function runCommand(commandId, tab, opts = {}) {
  assertSharedLoaded();
  const id = S.resolveCommandId(commandId);
  if (!id) throw new Error(`Unknown command: ${commandId}`);
  if (PAGE_SIDE_COMMANDS.has(id)) {
    if (!tab?.id) throw new Error('No active tab');
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: PAGE_SIDE_MESSAGES[id] });
    return { ok: true };
  }
  switch (id) {
    case 'save.word':
      return saveSelection(tab, 'word', opts);
    case 'save.sentence':
      return saveSelection(tab, 'sentence', opts);
    case 'card.create':
      return saveSelection(tab, 'auto', { ...opts, forceAnki: true });
    case 'capture.page':
      return saveCurrent(tab);
    case 'capture.manga':
      return scanLongStrip(tab);
    case 'media.download':
      return downloadCurrent(tab);
    case 'capture.audio.save':
      return saveAudioClipboard(tab);
    case 'clipboard.send': {
      const sel = await selectionFromTab(tab);
      return clipboardText(tab, sel.text, S.classifyMineSelection(sel.text));
    }
    case 'tabs.picker':
      return openTabPicker();
    case 'app.open':
      return apiFetch('/v1/ui/open', {
        method: 'POST',
        body: JSON.stringify({ target: opts.target || 'inbox' }),
      });
    case 'settings.special':
      return apiFetch('/v1/ui/open', {
        method: 'POST',
        body: JSON.stringify({ target: 'special' }),
      });
    default:
      throw new Error(`Unhandled command: ${id}`);
  }
}

/* ------------------------------ context menus ------------------------------ */

const CONTEXT_MENU_ITEMS = [
  { id: 'lookup.selection', title: 'Look up selection', contexts: ['selection'] },
  { id: 'analyze.selection', title: 'AI analysis of selection', contexts: ['selection'] },
  { id: 'save.word', title: 'Save word', contexts: ['selection'] },
  { id: 'save.sentence', title: 'Save sentence', contexts: ['selection'] },
  { id: 'card.create', title: 'Create flashcard', contexts: ['selection'] },
  { id: 'sep-1', type: 'separator', contexts: ['page', 'selection'] },
  { id: 'capture.page', title: 'Save page to GrammarX', contexts: ['page'] },
  { id: 'capture.ocr', title: 'OCR capture (drag a box)', contexts: ['page', 'image'] },
  { id: 'app.open', title: 'Open GrammarX', contexts: ['page'] },
];

function rebuildContextMenus() {
  chrome.contextMenus.removeAll(() => {
    for (const item of CONTEXT_MENU_ITEMS) {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        type: item.type || 'normal',
        contexts: item.contexts,
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
  void ensureFlushAlarm();
  void queueCount().then((n) => updateBadge(n));
  // Run the settings migration once on update so every surface sees v2 keys.
  if (SETTINGS) void SETTINGS.load().then((s) => SETTINGS.save(s));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_FLUSH) void flushQueue();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'lookup.selection' && tab?.id) {
      // Look up the actual right-clicked text, not the stashed hit.
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: 'jp-lookup-selection',
        text: info.selectionText || '',
      });
      return;
    }
    if (info.menuItemId === 'analyze.selection' && tab?.id) {
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: 'jp-analyze-selection',
        text: info.selectionText || '',
      });
      return;
    }
    if (String(info.menuItemId).startsWith('sep-')) return;
    const res = await runCommand(String(info.menuItemId), tab);
    const msg =
      info.menuItemId === 'capture.page'
        ? S.formatCaptureResultMessage(res)
        : info.menuItemId === 'save.word' || info.menuItemId === 'save.sentence' || info.menuItemId === 'card.create'
          ? S.formatSaveResultMessage(res)
          : '';
    if (msg) await toastOnTab(tab, msg, res?.ok || res?.queued ? 'ok' : 'err');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[GrammarX extension]', err);
    await toastOnTab(tab, msg || 'Action failed', 'err');
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    // 'send-to-reader' used to be accepted here too. onCommand only ever fires
    // with an id declared in manifest.commands, and it is declared neither there
    // nor in COMMAND_ALIASES, so the branch was unreachable. Declaring it would
    // have spent a second keybinding slot on a duplicate of save-page.
    if (command === 'save-page') {
      const res = await saveCurrent(tab);
      await toastOnTab(tab, S.formatCaptureResultMessage(res), res?.ok || res?.queued ? 'ok' : 'err');
    } else if (command === 'mine-selection') {
      // Legacy command id — kept so existing user shortcuts survive the update.
      const res = await saveSelection(tab, 'auto');
      await toastOnTab(tab, S.formatSaveResultMessage(res), res?.ok || res?.queued ? 'ok' : 'err');
    } else if (command === 'dictionary-popup') {
      if (!tab?.id) return;
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'jp-lookup-selection' });
    } else if (command === 'action-wheel') {
      if (!tab?.id) return;
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'jp-action-wheel' });
    } else if (command === 'bulk-tabs') {
      await openTabPicker();
    } else if (command === 'analyze-selection') {
      if (!tab?.id) return;
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'jp-analyze-selection' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[GrammarX extension]', err);
    await toastOnTab(tab, msg || 'Command failed', 'err');
  }
});

/* ------------------------------- messages --------------------------------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'health') {
      try {
        const { port } = await getConfig();
        const res = await fetch(`${baseUrl(port)}/v1/health`);
        if (!res.ok) {
          // An app that answers and refuses us is running. Reporting that as
          // "not running" sends the user to relaunch an app already in front of
          // them, instead of to the pairing screen that would fix it.
          const auth = res.status === 401 || res.status === 403;
          sendResponse({
            ok: false,
            running: true,
            paired: auth ? false : undefined,
            status: res.status,
            error: auth ? AUTH_FAILED_MSG : `GrammarX answered HTTP ${res.status}.`,
          });
          return;
        }
        sendResponse({ ok: true, running: true, paired: true, data: await res.json() });
      } catch {
        // Nothing answered on the port — this is the genuine not-running case.
        sendResponse({ ok: false, running: false, error: 'GrammarX is not running.' });
      }
      return;
    }
    // Honest per-subsystem status for the popup header.
    if (msg?.type === 'status-summary') {
      const out = {
        ok: true,
        app: false,
        pending: await queueCount(),
        profileName: '',
        deckName: '',
        version: null,
      };
      try {
        const { port } = await getConfig();
        const res = await fetch(`${baseUrl(port)}/v1/health`);
        if (res.ok) {
          out.app = true;
          try {
            out.version = (await res.json())?.version ?? null;
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* app offline */
      }
      if (out.app) {
        try {
          const info = await apiFetch('/v1/mine-info');
          out.profileName = info?.profileName || '';
          out.deckName = info?.deckName || '';
          out.paired = true;
        } catch (err) {
          out.paired = err?.status !== 401 ? undefined : false;
        }
      }
      sendResponse(out);
      return;
    }
    if (msg?.type === 'detect') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url || '';
      const title = tab?.title || '';
      const kind = S.detectPageKind(url);
      const category = S.detectContentCategory(url, { title });
      sendResponse({
        ok: true,
        kind,
        category,
        categoryLabel: S.contentCategoryLabel(category),
        action: S.primaryAction(kind),
        url,
        title,
        scriptable: isScriptableUrl(url),
      });
      return;
    }
    if (msg?.type === 'recent-activity') {
      const data = await chrome.storage.local.get(ACTIVITY_KEY);
      sendResponse({ ok: true, items: Array.isArray(data[ACTIVITY_KEY]) ? data[ACTIVITY_KEY] : [] });
      return;
    }
    if (msg?.type === 'flush') {
      sendResponse(await flushQueue());
      return;
    }
    if (msg?.type === 'run-command') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        sendResponse(await runCommand(msg.command, tab, msg.opts || {}));
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err), offline: !!err.offline });
      }
      return;
    }
    if (msg?.type === 'save-selection') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        sendResponse(
          await saveSelection(tab, msg.mode || 'auto', { forceAnki: msg.forceAnki === true }),
        );
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err), offline: !!err.offline });
      }
      return;
    }
    if (msg?.type === 'save-text') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const text = String(msg.text || '').trim();
      if (!text) {
        sendResponse({ ok: false, error: 'No text' });
        return;
      }
      sendResponse(
        await saveText(tab, text, msg.mode || 'auto', { forceAnki: msg.forceAnki === true }),
      );
      return;
    }
    if (msg?.type === 'clipboard-text') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const text = String(msg.text || '').trim();
      if (!text) {
        sendResponse({ ok: false, error: 'No text' });
        return;
      }
      sendResponse(await clipboardText(tab, text, msg.entryType));
      return;
    }
    if (msg?.type === 'capture') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      sendResponse(await saveCurrent(tab));
      return;
    }
    if (msg?.type === 'scan-strip') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        sendResponse(await scanLongStrip(tab));
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err), offline: !!err.offline });
      }
      return;
    }
    if (msg?.type === 'ocr') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      sendResponse(
        await ocrVisibleTab(tab, msg.region, {
          category: msg.category,
          langHint: msg.langHint,
        }),
      );
      return;
    }
    if (msg?.type === 'ocr-status') {
      try {
        sendResponse(await apiFetch('/v1/ocr/status'));
      } catch (err) {
        // `available` is what the OCR button reads to decide whether to send the
        // user to the model-download screen. Only a reachable app that actually
        // answered about its models can say they are missing; a closed app or a
        // rejected token says nothing about them, so leave it undetermined
        // rather than sending the user to download models they may already have.
        const answered = !err.offline && !err.auth;
        sendResponse({
          ok: false,
          available: answered ? false : undefined,
          offline: !!err.offline,
          error: String(err.message || err),
        });
      }
      return;
    }
    if (msg?.type === 'playlist-status') {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const pageUrl = typeof msg.url === 'string' && msg.url ? msg.url : tab?.url || '';
        const listId = S.parseYoutubePlaylistId(pageUrl);
        if (!listId) {
          sendResponse({ ok: true, tracked: false, youtubePlaylistId: null, offline: false });
          return;
        }
        const q = new URLSearchParams({ list: listId });
        const out = await apiFetch(`/v1/playlists/status?${q.toString()}`);
        sendResponse({ ok: true, offline: false, ...out });
      } catch (err) {
        sendResponse({
          ok: false,
          tracked: false,
          // Was hardcoded true, which made a 401, a 500 and a closed app
          // indistinguishable to the caller — and this flag is what the caller
          // uses to decide whether waiting will help.
          offline: !!err.offline,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (msg?.type === 'list-tabs') {
      try {
        sendResponse({ ok: true, tabs: await listOpenTabs(!!msg.allWindows) });
      } catch (err) {
        sendResponse({ ok: false, tabs: [], error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'tab-action') {
      try {
        const tabId = Number(msg.tabId);
        if (!Number.isFinite(tabId)) {
          sendResponse({ ok: false, error: 'Invalid tab id' });
          return;
        }
        sendResponse(await runTabAction(tabId, msg.action));
      } catch (err) {
        sendResponse({
          ok: false,
          error: String(err.message || err),
          offline: !!err.offline,
          payload: err.payload,
        });
      }
      return;
    }
    if (msg?.type === 'open-tab-picker') {
      try {
        sendResponse(await openTabPicker());
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'ensure-content') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'No tab' });
        return;
      }
      await ensureContentScript(tab.id);
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === 'get-commands') {
      const cmds = await chrome.commands.getAll();
      sendResponse({ ok: true, commands: cmds });
      return;
    }

    // ---- bridge passthroughs (data lookups used by the reader popup) ----
    if (msg?.type === 'lookup') {
      try {
        sendResponse(
          await apiFetch('/v1/lookup', {
            method: 'POST',
            body: JSON.stringify({ query: msg.query || '' }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, entries: [], offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    // Whole-sentence AI annotation. The app owns the preferences and the cache,
    // so this is a straight pass-through — the extension never decides what the
    // analysis contains.
    if (msg?.type === 'sentence-analysis') {
      try {
        sendResponse(
          await apiFetch('/v1/sentence-analysis', {
            method: 'POST',
            body: JSON.stringify({
              text: msg.text || '',
              lang: msg.lang || 'ja',
              explainIn: msg.explainIn || 'en',
              context: msg.context || '',
            }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'sentence-analysis-snapshot') {
      try {
        sendResponse(
          await apiFetch('/v1/sentence-analysis/snapshot', {
            method: 'POST',
            body: JSON.stringify({
              result: msg.result,
              lang: msg.lang || 'ja',
              sourceLabel: msg.sourceLabel || '',
            }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'sentence-analysis-mine') {
      try {
        sendResponse(
          await apiFetch('/v1/sentence-analysis/mine', {
            method: 'POST',
            body: JSON.stringify({
              result: msg.result,
              annotationIndex: msg.annotationIndex || 0,
              cardKind: msg.cardKind,
              lang: msg.lang || 'ja',
              uiLang: msg.uiLang || 'en',
            }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'examples') {
      try {
        sendResponse(
          await apiFetch('/v1/examples', {
            method: 'POST',
            body: JSON.stringify({ query: msg.query || '', limit: msg.limit || 8 }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, examples: [], error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'known-levels') {
      try {
        sendResponse(
          await apiFetch('/v1/known-levels', {
            method: 'POST',
            body: JSON.stringify({ terms: msg.terms || [] }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, levels: {}, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'known-level') {
      try {
        sendResponse(
          await apiFetch('/v1/known-level', {
            method: 'POST',
            body: JSON.stringify({ term: msg.term || '', level: msg.level }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'level-estimate') {
      try {
        sendResponse(
          await apiFetch('/v1/level-estimate', {
            method: 'POST',
            body: JSON.stringify({ text: msg.text || '' }),
          }),
        );
      } catch (err) {
        sendResponse({
          ok: false,
          badge: '—',
          offline: !!err.offline,
          error: String(err.message || err),
        });
      }
      return;
    }
    if (msg?.type === 'comprehensibility') {
      try {
        sendResponse(
          await apiFetch('/v1/comprehensibility', {
            method: 'POST',
            body: JSON.stringify({ text: msg.text || '' }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'grammar-match') {
      try {
        sendResponse(
          await apiFetch('/v1/grammar-match', {
            method: 'POST',
            body: JSON.stringify({ text: msg.text || msg.query || '' }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, matches: [], offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'translate') {
      try {
        sendResponse(
          await apiFetch('/v1/translate', {
            method: 'POST',
            body: JSON.stringify({
              text: msg.text || '',
              source: msg.source || 'ja',
              target: msg.target || 'en',
            }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'page-context') {
      try {
        const q = new URLSearchParams();
        if (msg.url) q.set('url', String(msg.url));
        if (msg.title) q.set('title', String(msg.title));
        if (msg.text) q.set('text', String(msg.text).slice(0, 8000));
        if (msg.cardKind) q.set('cardKind', String(msg.cardKind));
        sendResponse(await apiFetch(`/v1/page-context?${q.toString()}`));
      } catch (err) {
        sendResponse({ ok: false, offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'ui-open') {
      try {
        sendResponse(
          await apiFetch('/v1/ui/open', {
            method: 'POST',
            body: JSON.stringify({
              target: msg.target || '',
              functions: msg.functions,
              level: msg.level,
              levels: msg.levels,
              lang: msg.lang,
            }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, offline: !!err.offline, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'immersion-visit') {
      try {
        sendResponse(
          await apiFetch('/v1/immersion/visit', {
            method: 'POST',
            body: JSON.stringify({
              url: msg.url || '',
              title: msg.title || '',
              seconds: msg.seconds,
              chars: msg.chars,
            }),
          }),
        );
      } catch (err) {
        const queued = await enqueueIfRetryable(
          'immersion',
          {
            url: msg.url || '',
            title: msg.title || '',
            seconds: msg.seconds,
            chars: msg.chars,
          },
          err,
        );
        if (queued) {
          sendResponse({ ok: true, queued: true });
          return;
        }
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    if (msg?.type === 'api') {
      try {
        sendResponse(await apiFetch(msg.path, { method: msg.method || 'GET', body: msg.body }));
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err), payload: err.payload });
      }
      return;
    }
    sendResponse({ ok: false, error: 'Unknown message' });
  })().catch((err) =>
    sendResponse({
      ok: false,
      error: String(err.message || err),
      offline: !!err.offline,
      payload: err.payload,
    }),
  );
  return true;
});

void ensureFlushAlarm();
