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
import './idb.js';

const S = globalThis.jpStudyShared || {};
/** A catalogue string (see shared.js jpMsg); the key if shared.js did not load. */
const t = (key, subs) => (S.msg ? S.msg(key, subs) : key);
if (!S.resolveCommandId) {
  console.error('[Gum] shared.js did not publish jpStudyShared in the service worker.');
}

/** Throw a diagnosable error instead of a bare TypeError when shared.js is missing. */
function assertSharedLoaded() {
  if (S.resolveCommandId) return;
  throw new Error(t('bg_scriptsFailed'));
}
const SETTINGS = globalThis.jpStudySettings || null;
const DEFAULT_PORT = S.DEFAULT_PORT || 18765;
const QUEUE_KEY = 'jpStudyRetryQueue';
const TOKEN_KEY = 'jpStudyToken';
const PORT_KEY = 'jpStudyPort';
const ACTIVITY_KEY = 'jpRecentActivity';
/** Saves waiting for the app. Never evicted: past this a new save is refused out loud. */
const MAX_QUEUE = 200;
const IMMERSION_KEY = 'jpStudyImmersionQueue';
const MAX_IMMERSION = 60;
/** True while a recording is running: the badge reads REC instead of the queue. */
let recordingBadge = false;
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
 * Routes that older Gum builds lack — a bare 404 means restart/update the app.
 *
 * The boundary is load-bearing: unanchored, this also claimed any future
 * `/v1/sentence-analysis-v2` or `-batch` route, so a 404 from a genuinely missing
 * NEW endpoint would tell the user their app is out of date when it isn't. Match
 * the segment, then end / a sub-path / a query string.
 */
const APP_UPDATE_PATHS = /^\/v1\/sentence-analysis(?:[/?]|$)/;

const APP_OUTDATED_MSG = t('bg_appOutdated');

/**
 * A reachable app that rejects our token. Waiting never fixes it; re-pairing
 * does, and the message names where: the token lives in Gum under Settings ->
 * Profile & dictionary -> Chrome extension (settings/pages/StudyPage.tsx mounts
 * ExtensionBridgeSection), and the extension takes it in its own options page
 * under Connection. It used to send people to "Companions", the desktop-pet page.
 */
const AUTH_FAILED_MSG = t('bg_authFailed');

/** App error code → _locales key (shared.js; content.js uses the same map for 200 `{ok:false}` replies). */
const SERVER_ERROR_KEYS = S.SERVER_ERROR_KEYS || {};
function serverErrorCode(json, raw) {
  return typeof S.serverErrorCode === 'function' ? S.serverErrorCode(json, raw) : '';
}

async function apiFetch(path, opts = {}) {
  const { token, port } = await getConfig();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    const init = { method: opts.method || 'GET', headers, body: opts.body };
    // opts.timeoutMs: abort a request the app never answers (the recorder's
    // /finish and /status); a timed-out call is treated like an offline one.
    res =
      Number(opts.timeoutMs) > 0
        ? await fetchWithTimeout(`${baseUrl(port)}${path}`, init, Number(opts.timeoutMs))
        : await fetch(`${baseUrl(port)}${path}`, init);
  } catch (err) {
    const offline = new Error(t('bg_offline'));
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
    err.code = serverErrorCode(json, raw);
    // 423: the app's lockscreen is engaged. Retryable later, never a refusal:
    // see shouldQueue / shouldRetryQueued and the lock state below.
    if (res.status === 423) err.code = 'locked';
    err.locked = err.code === 'locked';
    if (err.auth) err.message = AUTH_FAILED_MSG;
    else if (err.locked) err.message = t(SERVER_ERROR_KEYS.locked || 'bg_errLocked');
    else if (err.code && message === raw) err.message = t(SERVER_ERROR_KEYS[err.code]);
    err.payload = json;
    if (err.locked) await noteAppLocked(true);
    throw err;
  }
  // A content route answered: whatever the last health probe said, the app is
  // unlocked now, so what waited for it goes out.
  if (appLockedHint === true) void noteAppLocked(false);
  return json;
}

/* ------------------------------ app lock state ----------------------------- */
/*
 * While Gum's lockscreen is engaged every content route answers 423 and
 * /v1/health reports `locked: true`. Nothing queued is dropped meanwhile: the
 * retry queue and the recording uploader stop sending (a recording in progress
 * would otherwise PUT a chunk every two seconds into a locked app) and the
 * flush alarm — the existing one-minute cadence, no new timer — asks
 * /v1/health instead, once per tick. When it reports `locked: false` the queue
 * flushes and the recordings resume. The flag is kept in storage.local so a
 * worker woken mid-lock does not start by replaying the whole backlog.
 */
const LOCK_KEY = 'jpStudyAppLocked';
/** null = not read from storage yet. */
let appLockedHint = null;

async function isAppLockedHint() {
  if (appLockedHint === null) {
    try {
      const data = await chrome.storage.local.get(LOCK_KEY);
      appLockedHint = !!data[LOCK_KEY];
    } catch {
      appLockedHint = false;
    }
  }
  return appLockedHint;
}

/** Record the lock state; on the locked → unlocked edge, flush and resume. */
async function noteAppLocked(locked) {
  const was = await isAppLockedHint();
  appLockedHint = !!locked;
  if (was === appLockedHint) return;
  try {
    if (appLockedHint) await chrome.storage.local.set({ [LOCK_KEY]: Date.now() });
    else await chrome.storage.local.remove(LOCK_KEY);
  } catch {
    /* the in-memory flag still holds for this worker's life */
  }
  if (!appLockedHint) {
    void flushQueue();
    void resumeRecordingUploads();
  }
}

/** GET /v1/health (no token; it answers while locked). null when nothing answered. */
async function probeHealth() {
  try {
    const { port } = await getConfig();
    const res = await fetch(`${baseUrl(port)}/v1/health`);
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    return { status: res.status, ok: res.ok, json, locked: !!(res.ok && json && json.locked === true) };
  } catch {
    return null;
  }
}

/**
 * Before sending anything that a lock would refuse: is the app still locked?
 * Only asks /v1/health when the last answer WAS a lock, so an unlocked app
 * costs nothing extra; concurrent callers share one probe.
 */
