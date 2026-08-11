/**
 * Settings for the universal file-drop router.
 *
 * Carries a `storage` listener from the start (B7) — these prefs are read by
 * every desktop window, so a change made on one monitor has to reach the rest
 * without a reload.
 */
import type { DropTargetId } from '../shared/fileRouting';

export interface FileDropPrefs {
  /** Master switch. Off: every drop opens the triage sheet. */
  autoRoute: boolean;
  /** Show the triage sheet even when classification is certain. */
  alwaysTriage: boolean;
  /** How many undo tokens to keep. 0 disables undo. */
  undoDepth: number;
  /** Per-extension override, e.g. `{ '.zip': 'library-manga' }`. */
  overrides: Record<string, DropTargetId>;
}

const KEY = 'jp-os-filedrop-prefs-v1';
const EVENT = 'jp-os-filedrop-prefs-changed';

const DEFAULTS: FileDropPrefs = {
  autoRoute: true,
  alwaysTriage: false,
  undoDepth: 10,
  overrides: {},
};

function normalize(s: Partial<FileDropPrefs>): FileDropPrefs {
  const rawOverrides = s.overrides;
  const overrides: Record<string, DropTargetId> = {};
  if (rawOverrides && typeof rawOverrides === 'object') {
    for (const [ext, target] of Object.entries(rawOverrides)) {
      if (typeof ext === 'string' && ext.startsWith('.') && typeof target === 'string') {
        overrides[ext.toLowerCase()] = target as DropTargetId;
      }
    }
  }
  const depth = typeof s.undoDepth === 'number' && Number.isFinite(s.undoDepth) ? s.undoDepth : DEFAULTS.undoDepth;
  return {
    autoRoute: s.autoRoute !== false,
    alwaysTriage: s.alwaysTriage === true,
    undoDepth: Math.max(0, Math.min(50, Math.round(depth))),
    overrides,
  };
}

export function loadFileDropPrefs(): FileDropPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<FileDropPrefs>);
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS, overrides: {} };
}

export function saveFileDropPrefs(partial: Partial<FileDropPrefs>): FileDropPrefs {
  const next = normalize({ ...loadFileDropPrefs(), ...partial });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<FileDropPrefs>(EVENT, { detail: next }));
  return next;
}

export function resetFileDropPrefs(): FileDropPrefs {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const next = { ...DEFAULTS, overrides: {} };
  window.dispatchEvent(new CustomEvent<FileDropPrefs>(EVENT, { detail: next }));
  return next;
}

export function onFileDropPrefsChanged(cb: (s: FileDropPrefs) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<FileDropPrefs>).detail);
  window.addEventListener(EVENT, handler);
  const onStorage = (e: StorageEvent): void => {
    if (e.key === KEY) cb(loadFileDropPrefs());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}
