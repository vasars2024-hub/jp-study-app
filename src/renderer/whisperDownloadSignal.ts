// The "a Whisper model was downloaded or removed" signal, without the model cache.
//
// `whisperModelCache.ts` owns the record; this is only its storage key and
// event name, so a window that merely needs to *hear* about a download (the
// Region Recorder's bridge, which starts recordings waiting for the model) does
// not pull the cache, the model specs and the Whisper settings into its boot.
//
// A download in the same window fires the custom event; a download in another
// window of the app (same origin, same localStorage) arrives as a `storage`
// event for the key. Both are heard here.

export const WHISPER_DOWNLOADED_KEY = 'jp-study-whisper-downloaded';
export const WHISPER_DOWNLOADED_EVENT = 'whisper-downloaded-changed';

/** Subscribe to downloads and removals in this window and in every other window of the app. */
export function onWhisperDownloadsChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const local = (): void => cb();
  const other = (event: StorageEvent): void => {
    if (event.key === WHISPER_DOWNLOADED_KEY || event.key === null) cb();
  };
  window.addEventListener(WHISPER_DOWNLOADED_EVENT, local);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(WHISPER_DOWNLOADED_EVENT, local);
    window.removeEventListener('storage', other);
  };
}
