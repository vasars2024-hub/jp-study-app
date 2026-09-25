// @vitest-environment node
//
// Note types learners of Chinese and Russian actually use get their fields
// filled: Hanzi / Pinyin / 例句, Слово / Ударение / Перевод.
import { describe, expect, it } from 'vitest';
import { resolveFieldMap } from '../anki/fieldMapper';
import type { StudyProfile } from '../../shared/profiles';

const profile = { anki: { fieldMap: {} } } as unknown as StudyProfile;

describe('resolveFieldMap across study languages', () => {
  it('maps a Chinese deck', () => {
    const map = resolveFieldMap(profile, 'HSK', ['Hanzi', 'Pinyin', 'Meaning', '例句', 'Audio']);
    expect(map).toMatchObject({ term: 'Hanzi', reading: 'Pinyin', meaning: 'Meaning', sentence: '例句', termAudio: 'Audio' });
  });

  it('maps a Chinese deck named in Chinese', () => {
    const map = resolveFieldMap(profile, '中文', ['汉字', '拼音', '释义', '例句', '笔记']);
    expect(map).toMatchObject({ term: '汉字', reading: '拼音', meaning: '释义', sentence: '例句', notes: '笔记' });
  });

  it('maps a Russian deck named in Russian', () => {
    const map = resolveFieldMap(profile, 'Русский', ['Слово', 'Значение', 'Ударение', 'Перевод', 'Пример', 'Заметки']);
    expect(map).toMatchObject({
      term: 'Слово', meaning: 'Значение', reading: 'Ударение', translation: 'Перевод', sentence: 'Пример', notes: 'Заметки',
    });
  });

  it('still maps a Japanese deck exactly as before', () => {
    const map = resolveFieldMap(profile, 'Mining', ['Expression', 'Reading', 'Meaning', 'Sentence']);
    expect(map).toMatchObject({ term: 'Expression', reading: 'Reading', meaning: 'Meaning', sentence: 'Sentence' });
  });
});
