import { describe, expect, it } from 'vitest';
import type { SubtitleRecord } from '../subtitleRecord';
import {
  pickHelperSubtitle,
  pickStudySubtitle,
  pickSubtitlePair,
  subtitleLangMatches,
} from '../subtitleDiscoveryPick';

const rec = (over: Partial<SubtitleRecord>): SubtitleRecord => ({
  id: 'r', lang: 'ja', source: 'provider', format: 'srt', path: 'p', addedAt: 1, ...over,
});

describe('subtitleLangMatches', () => {
  it('compares base languages', () => {
    expect(subtitleLangMatches('ja-JP', 'ja')).toBe(true);
    expect(subtitleLangMatches('en', 'ja')).toBe(false);
    expect(subtitleLangMatches(undefined, 'ja')).toBe(false);
  });
});

describe('pickStudySubtitle', () => {
  it('orders generated tracks: fusion, then Whisper, then machine translation', () => {
    const records = [
      rec({ id: 'mt', source: 'generated', derivation: 'machine-translation', machineGenerated: true }),
      rec({ id: 'whisper', source: 'generated', derivation: 'whisper', machineGenerated: true }),
      rec({ id: 'fused', source: 'generated', derivation: 'en-ja-fusion', machineGenerated: true }),
    ];
    expect(pickStudySubtitle(records)?.id).toBe('fused');
    expect(pickStudySubtitle(records.filter((r) => r.id !== 'fused'))?.id).toBe('whisper');
  });

  it('puts any human track ahead of every generated one', () => {
    expect(pickStudySubtitle([
      rec({ id: 'fused', source: 'generated', derivation: 'en-ja-fusion', confidence: 99 }),
      rec({ id: 'dl', source: 'provider', confidence: 71 }),
    ])?.id).toBe('dl');
  });

  it('honours the user\'s choice over everything', () => {
    const records = [rec({ id: 'emb', source: 'embedded' }), rec({ id: 'mt', source: 'generated', derivation: 'machine-translation' })];
    expect(pickStudySubtitle(records, 'ja', 'mt')?.id).toBe('mt');
  });
});

describe('pickHelperSubtitle', () => {
  it('takes a human track over a machine translation', () => {
    expect(pickHelperSubtitle([
      rec({ id: 'mt', lang: 'en', source: 'generated', derivation: 'machine-translation', machineGenerated: true }),
      rec({ id: 'os', lang: 'en', source: 'provider', confidence: 72 }),
    ], 'en')?.id).toBe('os');
  });

  it('takes a clean track over a hearing-impaired or signs-only one', () => {
    expect(pickHelperSubtitle([
      rec({ id: 'hi', lang: 'en', source: 'embedded', hearingImpaired: true }),
      rec({ id: 'clean', lang: 'en', source: 'provider' }),
    ], 'en')?.id).toBe('clean');
    expect(pickHelperSubtitle([
      rec({ id: 'signs', lang: 'en', source: 'embedded', label: 'English (Signs & Songs)' }),
      rec({ id: 'full', lang: 'en', source: 'provider' }),
    ], 'en')?.id).toBe('full');
  });

  it('is null without a helper language or a matching track', () => {
    expect(pickHelperSubtitle([rec({ lang: 'en' })], null)).toBeNull();
    expect(pickHelperSubtitle([rec({ lang: 'ja' })], 'en')).toBeNull();
  });
});

describe('pickSubtitlePair', () => {
  it('gives the study line Japanese and the helper line English', () => {
    const pair = pickSubtitlePair([
      rec({ id: 'en', lang: 'en', source: 'embedded' }),
      rec({ id: 'ja', lang: 'ja', source: 'provider', providerId: 'jimaku' }),
    ], 'ja', 'en');
    expect(pair.primary?.id).toBe('ja');
    expect(pair.secondary?.id).toBe('en');
  });

  it('never returns the same track for both lines', () => {
    // No Japanese: English is the primary, and there is no second English track.
    const pair = pickSubtitlePair([rec({ id: 'en', lang: 'en' })], 'ja', 'en');
    expect(pair.primary?.id).toBe('en');
    expect(pair.secondary).toBeNull();
  });

  it('respects a chosen English primary by not repeating English underneath', () => {
    const pair = pickSubtitlePair([
      rec({ id: 'ja', lang: 'ja' }),
      rec({ id: 'en1', lang: 'en' }),
      rec({ id: 'en2', lang: 'en', source: 'embedded' }),
    ], 'ja', 'en', 'en1');
    expect(pair.primary?.id).toBe('en1');
    expect(pair.secondary).toBeNull();
  });
});
