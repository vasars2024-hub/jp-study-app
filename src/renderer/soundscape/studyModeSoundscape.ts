/**
 * snd5 — scene presets that follow the study mode.
 *
 * Reading, a review session and listening practice want different sound: a
 * bed with no melody under text, something light under a review, and silence
 * while the ear is the thing being trained. With this on, opening one of those
 * surfaces switches the mixer to that mode's preset.
 *
 * The mode is read from the command registry rather than from each view: a
 * review session registers `flashcards.flip`, an open book `reader.pageNext`,
 * the video study overlay `video.replayLine` — exactly while that surface is up,
 * which is what "in this mode" means. No view had to change to be followed.
 *
 * Same conservative rules as the focus link (focusSoundscape.ts): off by
 * default; it only stops what it started; a mixer it paused for listening is
 * started again when listening ends; pausing by hand hands control back.
 *
 * snd6: pop-out windows count too. Each publishes its mode through
 * studyModePresence.ts, and this link takes the highest-priority mode among its
 * own window and every fresh pop-out. The same record carries "speech or video
 * is audible over there", which is handed to the foreground-audio signal so the
 * mixer ducks for a pop-out's video as it does for one in this window.
 */
import { COMMAND_HANDLERS_EVENT } from '../keyboardShortcuts';
import { setRemoteForegroundAudio } from '../foregroundAudio';
import { fadeOutSoundscape, isSoundscapePlaying, startSoundscape, subscribeSoundscape } from './soundscapeStore';
import { MODE_PRESET_KEEP, MODE_PRESET_PAUSE, type StudyModeId } from './soundscapeModel';
import {
  PRESENCE_KEY,
  detectStudyMode,
  hasPresence,
  pickStudyMode,
  remoteStudyAudio,
  remoteStudyModes,
} from './studyModePresence';
import {
  STUDY_MODE_PRESETS_KEY,
  loadStudyModePresets,
  onStudyModePresetsChanged,
  saveStudyModePresets,
} from './studyModePresets';

export { STUDY_MODE_PRESETS_KEY, loadStudyModePresets, onStudyModePresetsChanged, saveStudyModePresets };

const PAUSE_FADE_SECONDS = 2;
const EXIT_FADE_SECONDS = 3;

// ---- the link ------------------------------------------------------------------

let installed = false;
let current: StudyModeId | null = null;
/** The link started the sound that is playing, so it may stop it. */
let owned = false;
/** The link paused the owner's sound for this mode, so it starts it again after. */
let pausedFor: StudyModeId | null = null;
/** Set while the link itself is driving the mixer, so its own changes are not read as the owner's. */
let acting = false;

function act(fn: () => void): void {
  acting = true;
  try {
    fn();
  } finally {
    acting = false;
  }
}

/** This window's mode, or the highest-priority one a pop-out reports. */
function currentStudyMode(): StudyModeId | null {
  return pickStudyMode([detectStudyMode(), ...remoteStudyModes()]);
}

/** How often a stale pop-out entry is looked for while any entry exists. */
const PRESENCE_RECHECK_MS = 30_000;

function sync(): void {
  const presets = loadStudyModePresets();
  const mode = presets.enabled ? currentStudyMode() : null;
  if (mode === current) return;
  current = mode;
  if (mode) {
    const preset = presets[mode];
    if (preset === MODE_PRESET_PAUSE) {
      if (isSoundscapePlaying()) {
        if (!owned) pausedFor = mode;
        owned = false;
        act(() => fadeOutSoundscape(PAUSE_FADE_SECONDS));
      }
      return;
    }
    if (preset === MODE_PRESET_KEEP) return;
    const wasPlaying = isSoundscapePlaying() || pausedFor !== null;
    act(() => {
      if (startSoundscape(preset) && !wasPlaying) owned = true;
    });
    pausedFor = null;
    return;
  }
  // Left every study mode.
  if (pausedFor) {
    pausedFor = null;
    act(() => startSoundscape());
  } else if (owned) {
    owned = false;
    act(() => fadeOutSoundscape(EXIT_FADE_SECONDS));
  }
}

/** Main window only (main.tsx); idempotent. Returns an uninstall for tests. Pop-outs install studyModePresence instead. */
export function installStudyModeSoundscape(): () => void {
  if (installed) return () => undefined;
  installed = true;
  current = null;
  const onHandlers = (): void => sync();
  let recheck: ReturnType<typeof setInterval> | null = null;
  const onPresence = (): void => {
    setRemoteForegroundAudio(remoteStudyAudio());
    sync();
    // A pop-out that died without withdrawing goes stale; look again until none is left.
    if (hasPresence() && !recheck) {
      recheck = setInterval(() => {
        onPresence();
        if (!hasPresence() && recheck) {
          clearInterval(recheck);
          recheck = null;
        }
      }, PRESENCE_RECHECK_MS);
    }
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === STUDY_MODE_PRESETS_KEY) sync();
    if (event.key === PRESENCE_KEY || event.key === null) onPresence();
  };
  // The owner pausing or starting by hand takes the sound back from the link.
  const offMixer = subscribeSoundscape((snap) => {
    if (acting) return;
    if (!snap.playing) owned = false;
    if (snap.playing) pausedFor = null;
  });
  // Turning the link on mid-session acts now, not at the next mode change.
  const offPresets = onStudyModePresetsChanged(() => sync());
  window.addEventListener(COMMAND_HANDLERS_EVENT, onHandlers);
  window.addEventListener('storage', onStorage);
  onPresence();
  return () => {
    window.removeEventListener(COMMAND_HANDLERS_EVENT, onHandlers);
    window.removeEventListener('storage', onStorage);
    if (recheck) clearInterval(recheck);
    recheck = null;
    setRemoteForegroundAudio(false);
    offPresets();
    offMixer();
    installed = false;
    current = null;
    owned = false;
    pausedFor = null;
  };
}

/** Test seams. */
export function studyModeLinkState(): { mode: StudyModeId | null; owned: boolean; pausedFor: StudyModeId | null } {
  return { mode: current, owned, pausedFor };
}
