/**
 * snd6 — "something the learner is meant to hear is playing".
 *
 * The Soundscape already lowered itself for the music player (audioBus), but
 * not for the sounds a study session is actually about: text-to-speech, a card's
 * audio clip, the video being studied. This is that signal, kept apart from the
 * soundscape so the producers (tts.ts, cardAudioPlayback.ts) stay free of it.
 *
 * Sources:
 *  - named flags set by producers (`setForegroundAudio('tts', true)`);
 *  - media elements handed to `trackForegroundMedia` (a detached `new Audio()`
 *    fires its events on itself only, so it has to be handed over);
 *  - every `<video>` in this document, watched with capture-phase listeners
 *    (media events do not bubble, but they do pass the capture phase), counted
 *    only while it is playing and audible;
 *  - other windows of the app (a pop-out player), reported through
 *    `setRemoteForegroundAudio` by the soundscape presence link.
 *
 * The music player's own `<audio>` is NOT counted: ducking for music has its
 * own setting, and counting it here would duck for music with that setting off.
 */

const flags = new Set<string>();
const tracked = new Set<HTMLMediaElement>();
const listeners = new Set<(active: boolean) => void>();
let remote = false;
let videoActive = false;
let watching = false;
let announced = false;
let speechPoll: ReturnType<typeof setInterval> | null = null;

function audible(el: HTMLMediaElement): boolean {
  return !el.paused && !el.ended && !el.muted && el.volume > 0;
}

function recompute(): void {
  const next = flags.size > 0 || remote || videoActive || [...tracked].some(audible);
  if (next === announced) return;
  announced = next;
  for (const listener of [...listeners]) listener(next);
}

function scanVideos(): void {
  if (typeof document === 'undefined') return;
  let any = false;
  for (const el of document.querySelectorAll('video')) {
    if (audible(el)) {
      any = true;
      break;
    }
  }
  videoActive = any;
}

const MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange'] as const;

function onMediaEvent(event: Event): void {
  if (!(event.target instanceof HTMLVideoElement)) return;
  scanVideos();
  recompute();
}

function watchDocument(): void {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  for (const type of MEDIA_EVENTS) document.addEventListener(type, onMediaEvent, true);
  scanVideos();
}

/** True while speech, a study clip or a video is audible in any window. */
export function isForegroundAudioActive(): boolean {
  watchDocument();
  scanVideos();
  return flags.size > 0 || remote || videoActive || [...tracked].some(audible);
}

/** True while it is audible in THIS window (what a pop-out reports to the main window). */
export function isLocalForegroundAudioActive(): boolean {
  watchDocument();
  scanVideos();
  return flags.size > 0 || videoActive || [...tracked].some(audible);
}

export function onForegroundAudioChanged(cb: (active: boolean) => void): () => void {
  watchDocument();
  announced = isForegroundAudioActive();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** A producer's own on/off flag ('tts', …). */
export function setForegroundAudio(source: string, active: boolean): void {
  if (active) flags.add(source);
  else flags.delete(source);
  recompute();
}

/** Another window of the app reports audio (soundscape presence link). */
export function setRemoteForegroundAudio(active: boolean): void {
  remote = active;
  recompute();
}

/** Count a detached media element (a card clip) while it plays. */
export function trackForegroundMedia(el: HTMLMediaElement): void {
  if (tracked.has(el)) return;
  tracked.add(el);
  const update = (): void => {
    // A finished clip is forgotten, so the set never grows past what is playing.
    if (el.ended || el.error) tracked.delete(el);
    recompute();
  };
  for (const type of MEDIA_EVENTS) el.addEventListener(type, update);
  el.addEventListener('error', update);
}

/**
 * Speech has no per-utterance handle worth trusting (Chromium drops `onend` for
 * a cancelled utterance), so after `speak` the flag follows
 * `speechSynthesis.speaking` on a short poll until it goes quiet.
 */
export function noteSpeechStarted(): void {
  if (typeof speechSynthesis === 'undefined') return;
  setForegroundAudio('tts', true);
  if (speechPoll) return;
  let quietTicks = 0;
  speechPoll = setInterval(() => {
    const speaking = speechSynthesis.speaking || speechSynthesis.pending;
    quietTicks = speaking ? 0 : quietTicks + 1;
    // Two quiet reads in a row: a voice that has not started yet reads quiet once.
    if (quietTicks >= 2) {
      if (speechPoll) clearInterval(speechPoll);
      speechPoll = null;
      setForegroundAudio('tts', false);
    }
  }, 250);
}

export function noteSpeechStopped(): void {
  if (speechPoll) clearInterval(speechPoll);
  speechPoll = null;
  setForegroundAudio('tts', false);
}

/** Test seam: forget everything. */
export function resetForegroundAudioForTests(): void {
  flags.clear();
  tracked.clear();
  listeners.clear();
  remote = false;
  videoActive = false;
  announced = false;
  if (speechPoll) clearInterval(speechPoll);
  speechPoll = null;
  if (watching && typeof document !== 'undefined') {
    for (const type of MEDIA_EVENTS) document.removeEventListener(type, onMediaEvent, true);
  }
  watching = false;
}
