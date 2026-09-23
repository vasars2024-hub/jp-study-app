import { describe, expect, it } from 'vitest';
import type { SubtitleRecord } from '../subtitleRecord';
import {
  decideAudioLanguage,
  deriveSubtitleAutoStatus,
  sameSubtitleAutoStatus,
} from '../subtitleDiscoveryStatus';

const rec = (over: Partial<SubtitleRecord>): SubtitleRecord => ({
  id: 'r', lang: 'ja', source: 'provider', format: 'srt', path: 'p', addedAt: 1, ...over,
});

const status = (records: SubtitleRecord[], extra: Partial<Parameters<typeof deriveSubtitleAutoStatus>[0]> = {}) =>
  deriveSubtitleAutoStatus({ mediaId: 'm', records, helperLang: 'en', now: 5, ...extra });

describe('deriveSubtitleAutoStatus', () => {
  it('reports a found Jimaku line and a machine-translated helper line', () => {
    const out = status([
      rec({ id: 'ja', providerId: 'jimaku' }),
      rec({ id: 'mt', lang: 'en', source: 'generated', derivation: 'machine-translation', machineGenerated: true }),
    ]);
    expect(out).toMatchObject({
      ja: 'found',
      en: 'generated',
      source: { ja: 'jimaku', en: 'machine-translation' },
      primaryId: 'ja',
      secondaryId: 'mt',
      machineTranslated: { ja: false, en: true },
      notice: null,
      updatedAt: 5,
    });
  });

  it('does not call an English primary a Japanese line', () => {
    const out = status([rec({ id: 'en', lang: 'en', source: 'sidecar' })]);
    expect(out.ja).toBe('none');
    expect(out.en).toBe('found');
    expect(out.source).toEqual({ ja: null, en: 'sidecar' });
    expect(out.primaryId).toBe('en');
  });

  it('says searching and generating while those run', () => {
    expect(status([], { activity: { searching: true } }).ja).toBe('searching');
    const busy = status([rec({ id: 'ja' })], { activity: { generating: ['en'] } });
    expect(busy.en).toBe('generating');
    expect(busy.ja).toBe('found');
    // A generated line being replaced is news too.
    const regen = status([rec({ id: 'w', source: 'generated', derivation: 'whisper' })], { activity: { generating: ['ja'] } });
    expect(regen.ja).toBe('generating');
  });

  it('carries the notice and honours the user\'s chosen track', () => {
    const out = status(
      [rec({ id: 'a' }), rec({ id: 'b', source: 'embedded' })],
      { preferredSubtitleId: 'a', activity: { notice: 'translation-unavailable' } },
    );
    expect(out.primaryId).toBe('a');
    expect(out.notice).toBe('translation-unavailable');
  });

  it('reports the helper line as none when it is switched off', () => {
    expect(status([rec({ lang: 'en', id: 'en' })], { helperLang: null }).en).toBe('none');
  });

  it('compares statuses by what they render', () => {
    const a = status([rec({ id: 'ja' })]);
    expect(sameSubtitleAutoStatus(a, { ...a, updatedAt: 99 })).toBe(true);
    expect(sameSubtitleAutoStatus(a, { ...a, en: 'generating' })).toBe(false);
    expect(sameSubtitleAutoStatus(undefined, a)).toBe(false);
  });
});

describe('decideAudioLanguage', () => {
  it('trusts container tags first', () => {
    expect(decideAudioLanguage({ streamLanguages: ['ja'] })).toBe('ja');
    expect(decideAudioLanguage({ streamLanguages: ['en'], anilistId: 5 })).toBe('other');
    // Dual audio: the transcription job decodes the default stream, which is not
    // reliably the Japanese one.
    expect(decideAudioLanguage({ streamLanguages: ['ja', 'en'] })).toBe('other');
    expect(decideAudioLanguage({ streamLanguages: [null, 'und'], category: 'anime' })).toBe('ja');
  });

  it('falls back to what the library knows', () => {
    expect(decideAudioLanguage({ originalLanguage: 'ja', category: 'movie' })).toBe('ja');
    expect(decideAudioLanguage({ originalLanguage: 'en', category: 'anime' })).toBe('other');
    expect(decideAudioLanguage({ anilistId: 567 })).toBe('ja');
    expect(decideAudioLanguage({ itemLang: 'ko' })).toBe('other');
    expect(decideAudioLanguage({ nativeTitle: '千と千尋の神隠し' })).toBe('ja');
  });

  it('does not read a Chinese title as Japanese, and says unknown when it cannot tell', () => {
    expect(decideAudioLanguage({ nativeTitle: '甄嬛传' })).toBe('unknown');
    expect(decideAudioLanguage({})).toBe('unknown');
  });
});
