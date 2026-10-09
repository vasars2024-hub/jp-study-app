/* global chrome */
/* Task-oriented toolbar popup: what can I do on this page right now? */

// Every visible string comes from _locales via shared.js; the English in
// popup.html is only what shows for the instant before this runs.
const t = (key, subs) => globalThis.jpStudyShared.msg(key, subs);
const tn = (key, count, subs) => globalThis.jpStudyShared.msgCount(key, count, subs);
/** A failed reply's message in the UI language (app error codes → _locales), else `fallbackKey`. */
const appErr = (res, fallbackKey) => globalThis.jpStudyShared.appErrorText(res, fallbackKey);
globalThis.jpStudyShared.applyI18n(document);

const chipEl = document.getElementById('status-chip');
const detailEl = document.getElementById('status-detail');
const stApp = document.getElementById('st-app');
const stPair = document.getElementById('st-pair');
const stAnki = document.getElementById('st-anki');
const stPending = document.getElementById('st-pending');
const pageTitleEl = document.getElementById('page-title');
const pageMetaEl = document.getElementById('page-meta');
const pageCardEl = document.getElementById('page-card');
const actionsEl = document.getElementById('actions');
const recentWrap = document.getElementById('recent-wrap');
const recentEl = document.getElementById('recent');
const pendingBar = document.getElementById('pending-bar');
const pendingText = document.getElementById('pending-text');
const feedbackEl = document.getElementById('feedback');

let detect = null;

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, error: t('common_noResponse') });
    });
  });
}

function feedback(text, cls) {
  feedbackEl.textContent = text || '';
  feedbackEl.className = cls || '';
}

/* ------------------------------ status header ------------------------------ */

async function refreshStatus() {
  const st = await send({ type: 'status-summary' });
  const pending = st?.pending || 0;

  if (st?.app && st?.paired !== false) {
    chipEl.textContent = pending > 0 ? tn('popup_chipConnectedQueued', pending) : t('popup_chipConnected');
    chipEl.className = 'status-chip' + (pending > 0 ? ' warn' : ' ok');
  } else if (st?.app) {
    chipEl.textContent = t('popup_chipPairingNeeded');
    chipEl.className = 'status-chip warn';
  } else {
    chipEl.textContent = t('popup_chipAppNotRunning');
    chipEl.className = 'status-chip err';
  }

  stApp.textContent = st?.app ? t('popup_appRunning') : t('popup_appNotRunning');
  stApp.className = 'v ' + (st?.app ? 'ok' : 'err');
  stPair.textContent = !st?.app ? '—' : st?.paired === false ? t('popup_pairTokenNeeded') : t('popup_pairOk');
  stPair.className = 'v ' + (!st?.app ? '' : st?.paired === false ? 'warn' : 'ok');
  stAnki.textContent = st?.profileName
    ? st.deckName
      ? `${st.profileName} → ${st.deckName}`
      : st.profileName
    : '—';
  stAnki.className = 'v';
  stPending.textContent = String(pending);
  stPending.className = 'v ' + (pending > 0 ? 'warn' : '');

  pendingBar.hidden = pending === 0;
  if (pending > 0) {
    pendingText.textContent = tn('popup_pendingItems', pending);
  }
}

chipEl.addEventListener('click', () => {
  const open = detailEl.hidden;
  detailEl.hidden = !open;
  chipEl.setAttribute('aria-expanded', open ? 'true' : 'false');
});

document.getElementById('fix-connection').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

/* ------------------------------- page section ------------------------------ */

