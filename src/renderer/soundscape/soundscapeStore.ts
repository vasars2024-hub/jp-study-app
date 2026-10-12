/**
 * Soundscape store — the one owner of the mixer's state.
 *
 * Playback lives here rather than in the widget because a widget's body unmounts
 * when it is collapsed or removed, and the sound must carry on regardless. The
 * widget is only a view: it reads a snapshot and calls the actions below.
 */

import { isPlaying as mediaIsPlaying, onPlayingChanged } from '../audioBus';
import { writeLocalStorageJson } from '../localStorageWrite';
import { soundscapeEngine } from './soundscapeEngine';
import {
  BUILT_IN_SCENES,
  MAX_SAVED_MIXES,
  SOUNDSCAPE_STORAGE_KEY,
  applyMix,
  clamp01,
  fadeScheduleOf,
  isMixSilent,
  matchingSceneId,
  mixOf,
  normalizeSoundscapeState,
  sleepFadePlan,
  sliderToGain,
  type FadeScheduleId,
  type MusicStyleId,
  type SoundLayerId,
  type SoundscapeMix,
  type SoundscapeState,
} from './soundscapeModel';

export interface SoundscapeSnapshot {
  state: SoundscapeState;
  playing: boolean;
  /** The built-in scene or saved mix the current sliders match, if any. */
  sceneId: string | null;
  /** Epoch ms at which the sleep timer stops playback, or null when it is off. */
  timerEndsAt: number | null;
}

function load(): SoundscapeState {
  try {
    const raw = localStorage.getItem(SOUNDSCAPE_STORAGE_KEY);
    return normalizeSoundscapeState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSoundscapeState(null);
  }
}

let state: SoundscapeState = load();
let playing = false;
let timerEndsAt: number | null = null;
let timerHandle: ReturnType<typeof setTimeout> | null = null;
/** snd5: when the sleep timer's long fade begins. */
let timerFadeHandle: ReturnType<typeof setTimeout> | null = null;
let saveHandle: ReturnType<typeof setTimeout> | null = null;
let mediaPlaying = false;
let mediaHooked = false;
let snapshot: SoundscapeSnapshot | null = null;
const listeners = new Set<(snapshot: SoundscapeSnapshot) => void>();

export function getSoundscape(): SoundscapeSnapshot {
  if (!snapshot) snapshot = { state, playing, sceneId: matchingSceneId(state), timerEndsAt };
  return snapshot;
}

