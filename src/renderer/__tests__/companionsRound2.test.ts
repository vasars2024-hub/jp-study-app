/**
 * Companions round 2: the locked "treasure" pet can be hidden, and companion
 * chatter plus the built-in buddy routines speak the UI language.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  isTreasureCompanionHidden,
  onAeroDiscoveryChanged,
  setTreasureCompanionHidden,
  showsTreasureCompanion,
} from '../aeroDiscovery';
import { buddyText, BUILTIN_TEXT_KEYS } from '../environment/buddyText';
import { getDefaultBuddyRoutines } from '../environment/buddyRoutines';
import { setUiLang } from '../i18n';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { ensureCatalog } from '../../shared/i18n/catalogs';

/** setUiLang lands on a promise; the second ensureCatalog flushes it. */
async function useLang(lang: 'en' | 'ja' | 'ru'): Promise<void> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await ensureCatalog(lang);
}

afterEach(async () => {
  localStorage.clear();
  await useLang('en');
});

describe('the locked treasure companion', () => {
  it('shows until hidden, and hiding notifies listeners', () => {
    expect(showsTreasureCompanion()).toBe(true);
    let calls = 0;
    const off = onAeroDiscoveryChanged(() => {
      calls += 1;
    });
    setTreasureCompanionHidden(true);
    off();
    expect(isTreasureCompanionHidden()).toBe(true);
    expect(showsTreasureCompanion()).toBe(false);
    expect(calls).toBe(1);
    setTreasureCompanionHidden(false);
    expect(showsTreasureCompanion()).toBe(true);
  });

  it('never shows once the theme is found', () => {
    localStorage.setItem('jp-aero-discovered', '1');
    expect(showsTreasureCompanion()).toBe(false);
  });
});

describe('companion text in the UI language', () => {
  it('translates built-in routine names and steps, keeps user text', async () => {
    await useLang('ru');
    const review = getDefaultBuddyRoutines().find((r) => r.id === 'br-buddy-review');
    expect(buddyText(review!.name)).toBe('Начать повторение');
    expect(buddyText('My own routine')).toBe('My own routine');
    await useLang('ja');
    expect(buddyText('Ready when you are.')).toBe('いつでもどうぞ。');
  });

  it('covers every built-in string the routines carry', () => {
    const texts: string[] = [];
    for (const r of getDefaultBuddyRoutines()) {
      texts.push(r.name);
      for (const s of r.steps as Array<Record<string, unknown>>) {
        for (const field of ['status', 'text', 'title', 'body']) {
          if (typeof s[field] === 'string') texts.push(s[field] as string);
        }
      }
    }
    expect(texts.filter((x) => !BUILTIN_TEXT_KEYS[x])).toEqual([]);
  });

  it('has every key in every language', () => {
    const keys = [
      ...Object.values(BUILTIN_TEXT_KEYS),
      'companion.treasure.hideHint',
      'companion.treasure.hidden',
      'companion.treasure.showLocked',
      'companion.treasure.showLockedDesc',
    ];
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      expect(keys.filter((k) => typeof cat[k] !== 'string'), lang).toEqual([]);
    }
  });
});
