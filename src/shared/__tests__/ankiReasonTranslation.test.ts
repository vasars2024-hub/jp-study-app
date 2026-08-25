/**
 * The connection-failure REASON reached the user in English no matter the UI language, and this
 * pins the fix.
 *
 * Measured live on the Media Center (`l8-states-video.cjs --langs`, pid 1324, Video window,
 * AnkiConnect refusing a TCP connect on 127.0.0.1:8765). Review rendered, in Japanese:
 *
 *   Anki に接続できないため（Can't reach Anki. Open Anki desktop and make sure the AnkiConnect
 *   add-on is installed.）、以下のカードの復習状況は不明です。
 *
 * — the outer sentence translated, the interpolated reason not, and the same in zh-Hans and ru.
 * The cause is structural rather than a missing key: main authors `ANKI_UNREACHABLE_MSG` and has
 * no locale, so the string is already English by the time any catalog could be consulted.
 *
 * A raw-key sweep cannot catch this (an English sentence is a real string, not a dotted key) and
 * neither can a key-count check (no key was missing — there was no key at all). What catches it is
 * asserting that the rendered reason CHANGES between languages, which is what the last case does.
 */
import { describe, expect, it } from 'vitest';
import {
  ANKI_COLLECTION_UNAVAILABLE_MSG,
  ANKI_UNREACHABLE_MSG,
  translateAnkiReason,
} from '../anki';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

const KEYS = ['anki.unreachableReason', 'anki.collectionUnavailableReason'] as const;
const CATALOGS: Array<[string, Record<string, string>]> = [
  ['en', en as Record<string, string>],
  ['ja', ja as Record<string, string>],
  ['zh', zh as Record<string, string>],
  ['ru', ru as Record<string, string>],
];

/** Stand-in for `useT()`: resolves against one catalog and returns the key if it is missing, which
 *  is exactly how a missing key would surface to the user. */
const translatorFor = (catalog: Record<string, string>) => (key: string) => catalog[key] ?? key;

describe('translateAnkiReason', () => {
  it('maps both reasons this app authors', () => {
    const t = translatorFor(ja as Record<string, string>);
    expect(translateAnkiReason(ANKI_UNREACHABLE_MSG, t)).toBe(ja['anki.unreachableReason']);
    expect(translateAnkiReason(ANKI_COLLECTION_UNAVAILABLE_MSG, t)).toBe(
      ja['anki.collectionUnavailableReason'],
    );
  });

  it('passes through a reason it did not author, unchanged', () => {
    // Verbatim AnkiConnect API errors and JS Error messages. Substituting a generic translated
    // string here would throw away the only detail that makes them actionable.
    const t = translatorFor(ru as Record<string, string>);
    for (const raw of ['deck was not found: 日本語', 'model was not found: Basic', 'fetch failed']) {
      expect(translateAnkiReason(raw, t)).toBe(raw);
    }
    expect(translateAnkiReason(undefined, t)).toBeUndefined();
    expect(translateAnkiReason('', t)).toBe('');
  });

  it('leaves English byte-identical to the constants', () => {
    // `ANKI_UNREACHABLE_MSG` is documented in shared/anki.ts as byte-exact UI copy and a single
    // source of truth. Routing en through the catalog must not quietly reword it.
    expect(en['anki.unreachableReason']).toBe(ANKI_UNREACHABLE_MSG);
    expect(en['anki.collectionUnavailableReason']).toBe(ANKI_COLLECTION_UNAVAILABLE_MSG);
    const t = translatorFor(en as Record<string, string>);
    expect(translateAnkiReason(ANKI_UNREACHABLE_MSG, t)).toBe(ANKI_UNREACHABLE_MSG);
  });

  it('carries both keys in all four catalogs', () => {
    for (const [name, catalog] of CATALOGS) {
      for (const key of KEYS) {
        expect(catalog[key], `${name} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('THE CONTROL: the reason actually changes language', () => {
    // This is the assertion the defect would have failed. Before the fix every language rendered
    // the English constant; a regression that reverts to it, or a catalog entry copy-pasted from
    // en, fails here and nowhere else.
    for (const key of KEYS) {
      const english = en[key as keyof typeof en] as string;
      for (const [name, catalog] of CATALOGS.filter(([n]) => n !== 'en')) {
        expect(catalog[key], `${name}.${key} is still the English string`).not.toBe(english);
      }
    }
    // And each translation still names the dependency, because `Anki` is a proper noun in every
    // catalog — this is the property the live probe scores `namesDependency` on.
    for (const [name, catalog] of CATALOGS) {
      expect(catalog['anki.unreachableReason'], `${name} dropped the proper noun`).toMatch(/Anki/);
    }
  });
});
