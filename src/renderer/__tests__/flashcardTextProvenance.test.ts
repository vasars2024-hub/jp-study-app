/**
 * A card has to say where its Japanese TEXT came from.
 *
 * `FlashcardSource` answers which surface made the card, not whether a human wrote
 * the sentence. A Whisper transcript line and a human-authored subtitle line both
 * arrive as `source: 'media'`, and only one of them can be wrong about what was
 * actually said — which is the "unrefereed track" failure the mining-unification
 * work already paid for once.
 *
 * The four values are that work's own vocabulary, adopted here so the two do not
 * diverge before they meet.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
// The transcript-card handler moved out of App.tsx into the installer both
// Study OS and Blanc run (studyBackgroundJobs.ts); the assertions follow it.
const APP = resolve(SRC, 'renderer/studyBackgroundJobs.ts');
const DECK = resolve(SRC, 'renderer/flashcardDeck.ts');
const FLASHCARDS = resolve(SRC, 'renderer/components/flashcards/FlashcardsContent.tsx');

const PROVENANCES = ['human-subs', 'auto-captions', 'transcript', 'book-text'] as const;
const KEYS = [
  'flash.provenance.humanSubs',
  'flash.provenance.autoCaptions',
  'flash.provenance.transcript',
  'flash.provenance.bookText',
] as const;

function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

describe('the deck carries a text provenance', () => {
  it('the union is exactly the four agreed values, and the field is optional', () => {
    const source = code(readFileSync(DECK, 'utf8'));
    const union = /export type FlashcardTextProvenance =([\s\S]*?);/.exec(source);
    expect(union, 'FlashcardTextProvenance is gone').toBeTruthy();
    for (const value of PROVENANCES) expect(union?.[1]).toContain(`'${value}'`);
    expect((union?.[1].match(/'/g) ?? []).length).toBe(PROVENANCES.length * 2);

    // Optional on purpose: every card written before this field exists, and every
    // source that has not been classified yet, must read as "not recorded" — never
    // be silently defaulted to "human", which would be a claim.
    expect(source).toMatch(/textProvenance\?: FlashcardTextProvenance;/);
  });
});

describe('transcript cards are marked, at the point they are created', () => {
  it('App stamps transcript, and nothing else stamps a provenance it did not verify', () => {
    const source = code(readFileSync(APP, 'utf8'));
    expect(source).toMatch(/textProvenance: 'transcript' as const/);
    // Control: exactly one write. A second one would mean some other batch is
    // asserting a provenance this test has not looked at.
    expect((source.match(/textProvenance:/g) ?? []).length).toBe(1);
  });
});

describe('the review surface renders it, per value', () => {
  it('the chip is driven by a key map, not by a string built at write time', () => {
    const source = code(readFileSync(FLASHCARDS, 'utf8'));
    for (const key of KEYS) expect(source).toContain(key);
    expect(source).toMatch(/t\(TEXT_PROVENANCE_KEYS\[current\.textProvenance\]\)/);
  });

  it('every value has a translation in all four languages', async () => {
    const { CATALOGS } = await import('../../shared/i18n/catalogs/all');
    for (const key of KEYS) {
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
        const entry = (CATALOGS[lang] as Record<string, string>)[key];
        expect(entry, `${key} missing from ${lang}`).toBeTruthy();
      }
    }
    // A map with four keys and one shared string would pass the check above. The
    // four labels have to actually differ, in each language.
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const catalog = CATALOGS[lang] as Record<string, string>;
      expect(new Set(KEYS.map((key) => catalog[key])).size, lang).toBe(KEYS.length);
    }
  });
});
