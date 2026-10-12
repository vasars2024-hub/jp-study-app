// Shared Whisper transcription preferences (device + model tier), set in
// Settings and read by Media / Video. Mirrors the get/set/subscribe pattern
// in appZoom.ts so any open view stays in sync when the preference changes.

import {
  defaultWhisperTier,
  isWhisperModelTier,
  whisperSpec,
  whisperTierForLang,
  type WhisperModelTier,
} from '../shared/whisperModels';

const DEVICE_KEY = 'jp-study-whisper-device';
const MODEL_KEY = 'jp-study-whisper-model';
const DEVICE_EVENT = 'whisper-device-changed';
const MODEL_EVENT = 'whisper-model-changed';

export type WhisperDevice = 'auto' | 'cpu';
export type { WhisperModelTier };

export function loadWhisperDevice(): WhisperDevice {
  try {
    return localStorage.getItem(DEVICE_KEY) === 'cpu' ? 'cpu' : 'auto';
  } catch {
    return 'auto';
  }
}

/** Set, persist, and broadcast a new device preference. */
export function setWhisperDevice(device: WhisperDevice): void {
  try {
    localStorage.setItem(DEVICE_KEY, device);
  } catch {
    /* storage unavailable — preference just won't persist */
  }
  window.dispatchEvent(new CustomEvent<WhisperDevice>(DEVICE_EVENT, { detail: device }));
}

/** Subscribe to device changes. Returns an unsubscribe fn. */
export function onWhisperDeviceChanged(cb: (device: WhisperDevice) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<WhisperDevice>).detail);
  window.addEventListener(DEVICE_EVENT, handler);
  return () => window.removeEventListener(DEVICE_EVENT, handler);
}

/**
 * The tier to run for `lang`, and the one the user picked when that differs.
 *
 * The Settings choice is global; a tier that cannot transcribe `lang` (the
 * Japanese-only kotoba-whisper for Chinese audio) is replaced by a multilingual
 * one, preferring one `isDownloaded` says is already on disk.
 */
export function whisperTierPlan(
  lang: 'ja' | 'zh' | 'ru' = 'ja',
  isDownloaded?: (tier: WhisperModelTier) => boolean,
): { tier: WhisperModelTier; picked: WhisperModelTier } {
  let picked = defaultWhisperTier(lang);
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (isWhisperModelTier(raw)) picked = raw;
  } catch {
    /* ignore */
  }
  return { tier: whisperTierForLang(picked, lang, isDownloaded), picked };
}

export function loadWhisperModelTier(lang: 'ja' | 'zh' | 'ru' = 'ja'): WhisperModelTier {
  return whisperTierPlan(lang).tier;
}

export function setWhisperModelTier(tier: WhisperModelTier): void {
  try {
    localStorage.setItem(MODEL_KEY, tier);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<WhisperModelTier>(MODEL_EVENT, { detail: tier }));
}

export function onWhisperModelChanged(cb: (tier: WhisperModelTier) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<WhisperModelTier>).detail);
  window.addEventListener(MODEL_EVENT, handler);
  return () => window.removeEventListener(MODEL_EVENT, handler);
}

/** HF model id for the worker. */
export function whisperHfId(tier: WhisperModelTier = loadWhisperModelTier()): string {
  return whisperSpec(tier).hfId;
}