async function refreshPage() {
  detect = await send({ type: 'detect' });
  if (!detect?.ok || !detect.scriptable) {
    pageCardEl.classList.add('empty');
    pageTitleEl.textContent = t('popup_pageRestricted');
    pageMetaEl.innerHTML = '';
    if (detect?.ok && !detect.scriptable) {
      pageMetaEl.innerHTML = `<span>${escapeHtml(t('popup_pageRestrictedHint'))}</span>`;
    }
    renderActions();
    return;
  }
  pageTitleEl.textContent = detect.title || detect.url || t('popup_currentPage');
  pageTitleEl.title = detect.url || '';

  const pills = [`<span class="pill">${escapeHtml(detect.categoryLabel || t('category_webpage'))}</span>`];

  // Difficulty + known coverage come from the content script's page scan.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const badge = await chrome.tabs.sendMessage(tab.id, { type: 'jp-get-level-badge' });
      if (badge?.badge && badge.badge !== '—' && badge.badge !== 'X') {
        pills.push(
          `<span class="pill" title="${escapeHtml(t('popup_difficultyTitle'))}">${escapeHtml(
            t(badge.offline ? 'popup_difficultyCached' : 'popup_difficulty', badge.badge),
          )}</span>`,
        );
      }
      if (typeof badge?.comprehensibility === 'number') {
        pills.push(`<span class="pill">${escapeHtml(t('popup_knownWords', badge.comprehensibility))}</span>`);
      }
      if (badge?.empty) {
        pageCardEl.classList.add('empty');
        pageTitleEl.textContent = t('popup_noJapanese');
        pageMetaEl.innerHTML = `<span>${escapeHtml(t('popup_noJapaneseHint'))}</span>`;
        renderActions();
        return;
      }
    }
  } catch {
    /* content script not present (e.g. page just opened) — fine */
  }
  pageCardEl.classList.remove('empty');
  pageMetaEl.innerHTML = pills.join('');
  renderActions();
  // Not awaited: one status call must never delay the buttons.
  void showTranscriptionPill();
}

/**
 * What Gum already knows about THIS video's audio, before anything is
 * clicked.
 *
 * `/v1/transcribe/status` knew all of this already and nothing asked it except
 * a poller started by a click — so a video transcribed yesterday looked
 * identical to one never touched, and the only way to learn the cue count was
 * to press Transcribe again.
 *
 * `notStarted` is deliberately SILENT. It is the ordinary state of every video
 * on the internet, and a pill for it would be noise on every page; it exists so
 * that the `failed` pill, which IS actionable, is not printed over videos this
 * machine has never downloaded. That was the actual defect: before `notStarted`
 * this branch would have said "transcription failed" on every YouTube page.
 */
async function showTranscriptionPill() {
  if (detect?.kind !== 'youtube-video') return;
  // `detect` reports the page KIND, not the id — parsed here rather than
  // widening that message, which four other callers already depend on.
  const videoId = parseVideoId(detect.url || '');
  if (!videoId) return;
  const res = await send({ type: 'transcribe-status', videoId });
  if (!res || res.state === 'notStarted') return;
  let pill = null;
  if (res.state === 'transcribed') {
    pill = `<span class="pill" title="${escapeHtml(t('popup_transcribedTitle'))}">${escapeHtml(tn('popup_transcribedCues', res.cueCount))}</span>`;
  } else if (res.state === 'pending') {
    const secs = Number.isFinite(res.queuedAt) ? Math.round((Date.now() - res.queuedAt) / 1000) : null;
    pill = `<span class="pill">${escapeHtml(secs === null ? t('popup_transcribing') : t('popup_transcribingFor', secs))}</span>`;
  } else if (res.state === 'failed') {
    pill = `<span class="pill" title="${escapeHtml(t('popup_transcriptionEmptyTitle'))}">${escapeHtml(t('popup_transcriptionEmpty'))}</span>`;
  }
  if (!pill) return;
  pageMetaEl.insertAdjacentHTML('beforeend', pill);
  // A job still running is worth following from here too — the popup is open,
  // and the count is the thing the gate asks for.
  if (res.state === 'pending') void followTranscription(videoId, res.queuedAt);
}

