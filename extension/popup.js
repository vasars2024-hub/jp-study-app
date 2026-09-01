/* global chrome */
/* Task-oriented toolbar popup: what can I do on this page right now? */

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
      resolve(res || { ok: false, error: 'No response' });
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
    chipEl.textContent = pending > 0 ? `Connected · ${pending} queued` : 'Connected';
    chipEl.className = 'status-chip' + (pending > 0 ? ' warn' : ' ok');
  } else if (st?.app) {
    chipEl.textContent = 'Pairing needed';
    chipEl.className = 'status-chip warn';
  } else {
    chipEl.textContent = 'App not running';
    chipEl.className = 'status-chip err';
  }

  stApp.textContent = st?.app ? 'Running' : 'Not running';
  stApp.className = 'v ' + (st?.app ? 'ok' : 'err');
  stPair.textContent = !st?.app ? '—' : st?.paired === false ? 'Token needed' : 'OK';
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
    pendingText.textContent = `${pending} item${pending === 1 ? '' : 's'} waiting to sync`;
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
    pageTitleEl.textContent = 'This page is browser-restricted';
    pageMetaEl.innerHTML = '';
    if (detect?.ok && !detect.scriptable) {
      pageMetaEl.innerHTML = '<span>Lookup and capture are unavailable on internal browser pages.</span>';
    }
    renderActions();
    return;
  }
  pageTitleEl.textContent = detect.title || detect.url || 'Current page';
  pageTitleEl.title = detect.url || '';

  const pills = [`<span class="pill">${escapeHtml(detect.categoryLabel || 'Webpage')}</span>`];

  // Difficulty + known coverage come from the content script's page scan.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const badge = await chrome.tabs.sendMessage(tab.id, { type: 'jp-get-level-badge' });
      if (badge?.badge && badge.badge !== '—' && badge.badge !== 'X') {
        pills.push(
          `<span class="pill" title="Vocabulary-band estimate, not an official rating">Difficulty ${escapeHtml(badge.badge)}${badge.offline ? ' (cached)' : ''}</span>`,
        );
      }
      if (typeof badge?.comprehensibility === 'number') {
        pills.push(`<span class="pill">Known words ${badge.comprehensibility}%</span>`);
      }
      if (badge?.empty) {
        pageCardEl.classList.add('empty');
        pageTitleEl.textContent = 'No Japanese text detected on this page';
        pageMetaEl.innerHTML =
          '<span>Hover lookup activates when you hold the lookup key over Japanese text.</span>';
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
    items = [{ id: 'open-app', label: 'Open GrammarX', primary: true }];
  } else if (kind === 'youtube-video' || kind === 'youtube-playlist') {
    items = [
      { id: 'capture-page', label: kind === 'youtube-playlist' ? 'Save playlist' : 'Save video', primary: true },
      { id: 'download', label: 'Download video' },
      // MINING gate 11. Only on a single video: a playlist has no one audio
      // track to transcribe, and offering it there would be a button that can
      // only refuse.
      ...(kind === 'youtube-video' ? [{ id: 'transcribe', label: 'Transcribe audio' }] : []),
      { id: 'lookup', label: 'Look up selection' },
      { id: 'save-selection', label: 'Save selection' },
    ];
  } else if (category === 'manga') {
    items = [
      { id: 'ocr', label: 'OCR capture', primary: true },
      { id: 'scan-strip', label: 'Import manga pages' },
      { id: 'lookup', label: 'Look up selection' },
      { id: 'capture-page', label: 'Save page' },
    ];
  } else {
    items = [
      { id: 'lookup', label: 'Look up selection', primary: true },
      { id: 'save-selection', label: 'Save selection' },
      { id: 'capture-page', label: 'Save page' },
      { id: 'ocr', label: 'OCR capture' },
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
      else feedback(res?.error || 'Could not open the lookup popup', 'err');
    } else if (action === 'save-selection') {
      feedback('Saving selection…', 'pending');
      const res = await send({ type: 'save-selection', mode: 'auto' });
      feedback(formatSave(res), res?.ok || res?.queued ? 'ok' : 'err');
    } else if (action === 'capture-page') {
      feedback('Saving page…', 'pending');
      const res = await send({ type: 'capture' });
      feedback(formatCapture(res), res?.ok || res?.queued ? 'ok' : 'err');
    } else if (action === 'download') {
      feedback('Queueing download…', 'pending');
      const res = await send({ type: 'run-command', command: 'media.download' });
      feedback(res?.ok ? 'Download queued in GrammarX.' : res?.error || 'Download failed', res?.ok ? 'ok' : 'err');
    } else if (action === 'transcribe') {
      feedback('Asking GrammarX to transcribe…', 'pending');
      const res = await send({ type: 'run-command', command: 'media.transcribe' });
      feedback(formatTranscribe(res), res?.ok ? 'ok' : 'err');
      // Not awaited: the job runs for minutes and the button must not stay
      // disabled for them. See followTranscription.
      if (res?.state === 'queued' && res.videoId) void followTranscription(res.videoId);
    } else if (action === 'ocr') {
      const res = await send({ type: 'run-command', command: 'capture.ocr' });
      if (res?.ok) window.close();
      else feedback(res?.error || 'Could not start OCR selection', 'err');
    } else if (action === 'scan-strip') {
      feedback('Scanning manga pages… this scrolls the page', 'pending');
      const res = await send({ type: 'scan-strip' });
      feedback(
        res?.ok
          ? `Imported ${res.pageCount ?? res.imageCount ?? '?'} pages into GrammarX Manga.`
          : res?.error || 'Import failed',
        res?.ok ? 'ok' : 'err',
      );
    } else if (action === 'open-app') {
      const res = await send({ type: 'ui-open', target: 'inbox' });
      if (!res?.ok) feedback(res?.error || 'GrammarX is not running', 'err');
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
  notAVideoPage: 'Open a video page first — there is no audio on this one.',
  noVideoId: 'This YouTube URL has no video in it.',
  notDownloaded: 'Download this video first — Whisper reads the file, not the page.',
  audioMissing: 'GrammarX has a record of this video but its file is gone.',
  transcriberOffline: 'GrammarX is running but its transcriber is not ready yet.',
  'host-not-registered': 'GrammarX is running but its transcriber is not ready yet.',
  'item-not-found': 'GrammarX no longer has this video in its media library.',
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

async function followTranscription(videoId) {
  const startedAt = Date.now();
  const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}s`;
  for (let i = 0; i < TRANSCRIBE_POLL_LIMIT; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, TRANSCRIBE_POLL_MS));
    const res = await send({ type: 'transcribe-status', videoId });
    if (!res) continue;
    if (res.state === 'transcribed') {
      feedback(`Transcribed — ${res.cueCount} cues. Mine it from Files or Mining.`, 'ok');
      return;
    }
    if (res.state === 'failed') {
      feedback('The transcription ended without a transcript. Retry from the Media library.', 'err');
      return;
    }
    if (res.state === 'notStarted') {
      feedback('Nothing has been downloaded for this video yet, so no transcription has run.', 'err');
      return;
    }
    feedback(`Transcribing in GrammarX… ${elapsed()}`, 'pending');
  }
  feedback('Still transcribing in GrammarX — it will appear in the catalogue.', 'pending');
}

function formatTranscribe(res) {
  if (!res) return 'Transcription failed';
  if (res.state === 'transcribed') {
    return `Already transcribed — ${res.cueCount} cues. Mine it from Files or Mining.`;
  }
  if (res.state === 'queued') return 'Transcribing in GrammarX — it will appear in the catalogue.';
  if (res.state === 'refused') {
    return TRANSCRIBE_REFUSALS[res.reason] || res.reason || 'Transcription refused';
  }
  return res.error || 'Transcription failed';
}

function formatSave(res) {
  if (!res) return 'Save failed';
  if (!res.ok && !res.queued) return res.error || 'Save failed';
  if (res.queued) return 'Queued — will sync when GrammarX is open.';
  if (res.anki?.ok) return 'Card created in Anki · saved in GrammarX.';
  return 'Saved to GrammarX.';
}

function formatCapture(res) {
  if (!res) return 'Could not save this page';
  if (!res.ok && !res.queued) return res.error || 'Could not save this page';
  if (res.queued) return 'Page queued — will sync when GrammarX is open.';
  if (res.action === 'playlist') return 'Playlist saved to GrammarX.';
  if (res.action === 'video') return res.duplicate ? 'Video is already in GrammarX.' : 'Video saved to GrammarX.';
  return 'Page saved to your GrammarX inbox.';
}

/* --------------------------------- recent ---------------------------------- */

const RECENT_LABELS = {
  word: 'Word saved',
  sentence: 'Sentence saved',
  card: 'Card created',
  page: 'Page saved',
  download: 'Download queued',
  ocr: 'OCR captured',
  manga: 'Manga imported',
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
          it.queued ? 'Queued' : RECENT_LABELS[it.kind] || 'Saved',
        )}</span>
      </div>`,
    )
    .join('');
}

