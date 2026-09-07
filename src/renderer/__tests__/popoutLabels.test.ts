import { describe, expect, it } from 'vitest';
import { POPOUT_LABEL_KEYS, popoutLabel, popoutSectionFromSearch } from '../popoutLabels';
import { en } from '../../shared/i18n/catalogs/en';
import type { DesktopWinSection } from '../../shared/desktop';

/**
 * Pre-sweep D108 — a pop-out title that says `musicwidget`.
 *
 * The localization slice replaced a table of raw English titles with a table of catalog
 * keys, and resolved it with `key ? translate(key) : section`. That collapses two cases the
 * old `POPOUT_LABELS[popout] ?? popout` kept apart: `??` only falls back on null/undefined,
 * so `musicwidget`'s deliberately-empty entry stayed empty; a truthiness test sends it down
 * the fallback arm and titles the window with its own section id.
 *
 * It is not cosmetic. `PopoutChrome` reads a blank label as "icon-only drag strip"
 * (`popout-drag ${label ? '' : 'popout-drag-icon'}` in App.tsx), so the widget pop-out would
 * have gained a text title where the design has an icon.
 *
 * `translate` is injected, so these are real resolutions, not a source scan.
 */
const t = (key: string): string => {
  const value = (en as Record<string, string>)[key];
  if (value === undefined) throw new Error(`no such English key: ${key}`);
  return value;
};

describe('popoutLabel', () => {
  it('keeps the deliberately-unlabelled widget unlabelled', () => {
    expect(POPOUT_LABEL_KEYS.musicwidget).toBe('');
    expect(popoutLabel(t, 'musicwidget')).toBe('');
  });

  it('falls back to the raw id only when the section is not in the table at all', () => {
    // `note` renders no pop-out control, so it is absent by design — but if something ever
    // opened `?popout=note`, a bare id beats a blank title bar.
    expect('note' in POPOUT_LABEL_KEYS).toBe(false);
    expect(popoutLabel(t, 'note' as DesktopWinSection)).toBe('note');
  });

  it('composes the two Media Center sub-surfaces', () => {
    expect(popoutLabel(t, 'video')).toBe(`${t('mediaCenter.nav.label')} · ${t('palette.section.video')}`);
    expect(popoutLabel(t, 'music')).toBe(`${t('mediaCenter.nav.label')} · ${t('palette.section.music')}`);
  });

  it('resolves every other entry through the catalog', () => {
    const composed = new Set(['video', 'music', 'musicwidget']);
    const resolved = Object.keys(POPOUT_LABEL_KEYS)
      .filter((s) => !composed.has(s))
      .map((s) => [s, popoutLabel(t, s as DesktopWinSection)] as const);
    // Non-vacuous, and no entry resolves to its own id (which is what a missing key looks
    // like once `key === undefined` is the only fallback arm).
    expect(resolved.length).toBeGreaterThanOrEqual(18);
    expect(resolved.filter(([section, label]) => label === section || label === '')).toEqual([]);
  });

  it('every key in the table exists in the English catalog', () => {
    const missing = Object.values(POPOUT_LABEL_KEYS)
      .filter((key): key is string => Boolean(key))
      .filter((key) => (en as Record<string, string>)[key] === undefined);
    expect(missing).toEqual([]);
  });
});

describe('popoutSectionFromSearch', () => {
  it('accepts a section in the allow-list and rejects one that is not', () => {
    expect(popoutSectionFromSearch('?popout=youtube')).toBe('youtube');
    expect(popoutSectionFromSearch('?popout=note')).toBeNull();
    expect(popoutSectionFromSearch('?popout=')).toBeNull();
    expect(popoutSectionFromSearch('')).toBeNull();
  });
});
