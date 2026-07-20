import {
  DEFAULT_BLANC_MODE,
  mergeBlancModeSettings,
  sanitizeBlancModeSettings,
  type BlancModeSettings,
  type BlancTabId,
} from '../shared/blancMode';
import { loadToolboxSettings } from './toolboxSettings';

const KEY = 'jp-blanc-mode-v1';
const MEMORY_KEY = 'jp-blanc-memory-v1';
const EVENT = 'jp-blanc-mode-changed';
const MEMORY_EVENT = 'jp-blanc-memory-changed';

export type { BlancModeSettings, BlancTabId };

/** Dedicated compact Blanc Toolbox side window (`?blanc=1`). */
export function isBlancWindow(): boolean {
  return new URLSearchParams(window.location.search).get('blanc') === '1';
}

export interface BlancMemorySettings {
  rememberLastTab: boolean;
  restoreReaderOnLaunch: boolean;
  localReviewLimit: number;
  scratchpad: string;
}

export const DEFAULT_BLANC_MEMORY: BlancMemorySettings = {
  rememberLastTab: true,
  restoreReaderOnLaunch: false,
  localReviewLimit: 40,
  scratchpad: '',
};

function sanitizeBlancMemorySettings(value: unknown): BlancMemorySettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_BLANC_MEMORY };
  const input = value as Partial<BlancMemorySettings>;
  const limit = Number(input.localReviewLimit);
  return {
    rememberLastTab: input.rememberLastTab !== false,
    restoreReaderOnLaunch: input.restoreReaderOnLaunch === true,
    localReviewLimit: Number.isFinite(limit) ? Math.min(200, Math.max(5, Math.round(limit))) : DEFAULT_BLANC_MEMORY.localReviewLimit,
    scratchpad: typeof input.scratchpad === 'string' ? input.scratchpad.slice(0, 4000) : '',
  };
}

export function loadBlancMode(): BlancModeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeBlancModeSettings(JSON.parse(raw)) : { ...DEFAULT_BLANC_MODE };
  } catch {
    return { ...DEFAULT_BLANC_MODE };
  }
}

export function saveBlancMode(patch: Partial<BlancModeSettings>): BlancModeSettings {
  const next = mergeBlancModeSettings(loadBlancMode(), patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    document.documentElement.classList.toggle('blanc-mode-enabled', next.enabled);
    document.documentElement.classList.toggle('blanc-mode-dark', next.enabled && next.darkMode);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export function applyBlancModeClass(settings = loadBlancMode()): void {
  try {
    document.documentElement.classList.toggle('blanc-mode-enabled', settings.enabled);
    document.documentElement.classList.toggle('blanc-mode-dark', settings.enabled && settings.darkMode);
  } catch {
    /* ignore */
  }
}

export async function setBlancModeEnabled(on: boolean): Promise<BlancModeSettings> {
  const next = saveBlancMode({ enabled: on });
  try {
    if (on) {
      // With rememberWindowBounds on, omit the size so main restores the last
      // saved Blanc window bounds; otherwise force the default size.
      const size = loadToolboxSettings().rememberWindowBounds
        ? undefined
        : { width: 560, height: 460 };
      await window.api?.blancOpen?.(size);
    } else {
      await window.api?.blancClose?.();
    }
  } catch {
    /* The setting is saved; if the window IPC is unavailable, the live router updates. */
  }
  return next;
}

export function setBlancDarkMode(on: boolean): BlancModeSettings {
  return saveBlancMode({ darkMode: on });
}

export function setBlancAdvanced(on: boolean): BlancModeSettings {
  return saveBlancMode({ advanced: on });
}

export function setBlancLastTab(tab: BlancTabId): BlancModeSettings {
  return saveBlancMode({ lastTab: tab });
}

export function onBlancModeChanged(cb: (settings: BlancModeSettings) => void): () => void {
  const h = (event: Event) => {
    const detail = (event as CustomEvent<BlancModeSettings>).detail;
    cb(detail && typeof detail === 'object' ? sanitizeBlancModeSettings(detail) : loadBlancMode());
  };
  const storage = (event: StorageEvent) => {
    if (event.key === KEY) cb(loadBlancMode());
  };
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener('storage', storage);
  };
}

export function loadBlancMemory(): BlancMemorySettings {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? sanitizeBlancMemorySettings(JSON.parse(raw)) : { ...DEFAULT_BLANC_MEMORY };
  } catch {
    return { ...DEFAULT_BLANC_MEMORY };
  }
}

export function saveBlancMemory(patch: Partial<BlancMemorySettings>): BlancMemorySettings {
  const next = sanitizeBlancMemorySettings({ ...loadBlancMemory(), ...patch });
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(MEMORY_EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export function resetBlancMemory(): BlancMemorySettings {
  const next = { ...DEFAULT_BLANC_MEMORY };
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(MEMORY_EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export function onBlancMemoryChanged(cb: (settings: BlancMemorySettings) => void): () => void {
  const h = (event: Event) => {
    const detail = (event as CustomEvent<BlancMemorySettings>).detail;
    cb(detail && typeof detail === 'object' ? sanitizeBlancMemorySettings(detail) : loadBlancMemory());
  };
  window.addEventListener(MEMORY_EVENT, h);
  return () => window.removeEventListener(MEMORY_EVENT, h);
}
