// @vitest-environment jsdom
/**
 * `AnkiSetup` is the panel every Dictionary/reading surface shows when AnkiConnect is down, and it
 * printed main's English reason verbatim in every language.
 *
 * Same structural defect `shared/__tests__/ankiReasonTranslation.test.ts` pins for the Media
 * Center, on a different surface: main authors `ANKI_UNREACHABLE_MSG` /
 * `ANKI_COLLECTION_UNAVAILABLE_MSG` and main has no locale, so the string is already English before
 * any catalog could be consulted. `AnkiSetup.tsx` rendered `status?.error` straight into
 * `.anki-setup-msg`, so a Japanese user saw four translated install steps under one English
 * sentence.
 *
 * Neither standard guard sees this. A raw-key sweep reads a real English sentence, not a dotted
 * key; `tools/i18n-check.cjs` reads catalogs and never renders. What catches it is asserting that
 * the rendered message CHANGES between languages, which is the last case here.
 *
 * The load-bearing trap is the `collectionWait` branch: the identity comparison in `AnkiSetup.tsx`
 * must keep testing the RAW constant. Translating before comparing silently swaps the "collection
 * is loading, we retry automatically" copy for the install-AnkiConnect steps in ja/zh/ru only — a
 * worse bug than the one being fixed, and invisible in English.
 *
 * Second trap, paid for by `readingLensI18n.test.ts` first: `setUiLang` is synchronous to callers
 * but lands on a promise, so `setUiLang(l); render()` renders the PREVIOUS language. The second
 * `await ensureCatalog(lang)` is what flushes it, and without it every case below passes vacuously.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ANKI_COLLECTION_UNAVAILABLE_MSG, ANKI_UNREACHABLE_MSG } from '../../shared/anki';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { UI_LANGS, type UiLang } from '../../shared/i18n/core';
import type { AnkiStatus } from '../../shared/types';
import { setUiLang } from '../i18n';
import AnkiSetup from '../components/AnkiSetup';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const NON_EN: UiLang[] = UI_LANGS.filter((l) => l !== 'en');

function statusWith(error: string | undefined): AnkiStatus {
  return { connected: false, decks: [], models: [], ...(error === undefined ? {} : { error }) };
}

/** Switches language, renders, and returns the `.anki-setup-msg` text. */
async function renderIn(lang: UiLang, error: string | undefined): Promise<HTMLElement> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await ensureCatalog(lang);
  const mount = document.createElement('div');
  document.body.append(mount);
  const created = createRoot(mount);
  host = mount;
  root = created;
  await act(async () => {
    created.render(<AnkiSetup status={statusWith(error)} onRetry={() => undefined} />);
  });
  return mount;
}

function messageOf(el: HTMLElement): string {
  const msg = el.querySelector('.anki-setup-msg');
  if (!msg) throw new Error('no .anki-setup-msg rendered');
  return msg.textContent ?? '';
}

function teardown(): void {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
}

beforeAll(async () => {
  for (const lang of UI_LANGS) await ensureCatalog(lang);
});

afterEach(async () => {
  teardown();
  setUiLang('en');
  await ensureCatalog('en');
});

describe('AnkiSetup renders the connection reason in the UI language', () => {
  it('is byte-identical to the constant in English, so the single-source contract holds', async () => {
    expect(messageOf(await renderIn('en', ANKI_UNREACHABLE_MSG))).toBe(ANKI_UNREACHABLE_MSG);
  });

  it.each(NON_EN)('translates the unreachable reason in %s', async (lang) => {
    const text = messageOf(await renderIn(lang, ANKI_UNREACHABLE_MSG));
    expect(text).not.toBe(ANKI_UNREACHABLE_MSG);
    // A missing key surfaces as the key itself; that is a leak, not a translation.
    expect(text).not.toContain('anki.unreachableReason');
    expect(text.length).toBeGreaterThan(0);
  });

  it.each(NON_EN)('translates the collection-unavailable reason in %s', async (lang) => {
    const text = messageOf(await renderIn(lang, ANKI_COLLECTION_UNAVAILABLE_MSG));
    expect(text).not.toBe(ANKI_COLLECTION_UNAVAILABLE_MSG);
    expect(text).not.toContain('anki.collectionUnavailableReason');
  });

  it.each(NON_EN)(
    'still picks the collection-wait branch in %s — the identity test reads the raw constant',
    async (lang) => {
      const el = await renderIn(lang, ANKI_COLLECTION_UNAVAILABLE_MSG);
      // The wait copy replaces the four install steps. If the comparison were made against the
      // translated string the branch would flip to "install AnkiConnect" in this language only.
      expect(el.querySelector('.anki-steps')).toBeNull();
      expect(el.querySelector('.anki-setup-sub')).not.toBeNull();
    },
  );

  it('passes a verbatim AnkiConnect error through unchanged', async () => {
    // Not ours to translate, and a generic translated string would lose the actionable detail.
    expect(messageOf(await renderIn('ja', 'deck was not found: 日本語'))).toBe(
      'deck was not found: 日本語',
    );
  });

  it('falls back to the short catalog message when there is no reason at all', async () => {
    const text = messageOf(await renderIn('ja', undefined));
    expect(text).not.toContain('ankiSetup.cantReach');
    expect(text.length).toBeGreaterThan(0);
  });

  it('renders a DIFFERENT message in every language, which is the only check that sees this bug', async () => {
    const seen = new Map<UiLang, string>();
    for (const lang of UI_LANGS) {
      seen.set(lang, messageOf(await renderIn(lang, ANKI_UNREACHABLE_MSG)));
      teardown();
    }
    const enText = seen.get('en');
    expect(enText).toBe(ANKI_UNREACHABLE_MSG);
    for (const lang of NON_EN) expect(seen.get(lang)).not.toBe(enText);
    expect(new Set(seen.values()).size).toBe(UI_LANGS.length);
  });
});