/* -------------------------------- footer nav ------------------------------- */

document.getElementById('nav-tabs').addEventListener('click', async () => {
  const res = await send({ type: 'open-tab-picker' });
  if (res?.ok) window.close();
  else feedback(res?.error || 'Could not open the reading list', 'err');
});

document.getElementById('nav-app').addEventListener('click', async () => {
  const res = await send({ type: 'ui-open', target: 'inbox' });
  if (res?.ok) window.close();
  else feedback(res?.error || 'GrammarX is not running — start the desktop app.', 'err');
});

document.getElementById('nav-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('retry-queue').addEventListener('click', async () => {
  feedback('Retrying queued items…', 'pending');
  const res = await send({ type: 'flush' });
  // A drop is the queue giving up on a save the user was told would sync, so it
  // has to be said out loud here. Without it a flush that discarded everything
  // reads as "Nothing to retry." — the queue's worst outcome reported as its
  // most boring one. Details of each drop go to the recent-activity list.
  const dropped = res?.dropped
    ? ` ${res.dropped} item${res.dropped === 1 ? '' : 's'} could not be saved and ${res.dropped === 1 ? 'was' : 'were'} discarded — see recent activity.`
    : '';
  if (res?.flushed) {
    feedback(
      `Sent ${res.flushed} queued item${res.flushed === 1 ? '' : 's'}${res.left ? ` — ${res.left} still pending` : ''}.${dropped}`,
      res.left || res.dropped ? 'err' : 'ok',
    );
  } else if (res?.left) {
    feedback(`App still unreachable — ${res.left} item(s) queued.${dropped}`, 'err');
  } else {
    feedback(dropped ? dropped.trim() : 'Nothing to retry.', dropped ? 'err' : 'ok');
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

/* ---------------------------------- init ----------------------------------- */

void (async () => {
  await Promise.all([refreshStatus(), refreshPage(), refreshRecent(), refreshModes()]);
})();
