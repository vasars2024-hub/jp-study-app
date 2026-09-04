/**
 * §3 matching. Every case here is a decision the binder is allowed to make on
 * its own, in the background, without asking — so the ones that must NOT bind
 * carry as much weight as the ones that must.
 */

import { describe, expect, it } from 'vitest';
import {
  BIND_ACCEPT,
  BIND_SUGGEST,
  bestReadingBind,
  kanaToRomaji,
  readingBindDisposition,
  readingWorkFingerprint,
  scoreReadingBind,
  type ReadingBindCandidate,
} from '../readingListMatch';
import type { ReadingWorkRef } from '../readingLists';

function work(overrides: Partial<ReadingWorkRef> & { titleRaw: string }): ReadingWorkRef {
  return { id: 'rw_1', boundItemIds: [], bindConfidence: 0, ...overrides };
}

function item(id: string, title: string, rest: Partial<ReadingBindCandidate> = {}) {
  return { id, title, ...rest };
}

describe('kanaToRomaji', () => {
  it('transliterates the kana constructs a real title uses', () => {
    expect(kanaToRomaji('ノルウェイのもり')).toBe('noruweinomori');
    expect(kanaToRomaji('きょう')).toBe('kyou');
    expect(kanaToRomaji('がっこう')).toBe('gakkou');
    expect(kanaToRomaji('コーヒー')).toBe('koohii');
    expect(kanaToRomaji('しゃしん')).toBe('shashin');
  });

  it('leaves kanji alone rather than guessing a reading', () => {
    // The limit is deliberate: a guessed kanji reading produces a confident wrong
    // binding, which is the one outcome this module exists to prevent.
    expect(kanaToRomaji('森')).toBe('森');
    expect(kanaToRomaji('ノルウェイの森')).toBe('noruweino森');
  });

  it('drops a trailing sokuon that has no consonant to double', () => {
    expect(kanaToRomaji('あっ')).toBe('a');
  });

  it('passes text with no kana through untouched', () => {
    expect(kanaToRomaji('Norwegian Wood')).toBe('Norwegian Wood');
  });
});

describe('scoreReadingBind', () => {
  it('accepts an exact title, in either script', () => {
    const fingerprint = readingWorkFingerprint(
      work({ titleRaw: 'コンビニ人間', titleEn: 'Convenience Store Woman' }),
    );
    expect(scoreReadingBind(fingerprint, item('li_1', 'コンビニ人間')).disposition).toBe('accept');
    expect(
      scoreReadingBind(fingerprint, item('li_2', 'Convenience Store Woman')).disposition,
    ).toBe('accept');
  });

  it('binds katakana on one side to romaji on the other — the reason the romanizer exists', () => {
    const fingerprint = readingWorkFingerprint(work({ titleRaw: 'ノルウェイのもり' }));
    const score = scoreReadingBind(fingerprint, item('li_1', 'Noruwei no Mori'));
    expect(score.reasons).toContain('title-exact');
    expect(score.disposition).toBe('accept');
  });

  it('refuses an unrelated book outright', () => {
    const fingerprint = readingWorkFingerprint(work({ titleRaw: 'Convenience Store Woman' }));
    const score = scoreReadingBind(fingerprint, item('li_1', 'Kafka on the Shore'));
    expect(score.disposition).toBe('reject');
    expect(score.confidence).toBeLessThan(BIND_SUGGEST);
  });

  it('does not let a sequel swallow its predecessor', () => {
    const fingerprint = readingWorkFingerprint(work({ titleRaw: 'The Big O' }));
    const score = scoreReadingBind(fingerprint, item('li_1', 'The Big O II Return of the Machine'));
    expect(score.confidence).toBeLessThan(BIND_ACCEPT);
  });

  it('rejects a clashing volume even though the titles are identical', () => {
    // The case the title signal is structurally unable to see: vol 1 and vol 7 of
    // one series are the same string. Binding the wrong one is a wrong answer.
    const fingerprint = readingWorkFingerprint(
      work({ titleRaw: 'よつばと', volume: { from: 1 } }),
    );
    const score = scoreReadingBind(fingerprint, item('li_1', 'よつばと', { volume: { from: 7 } }));
    expect(score.reasons).toContain('volume-mismatch');
    expect(score.disposition).not.toBe('accept');
  });

  it('accepts a volume inside the work range', () => {
    const fingerprint = readingWorkFingerprint(
      work({ titleRaw: 'よつばと', volume: { from: 1, to: 3 } }),
    );
    const score = scoreReadingBind(fingerprint, item('li_1', 'よつばと', { volume: { from: 2 } }));
    expect(score.reasons).toContain('volume-match');
    expect(score.disposition).toBe('accept');
  });

  it('treats a volume only one side knows as silence, not disagreement', () => {
    const fingerprint = readingWorkFingerprint(
      work({ titleRaw: 'よつばと', volume: { from: 4 } }),
    );
    const score = scoreReadingBind(fingerprint, item('li_1', 'よつばと'));
    expect(score.reasons).toContain('volume-unknown');
    expect(score.disposition).toBe('accept');
  });

  it('lets a matching author corroborate but never let a clash reject a plain match', () => {
    const base = work({ titleRaw: 'Kafka on the Shore', authorRaw: 'Haruki Murakami' });
    const agree = scoreReadingBind(
      readingWorkFingerprint(base),
      item('li_1', 'Kafka on the Shore', { author: 'Haruki Murakami' }),
    );
    const clash = scoreReadingBind(
      readingWorkFingerprint(base),
      item('li_2', 'Kafka on the Shore', { author: 'Banana Yoshimoto' }),
    );
    expect(agree.reasons).toContain('author-match');
    expect(clash.reasons).toContain('author-mismatch');
    expect(clash.disposition).toBe('accept');
    expect(clash.confidence).toBeLessThan(agree.confidence);
  });

  it('holds a fuzzy match on a very short key under the accept line', () => {
    const fingerprint = readingWorkFingerprint(work({ titleRaw: 'IQ' }));
    const score = scoreReadingBind(fingerprint, item('li_1', 'IQ84 and other stories'));
    expect(score.reasons).toContain('short-key-floor');
    expect(score.disposition).not.toBe('accept');
  });
});

describe('readingBindDisposition', () => {
  it('splits at the two thresholds the plan names', () => {
    expect(readingBindDisposition(BIND_ACCEPT)).toBe('accept');
    expect(readingBindDisposition(BIND_ACCEPT - 0.001)).toBe('suggest');
    expect(readingBindDisposition(BIND_SUGGEST)).toBe('suggest');
    expect(readingBindDisposition(BIND_SUGGEST - 0.001)).toBe('reject');
  });
});

describe('bestReadingBind', () => {
  it('picks the strongest candidate and ignores the rejects entirely', () => {
    const fingerprint = readingWorkFingerprint(work({ titleRaw: 'Convenience Store Woman' }));
    const best = bestReadingBind(fingerprint, [
      item('li_1', 'Kafka on the Shore'),
      item('li_2', 'Convenience Store Woman'),
      item('li_3', 'Convenience Store'),
    ]);
    expect(best?.itemId).toBe('li_2');
    expect(best?.disposition).toBe('accept');
  });

  it('returns null when nothing reaches even the suggest band', () => {
    const fingerprint = readingWorkFingerprint(work({ titleRaw: 'Convenience Store Woman' }));
    expect(bestReadingBind(fingerprint, [item('li_1', 'Kafka on the Shore')])).toBeNull();
  });
});