/** The 11-character id in a watch/shorts/youtu.be URL, or ''. */
function parseVideoId(url) {
  const m = String(url || '').match(/(?:v=|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -------------------------------- actions ---------------------------------- */

function renderActions() {
  const kind = detect?.kind || 'article';
  const category = detect?.category || 'other';
  const scriptable = !!detect?.scriptable;
  let items;
  if (!scriptable) {
    items = [{ id: 'open-app', label: t('popup_navApp'), primary: true }];
  } else if (kind === 'youtube-video' || kind === 'youtube-playlist') {
    items = [
      { id: 'capture-page', label: kind === 'youtube-playlist' ? t('popup_savePlaylist') : t('popup_saveVideo'), primary: true },
      { id: 'download', label: t('popup_downloadVideo') },
      // MINING gate 11. Only on a single video: a playlist has no one audio
      // track to transcribe, and offering it there would be a button that can
      // only refuse.
      ...(kind === 'youtube-video' ? [{ id: 'transcribe', label: t('popup_transcribeAudio') }] : []),
      { id: 'lookup', label: t('popup_lookupSelection') },
      { id: 'save-selection', label: t('popup_saveSelection') },
    ];
  } else if (category === 'manga') {
    items = [
      { id: 'ocr', label: t('popup_ocrCapture'), primary: true },
      { id: 'scan-strip', label: t('popup_importManga') },
      { id: 'lookup', label: t('popup_lookupSelection') },
      { id: 'capture-page', label: t('popup_savePage') },
    ];
  } else {
    items = [
      { id: 'lookup', label: t('popup_lookupSelection'), primary: true },
      { id: 'save-selection', label: t('popup_saveSelection') },
      { id: 'capture-page', label: t('popup_savePage') },
      { id: 'ocr', label: t('popup_ocrCapture') },
    ];
  }
  actionsEl.innerHTML = items
    .map(
      (a) =>
        `<button type="button" data-action="${a.id}"${a.primary ? ' class="primary"' : ''}>${escapeHtml(a.label)}</button>`,
    )
    .join('');
}

actionsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    if (action === 'lookup') {
      const res = await send({ type: 'run-command', command: 'lookup.selection' });
      if (res?.ok) window.close();
      else feedback(appErr(res, 'popup_lookupFailed'), 'err');
    } else if (action === 'save-selection') {
      feedback(t('popup_savingSelection'), 'pending');
      const res = await send({ type: 'save-selection', mode: 'auto' });
      feedback(formatSave(res), res?.ok || res?.queued ? 'ok' : 'err');
    } else if (action === 'capture-page') {
      feedback(t('popup_savingPage'), 'pending');
      const res = await send({ type: 'capture' });
      feedback(formatCapture(res), res?.ok || res?.queued ? 'ok' : 'err');
    } else if (action === 'download') {
      feedback(t('popup_queueingDownload'), 'pending');
      const res = await send({ type: 'run-command', command: 'media.download' });
      feedback(res?.ok ? t('popup_downloadQueued') : appErr(res, 'popup_downloadFailed'), res?.ok ? 'ok' : 'err');
    } else if (action === 'transcribe') {
      feedback(t('popup_askingTranscribe'), 'pending');
      const res = await send({ type: 'run-command', command: 'media.transcribe' });
      feedback(formatTranscribe(res), res?.ok ? 'ok' : 'err');
      // Not awaited: the job runs for minutes and the button must not stay
      // disabled for them. See followTranscription.
      if ((res?.state === 'queued' || res?.state === 'running') && res.videoId) {
        void followTranscription(res.videoId, res.queuedAt);
      }
    } else if (action === 'ocr') {
      const res = await send({ type: 'run-command', command: 'capture.ocr' });
      if (res?.ok) window.close();
      else feedback(appErr(res, 'popup_ocrFailed'), 'err');
    } else if (action === 'scan-strip') {
      feedback(t('popup_scanningManga'), 'pending');
      const res = await send({ type: 'scan-strip' });
      feedback(
        res?.ok
          ? tn('popup_mangaImported', res.pageCount ?? res.imageCount ?? 0)
          : appErr(res, 'popup_importFailed'),
        res?.ok ? 'ok' : 'err',
      );
    } else if (action === 'open-app') {
      const res = await send({ type: 'ui-open', target: 'inbox' });
      if (!res?.ok) feedback(appErr(res, 'common_gumNotRunning'), 'err');
      else window.close();
    }
  } finally {
    btn.disabled = false;
    void refreshStatus();
    void refreshRecent();
  }
});

/**
 * MINING gate 11's user-facing text. Every refusal gets its OWN sentence with
 * the next step in it — a shared "Transcription failed" is what makes a feature
 * that is working correctly look broken.
 */
const TRANSCRIBE_REFUSALS = {
  notAVideoPage: 'popup_refuseNotAVideoPage',
  noVideoId: 'popup_refuseNoVideoId',
  notDownloaded: 'popup_refuseNotDownloaded',
  audioMissing: 'popup_refuseAudioMissing',
  transcriberOffline: 'popup_refuseTranscriberOffline',
  'host-not-registered': 'popup_refuseTranscriberOffline',
  'item-not-found': 'popup_refuseItemNotFound',
};