let lockProbe = null;
async function stillLocked() {
  if (!(await isAppLockedHint())) return false;
  if (!lockProbe) {
    lockProbe = probeHealth().finally(() => {
      lockProbe = null;
    });
  }
  const health = await lockProbe;
  // Nothing answered: the app closed while locked. Keep the flag; sending now
  // would only fail offline, and a restarted app reports its state next tick.
  if (!health) return true;
  if (health.ok && !health.locked) {
    appLockedHint = false;
    try {
      await chrome.storage.local.remove(LOCK_KEY);
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}

/** `{ locked: true }` for a reply about something kept because the app is locked. */
function lockedFlag(err) {
  return err && err.locked ? { locked: true } : {};
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
  // A locked app (423) is the other condition waiting fixes: it is running and
  // will take the save the moment the user unlocks it.
  return !!(err && (err.offline || err.locked));
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
  if (err.offline || err.locked) return true;
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

/**
 * Every read-modify-write of the queue runs under this one promise lock.
 *
 * Without it a save landing while a flush was in flight was overwritten by the
 * flush's write-back (lost), and two overlapping flushes posted the same items
 * twice (duplicates in Anki). Items carry an `id`, and a flush removes exactly
 * the ids it sent, so anything enqueued meanwhile survives.
 */
let queueLock = Promise.resolve();
function withQueueLock(fn) {
  const run = queueLock.then(fn, fn);
  queueLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function newQueueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readQueue() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  const queue = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
  // Items an older build stored have no id; give them one so a flush can
  // remove exactly what it sent.
  for (const item of queue) if (item && !item.id) item.id = newQueueId();
  return queue;
}

async function writeQueue(queue) {
  // chrome.storage.local is 10 MB and this manifest does not request
  // unlimitedStorage. An unhandled rejection here loses the save silently,
  // which is the one outcome the queue exists to prevent.
  try {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  } catch (err) {
    const quota = new Error(t('bg_storageFull'));
    quota.quota = true;
    quota.cause = err;
    throw quota;
  }
}

async function enqueue(kind, payload) {
  await withQueueLock(async () => {
    const queue = await readQueue();
    // A save is never evicted to make room for another: past the cap the new
    // one is refused out loud instead of the oldest vanishing silently.
    if (queue.length >= MAX_QUEUE) {
      const full = new Error(t('bg_storageFull'));
      full.quota = true;
      throw full;
    }
    const id = newQueueId();
    queue.push({ id, kind, payload: await stashLargeFields(id, payload), at: Date.now(), attempts: 0 });
    await writeQueue(queue);
    await updateBadge(queue.length);
  });
  await ensureFlushAlarm();
}

/**
 * Recording / screenshot data URLs go to IndexedDB, not storage.local: a few
 * queued audio clips used to fill the 10 MB quota and make every later save
 * fail. The queue item keeps a `{ __blob: key }` stand-in.
 */
const BLOB_FIELDS = ['dataUrl', 'audioDataUrl', 'imageDataUrl'];
const BLOB_INLINE_MAX = 64 * 1024;

async function stashLargeFields(id, payload) {
  const store = globalThis.jpStudyIdb;
  if (!store || store.kind !== 'indexeddb' || !payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  for (const field of BLOB_FIELDS) {
    const value = out[field];
    if (typeof value !== 'string' || value.length <= BLOB_INLINE_MAX) continue;
    const key = `${id}:${field}`;
    await store.putStrict('blobs', { key, data: value, at: Date.now() });
    out[field] = { __blob: key };
  }
  return out;
}

async function restoreLargeFields(payload) {
  const store = globalThis.jpStudyIdb;
  if (!store || !payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  for (const field of BLOB_FIELDS) {
    const ref = out[field];
    if (!ref || typeof ref !== 'object' || typeof ref.__blob !== 'string') continue;
    const row = await store.get('blobs', ref.__blob);
    out[field] = row ? row.data : '';
  }
  return out;
}

async function dropLargeFields(item) {
  const store = globalThis.jpStudyIdb;
  if (!store || !item || !item.payload) return;
  for (const field of BLOB_FIELDS) {
    const ref = item.payload[field];
    if (ref && typeof ref === 'object' && typeof ref.__blob === 'string') await store.delete('blobs', ref.__blob);
  }
}

/**
 * Reading time is not a save and never shares the save queue: one entry per
 * page, merged, capped. It used to post a heartbeat per tab per minute into the
 * same 40-item queue, so an afternoon with the app closed evicted real saves.
 */
async function queueImmersion(visit) {
  await withQueueLock(async () => {
    const data = await chrome.storage.local.get(IMMERSION_KEY);
    const list = Array.isArray(data[IMMERSION_KEY]) ? data[IMMERSION_KEY] : [];
    const hit = list.find((v) => v && v.url === visit.url);
    if (hit) {
      hit.seconds = (Number(hit.seconds) || 0) + (Number(visit.seconds) || 0);
      hit.chars = Math.max(Number(hit.chars) || 0, Number(visit.chars) || 0);
      hit.title = hit.title || visit.title;
      hit.at = Date.now();
    } else {
      list.push({ ...visit, at: Date.now() });
    }
    while (list.length > MAX_IMMERSION) list.shift();
    await chrome.storage.local.set({ [IMMERSION_KEY]: list });
  });
  await ensureFlushAlarm();
}

async function flushImmersion() {
  const data = await chrome.storage.local.get(IMMERSION_KEY);
  const list = Array.isArray(data[IMMERSION_KEY]) ? data[IMMERSION_KEY] : [];
  if (!list.length) return;
  const done = new Set();
  for (const visit of list) {
    try {
      const { at: _at, ...body } = visit;
      await apiFetch('/v1/immersion/visit', { method: 'POST', body: JSON.stringify(body) });
      done.add(visit.url);
    } catch (err) {
      if (err.offline || err.locked) break;
      done.add(visit.url); // refused: retrying will not change the answer
    }
  }
  await withQueueLock(async () => {
    const now = await chrome.storage.local.get(IMMERSION_KEY);
    const current = Array.isArray(now[IMMERSION_KEY]) ? now[IMMERSION_KEY] : [];
    await chrome.storage.local.set({ [IMMERSION_KEY]: current.filter((v) => !done.has(v.url)) });
  });
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
  // A running recording owns the badge; the queue count returns when it stops.
  if (recordingBadge) return;
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

/** One flush at a time: a second caller gets the flush already running. */
let flushInFlight = null;
function flushQueue() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlushQueue().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlushQueue() {
  const snapshot = await withQueueLock(async () => {
    const queue = await readQueue();
    if (queue.length) await writeQueue(queue); // persist ids given to legacy items
    return queue;
  });
  // Locked: one /v1/health probe instead of a 423 per item. Nothing is touched.
  if (await stillLocked()) {
    await updateBadge(snapshot.length);
    return { flushed: 0, left: snapshot.length, dropped: 0, locked: true };
  }
  const sent = new Set();
  const dropped = [];
  const updates = new Map();
  let flushed = 0;
  let locked = false;
  const now = Date.now();
  for (const item of snapshot) {
    const endpoint = QUEUE_ENDPOINTS[item.kind];
    if (!endpoint) {
      // Unknown legacy kind — there is no endpoint left to replay it to. Counted
      // as a drop rather than skipped silently, so flushed + left + dropped adds
      // up to what went in and the popup can say so.
      dropped.push({ ...item, reason: 'unknown-kind' });
      continue;
    }
    // An item older than the age bound is past the point where silently
    // retrying it is doing the user any favours. Backfill `at` for the items an
    // older build stored without one, so the bound covers those too.
    const at = typeof item.at === 'number' ? item.at : now;
    if (now - at > MAX_QUEUE_AGE_MS) {
      dropped.push({ ...item, reason: 'expired' });
      continue;
    }
    try {
      await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(await restoreLargeFields(item.payload)) });
      sent.add(item.id);
      flushed += 1;
      await dropLargeFields(item);
    } catch (err) {
      if (err.locked) {
        // The app locked (or was locked) under us: this item and every one
        // after it wait, unchanged and uncounted, for the unlock.
        locked = true;
        break;
      }
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
      updates.set(item.id, { at, attempts });
    }
  }
  const droppedIds = new Set(dropped.map((d) => d.id));
  // Commit against the queue as it is NOW: remove exactly what was sent or
  // dropped, keep whatever was enqueued while the requests were in flight.
  const left = await withQueueLock(async () => {
    const current = await readQueue();
    const next = current
      .filter((it) => !sent.has(it.id) && !droppedIds.has(it.id))
      .map((it) => (updates.has(it.id) ? { ...it, ...updates.get(it.id) } : it));
    await writeQueue(next);
    return next;
  });
  // A drop is the queue failing at its one job, so it goes in the activity list
  // the popup shows rather than vanishing into a console nobody has open.
  for (const item of dropped) {
    await dropLargeFields(item);
    await recordActivity({ kind: item.kind, label: queueItemLabel(item), dropped: item.reason });
  }
  // Always written, so a badge left stale by a crashed write is corrected here.
  await updateBadge(left.length);
  if (locked) return { flushed, left: left.length, dropped: dropped.length, locked: true };
  try {
    await flushImmersion();
  } catch {
    /* reading time is best effort */
  }
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
    return { ok: true, queued: true, ...lockedFlag(err), kind, action, openTarget };
  }
}

async function downloadCurrent(tab) {
  if (!tab?.url) throw new Error('No active tab');
  const kind = S.detectPageKind(tab.url);
  if (kind !== 'youtube-video' && kind !== 'youtube-playlist') {
    throw new Error(t('bg_needYoutubeTab'));
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
    // Queued means it WILL happen: answer that, not the offline error (the
    // toast used to say "failed" for a download that then ran).
    if (!(await enqueueIfRetryable('download', payload, err))) throw err;
    await recordActivity({ kind: 'download', label: tab.title || tab.url, queued: true });
    return { ok: true, queued: true, ...lockedFlag(err), kind, openTarget: 'youtube' };
  }
}

/**
 * MINING gate 11 — transcribe the audio of the page being watched.
 *
 * Not queued for retry when it refuses. `enqueueIfRetryable` exists for a
 * request the app was simply not running to receive; a refusal here is an
 * ANSWER — "you have not downloaded this video", "the transcriber is not
 * running" — and replaying it later would produce the same answer while making
 * it look like the click was lost.
 */
async function transcribeCurrent(tab) {
  if (!tab?.url) throw new Error('No active tab');
  const kind = S.detectPageKind(tab.url);
  if (kind !== 'youtube-video') {
    throw new Error(t('bg_needYoutubeVideo'));
  }
  const out = await apiFetch('/v1/transcribe', {
    method: 'POST',
    body: JSON.stringify({ url: tab.url }),
  });
  if (out?.ok) {
    await recordActivity({ kind: 'transcribe', label: tab.title || tab.url });
  }
  return { ...out, kind, openTarget: 'youtube' };
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
 * Save text to the Gum library, optionally creating an Anki card.
 * The bridge always keeps the Gum copy; `preferAnki` additionally
 * attempts an Anki card, `forceAnki` requires the attempt.
 */
async function saveText(tab, text, mode, opts = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error(t('bg_nothingSelected'));
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
    // What the popup knew: the sentence around the word, the entry the user
    // picked (its reading and gloss), and the dictionary form. The app used to
    // get the bare selection and Anki an empty back.
    ...pickMineContext(opts),
    // The page's language for the selection, so the app glosses a Chinese
    // word from the Chinese dictionary (Han alone would follow the study language).
    ...(opts.lang === 'ja' || opts.lang === 'zh' || opts.lang === 'ru' ? { lang: opts.lang } : {}),
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
    return { ...saveQueuedResponse(payload, resolved, trimmed), ...lockedFlag(err) };
  }
}

/** The optional, length-capped card context a content script may send with a save. */
function pickMineContext(opts) {
  const out = {};
  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
  const sentence = str(opts.sentence, 2000);
  const reading = str(opts.reading, 200);
  const meaning = str(opts.meaning, 2000);
  const lemma = str(opts.lemma, 80);
  const surface = str(opts.surface, 80);
  if (sentence) out.sentence = sentence;
  if (reading) out.reading = reading;
  if (meaning) out.meaning = meaning;
  if (lemma) out.lemma = lemma;
  if (surface) out.surface = surface;
  if (Number.isInteger(opts.entryIndex) && opts.entryIndex >= 0) out.entryIndex = opts.entryIndex;
  if (typeof opts.imageDataUrl === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(opts.imageDataUrl)) {
    out.imageDataUrl = opts.imageDataUrl;
  }
  return out;
}

/** Selection text from the page: stashed reader-popup hit first, then live selection. */
async function selectionFromTab(tab) {
  if (!tab?.id) throw new Error('No active tab');
  await ensureContentScript(tab.id);
  try {
    const stash = await chrome.tabs.sendMessage(tab.id, { type: 'jp-get-save-payload' });
    if (stash?.text) return { text: String(stash.text).trim(), mode: stash.mode || 'auto', context: stash.context || {} };
  } catch {
    /* fall through */
  }
  const page = await capturePage(tab.id);
  const text = (page.selection || '').trim();
  if (!text) throw new Error(t('bg_selectFirst'));
  return { text, mode: 'auto' };
}

async function saveSelection(tab, mode, opts = {}) {
  const sel = await selectionFromTab(tab);
  const resolved = mode === 'auto' || !mode ? sel.mode : mode;
  // The popup's context belongs to the word it shows; a sentence save keeps
  // only the sentence-level fields.
  const ctx = sel.context || {};
  const context = resolved === 'sentence' ? { lang: ctx.lang } : ctx;
  return saveText(tab, sel.text, resolved, { ...context, ...opts });
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
    return { ok: true, queued: true, ...lockedFlag(err) };
  }
}

async function saveAudioClipboard(tab) {
  if (!tab?.id) throw new Error('No active tab');
  await ensureContentScript(tab.id);
  const stash = await chrome.tabs.sendMessage(tab.id, { type: 'jp-get-audio-clipboard' });
  if (stash?.recording) throw new Error(t('bg_stopRecordingFirst'));
  const dataUrl = stash?.dataUrl || '';
  if (!dataUrl) throw new Error(t('bg_noRecording'));
  const payload = {
    dataUrl,
    mimeType: stash.mimeType || 'audio/webm',
    url: tab.url || '',
    title: tab.title || '',
  };
  let out;
  try {
    out = await apiFetch('/v1/audio/save', { method: 'POST', body: JSON.stringify(payload) });
  } catch (err) {
    if (!(await enqueueIfRetryable('audio-save', payload, err))) throw err;
    out = { ok: true, queued: true, ...lockedFlag(err) };
  }
  // Clear the clip once it is saved or queued: a second Save used to make a
  // second card from the same recording.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-clear-audio-clipboard' });
  } catch {
    /* the tab may be gone */
  }
  return out;
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
  if (!result) throw new Error(t('bg_scanFailed'));
  if (!result.images.length) throw new Error(t('bg_noPanels'));
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
    if (!(await enqueueIfRetryable('manga-import', payload, err))) throw err;
    await recordActivity({ kind: 'manga', label: result.title || result.url, queued: true });
    return { ok: true, queued: true, ...lockedFlag(err), isLongStrip: result.isLongStrip, imageCount: result.images.length };
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
    throw new Error(t('common_dragLarger'));
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
    if (sw < 20 || sh < 20) throw new Error(t('common_dragLarger'));
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
    // The app's 503 says whether the models are missing or still downloading;
    // the page names either state in its own language instead of the English error.
    const p = err.payload || {};
    result = {
      ok: false,
      error: String(err.message || err),
      available: p.available === false ? false : true,
      downloading: p.downloading === true,
      payload: err.payload,
    };
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
  if (!isScriptableUrl(tab.url || '')) throw new Error(t('bg_tabRestricted'));
  if (action === 'capture' || action === 'save') return saveCurrent(tab);
  if (action === 'download') return downloadCurrent(tab);
  throw new Error('Unknown tab action');
}

/* ------------------------- content script helper -------------------------- */

/** The page scripts, in dependency order (popup-css.js styles the shadow-root popup). */
const CONTENT_SCRIPT_FILES = ['shared.js', 'settings.js', 'popup-css.js', 'content.js'];
const CONTENT_SCRIPT_ID = 'gum-content';
const CONTENT_SCRIPT_MATCHES = ['http://*/*', 'https://*/*'];

/**
 * The page scripts are registered here rather than in the manifest, so that
 * "Also work inside embedded frames" (settings.allFrames, default off) is one
 * `allFrames` flag on one registration. A static manifest entry plus a second,
 * all-frames registration would run shared.js twice in every top frame (its
 * top-level `const`s throw on the second run). Idempotent; calls are chained so
 * the startup call and onInstalled never race to register the same id.
 */
let contentScriptSync = Promise.resolve();
function syncContentScriptRegistration() {
  contentScriptSync = contentScriptSync.then(syncContentScriptRegistrationNow, syncContentScriptRegistrationNow);
  return contentScriptSync;
}

async function syncContentScriptRegistrationNow() {
  const api = chrome.scripting;
  if (!api || typeof api.registerContentScripts !== 'function') return 'unsupported';
  const settings = await getSettings();
  const allFrames = settings && settings.allFrames === true;
  const spec = {
    id: CONTENT_SCRIPT_ID,
    matches: CONTENT_SCRIPT_MATCHES,
    js: CONTENT_SCRIPT_FILES,
    css: ['content.css'],
    runAt: 'document_idle',
    allFrames,
    persistAcrossSessions: true,
  };
  try {
    const existing = await api.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
    const cur = Array.isArray(existing) ? existing[0] : null;
    if (!cur) {
      await api.registerContentScripts([spec]);
      return 'registered';
    }
    const same =
      !!cur.allFrames === allFrames &&
      JSON.stringify(cur.js || []) === JSON.stringify(CONTENT_SCRIPT_FILES) &&
      JSON.stringify(cur.css || []) === JSON.stringify(spec.css);
    if (same) return 'unchanged';
    await api.updateContentScripts([spec]);
    return 'updated';
  } catch (err) {
    // Another worker instance registered it between our read and write: the
    // one registration exists, which is all we want (never a second id).
    if (/duplicate script id/i.test(String((err && err.message) || err))) return 'unchanged';
    console.warn('[Gum] content script registration failed', err);
    return 'failed';
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'jp-ping' });
    return;
  } catch {
    /* inject */
  }
  // Idempotency guard: the registered script may already have run (or be
  // running) in this tab without answering the ping yet. Injecting again would
  // re-run shared.js, whose top-level consts throw on a second evaluation.
  if (await contentLoadedIn(tabId)) return;
  if (injecting.has(tabId)) return injecting.get(tabId);
  const run = injectContentScripts(tabId).finally(() => injecting.delete(tabId));
  injecting.set(tabId, run);
  return run;
}

