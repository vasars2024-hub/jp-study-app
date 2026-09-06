// @vitest-environment jsdom
/**
 * Aero v1.0 audit item 5.4 — the Translator gets a home next to Models &
 * dictionaries, and Settings search can finally reach it.
 *
 * The item's measured defect was reachability, so that is what is asserted:
 * `searchSettings('translator')` returned NOTHING before this slice (the
 * re-derivation grepped the whole Settings tree and found 28 hits, every one of
 * them the word "translated" in a comment). A card that exists but cannot be
 * found is the same defect with extra steps.
 *
 * The other half is the one item 5.3 had just spent a commit undoing on the
 * Scraper page: two editors for one document. This card must NOT be a second
 * copy of the Translate toolbar's state — it writes through the same single
 * owners, so a change here is the same change, not a parallel one.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TranslatorDefaultsCard from '../components/settings/pages/TranslatorDefaultsCard';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import { searchSettings } from '../components/settings/settingsRegistry';
import {
  getTranslateSource, setTranslateSource, TRANSLATE_SOURCE_KEY,
} from '../translateSource';
import { getTranslateTarget, setTranslateTarget } from '../translateTarget';
import { SECTION_OPEN_EVENT } from '../sectionSurface';

let host: HTMLDivElement;
let root: Root | null = null;

const controller = () =>
  ({ advancedMode: false, focusSettingId: null }) as unknown as SettingsController;

function render() {
  act(() => {
    root = createRoot(host);
    root.render(
      <SettingsProvider value={controller()}>
        <TranslatorDefaultsCard />
      </SettingsProvider>,
    );
  });
}

function select(id: string): HTMLSelectElement {
  const el = host.querySelector<HTMLSelectElement>(`#${id}`);
  // A missing select would otherwise surface as "cannot read value of null"
  // three frames away from the card that failed to render it.
  if (!el) throw new Error(`no <select id="${id}"> rendered`);
  return el;
}

function choose(id: string, value: string) {
  const el = select(id);
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  setTranslateSource('ja');
  setTranslateTarget('en');
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

describe('Translator languages in Settings', () => {
  it('is reachable from Settings search, which found nothing before', () => {
    const hits = searchSettings('translator', (key) => key, { advanced: true })
      .map((entry) => entry.id);
    expect(hits).toContain('translator-languages');
    // "translator" alone is a WEAK assertion, and two mutation controls proved
    // it. `t` is the identity here, so the entry's own titleKey string
    // ("translator.card.title") lands in the haystack and the entry still
    // matches with its keyword list gutted. Nor is a multi-word query enough:
    // `searchSettings` scores per WORD, so "language pair" kept matching on
    // "language" from `source language` after `language pair` was deleted.
    // One distinctive word that appears in no key name is the assertion with
    // teeth.
    const byKeyword = searchSettings('swap', (key) => key, { advanced: true })
      .map((entry) => entry.id);
    expect(byKeyword).toContain('translator-languages');
    // Negative control: the query has to be doing the work. A term that names
    // no setting must still return nothing, or "found it" means only that
    // `searchSettings` returns everything.
    expect(searchSettings('kumquat harmonica', (key) => key, { advanced: true })).toEqual([]);
  });

  it('lands on the Models & dictionaries page, where the card is composed', () => {
    const entry = searchSettings('target language', (key) => key, { advanced: true }).find((e) => e.id === 'translator-languages');
    expect(entry?.pageId).toBe('storage');
  });

  it('writes through the shared owner, so the Translate app reads the same value', () => {
    render();
    choose('translator-target', 'ru');
    expect(getTranslateTarget()).toBe('ru');
    // Not a private copy: the owner's own reader sees it, and so does storage.
    expect(localStorage.getItem('jp-study-translate-target')).toBe('ru');
  });

  it('follows a change made outside Settings without a remount', () => {
    render();
    expect(select('translator-source').value).toBe('ja');
    act(() => { setTranslateSource('zh'); });
    expect(select('translator-source').value).toBe('zh');
  });

  it('refuses to translate a language into itself, from either field', () => {
    render();
    // source ja / target en. Ask for target = ja: the pair would collapse, so
    // the source takes the target's old value rather than the change being
    // silently dropped.
    choose('translator-target', 'ja');
    expect(getTranslateTarget()).toBe('ja');
    expect(getTranslateSource('xx')).toBe('en');
    // And the same from the source field.
    choose('translator-source', 'ja');
    expect(getTranslateSource('xx')).toBe('ja');
    expect(getTranslateTarget()).toBe('en');
  });

  it('keeps a stored language it does not recognise selectable', () => {
    setTranslateSource('ko');
    render();
    const options = [...select('translator-source').options].map((o) => o.value);
    expect(options).toContain('ko');
    expect(select('translator-source').value).toBe('ko');
  });

  it('hands off to the Translate app rather than duplicating it', () => {
    render();
    const opened = vi.fn();
    window.addEventListener(SECTION_OPEN_EVENT, opened);
    try {
      const btn = [...host.querySelectorAll('button')].find((b) => /translate/i.test(b.textContent ?? ''));
      act(() => btn?.click());
      expect(opened).toHaveBeenCalledOnce();
      expect((opened.mock.calls[0][0] as CustomEvent<string>).detail).toBe('translate');
    } finally {
      window.removeEventListener(SECTION_OPEN_EVENT, opened);
    }
  });

  it('normalises on write, which the raw key never did', () => {
    // The whole reason `translateSource.ts` exists: the old inline SOURCE_KEY
    // stored whatever it was handed. '  ZH ' and 'zh' were two different
    // languages to a reader comparing strings.
    setTranslateSource('  ZH  ');
    expect(localStorage.getItem(TRANSLATE_SOURCE_KEY)).toBe('zh');
    expect(getTranslateSource('en')).toBe('zh');
  });
});
