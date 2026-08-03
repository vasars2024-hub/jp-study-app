import type { BlancThemeOverrides } from '../shared/blancTheme';
import type { ToolboxSettings } from '../shared/toolboxSettings';

export interface BlancThemeHistoryEntry {
  preset: string;
  overrides: BlancThemeOverrides;
  savedAt: number;
}

const STORAGE_KEY = 'jp-study-blanc-theme-history-v1';
const MAX_ENTRIES = 20;

function normalize(value: unknown): BlancThemeHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_ENTRIES).flatMap((entry): BlancThemeHistoryEntry[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<BlancThemeHistoryEntry>;
    if (typeof raw.preset !== 'string' || !raw.preset) return [];
    return [{
      preset: raw.preset.slice(0, 80),
      overrides: raw.overrides && typeof raw.overrides === 'object' ? { ...raw.overrides } : {},
      savedAt: typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now(),
    }];
  });
}

export function loadBlancThemeHistory(): BlancThemeHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function recordBlancThemeHistory(settings: Pick<ToolboxSettings, 'themePreset' | 'themeOverrides'>): BlancThemeHistoryEntry[] {
  const next = normalize([...loadBlancThemeHistory(), {
    preset: settings.themePreset,
    overrides: settings.themeOverrides,
    savedAt: Date.now(),
  }]);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* session-only history */ }
  return next;
}

export function undoBlancThemeHistory(): BlancThemeHistoryEntry | null {
  const history = loadBlancThemeHistory();
  const entry = history.pop() ?? null;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch { /* session-only history */ }
  return entry;
}
