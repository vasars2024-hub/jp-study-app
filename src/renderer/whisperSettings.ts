// Shared Whisper transcription preferences (device + model tier), set in
// Settings and read by Media / Video. Mirrors the get/set/subscribe pattern
// in appZoom.ts so any open view stays in sync when the preference changes.

import {
  defaultWhisperTier,
  isWhisperModelTier,
  whisperSpec,
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

export function loadWhisperModelTier(lang: 'ja' | 'zh' | 'ru' = 'ja'): WhisperModelTier {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (isWhisperModelTier(raw)) return raw;
  } catch {
    /* ignore */
  }
  return defaultWhisperTier(lang);
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
