/**
 * Per-device choices for the optional AI helpers for watching and reading that
 * are not consent (consent lives in main, Settings > AI > "What may use the
 * cloud"). Today one: whether a visual-novel line with no translation is given
 * an AI translation automatically when it is mined. Off by default — the AI
 * translation is otherwise only ever offered as a button.
 */
import { writeLocalStorageJson } from './localStorageWrite';

const KEY = 'jp-ai-immerse-prefs-v1';
const EVENT = 'jp-ai-immerse-prefs-changed';

export interface AiImmersePrefs {
  /** Translate a mined VN line that has none, with AI, before it is saved. */
  vnAutoTranslate: boolean;
}

const DEFAULTS: AiImmersePrefs = { vnAutoTranslate: false };

export function loadAiImmersePrefs(): AiImmersePrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AiImmersePrefs>) : {};
    return { vnAutoTranslate: parsed.vnAutoTranslate === true };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAiImmersePrefs(patch: Partial<AiImmersePrefs>): AiImmersePrefs {
  const next = { ...loadAiImmersePrefs(), ...patch };
  writeLocalStorageJson(KEY, next);
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    // No window (tests): the store is still written.
  }
  return next;
}

export function onAiImmersePrefsChanged(listener: (prefs: AiImmersePrefs) => void): () => void {
  const local = (): void => listener(loadAiImmersePrefs());
  const storage = (event: StorageEvent): void => {
    if (event.key === KEY) listener(loadAiImmersePrefs());
  };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener('storage', storage);
  };
}