const injecting = new Map();

async function contentLoadedIn(tabId) {
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      // content.js sets this first thing; the manifest-order files run in one go.
      func: () => globalThis.__jpStudyContentLoaded === true,
    });
    return !!(probe && probe.result);
  } catch {
    return false;
  }
}

async function injectContentScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES,
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

/* ------------------------------ hover scan --------------------------------- */

const IDB = globalThis.jpStudyIdb || null;
/** Offline lookup cache cap (IndexedDB rows), trimmed oldest-first. */
const LOOKUP_CACHE_MAX = 20000;
let lookupWrites = 0;

/** Real matches only (dictService `via`); an older app sends no `via` at all. */
function isRealMatch(entry) {
  return !entry || !entry.via || entry.via === 'exact' || entry.via === 'deinflected' || entry.via === 'reading';
}

async function cacheScanResult(lang, res) {
  if (!IDB || !res || !res.matched || !Array.isArray(res.entries) || !res.entries.length) return;
  const value = { matched: res.matched, entries: res.entries, deinflection: res.deinflection, via: res.via };
  await IDB.put('lookups', { key: `${lang}:${res.matched}`, value, at: Date.now() });
  lookupWrites += 1;
  if (lookupWrites % 200 === 0) await IDB.trim('lookups', LOOKUP_CACHE_MAX);
}

