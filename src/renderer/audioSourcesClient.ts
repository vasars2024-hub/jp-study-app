/**
 * The ordered audio sources in the renderer: one cached read of what main stores
 * (`dict:audioSourcesGet`), re-read after Settings saves. Main owns the list
 * because the Anki export reads it too; nothing here touches localStorage.
 */
import {
  DEFAULT_AUDIO_SOURCES,
  normalizeAudioSourcesPrefs,
  type AudioSourcesPrefs,
} from '../shared/audioSources';

export const AUDIO_SOURCES_EVENT = 'audio-sources-changed';

let cached: Promise<AudioSourcesPrefs> | null = null;

export function loadAudioSources(force = false): Promise<AudioSourcesPrefs> {
  if (cached && !force) return cached;
  const api = typeof window !== 'undefined' ? window.api?.dictAudioSourcesGet : undefined;
  if (typeof api !== 'function') return Promise.resolve(DEFAULT_AUDIO_SOURCES);
  cached = api()
    .then((raw) => normalizeAudioSourcesPrefs(raw))
    .catch(() => {
      cached = null;
      return DEFAULT_AUDIO_SOURCES;
    });
  return cached;
}

/** Save through main, then tell every mounted control to re-read. */
export async function saveAudioSources(next: AudioSourcesPrefs): Promise<AudioSourcesPrefs> {
  const api = typeof window !== 'undefined' ? window.api?.dictAudioSourcesSet : undefined;
  const prefs = typeof api === 'function'
    ? normalizeAudioSourcesPrefs(await api(normalizeAudioSourcesPrefs(next)))
    : normalizeAudioSourcesPrefs(next);
  cached = Promise.resolve(prefs);
  window.dispatchEvent(new CustomEvent(AUDIO_SOURCES_EVENT));
  return prefs;
}

export function onAudioSourcesChanged(cb: () => void): () => void {
  window.addEventListener(AUDIO_SOURCES_EVENT, cb);
  return () => window.removeEventListener(AUDIO_SOURCES_EVENT, cb);
}

/** Tests only. */
export function resetAudioSourcesClient(): void {
  cached = null;
}
