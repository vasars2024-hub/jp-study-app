// @vitest-environment jsdom
/**
 * D114 — the taskbar clock read `10:59 PM` while the date beside it read
 * `6 сент.` in a fully Russian desktop. `toLocaleTimeString` was handed the
 * right locale tag and then had its hour cycle overridden by `hour12`, which
 * came from a pref that defaulted to a hard `false` for every language.
 *
 * The contract these tests pin:
 *   - the default is `'auto'`, and `'auto'` means NO `hour12` option at all,
 *     so `Intl` uses the locale's own cycle;
 *   - an explicit choice still wins in every language, in both directions;
 *   - a boolean stored before the three-state control still loads unchanged.
 *
 * `undefined` and `false` are not interchangeable here, which is the whole
 * defect: passing `false` would force 24-hour onto English instead.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clockHour12, loadDesktopPrefs, saveDesktopPrefs } from '../desktopPrefs';
import { LANG_TAGS } from '../../shared/i18n/core';

const KEY = 'jp-os-desktop-prefs-v1';

/** 22:59 local time — the hour the live defect was measured at. */
function at2259(): Date {
  const d = new Date();
  d.setHours(22, 59, 0, 0);
  return d;
}

function render(lang: keyof typeof LANG_TAGS, pref: boolean | 'auto'): string {
  return at2259().toLocaleTimeString(LANG_TAGS[lang], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: clockHour12(pref),
  });
}

describe('taskbar clock hour cycle follows the UI language', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('defaults to auto, which passes no hour12 override', () => {
    expect(loadDesktopPrefs().clock24h).toBe('auto');
    expect(clockHour12('auto')).toBeUndefined();
  });

  it('renders 24-hour in ja/zh/ru and 12-hour in en on the default', () => {
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      const out = render(lang, 'auto');
      expect(out, `${lang} should be 24-hour`).toContain('22');
      expect(out, `${lang} should carry no AM/PM marker`).not.toMatch(/AM|PM/i);
    }
    // English keeps its own convention rather than being forced the other way.
    expect(render('en', 'auto')).toMatch(/PM/i);
  });

  it('honours an explicit choice in every language, both directions', () => {
    expect(clockHour12(true)).toBe(false);
    expect(clockHour12(false)).toBe(true);
    // Explicit 24h reaches English...
    expect(render('en', true)).toContain('22');
    expect(render('en', true)).not.toMatch(/AM|PM/i);
    // ...and explicit 12h reaches Russian.
    expect(render('ru', false)).toMatch(/10[:.]59/);
  });

  it('loads a boolean stored before the three-state control unchanged', () => {
    localStorage.setItem(KEY, JSON.stringify({ clock24h: true }));
    expect(loadDesktopPrefs().clock24h).toBe(true);
    localStorage.setItem(KEY, JSON.stringify({ clock24h: false }));
    expect(loadDesktopPrefs().clock24h).toBe(false);
  });

  it('normalizes an unrecognised stored value back to auto rather than to 12-hour', () => {
    localStorage.setItem(KEY, JSON.stringify({ clock24h: 'yes please' }));
    expect(loadDesktopPrefs().clock24h).toBe('auto');
    // A missing key is the pre-existing-user case and must not silently become false.
    localStorage.setItem(KEY, JSON.stringify({ iconSize: 'large' }));
    expect(loadDesktopPrefs().clock24h).toBe('auto');
  });

  it('round-trips an explicit choice and back to auto through save', () => {
    expect(saveDesktopPrefs({ clock24h: true }).clock24h).toBe(true);
    expect(loadDesktopPrefs().clock24h).toBe(true);
    expect(saveDesktopPrefs({ clock24h: 'auto' }).clock24h).toBe('auto');
    expect(loadDesktopPrefs().clock24h).toBe('auto');
    // An unrelated patch must not reset the user's explicit choice.
    saveDesktopPrefs({ clock24h: false });
    expect(saveDesktopPrefs({ clockSeconds: true }).clock24h).toBe(false);
  });
});
