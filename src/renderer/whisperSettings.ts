// Shared Whisper transcription device preference (GPU vs CPU), set once in
// Settings and read by the Media app. Mirrors the get/set/subscribe pattern
// in appZoom.ts so any open view stays in sync when the preference changes.

const KEY = 'jp-study-whisper-device';
const EVENT = 'whisper-device-changed';

export type WhisperDevice = 'auto' | 'cpu';

export function loadWhisperDevice(): WhisperDevice {
  try {
    return localStorage.getItem(KEY) === 'cpu' ? 'cpu' : 'auto';
  } catch {
    return 'auto';
  }
}

/** Set, persist, and broadcast a new device preference. */
export function setWhisperDevice(device: WhisperDevice): void {
  try {
    localStorage.setItem(KEY, device);
  } catch {
    /* storage unavailable — preference just won't persist */
  }
  window.dispatchEvent(new CustomEvent<WhisperDevice>(EVENT, { detail: device }));
}

/** Subscribe to device changes (e.g. to keep MediaView in sync). Returns an unsubscribe fn. */
export function onWhisperDeviceChanged(cb: (device: WhisperDevice) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<WhisperDevice>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
