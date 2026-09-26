/**
 * A machine-translated track was named by an English sentence built in main
 * ("English · machine translation of Japanese"), shown verbatim in every UI language.
 * It is now named from its parts in the interface language; records written before the
 * change keep working because the source part is recovered from the old sentence.
 */
import { describe, expect, it } from 'vitest';
import { subtitleRecordLabel, type SubtitleRecord } from '../subtitleRecord';

const catalog: Record<string, string> = {
  'subtitleTrack.machineTranslation': '{lang} · машинный перевод: {source}',
  'sentenceDeck.track.stream': 'Поток субтитров {n}',
};
const translate = (key: string, vars: Record<string, string | number>): string =>
  (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? ''));

function record(extra: Partial<SubtitleRecord>): SubtitleRecord {
  return { id: 'x', lang: 'en', source: 'generated', path: 'a.srt', addedAt: 1, ...extra } as SubtitleRecord;
}

describe('subtitleRecordLabel: machine translations', () => {
  it('names a new record from its parts, in the interface language', () => {
    const label = subtitleRecordLabel(record({
      derivation: 'machine-translation',
      label: 'English · machine translation of Japanese',
      translatedFromLabel: '',
      translatedFromLang: 'ja',
    }), translate, 'ru');
    expect(label).toBe('английский · машинный перевод: японский');
  });

  it("uses the source track's own label when it had one", () => {
    const label = subtitleRecordLabel(record({
      derivation: 'machine-translation',
      translatedFromLabel: '[SubsPlease] Episode 3',
      translatedFromLang: 'ja',
    }), translate, 'ru');
    expect(label).toBe('английский · машинный перевод: [SubsPlease] Episode 3');
  });

  it('recovers the source from a record written before the change', () => {
    const label = subtitleRecordLabel(record({
      derivation: 'machine-translation',
      label: 'English · machine translation of [Group] 03',
    }), translate, 'ru');
    expect(label).toBe('английский · машинный перевод: [Group] 03');
  });

  it('leaves ordinary and untitled-stream records as before', () => {
    expect(subtitleRecordLabel(record({ source: 'downloaded', label: 'Jimaku JP' }), translate, 'ru')).toBe('Jimaku JP');
    expect(subtitleRecordLabel(record({ source: 'embedded', label: 'Stream 2' }), translate, 'ru')).toBe('Поток субтитров 2');
  });
});