/**
 * MINING gate 11 — carry a queued job through to its cue count.
 *
 * The gate is "the button transcribes the audio of the page being watched and
 * RETURNS A CUE COUNT". `/v1/transcribe` can only answer `queued`, so the count
 * has to be collected afterwards from `/v1/transcribe/status`, which is the one
 * place that knows both transcript sinks.
 *
 * Four honest endings, never a shared "failed":
 *   transcribed -> the number
 *   failed      -> the job ended and left no transcript, with the next step
 *   notStarted  -> nothing was ever queued, because the video is not downloaded
 *   neither     -> still running, with the elapsed time so it is visibly alive
 *
 * `notStarted` cannot happen after our own POST returned `queued` — the queue
 * only accepts a media row. It is here because this route is polled, and a poll
 * that begins before or without a download must not report a failure that never
 * happened.
 *
 * A closed popup ends the poll — MV3 gives it no life of its own. That is not a
 * lost result: the transcript still lands in the catalogue, and pressing the
 * button again reports the finished count through `formatTranscribe`'s
 * already-transcribed branch. The initial `queued` line says exactly that.
 */
const TRANSCRIBE_POLL_MS = 4000;
/** 20 minutes at 4 s. Long enough for a first run that downloads a model. */
const TRANSCRIBE_POLL_LIMIT = 300;

async function followTranscription(videoId, startedAt) {
  // The JOB's clock when the app gave us one, not the poll's. Clicking a
  // second time on a job eight minutes in used to restart the counter at 0s.
  let clock = Number.isFinite(startedAt) ? startedAt : Date.now();
  const elapsed = () => Math.round((Date.now() - clock) / 1000);
  for (let i = 0; i < TRANSCRIBE_POLL_LIMIT; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, TRANSCRIBE_POLL_MS));
    const res = await send({ type: 'transcribe-status', videoId });
    if (!res) continue;
    if (Number.isFinite(res.queuedAt)) clock = res.queuedAt;
    if (res.state === 'transcribed') {
      feedback(tn('popup_transcribedDone', res.cueCount), 'ok');
      return;
    }
    if (res.state === 'failed') {
      feedback(t('popup_transcriptionEnded'), 'err');
      return;
    }
    if (res.state === 'notStarted') {
      feedback(t('popup_transcriptionNotStarted'), 'err');
      return;
    }
    feedback(t('popup_transcribingElapsed', elapsed()), 'pending');
  }
  feedback(t('popup_stillTranscribing'), 'pending');
}

function formatTranscribe(res) {
  if (!res) return t('popup_transcriptionFailed');
  if (res.state === 'transcribed') {
    return tn('popup_alreadyTranscribed', res.cueCount);
  }
  if (res.state === 'queued') return t('popup_transcribeQueued');
  // A second click on a job already running. Saying "queued" here would claim a
  // new job was started; nothing was, and `enqueueTranscription` deduplicated.
  if (res.state === 'running') {
    const secs = Number.isFinite(res.queuedAt) ? Math.round((Date.now() - res.queuedAt) / 1000) : null;
    return secs === null
      ? t('popup_alreadyTranscribing')
      : t('popup_alreadyTranscribingFor', secs);
  }
  if (res.state === 'refused') {
    const key = TRANSCRIBE_REFUSALS[res.reason];
    return key ? t(key) : res.reason || t('popup_transcriptionRefused');
  }
  return appErr(res, 'popup_transcriptionFailed');
}

function formatSave(res) {
  if (!res) return t('save_failed');
  if (!res.ok && !res.queued) return appErr(res, 'save_failed');
  if (res.queued) return t('common_queuedWillSync');
  if (res.anki?.ok) return t('popup_cardCreated');
  return t('popup_savedToGum');
}

function formatCapture(res) {
  if (!res) return t('capture_failed');
  if (!res.ok && !res.queued) return appErr(res, 'capture_failed');
  if (res.queued) return t('capture_queued');
  if (res.action === 'playlist') return t('capture_playlistSaved');
  if (res.action === 'video') return res.duplicate ? t('capture_videoDuplicate') : t('capture_videoSaved');
  return t('capture_pageSaved');
}

/* --------------------------------- recent ---------------------------------- */

const RECENT_LABELS = {
  word: 'popup_recentWord',
  sentence: 'popup_recentSentence',
  card: 'popup_recentCard',
  page: 'popup_recentPage',
  download: 'popup_recentDownload',
  ocr: 'popup_recentOcr',
  manga: 'popup_recentManga',
};

