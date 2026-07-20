import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BLANC_MODE,
  mergeBlancModeSettings,
  sanitizeBlancModeSettings,
} from '../blancMode';

describe('Blanc Mode settings', () => {
  it('falls back to defaults for missing or malformed values', () => {
    expect(sanitizeBlancModeSettings(null)).toEqual(DEFAULT_BLANC_MODE);
    expect(sanitizeBlancModeSettings('bad')).toEqual(DEFAULT_BLANC_MODE);
    expect(sanitizeBlancModeSettings({ enabled: 'yes', lastTab: 'desktop' })).toEqual(
      DEFAULT_BLANC_MODE,
    );
  });

  it('keeps only supported tabs and boolean flags', () => {
    expect(
      sanitizeBlancModeSettings({
        enabled: true,
        darkMode: true,
        advanced: true,
        lastTab: 'media',
        extra: 'ignored',
      }),
    ).toEqual({
      enabled: true,
      darkMode: true,
      advanced: true,
      lastTab: 'media',
    });
  });

  it('migrates the old music tab to the full media toolbox', () => {
    expect(sanitizeBlancModeSettings({ lastTab: 'music' }).lastTab).toBe('media');
  });

  it('merges patches through the same sanitizer', () => {
    expect(
      mergeBlancModeSettings(
        { enabled: true, darkMode: false, advanced: false, lastTab: 'read' },
        { darkMode: true, lastTab: 'blocks' },
      ),
    ).toEqual({
      enabled: true,
      darkMode: true,
      advanced: false,
      lastTab: 'blocks',
    });
  });
});