/** Longest cached prefix of the window, for when Gum is closed. */
async function cachedScan(text, lang) {
  if (!IDB) return null;
  const chars = [...text];
  for (let len = chars.length; len >= 1; len -= 1) {
    const row = await IDB.get('lookups', `${lang}:${chars.slice(0, len).join('')}`);
    if (row && row.value) return row.value;
  }
  return null;
}

/** Older Gum without /v1/scan: every prefix through /v1/lookup, in parallel. */
async function legacyScan(text, lang) {
  const chars = [...text].slice(0, 24);
  const prefixes = [];
  for (let len = chars.length; len >= 1; len -= 1) prefixes.push(chars.slice(0, len).join(''));
  const answers = await Promise.all(
    prefixes.map((q) =>
      apiFetch('/v1/lookup', { method: 'POST', body: JSON.stringify({ query: q, lang }) }).catch(() => null),
    ),
  );
  for (let i = 0; i < prefixes.length; i += 1) {
    const res = answers[i];
    const q = prefixes[i];
    const entries = (res && Array.isArray(res.entries) ? res.entries : []).filter(isRealMatch);
    if (!entries.length) continue;
    // Without `via`, only a headword, reading or de-inflection source equal to
    // the prefix proves it is a word rather than a near miss.
    const exact =
      (res.deinflection && res.deinflection.source === q) ||
      entries.some((e) => e.word === q || e.reading === q || !!e.via);
    if (!exact) continue;
    return { ok: true, matched: q, entries, deinflection: res.deinflection, legacy: true };
  }
  return { ok: true, matched: '', entries: [], legacy: true };
}

/**
 * One request per hover: the app looks every prefix up in one batched read.
 * Offline, the last answers for this page's words come from IndexedDB.
 */
async function scanLookup(text, lang) {
  const q = String(text || '').trim().slice(0, 64);
  if (!q) return { ok: true, matched: '', entries: [] };
  try {
    const res = await apiFetch('/v1/scan', { method: 'POST', body: JSON.stringify({ text: q, lang }) });
    if (res && res.ok) {
      res.entries = (res.entries || []).filter(isRealMatch);
      const settings = await getSettings();
      if (settings.offlineCache !== false) void cacheScanResult(lang, res);
    }
    return res;
  } catch (err) {
    if (err.status === 404) {
      try {
        return await legacyScan(q, lang);
      } catch {
        /* fall through */
      }
    }
    if (err.offline) {
      const cached = await cachedScan(q, lang);
      if (cached) return { ok: true, ...cached, fromCache: true, offline: true };
    }
    // Locked: no cached answers either — the lock is there to keep study data
    // off the screen, and the popup says why instead of looking empty.
    return {
      ok: false,
      matched: '',
      entries: [],
      offline: !!err.offline,
      ...(err.locked ? { locked: true, code: 'locked' } : {}),
      error: String(err.message || err),
    };
  }
}

/* ------------------------- word status (WP8) ------------------------------ */
/*
 * The app tokenizes visible page text (/v1/annotate). The known-word map
 * (/v1/known-snapshot) is cached in IndexedDB and refreshed with `?since=`, so
 * word status still paints, by longest known-word match, while Gum is closed.
 */
const KNOWN_SNAPSHOT_KEY = 'known-snapshot';
const KNOWN_SNAPSHOT_TTL_MS = 60_000;
let knownSnapshotMem = null;
let knownSnapshotCheckedAt = 0;

async function loadKnownSnapshot() {
  if (knownSnapshotMem) return knownSnapshotMem;
  if (!IDB) return null;
  try {
    const row = await IDB.get('meta', KNOWN_SNAPSHOT_KEY);
    knownSnapshotMem = row && row.value && row.value.words ? row.value : null;
  } catch {
    knownSnapshotMem = null;
  }
  return knownSnapshotMem;
}

/** The cached snapshot, refreshed from the app at most once a minute. */
async function knownSnapshot(force = false) {
  const cached = await loadKnownSnapshot();
  if (!force && cached && Date.now() - knownSnapshotCheckedAt < KNOWN_SNAPSHOT_TTL_MS) return cached;
  knownSnapshotCheckedAt = Date.now();
  try {
    const since = cached && cached.version ? `?since=${encodeURIComponent(cached.version)}` : '';
    const res = await apiFetch(`/v1/known-snapshot${since}`);
    if (res && res.ok && res.unchanged && cached) return cached;
    if (res && res.ok && res.words && typeof res.words === 'object') {
      knownSnapshotMem = { version: String(res.version || ''), lang: res.lang || '', words: res.words };
      if (IDB) await IDB.put('meta', { key: KNOWN_SNAPSHOT_KEY, value: knownSnapshotMem, at: Date.now() });
    }
  } catch {
    /* offline: keep the cached map */
  }
  return knownSnapshotMem;
}

/** Offline fallback: greedy longest known-word match inside CJK runs. */
function localAnnotate(texts, words) {
  const MAXLEN = 8;
  return texts.map((text) => {
    const out = [];
    const s = String(text || '');
    let i = 0;
    while (i < s.length) {
      let hit = 0;
      for (let len = Math.min(MAXLEN, s.length - i); len >= 1; len -= 1) {
        const w = s.slice(i, i + len);
        if (typeof words[w] === 'number' && (len > 1 || /[㐀-鿿]/.test(w))) {
          out.push({ o: i, n: len, l: w, k: words[w] });
          hit = len;
          break;
        }
      }
      i += hit || 1;
    }
    return out;
  });
}

async function annotateTexts(texts, lang) {
  const list = (Array.isArray(texts) ? texts : []).slice(0, 64).map((t) => String(t || '').slice(0, 2000));
  if (!list.length) return { ok: true, results: [] };
  try {
    const res = await apiFetch('/v1/annotate', { method: 'POST', body: JSON.stringify({ texts: list, lang }) });
    if (res && res.ok && Array.isArray(res.results)) return { ok: true, results: res.results };
  } catch (err) {
    if (!err.offline && err.status !== 504 && err.status !== 404) {
      return { ok: false, results: [], code: err.code || '', error: String(err.message || err) };
    }
  }
  const snap = await knownSnapshot();
  if (!snap) return { ok: false, results: [], offline: true };
  return { ok: true, results: localAnnotate(list, snap.words), fromCache: true };
}

/* ------------------------------ tab recorder ------------------------------- */
/*
 * Flow: a user gesture (toolbar popup, keyboard command, context menu, or the
 * wheel the command opened) → chrome.tabCapture.getMediaStreamId for the tab →
 * the offscreen document (reason USER_MEDIA) opens the stream, plays the tab's
 * sound back (tab capture mutes it), and records webm in 2 s chunks into
 * IndexedDB → this worker uploads each chunk to /v1/recordings and finishes the
 * upload when the recording stops. Chunks stay in IndexedDB until the app has
 * them, so a closed app or a worker restart loses nothing.
 */