async function refreshRecent() {
  const res = await send({ type: 'recent-activity' });
  const items = res?.ok && Array.isArray(res.items) ? res.items.slice(0, 3) : [];
  recentWrap.hidden = !items.length;
  recentEl.innerHTML = items
    .map(
      (it) => `
      <div class="recent-item">
        <span class="term" lang="ja" title="${escapeHtml(it.label || '')}">${escapeHtml(it.label || '')}</span>
        <span class="what${it.queued ? ' queued' : ''}">${escapeHtml(
          t(it.queued ? 'popup_recentQueued' : RECENT_LABELS[it.kind] || 'popup_recentSaved'),
        )}</span>
      </div>`,
    )
    .join('');
}

/* -------------------------------- footer nav ------------------------------- */

document.getElementById('nav-tabs').addEventListener('click', async () => {
  const res = await send({ type: 'open-tab-picker' });
  if (res?.ok) window.close();
  else feedback(appErr(res, 'common_readingListFailed'), 'err');
});

document.getElementById('nav-app').addEventListener('click', async () => {
  const res = await send({ type: 'ui-open', target: 'inbox' });
  if (res?.ok) window.close();
  else feedback(appErr(res, 'popup_gumNotRunningStart'), 'err');
});

document.getElementById('nav-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('retry-queue').addEventListener('click', async () => {
  feedback(t('popup_retrying'), 'pending');
  const res = await send({ type: 'flush' });
  // A drop is the queue giving up on a save the user was told would sync, so it
  // has to be said out loud here. Without it a flush that discarded everything
  // reads as "Nothing to retry." — the queue's worst outcome reported as its
  // most boring one. Details of each drop go to the recent-activity list.
  const dropped = res?.dropped ? tn('popup_retryDropped', res.dropped) : '';
  const join = (...parts) => parts.filter(Boolean).join(' ');
  if (res?.flushed) {
    feedback(
      join(tn('popup_retrySent', res.flushed), res.left ? tn('popup_retryStillPending', res.left) : '', dropped),
      res.left || res.dropped ? 'err' : 'ok',
    );
  } else if (res?.left) {
    feedback(join(tn('popup_retryUnreachable', res.left), dropped), 'err');
  } else {
    feedback(dropped || t('popup_retryNothing'), dropped ? 'err' : 'ok');
  }
  void refreshStatus();
});

/* ------------------------------- AI OCR mode ------------------------------- */
//
// Highlight and OCR are switched independently: highlighting is a constant,
// low-intent gesture while an OCR is deliberate, so wanting a full AI read of
// one but not the other is the normal case. Writing through jpStudySettings
// keeps the popup, the options page and the content script on one normalized
// shape rather than three views of the same keys.

const SETTINGS = globalThis.jpStudySettings || null;

