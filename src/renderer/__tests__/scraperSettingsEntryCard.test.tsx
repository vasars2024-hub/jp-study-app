// @vitest-environment jsdom
/**
 * The Settings → Scraper page after the engine half was removed.
 *
 * The removal replaced eleven cards with one hand-off card, and moved every
 * search haystack from an English literal into the catalogs. That second half
 * is what this file guards, because NOTHING ELSE CAN: `tools/i18n-check.cjs`
 * compares the four catalogs against each other, so a key that is missing from
 * ALL FOUR passes it — and `translate()` returns the key itself when it misses,
 * so the page renders "scraperPage.engine.title" as a heading and stays green
 * on every gate. That is the exact state this slice was interrupted in.
 *
 * The searchability half matters just as much: eleven cards' keywords went into
 * one `find.engine` entry precisely so that someone searching "proxy" or
 * "rollback" still lands somewhere that tells them where those settings went.
 * A dead search result would teach them nothing, so the terms are asserted, not
 * assumed.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScraperSettingsEntryCard from '../components/settings/pages/ScraperSettingsEntryCard';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { loadScraperShellState, saveScraperShellState } from '../scraperShellStore';
import { SECTION_OPEN_EVENT } from '../sectionSurface';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';

/** Every key the page and its card ask for, listed here rather than derived: a
 *  list derived from the source would drop a key at the same moment the source
 *  did, and pass. */
const REQUIRED_KEYS = [
  'scraperPage.search.label',
  'scraperPage.search.placeholder',
  'scraperPage.engine.title',
  'scraperPage.engine.description',
  'scraperPage.engine.body',
  'scraperPage.engine.whereProfiles',
  'scraperPage.engine.whereDrawer',
  'scraperPage.engine.openProfiles',
  'scraperPage.engine.openDrawer',
  'scraperPage.find.engine',
  'scraperPage.find.connectionProfiles',
  'scraperPage.find.unifiedSearch',
  'scraperPage.find.mediaProviders',
  'scraperPage.find.tracking',
  'scraperPage.find.malSync',
  'scraperPage.find.verifiedSites',
  'scraperPage.find.videoServers',
  'scraperPage.find.subtitles',
  'scraperPage.find.externalPlayer',
] as const;

const CATALOGS = { en, ja, zh, ru };

let host: HTMLDivElement;
let root: Root | null = null;

/** SettingsCard reads exactly these two off the controller. */
const controller = () =>
  ({ advancedMode: false, focusSettingId: null }) as unknown as SettingsController;

function render() {
  act(() => {
    root = createRoot(host);
    root.render(
      <SettingsProvider value={controller()}>
        <ScraperSettingsEntryCard />
      </SettingsProvider>,
    );
  });
}

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  saveScraperShellState(DEFAULT_SCRAPER_SHELL_STATE);
  host = document.createElement('div');
  document.body.append(host);
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: vi.fn(), writable: true, configurable: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

describe('Settings → Scraper hand-off card', () => {
  it('every catalog carries every key the page asks for', () => {
    // Read through the ASSEMBLED catalog, never `i18n/scraperUi/<lang>.ts`
    // directly. These keys arrive by spread (`catalogs/en.ts:753`-ish), and a
    // key present in the sub-module but dropped from the spread — or shadowed
    // by a later duplicate in the parent literal, which is what the last-wins
    // object semantics allow — resolves differently from what the sub-module
    // says. `en`/`ja`/`zh`/`ru` here are what `translate()` itself sees.
    const missing: string[] = [];
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
      for (const key of REQUIRED_KEYS) {
        const value = (catalog as Record<string, unknown>)[key];
        if (typeof value !== 'string' || value.trim() === '') missing.push(`${lang}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the removed cards findable in every language', () => {
    // One term from each of the eleven deleted cards, taken from that card's own
    // pre-deletion `matches(...)` string. The consolidated haystack shipped
    // covering only the headline noun of each — "extraction selectors" for a
    // card whose keywords were "css xpath regex attribute … ova movie" — so
    // searching "xpath" or "rollback" returned nothing at all where it used to
    // return a card. These are the terms, not a sample of them.
    const REMOVED_CARD_TERMS = [
      'balanced',   // profiles: 'profile preset fast balanced thorough'
      'proxy',      // network
      'chromium',   // browser (the cards are gone; the words still lead here)
      'fingerprint',// session
      'thumbnail',  // cache
      'robots',     // safety
      'credential', // authentication
      'rollback',   // revision history
      'xpath',      // extraction
      'subbed',     // episode processing
      'json',       // portable import/export
    ];
    for (const [lang, catalog] of Object.entries(CATALOGS)) {
      const haystack = String(
        (catalog as Record<string, unknown>)['scraperPage.find.engine'],
      ).toLowerCase();
      for (const term of REMOVED_CARD_TERMS) {
        expect(haystack, `${lang} lost "${term}"`).toContain(term);
      }
    }
  });

  it('renders translated copy, never a raw key', () => {
    render();
    const text = host.textContent ?? '';
    expect(text).toContain(en['scraperPage.engine.title']);
    expect(text).toContain(en['scraperPage.engine.whereDrawer']);
    expect(text).not.toMatch(/scraperPage\./);
  });

  it('stages the drawer destination and asks a host to open the Scraper', () => {
    render();
    const opened = vi.fn();
    window.addEventListener(SECTION_OPEN_EVENT, opened);
    try {
      act(() => button(en['scraperPage.engine.openDrawer'])?.click());
      expect(loadScraperShellState()).toMatchObject({ drawerOpen: true, drawerCategory: 'network' });
      expect(opened).toHaveBeenCalledOnce();
      expect((opened.mock.calls[0][0] as CustomEvent<string>).detail).toBe('scraper');
    } finally {
      window.removeEventListener(SECTION_OPEN_EVENT, opened);
    }
  });

  it('stages the Profiles destination and closes any drawer it would land behind', () => {
    saveScraperShellState({ ...DEFAULT_SCRAPER_SHELL_STATE, drawerOpen: true });
    render();
    act(() => button(en['scraperPage.engine.openProfiles'])?.click());
    expect(loadScraperShellState()).toMatchObject({ page: 'profiles', drawerOpen: false });
  });
});