async function listRecs() {
  if (!IDB) return [];
  const all = await IDB.getAll('recs');
  return all.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

async function activeRecs() {
  return (await listRecs()).filter((r) => r.status === 'recording');
}

async function refreshBadge() {
  recordingBadge = (await activeRecs()).length > 0;
  if (recordingBadge) {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#c62828' });
    return;
  }
  const data = await chrome.storage.local.get(QUEUE_KEY);
  await updateBadge(Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY].length : 0);
}

async function ensureOffscreen() {
  if (!chrome.offscreen) throw new Error(t('bg_recUnsupported'));
  try {
    if (chrome.runtime.getContexts) {
      const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (ctx && ctx.length) return;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'BLOBS'],
      justification: 'Records the tab or microphone the user asked Gum to record, and hands a pending recording to Save to disk.',
    });
  } catch (err) {
    if (!/single offscreen|only a single/i.test(String(err && err.message))) throw err;
  }
}

async function closeOffscreenIfIdle() {
  if ((await activeRecs()).length) return;
  // A Save to disk in progress reads the offscreen document's Blob URL.
  if (typeof diskSaves !== 'undefined' && diskSaves.size) return;
  if (typeof micClipActive !== 'undefined' && micClipActive) return;
  try {
    if (chrome.offscreen && chrome.offscreen.closeDocument) await chrome.offscreen.closeDocument();
  } catch {
    /* already closed */
  }
}

/** The largest visible video on the tab, as a crop region (auto-crop). */
async function videoRegionOnTab(tab) {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'jp-video-rect' }, { frameId: 0 });
    return res && res.region ? res.region : null;
  } catch {
    return null;
  }
}

/**
 * Tab (video or tab audio) or microphone recording. Both run in the offscreen
 * document and share the chunked IndexedDB → /v1/recordings upload. The mic is
 * opened by the offscreen document, so the permission belongs to the extension,
 * not to whatever site is in the tab; an offscreen document cannot show the
 * prompt, so a first mic recording opens the options page to grant it.
 */
async function startRecording(tab, opts = {}) {
  if (!IDB) throw new Error(t('bg_recUnsupported'));
  const source = opts.source === 'mic' ? 'mic' : 'tab';
  if (source === 'tab' && (!tab?.id || !isScriptableUrl(tab.url || ''))) throw new Error(t('bg_tabRestricted'));
  const running = await activeRecs();
  if (running.length) return stopRecording(running[0].id, 'user');
  const settings = await getSettings();
  let streamId = null;
  if (source === 'tab') {
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    } catch (err) {
      const m = String((err && err.message) || err);
      // Chrome only lets an invoked extension capture a tab.
      throw new Error(/invoked|activeTab|permission/i.test(m) ? t('bg_recNeedsGesture') : m);
    }
  }
  const video = source === 'tab' && opts.video !== false;
  let crop = video ? opts.crop || null : null;
  if (video && !crop && settings.recordAutoCrop) crop = await videoRegionOnTab(tab);
  const rec = {
    id: newQueueId(),
    kind: source,
    video,
    tabId: tab && tab.id ? tab.id : null,
    url: (tab && tab.url) || '',
    title: (tab && tab.title) || '',
    startedAt: Date.now(),
    status: 'recording',
    chunks: 0,
    bytes: 0,
    uploadedSeq: -1,
    serverId: null,
    crop,
  };
  await IDB.put('recs', rec);
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'offscreen-rec-start',
    recId: rec.id,
    source,
    streamId,
    video,
    crop,
    maxMs: settings.recordMaxMinutes * 60000,
  });
  if (!res || !res.ok) {
    await IDB.delete('recs', rec.id);
    await closeOffscreenIfIdle();
    if (source === 'mic' && res && (res.name === 'NotAllowedError' || res.name === 'SecurityError')) {
      // Grant once on an extension page that can show the prompt.
      try {
        await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#mic') });
      } catch {
        /* the message below still says what to do */
      }
      const err = new Error(t('bg_micGrantNeeded'));
      err.code = 'mic_permission';
      throw err;
    }
    if (source === 'mic' && res && (res.name === 'NotFoundError' || res.name === 'NotReadableError')) {
      throw new Error(t('content_micUnavailable'));
    }
    throw new Error((res && res.error) || t('bg_recFailed'));
  }
  rec.mimeType = res.mimeType || (video ? 'video/webm' : 'audio/webm');
  rec.transcribe = settings.recordTranscribe !== false;
  await IDB.put('recs', rec);
  await refreshBadge();
  void pumpUpload(rec.id);
  return { ok: true, recording: true, id: rec.id, video, source };
}

async function stopRecording(recId, reason) {
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'offscreen-rec-stop', recId, reason });
  } catch {
    /* the offscreen document is gone: mark it stopped below */
  }
  // The offscreen document reports `rec-stopped` itself; this is the fallback
  // for a document that died with the recording.
  await updateRec(recId, (rec) => {
    if (rec.status !== 'recording') return false;
    rec.status = 'stopped';
    rec.stoppedAt = Date.now();
    return true;
  });
  await refreshBadge();
  void pumpUpload(recId);
  return { ok: true, recording: false, id: recId };
}

/*
 * Every change to a `recs` row goes through this one chain: read the CURRENT
 * row, mutate, write. The uploader used to hold a copy across awaits and write
 * it back, so a stop that landed mid-upload was overwritten (the row stayed
 * `recording`, the REC badge stuck, and /finish was never sent). The mutator
 * returns false to skip the write.
 */
let recWrites = Promise.resolve();
function updateRec(recId, mutate) {
  const run = async () => {
    if (!IDB || !recId) return null;
    const rec = await IDB.get('recs', recId);
    if (!rec) return null;
    if (mutate(rec) === false) return rec;
    await IDB.put('recs', rec);
    return rec;
  };
  const next = recWrites.then(run, run);
  recWrites = next.catch(() => undefined);
  return next;
}

/*
 * After a browser restart (or an offscreen document that died) rows can be
 * left `recording` with nothing recording them: mark them stopped so the badge
 * clears and what was captured is uploaded. A live offscreen document is asked
 * which sessions it still runs; only the others are cleaned.
 */
async function cleanupStaleRecordings() {
  if (!IDB) return 0;
  const active = await activeRecs();
  if (!active.length) return 0;
  let live = [];
  try {
    const ctx = chrome.runtime.getContexts ? await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }) : [];
    if (ctx && ctx.length) {
      const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'offscreen-rec-list' });
      live = res && Array.isArray(res.ids) ? res.ids : [];
    }
  } catch {
    live = [];
  }
  let cleaned = 0;
  for (const rec of active) {
    if (live.includes(rec.id)) continue;
    const done = await updateRec(rec.id, (r) => {
      if (r.status !== 'recording') return false;
      r.status = r.chunks ? 'stopped' : 'failed';
      r.stoppedAt = r.stoppedAt || Date.now();
      r.durationMs = r.durationMs || Math.max(0, r.stoppedAt - (r.startedAt || r.stoppedAt));
      r.error = r.chunks ? r.error : t('bg_recFailed');
      return true;
    });
    if (done) {
      cleaned += 1;
      void pumpUpload(rec.id);
    }
  }
  await refreshBadge();
  return cleaned;
}

async function handleRecordMessage(msg, tab) {
  try {
    if (msg.type === 'record-status') {
      const recs = await listRecs();
      return {
        ok: true,
        active: recs.filter((r) => r.status === 'recording'),
        pending: recs.filter((r) => r.status !== 'recording' && r.status !== 'finished').slice(0, 10),
      };
    }
    if (msg.type === 'record-stop') {
      const running = await activeRecs();
      for (const rec of running) await stopRecording(rec.id, 'user');
      return { ok: true, recording: false };
    }
    return await startRecording(tab, {
      video: msg.video !== false,
      crop: msg.crop || null,
      source: msg.source === 'mic' ? 'mic' : 'tab',
    });
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), ...(err && err.code ? { code: err.code } : {}) };
  }
}