export function subscribeSoundscape(listener: (snapshot: SoundscapeSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function pushToEngine(): void {
  const layers: Partial<Record<SoundLayerId, number>> = {};
  for (const id of state.active) layers[id] = sliderToGain(state.levels[id]);
  soundscapeEngine.apply({
    master: sliderToGain(state.master),
    layers,
    music: state.music,
    musicGain: state.music === 'off' ? 0 : sliderToGain(state.musicVolume),
    ducked: state.duckWithMedia && mediaPlaying,
  });
}

function emit(): void {
  snapshot = null;
  const next = getSoundscape();
  for (const listener of listeners) listener(next);
}

/** Apply a change, keep the engine in step, and persist shortly after. */
function commit(next: SoundscapeState): void {
  state = next;
  pushToEngine();
  // A dragged slider commits dozens of times a second; one write afterwards is enough.
  if (saveHandle) clearTimeout(saveHandle);
  saveHandle = setTimeout(() => {
    saveHandle = null;
    writeLocalStorageJson(SOUNDSCAPE_STORAGE_KEY, state);
  }, 300);
  emit();
}

function hookMedia(): void {
  if (mediaHooked) return;
  mediaHooked = true;
  mediaPlaying = mediaIsPlaying();
  onPlayingChanged(() => {
    const now = mediaIsPlaying();
    if (now === mediaPlaying) return;
    mediaPlaying = now;
    pushToEngine();
  });
}

/**
 * `restoreLevel` false is for stopping: a sleep fade may already have taken
 * the level to nothing, and putting it back while the pause fade runs would
 * sound as a blip. Changing or cancelling the timer while playing restores it.
 */
function clearTimer(restoreLevel = true): void {
  if (timerHandle) clearTimeout(timerHandle);
  if (timerFadeHandle) {
    clearTimeout(timerFadeHandle);
    if (restoreLevel) soundscapeEngine.cancelScheduledFade();
  }
  timerHandle = null;
  timerFadeHandle = null;
  timerEndsAt = null;
}

function start(): void {
  if (playing || isMixSilent(state)) return;
  hookMedia();
  pushToEngine();
  soundscapeEngine.play(fadeScheduleOf(state.fade).fadeInSec);
  playing = true;
}

function stop(fadeSeconds = 0.4): void {
  // Stopping never puts a sleep fade's level back: the next `play()` does.
  clearTimer(false);
  if (!playing) return;
  soundscapeEngine.pause(fadeSeconds);
  playing = false;
}

/** snd5: a scene or saved mix by id, with the overall volume last used with it. */
function sceneMix(id: string): SoundscapeMix | undefined {
  return BUILT_IN_SCENES.find((scene) => scene.id === id)?.mix ?? state.saved.find((saved) => saved.id === id);
}

function withSceneVolume(next: SoundscapeState, id: string): SoundscapeState {
  const remembered = next.sceneVolumes[id];
  return remembered === undefined ? next : { ...next, master: remembered };
}

/** Start when a change makes something audible; stop when it leaves nothing to hear. */
function followMix(): void {
  if (isMixSilent(state)) stop();
  else start();
}

export function toggleSoundscape(): void {
  if (playing) stop();
  else start();
  emit();
}

/**
 * snd2 — for the focus link: start the current mix (or the given scene first)
 * without toggling, and report whether anything is now playing. A silent mix
 * stays silent; this never invents a sound the user did not set up.
 */
export function startSoundscape(sceneId?: string): boolean {
  if (sceneId) {
    const mix = sceneMix(sceneId);
    if (mix) {
      state = withSceneVolume(applyMix(state, mix), sceneId);
      commit(state);
    }
  }
  start();
  emit();
  return playing;
}

/** snd2 — fade out over `fadeSeconds` and stop; a no-op when nothing plays. */
export function fadeOutSoundscape(fadeSeconds = 4): void {
  if (!playing) return;
  stop(fadeSeconds);
  emit();
}

export function isSoundscapePlaying(): boolean {
  return playing;
}

/**
 * snd5: the overall volume is remembered per scene — set the temple bells
 * quieter than the rainy café once, and each comes back at its own level.
 */
export function setSoundscapeMaster(value: number): void {
  const master = clamp01(value);
  const scene = matchingSceneId(state);
  const sceneVolumes = scene ? { ...state.sceneVolumes, [scene]: master } : state.sceneVolumes;
  commit({ ...state, master, sceneVolumes });
}

/** snd5: how playback fades in and how the sleep timer and focus breaks fade out. */
export function setSoundscapeFade(id: FadeScheduleId): void {
  commit({ ...state, fade: fadeScheduleOf(id).id });
}

export function toggleSoundLayer(id: SoundLayerId): void {
  const on = state.active.includes(id);
  const active = on ? state.active.filter((other) => other !== id) : [...state.active, id];
  // A layer remembered at zero would switch on silently, which reads as broken.
  const levels = !on && state.levels[id] <= 0 ? { ...state.levels, [id]: 0.5 } : state.levels;
  state = { ...state, active, levels };
  followMix();
  commit(state);
}

export function setSoundLayerLevel(id: SoundLayerId, value: number): void {
  const level = clamp01(value);
  const on = state.active.includes(id);
  // Moving a slider is a request to hear that layer; dragging it to zero removes it.
  let active = state.active;
  if (level > 0 && !on) active = [...state.active, id];
  if (level <= 0 && on) active = state.active.filter((other) => other !== id);
  state = { ...state, active, levels: { ...state.levels, [id]: level } };
  followMix();
  commit(state);
}

export function setSoundscapeMusic(style: MusicStyleId): void {
  state = { ...state, music: style };
  followMix();
  commit(state);
}

export function setSoundscapeMusicVolume(value: number): void {
  commit({ ...state, musicVolume: clamp01(value) });
}

export function setSoundscapeDuck(on: boolean): void {
  commit({ ...state, duckWithMedia: on });
}

/** Switch to a built-in scene or a saved mix and start it. */
export function applySoundscapeScene(id: string): void {
  const mix = sceneMix(id);
  if (!mix) return;
  state = withSceneVolume(applyMix(state, mix), id);
  followMix();
  commit(state);
}

export function clearSoundscape(): void {
  state = { ...state, active: [], music: 'off' };
  followMix();
  commit(state);
}

/** Keep the current mix under `name`. Returns false when there is nothing to keep. */
export function saveSoundscapeMix(name: string): boolean {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed || isMixSilent(state) || state.saved.length >= MAX_SAVED_MIXES) return false;
  const id = `mix-${Date.now().toString(36)}`;
  commit({ ...state, saved: [...state.saved, { id, name: trimmed, ...mixOf(state) }] });
  return true;
}

export function deleteSoundscapeMix(id: string): void {
  commit({ ...state, saved: state.saved.filter((mix) => mix.id !== id) });
}

/**
 * Stop playback after `minutes`; 0 turns the timer off. snd5: the fade
 * schedule decides how the end arrives — the level starts falling
 * `fadeOutSec` before the end (8 s on "quick", ten minutes on "sleep") and
 * reaches silence exactly when the timer does.
 */
export function setSoundscapeTimer(minutes: number): void {
  clearTimer();
  if (minutes > 0) {
    const plan = sleepFadePlan(minutes, fadeScheduleOf(state.fade));
    timerEndsAt = Date.now() + plan.stopInMs;
    timerFadeHandle = setTimeout(() => {
      soundscapeEngine.scheduleFadeOut(0, plan.fadeMs / 1000);
    }, plan.fadeStartsInMs);
    timerHandle = setTimeout(() => {
      stop(0.2);
      emit();
    }, plan.stopInMs);
  }
  emit();
}

/** snd5: the fade the focus link uses when a work block ends. */
export function breakFadeSeconds(): number {
  return fadeScheduleOf(state.fade).breakFadeSec;
}