function paintModeSeg(el, isAi) {
  el.querySelectorAll('button').forEach((btn) => {
    const on = (btn.dataset.mode === 'ai') === isAi;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

async function refreshModes() {
  if (!SETTINGS) return;
  const s = await SETTINGS.load();
  paintModeSeg(document.getElementById('mode-highlight'), !!s.aiOnHighlight);
  paintModeSeg(document.getElementById('mode-ocr'), !!s.aiOnOcr);
}

function bindModeSeg(id, key) {
  const el = document.getElementById(id);
  if (!el || !SETTINGS) return;
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const isAi = btn.dataset.mode === 'ai';
    // Paint first: the write is a round trip through storage and the segment
    // feeling laggy is the whole reason this control exists in the popup.
    paintModeSeg(el, isAi);
    await SETTINGS.save({ [key]: isAi });
  });
}

bindModeSeg('mode-highlight', 'aiOnHighlight');
bindModeSeg('mode-ocr', 'aiOnOcr');

/* -------------------------------- recorder --------------------------------- */

const recTabBtn = document.getElementById('rec-tab');
const recAudioBtn = document.getElementById('rec-audio');
const recMicBtn = document.getElementById('rec-mic');
const recAreaBtn = document.getElementById('rec-area');
const recStopBtn = document.getElementById('rec-stop');
const recPendingEl = document.getElementById('rec-pending');

async function refreshRecorder() {
  const st = await send({ type: 'record-status' });
  const active = st?.ok && Array.isArray(st.active) ? st.active : [];
  const pending = st?.ok && Array.isArray(st.pending) ? st.pending : [];
  recTabBtn.hidden = active.length > 0;
  recAudioBtn.hidden = active.length > 0;
  if (recMicBtn) recMicBtn.hidden = active.length > 0;
  recAreaBtn.hidden = active.length > 0;
  recStopBtn.hidden = active.length === 0;
  if (active.length) {
    const secs = Math.round((Date.now() - (active[0].startedAt || Date.now())) / 1000);
    recStopBtn.textContent = t('popup_recStopFor', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
  }
  recPendingEl.hidden = !pending.length;
  recPendingEl.innerHTML = pending
    .map(
      (r) => `<div class="rec-item" data-id="${escapeHtml(r.id)}">
        <span class="name" title="${escapeHtml(r.url || '')}">${escapeHtml(r.title || r.url || '')}</span>
        <span>${escapeHtml(t(r.status === 'failed' ? 'popup_recFailed' : 'popup_recWaiting', String(Math.round((r.bytes || 0) / 1048576))))}</span>
        <button type="button" data-rec="upload">${escapeHtml(t('popup_recUpload'))}</button>
        <button type="button" data-rec="save-disk" title="${escapeHtml(t('popup_recSaveDiskTitle'))}">${escapeHtml(t('popup_recSaveDisk'))}</button>
        <button type="button" data-rec="discard">${escapeHtml(t('popup_recDiscard'))}</button>
      </div>`,
    )
    .join('');
}

async function startRec(video, source = 'tab') {
  const res = await send({ type: 'record-start', video, source });
  if (!res?.ok) feedback(appErr(res, 'popup_recFailedStart'), 'err');
  else feedback(t(source === 'mic' ? 'popup_recStartedMic' : video ? 'popup_recStartedVideo' : 'popup_recStartedAudio'), 'ok');
  void refreshRecorder();
}

recTabBtn.addEventListener('click', () => void startRec(true));
recAudioBtn.addEventListener('click', () => void startRec(false));
if (recMicBtn) recMicBtn.addEventListener('click', () => void startRec(false, 'mic'));

/**
 * `downloads` is optional: asked for on this click (the user gesture Chrome
 * requires), never at install. The request must be the first await.
 */
async function saveRecordingToDisk(id) {
  let granted = false;
  try {
    granted = await chrome.permissions.request({ permissions: ['downloads'] });
  } catch {
    granted = false;
  }
  if (!granted) {
    feedback(t('popup_recSaveDiskDenied'), 'err');
    return;
  }
  const res = await send({ type: 'recording-save-disk', id });
  if (res?.ok) feedback(t('popup_recSaveDiskStarted'), 'ok');
  else feedback(appErr(res, 'popup_recSaveDiskFailed'), 'err');
}
// Drag a box on the page; the recording starts with that area once it is drawn.
recAreaBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await send({ type: 'ensure-content' });
    await chrome.tabs.sendMessage(tab.id, { type: 'jp-select-record-region' });
    window.close();
  } catch {
    feedback(t('popup_recFailedStart'), 'err');
  }
});
recStopBtn.addEventListener('click', async () => {
  await send({ type: 'record-stop' });
  feedback(t('popup_recStoppedUploading'), 'ok');
  void refreshRecorder();
});
recPendingEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-rec]');
  const row = e.target.closest('.rec-item');
  if (!btn || !row) return;
  const id = row.dataset.id;
  if (btn.dataset.rec === 'save-disk') {
    await saveRecordingToDisk(id);
    return;
  }
  if (btn.dataset.rec === 'discard') await send({ type: 'recording-discard', id });
  else await send({ type: 'recording-upload', id });
  void refreshRecorder();
});

/* ---------------------------------- init ----------------------------------- */

void (async () => {
  await Promise.all([refreshStatus(), refreshPage(), refreshRecent(), refreshModes(), refreshRecorder()]);
})();

/**
 * While a recording runs or one is still on its way to Gum, keep the row live:
 * the Stop label carried a clock frozen at "0:00", and a recording the app had
 * already finished stayed listed as "waiting" with Upload/Discard on it for as
 * long as the popup stayed open (seen in Chrome, 2026-10-08).
 */
const RECORDER_TICK_MS = 1000;
setInterval(() => {
  if (!recStopBtn.hidden || !recPendingEl.hidden) void refreshRecorder();
}, RECORDER_TICK_MS);