/** Events from the offscreen recorder. */
async function handleRecorderEvent(msg) {
  if (!IDB || !msg.recId) return { ok: false };
  if (msg.type === 'rec-chunk') {
    const rec = await updateRec(msg.recId, (r) => {
      r.chunks = Math.max(r.chunks || 0, Number(msg.seq) + 1);
      r.bytes = (r.bytes || 0) + (Number(msg.size) || 0);
    });
    if (!rec) return { ok: false };
    void pumpUpload(rec.id);
    return { ok: true };
  }
  if (msg.type === 'rec-stopped' || msg.type === 'rec-error') {
    const rec = await updateRec(msg.recId, (r) => {
      if (r.status === 'recording') r.status = msg.type === 'rec-error' && !r.chunks ? 'failed' : 'stopped';
      r.stoppedAt = Date.now();
      r.durationMs = Number(msg.durationMs) || Date.now() - r.startedAt;
      if (msg.type === 'rec-error') r.error = String(msg.error || '');
    });
    if (!rec) return { ok: false };
    await refreshBadge();
    await closeOffscreenIfIdle();
    const tab = await chrome.tabs.get(rec.tabId).catch(() => null);
    if (tab) await toastOnTab(tab, msg.type === 'rec-error' ? rec.error || t('bg_recFailed') : t('bg_recStopped'), msg.type === 'rec-error' ? 'err' : 'ok');
    void pumpUpload(rec.id);
    return { ok: true };
  }
  return { ok: false };
}

const uploadChains = new Map();
function pumpUpload(recId) {
  const prev = uploadChains.get(recId) || Promise.resolve();
  const next = prev.then(() => uploadStep(recId)).catch(() => undefined);
  uploadChains.set(recId, next);
  return next;
}

/** fetch with an abort timeout (an app that hangs must not wedge the upload chain). */
async function fetchWithTimeout(url, init, ms) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    return await fetch(url, ctl ? { ...init, signal: ctl.signal } : init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const REC_CHUNK_TIMEOUT_MS = 60_000;
const REC_FINISH_POLL_MS = 2000;
const REC_FINISH_POLL_MAX = 900; // 30 min of conversion at most per pump

/*
 * The uploader. It never writes back a stale copy of the row (updateRec), and
 * each chunk is deleted from IndexedDB as soon as the app acknowledged it: a
 * one-hour recording used to keep ~1.1 GB in the browser until /finish.
 */
async function uploadStep(recId) {
  let rec = await IDB.get('recs', recId);
  if (!rec || rec.status === 'finished' || rec.status === 'failed') return;
  // Locked: the chunks stay in IndexedDB and nothing is sent — a recording in
  // progress would otherwise PUT one every two seconds into a 423. The flush
  // alarm probes /v1/health and resumes this once the app is unlocked.
  if (await isAppLockedHint()) return pauseForLock(recId);
  if (rec.paused === 'locked') {
    rec =
      (await updateRec(recId, (r) => {
        delete r.paused;
      })) || rec;
  }
  const { token, port } = await getConfig();
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  if (rec.status === 'finishing' && rec.serverId) return pollFinish(recId);
  if (!rec.serverId) {
    try {
      const created = await apiFetch('/v1/recordings', {
        method: 'POST',
        body: JSON.stringify({
          kind: rec.kind === 'mic' ? 'mic' : 'tab',
          mimeType: rec.mimeType || (rec.kind === 'mic' ? 'audio/webm' : 'video/webm'),
          title: rec.title,
          url: rec.url,
          purpose: 'recording',
          crop: rec.crop || undefined,
          startedAt: rec.startedAt,
        }),
      });
      const serverId = created.id;
      rec = await updateRec(recId, (r) => {
        r.serverId = serverId;
        r.uploadedSeq = -1;
      });
      if (!rec) return;
    } catch (err) {
      if (err && err.locked) return pauseForLock(recId);
      return; // offline or busy: the flush alarm tries again
    }
  }
  const serverId = rec.serverId;
  const chunks = (await IDB.getAllByIndex('chunks', 'recId', recId)).sort((a, b) => a.seq - b.seq);
  let uploadedSeq = rec.uploadedSeq;
  for (const chunk of chunks) {
    if (chunk.seq <= uploadedSeq) {
      // Acknowledged earlier (the delete was interrupted): drop it now.
      await IDB.delete('chunks', chunk.key);
      continue;
    }
    let res;
    try {
      res = await fetchWithTimeout(
        `${baseUrl(port)}/v1/recordings/${serverId}/chunks/${chunk.seq}`,
        { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: chunk.data },
        REC_CHUNK_TIMEOUT_MS,
      );
    } catch {
      return;
    }
    if (res.status === 423) {
      // Not acknowledged, so the chunk stays; nothing after it is tried.
      await noteAppLocked(true);
      return pauseForLock(recId);
    }
    if (res.status === 404) {
      // The app lost the session (restart past 24 h): start a new one next time.
      await updateRec(recId, (r) => {
        r.serverId = null;
      });
      return;
    }
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (typeof body.nextSeq === 'number') {
        uploadedSeq = body.nextSeq - 1;
        await updateRec(recId, (r) => {
          r.uploadedSeq = uploadedSeq;
        });
        if (chunk.seq <= uploadedSeq) await IDB.delete('chunks', chunk.key);
      }
      if (body.error === 'gap') return pumpUpload(recId);
      continue;
    }
    if (!res.ok) return;
    uploadedSeq = chunk.seq;
    await updateRec(recId, (r) => {
      r.uploadedSeq = Math.max(r.uploadedSeq ?? -1, uploadedSeq);
      delete r.paused;
    });
    await IDB.delete('chunks', chunk.key);
  }
  // Re-read: a stop may have landed while the chunks were going up.
  rec = await IDB.get('recs', recId);
  if (!rec || rec.status !== 'stopped' || rec.uploadedSeq < (rec.chunks || 0) - 1) return;
  try {
    // Async finish: the app answers 202 at once and converts in the background;
    // an older app answers 200 with the result (still handled).
    const result = await apiFetch(`/v1/recordings/${serverId}/finish`, {
      method: 'POST',
      body: JSON.stringify({ totalChunks: rec.chunks, durationMs: rec.durationMs, transcribe: rec.transcribe !== false, async: true }),
      timeoutMs: 120_000,
    });
    if (result && result.pending) {
      await updateRec(recId, (r) => {
        r.status = 'finishing';
      });
      return pollFinish(recId);
    }
    await completeRecording(recId, result);
  } catch (err) {
    // Retried by the flush alarm; a 423 keeps the row `stopped` until unlock.
    if (err && err.locked) await pauseForLock(recId);
  }
}

/** Mark a recording as waiting for the app to be unlocked (shown by the popup's list). */
async function pauseForLock(recId) {
  await updateRec(recId, (r) => {
    if (r.paused === 'locked') return false;
    r.paused = 'locked';
    return true;
  });
}

async function completeRecording(recId, result) {
  const failed = result && result.ok === false;
  const rec = await updateRec(recId, (r) => {
    r.status = failed ? 'failed' : 'finished';
    r.result = result;
    if (failed) r.error = String(result.error || '');
  });
  await IDB.deleteByIndex('chunks', 'recId', recId);
  if (!rec || failed) return;
  await recordActivity({ kind: 'recording', label: rec.title || rec.url });
  const tab = rec.tabId ? await chrome.tabs.get(rec.tabId).catch(() => null) : null;
  if (tab) await toastOnTab(tab, t('bg_recSaved'), 'ok');
}

/** Poll /status until the app's conversion is done (the /finish request no longer waits for it). */
async function pollFinish(recId) {
  for (let i = 0; i < REC_FINISH_POLL_MAX; i += 1) {
    const rec = await IDB.get('recs', recId);
    if (!rec || rec.status !== 'finishing' || !rec.serverId) return;
    let st;
    try {
      st = await apiFetch(`/v1/recordings/${rec.serverId}/status`, { timeoutMs: 15_000 });
    } catch (err) {
      // Offline or locked: the flush alarm resumes polling (after the unlock).
      if (err && err.locked) await pauseForLock(recId);
      return;
    }
    if (st && (st.state === 'finished' || st.state === 'failed')) {
      await completeRecording(recId, st.result || { ok: st.state === 'finished', id: rec.serverId, error: st.error });
      return;
    }
    await new Promise((r) => setTimeout(r, REC_FINISH_POLL_MS));
  }
}

async function resumeRecordingUploads() {
  for (const rec of await listRecs()) {
    if (rec.status === 'stopped' || rec.status === 'finishing') void pumpUpload(rec.id);
  }
}

async function discardRecording(recId) {
  const rec = await IDB.get('recs', recId);
  if (!rec) return { ok: true };
  if (rec.status === 'recording') await stopRecording(recId, 'discard');
  if (rec.serverId) {
    try {
      await apiFetch(`/v1/recordings/${rec.serverId}`, { method: 'DELETE' });
    } catch {
      /* the app cleans partials after 24 h anyway */
    }
  }
  await IDB.deleteByIndex('chunks', 'recId', recId);
  await IDB.delete('recs', recId);
  await refreshBadge();
  return { ok: true };
}

