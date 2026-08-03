import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadBlancThemeHistory, recordBlancThemeHistory, undoBlancThemeHistory } from '../blancThemeHistoryStore';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

describe('Blanc theme history', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));

  it('records and undoes bounded theme snapshots', () => {
    recordBlancThemeHistory({ themePreset: 'default', themeOverrides: {} });
    recordBlancThemeHistory({ themePreset: 'blood', themeOverrides: { accent: '#ff2e4d' } });
    expect(undoBlancThemeHistory()?.preset).toBe('blood');
    expect(loadBlancThemeHistory()).toHaveLength(1);
  });
});