/*
 * Save to disk: a pending recording's chunks, as one file, through
 * chrome.downloads. `downloads` is an OPTIONAL permission: the toolbar popup
 * requests it on the click (a user gesture), so the extension never holds it
 * unasked. A service worker has no URL.createObjectURL, so the offscreen
 * document (reason BLOBS) assembles the Blob and keeps its URL alive until
 * the download completes.
 */
const diskSaves = new Map();
let diskSaveListener = false;

/*
 * The page's "record audio" clip (attached to the next saved card), recorded by
 * the offscreen document so the microphone permission is the extension's, not
 * each site's. Same grant flow as a mic recording.
 */
let micClipActive = false;

async function handleMicClip(action) {
  if (action === 'stop') {
    if (!micClipActive) return { ok: false, recording: false };
    micClipActive = false;
    let res = null;
    try {
      res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'offscreen-clip-stop' });
    } catch (err) {
      res = { ok: false, error: String((err && err.message) || err) };
    }
    await closeOffscreenIfIdle();
    return { ...(res || { ok: false }), recording: false };
  }
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'offscreen-clip-start' });
  if (res && res.ok) {
    micClipActive = true;
    return { ok: true, recording: true };
  }
  await closeOffscreenIfIdle();
  if (res && (res.name === 'NotAllowedError' || res.name === 'SecurityError')) {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('options.html#mic') });
    } catch {
      /* the message still says what to do */
    }
    return { ok: false, code: 'mic_permission', error: t('bg_micGrantNeeded') };
  }
  if (res && (res.name === 'NotFoundError' || res.name === 'NotReadableError')) {
    return { ok: false, code: 'mic_unavailable', error: t('content_micUnavailable') };
  }
  return { ok: false, error: (res && res.error) || t('content_micUnavailable') };
}

function recordingFilename(rec) {
  const d = new Date(rec.startedAt || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `Gum ${rec.kind === 'mic' ? 'mic' : 'tab'} recording ${stamp}.webm`;
}

async function releaseDiskSave(downloadId) {
  const url = diskSaves.get(downloadId);
  if (!url) return;
  diskSaves.delete(downloadId);
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'offscreen-revoke', url });
  } catch {
    /* the document is already gone */
  }
  await closeOffscreenIfIdle();
}

async function saveRecordingToDisk(recId) {
  if (!chrome.downloads || typeof chrome.downloads.download !== 'function') {
    return { ok: false, code: 'downloads_permission', error: t('bg_recSaveNeedsPermission') };
  }
  const rec = IDB ? await IDB.get('recs', recId) : null;
  const chunks = rec ? await IDB.getAllByIndex('chunks', 'recId', recId) : [];
  if (!rec || !chunks.length) return { ok: false, error: t('bg_recSaveMissing') };
  // Chunks are dropped once the app has them; a partly uploaded recording is
  // no longer a whole file here (it lives in Gum).
  const seqs = chunks.map((c) => c.seq).sort((a, b) => a - b);
  if (seqs[0] !== 0 || seqs.length < (rec.chunks || 0)) {
    return { ok: false, code: 'rec_in_app', error: t('bg_recSaveInApp') };
  }
  if (!diskSaveListener && chrome.downloads.onChanged && chrome.downloads.onChanged.addListener) {
    diskSaveListener = true;
    chrome.downloads.onChanged.addListener((delta) => {
      const state = delta && delta.state && delta.state.current;
      if (state === 'complete' || state === 'interrupted') void releaseDiskSave(delta.id);
    });
  }
  await ensureOffscreen();
  const made = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'offscreen-blob-url',
    recId,
    mimeType: rec.mimeType || (rec.kind === 'mic' ? 'audio/webm' : 'video/webm'),
  });
  if (!made || !made.ok || !made.url) {
    await closeOffscreenIfIdle();
    return { ok: false, error: (made && made.error) || t('bg_recFailed') };
  }
  try {
    const downloadId = await chrome.downloads.download({
      url: made.url,
      filename: recordingFilename(rec),
      saveAs: true,
      conflictAction: 'uniquify',
    });
    diskSaves.set(downloadId, made.url);
    return { ok: true, downloadId };
  } catch (err) {
    try {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'offscreen-revoke', url: made.url });
    } catch {
      /* ignore */
    }
    await closeOffscreenIfIdle();
    return { ok: false, error: String((err && err.message) || err) };
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
    case 'media.transcribe':
      return transcribeCurrent(tab);
    case 'capture.audio.save':
      return saveAudioClipboard(tab);
    case 'capture.video.record':
      return startRecording(tab, { video: true });
    case 'capture.audio.tab':
      return startRecording(tab, { video: false });
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
  { id: 'lookup.selection', title: t('menu_lookup'), contexts: ['selection'] },
  { id: 'analyze.selection', title: t('menu_analyze'), contexts: ['selection'] },
  { id: 'save.word', title: t('menu_saveWord'), contexts: ['selection'] },
  { id: 'save.sentence', title: t('menu_saveSentence'), contexts: ['selection'] },
  { id: 'card.create', title: t('menu_createCard'), contexts: ['selection'] },
  { id: 'sep-1', type: 'separator', contexts: ['page', 'selection'] },
  { id: 'capture.page', title: t('menu_savePage'), contexts: ['page'] },
  { id: 'capture.ocr', title: t('menu_ocr'), contexts: ['page', 'image'] },
  { id: 'capture.video.record', title: t('menu_recordTab'), contexts: ['page', 'video'] },
  { id: 'app.open', title: t('menu_openApp'), contexts: ['page'] },
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

// Page scripts: registered dynamically (see syncContentScriptRegistration).
void syncContentScriptRegistration();
// Rows a browser restart (or a dead offscreen document) left `recording`.
void cleanupStaleRecordings().catch(() => undefined);
if (chrome.runtime.onStartup && chrome.runtime.onStartup.addListener) {
  chrome.runtime.onStartup.addListener(() => {
    void syncContentScriptRegistration();
    void cleanupStaleRecordings().catch(() => undefined);
  });
}
if (chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes || !changes.jpStudySettings) return;
    const before = (changes.jpStudySettings.oldValue || {}).allFrames === true;
    const after = (changes.jpStudySettings.newValue || {}).allFrames === true;
    if (before !== after) void syncContentScriptRegistration();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void syncContentScriptRegistration();
  rebuildContextMenus();
  void ensureFlushAlarm();
  void queueCount().then((n) => updateBadge(n));
  // Run the settings migration once on update so every surface sees v2 keys.
  if (SETTINGS) void SETTINGS.load().then((s) => SETTINGS.save(s));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_FLUSH) return;
  void onFlushAlarm();
});

/**
 * The one-minute tick. While the app is locked this is the only thing that
 * talks to it: a single /v1/health probe, and nothing else until it reports
 * `locked: false` — then the queue flushes and recordings resume.
 */
async function onFlushAlarm() {
  if (await stillLocked()) return;
  void flushQueue();
  void resumeRecordingUploads();
}

// A recording follows its tab: closing the tab ends it.
if (chrome.tabs.onRemoved && chrome.tabs.onRemoved.addListener) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void activeRecs().then((recs) => {
      // A mic recording is not the tab's; only tab captures end with their tab.
      for (const rec of recs) if (rec.tabId === tabId && rec.kind !== 'mic') void stopRecording(rec.id, 'tab-closed');
    });
  });
}

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
    console.warn('[Gum extension]', err);
    await toastOnTab(tab, msg || t('bg_actionFailed'), 'err');
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
    } else if (command === 'record-tab') {
      const res = await startRecording(tab, { video: true });
      await toastOnTab(tab, res.recording ? t('bg_recStarted') : t('bg_recStopped'), 'ok');
    } else if (command === 'bulk-tabs') {
      await openTabPicker();
    } else if (command === 'analyze-selection') {
      if (!tab?.id) return;
      await ensureContentScript(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: 'jp-analyze-selection' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Gum extension]', err);
    await toastOnTab(tab, msg || t('bg_commandFailed'), 'err');
  }
});

/* ------------------------------- messages --------------------------------- */

/**
 * Who sent a message. Content scripts run inside web pages, so a compromised
 * page renderer can speak with a content script's voice; extension pages
 * (popup, options, reading list) are the extension's own origin.
 */
function senderKind(sender) {
  if (!sender || (sender.id && chrome.runtime.id && sender.id !== chrome.runtime.id)) return 'foreign';
  const base = chrome.runtime.getURL('');
  const url = String(sender.url || '');
  if (url.startsWith(base) && !sender.tab) return 'page';
  if (sender.tab) return url.startsWith(base) ? 'page' : 'content';
  return 'foreign';
}

/** Messages only the extension's own pages may send (they act on other tabs or the whole queue). */
const PAGE_ONLY_MESSAGES = new Set([
  'list-tabs',
  'tab-action',
  'open-tab-picker',
  'flush',
  'get-commands',
  'ensure-content',
  'save-selection',
  'capture',
  'scan-strip',
  'status-summary',
  'recent-activity',
  'transcribe-status',
  'playlist-status',
]);

/** The tab a message is about: the sending tab for a content script, else the active one. */
async function messageTab(sender) {
  if (sender && sender.tab && sender.tab.id != null) return sender.tab;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const from = senderKind(sender);
    if (from === 'foreign' || (from === 'content' && PAGE_ONLY_MESSAGES.has(msg?.type))) {
      sendResponse({ ok: false, error: 'Forbidden' });
      return;
    }
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
            error: auth ? AUTH_FAILED_MSG : t('bg_httpStatus', res.status),
          });
          return;
        }
        const data = await res.json();
        // Additive in the app: `locked: true` while its lockscreen is engaged.
        const locked = !!(data && data.locked === true);
        await noteAppLocked(locked);
        sendResponse({ ok: true, running: true, paired: true, ...(locked ? { locked: true } : {}), data });
      } catch {
        // Nothing answered on the port — this is the genuine not-running case.
        sendResponse({ ok: false, running: false, error: t('common_gumNotRunning') });
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
          let health = null;
          try {
            health = await res.json();
          } catch {
            /* ignore */
          }
          out.version = health?.version ?? null;
          out.locked = !!(health && health.locked === true);
          await noteAppLocked(out.locked);
        }
      } catch {
        /* app offline */
      }
      // Locked: /v1/mine-info would only answer 423, and says nothing about the
      // pairing, so it is not asked; `paired` stays undetermined.
      if (out.app && !out.locked) {
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
      const tab = await messageTab(sender);
      try {
        sendResponse(await runCommand(msg.command, tab, msg.opts || {}));
      } catch (err) {
        sendResponse({ ok: false, error: String(err.message || err), offline: !!err.offline });
      }
      return;
    }
    /**
     * MINING gate 11's second half — the cue count.
     *
     * A queued job is not the answer the gate asks for; "returns a cue count"
     * is. `/v1/transcribe` can only ever reply `queued`, so without this the
     * button ends at "it will appear in the catalogue" and the user has no way
     * to learn whether it did. The popup polls this while it is open.
     *
     * Deliberately a thin pass-through: the app's status route already merges
     * both transcript sinks and separates `pending` from `failed`, and a second
     * copy of that judgement here is how the two drift apart.
     */
    if (msg?.type === 'transcribe-status') {
      const videoId = String(msg.videoId || '').trim();
      if (!videoId) {
        sendResponse({ ok: false, state: 'failed', error: 'No video id' });
        return;
      }
      try {
        sendResponse(
          await apiFetch(`/v1/transcribe/status?videoId=${encodeURIComponent(videoId)}`),
        );
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
      // The tab the save came from, not whichever tab is active by the time
      // the message lands (a save from a background tab went to the wrong page).
      const tab = await messageTab(sender);
      const text = String(msg.text || '').trim();
      if (!text) {
        sendResponse({ ok: false, error: 'No text' });
        return;
      }
      let imageDataUrl = '';
      if (msg.screenshotRegion && tab?.windowId != null) {
        try {
          const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          imageDataUrl = await cropDataUrlToRegion(shot, msg.screenshotRegion);
        } catch {
          /* a protected page cannot be captured; the card goes without */
        }
      }
      sendResponse(
        await saveText(tab, text, msg.mode || 'auto', {
          ...pickMineContext(msg),
          ...(imageDataUrl ? { imageDataUrl } : {}),
          forceAnki: msg.forceAnki === true,
          lang: msg.lang,
        }),
      );
      return;
    }
    if (msg?.type === 'clipboard-text') {
      const tab = await messageTab(sender);
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
      const tab = await messageTab(sender);
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
            body: JSON.stringify({ query: msg.query || '', lang: msg.lang || '' }),
          }),
        );
      } catch (err) {
        sendResponse({
          ok: false,
          entries: [],
          offline: !!err.offline,
          ...(err.locked ? { locked: true, code: 'locked' } : {}),
          error: String(err.message || err),
        });
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
            body: JSON.stringify({ query: msg.query || '', limit: msg.limit || 8, lang: msg.lang || '' }),
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
              // No source: the app reads it from the text (never a blanket 'ja').
              source: msg.source || '',
              target: msg.target || 'en',
            }),
          }),
        );
      } catch (err) {
        // `status` lets the page name a missing model (503) in its own language.
        sendResponse({ ok: false, status: err.status, offline: !!err.offline, error: String(err.message || err) });
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
        if (err.offline || err.locked) {
          await queueImmersion({
            url: msg.url || '',
            title: msg.title || '',
            seconds: Number(msg.seconds) || 0,
            chars: Number(msg.chars) || 0,
          });
          sendResponse({ ok: true, queued: true, ...lockedFlag(err) });
          return;
        }
        sendResponse({ ok: false, error: String(err.message || err) });
      }
      return;
    }
    // The old all-routes pi pass-through is gone: it let any content script
    // call every bridge route with the pairing token attached.
    if (msg?.type === 'scan') {
      sendResponse(await scanLookup(String(msg.text || ''), String(msg.lang || '')));
      return;
    }
    if (msg?.type === 'mic-clip') {
      sendResponse(await handleMicClip(msg.action === 'stop' ? 'stop' : 'start'));
      return;
    }
    if (msg?.type === 'annotate') {
      sendResponse(await annotateTexts(msg.texts, String(msg.lang || '')));
      return;
    }
    if (msg?.type === 'known-snapshot-refresh') {
      const snap = await knownSnapshot(true);
      sendResponse({ ok: !!snap, version: snap ? snap.version : '' });
      return;
    }
    if (msg?.type === 'word-audio') {
      try {
        sendResponse(
          await apiFetch('/v1/word-audio', {
            method: 'POST',
            body: JSON.stringify({ term: msg.term || '', reading: msg.reading || '', lang: msg.lang || '' }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, offline: !!err.offline, status: err.status === 404 ? 'unsupported' : 'offline' });
      }
      return;
    }
    if (msg?.type === 'mine-check') {
      try {
        sendResponse(
          await apiFetch('/v1/mine/check', {
            method: 'POST',
            body: JSON.stringify({ terms: Array.isArray(msg.terms) ? msg.terms.slice(0, 50) : [] }),
          }),
        );
      } catch (err) {
        sendResponse({ ok: false, duplicates: {}, offline: !!err.offline });
      }
      return;
    }
    if (msg?.type === 'record-start' || msg?.type === 'record-stop' || msg?.type === 'record-status') {
      sendResponse(await handleRecordMessage(msg, await messageTab(sender)));
      return;
    }
    if (from === 'page' && msg?.type === 'recording-upload') {
      // A user's Retry asks /v1/health first when the last answer was a lock.
      await stillLocked();
      await pumpUpload(String(msg.id || ''));
      sendResponse({ ok: true });
      return;
    }
    if (from === 'page' && msg?.type === 'recording-discard') {
      sendResponse(await discardRecording(String(msg.id || '')));
      return;
    }
    if (from === 'page' && msg?.type === 'recording-save-disk') {
      sendResponse(await saveRecordingToDisk(String(msg.id || '')));
      return;
    }
    if (from === 'page' && typeof msg?.type === 'string' && msg.type.startsWith('rec-')) {
      sendResponse(await handleRecorderEvent(msg));
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

// Test hook: only a test sandbox sets this global; nothing a page or another
// extension can reach defines it in the service worker.
if (globalThis.__JP_STUDY_TEST__ === true) globalThis.__jpStudyBg = { apiFetch, flushQueue, scanLookup };

void ensureFlushAlarm();
// A worker woken after a restart repaints REC or the pending count.
void refreshBadge();
