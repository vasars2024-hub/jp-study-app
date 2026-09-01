// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CollectedFolder, CollectedTool } from '../../shared/collectedTools';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import {
  BLANC_MASTER_SETTINGS,
  appDrawerMasterContent,
  blancMasterSourceLabels,
  deckCardMasterContent,
  dictionaryEntryMasterContent,
  grammarPointMasterContent,
  libraryItemMasterContent,
  readBlancDictionaryQuery,
  savedWordMasterContent,
} from '../components/blanc/blancMasterSources';

function labelsFrom(catalog: object) {
  return blancMasterSourceLabels((key, vars) => {
    let value = String((catalog as Record<string, unknown>)[key] ?? key);
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  });
}

const EN_LABELS = labelsFrom(en);
const JA_LABELS = labelsFrom(ja);

const FOLDERS: CollectedFolder[] = [
  { id: 'study', name: 'Study', parentFolderId: null, order: 0 },
  { id: 'reading', name: 'Reading', parentFolderId: 'study', order: 0 },
];

const TOOLS: CollectedTool[] = [{
  id: 'reader-folder',
  name: 'Reader folder',
  url: 'C:\\Japanese\\Reading',
  note: 'Graded material',
  tags: ['books'],
  addedAt: 1,
  source: 'app',
  kind: 'file',
  folderId: 'reading',
}];

describe('Blanc Master Search source adapters', () => {
  it('keeps App Drawer target, tags, note, kind, and nested folder metadata searchable', () => {
    expect(appDrawerMasterContent(TOOLS, FOLDERS)).toEqual([expect.objectContaining({
      kind: 'shortcut',
      id: 'reader-folder',
      title: 'Reader folder',
      detail: 'file · Study / Reading · Graded material',
      category: 'Study / Reading',
      keywords: ['C:\\Japanese\\Reading', 'file', 'books'],
    })]);
  });

  it('indexes saved words by expression, reading, and meaning', () => {
    expect(savedWordMasterContent([{
      word: '食べる',
      reading: 'たべる',
      meaning: 'to eat',
      addedAt: 1,
    }])).toEqual([expect.objectContaining({
      kind: 'saved-word',
      id: '食べる',
      detail: 'たべる · to eat',
      keywords: ['たべる', 'to eat'],
    })]);
  });

  it('defines a unique deep-link target for every live Blanc settings section', () => {
    const ids = BLANC_MASTER_SETTINGS.map((setting) => setting.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'interface',
      'models',
      'memory',
      'lockscreen',
      'control-center',
      'theme',
      'custom-css',
      'launcher-order',
      'tool-visibility',
      'shortcuts',
      'mode',
    ]);
  });

  it('accepts only non-empty string dictionary queries', () => {
    expect(readBlancDictionaryQuery(new CustomEvent('query', { detail: '  食べる  ' }))).toBe('食べる');
    expect(readBlancDictionaryQuery(new CustomEvent('query', { detail: { word: '食べる' } }))).toBeNull();
    expect(readBlancDictionaryQuery(new CustomEvent('query', { detail: ' ' }))).toBeNull();
  });

  it('indexes the readable fields of real deck cards, including mined sentence context', () => {
    const content = deckCardMasterContent([{
      id: 'card-1',
      word: '走る',
      reading: 'はしる',
      meaning: 'to run',
      sentence: '毎朝、公園を走る。',
      source: 'epub',
      bookTitle: '朝の話',
      addedAt: 1,
    }], EN_LABELS);

    expect(content).toEqual([expect.objectContaining({
      kind: 'deck-card',
      id: 'card-1',
      title: '走る',
      detail: 'はしる · to run · 朝の話',
      keywords: expect.arrayContaining(['毎朝、公園を走る。', '朝の話', 'epub']),
    })]);
  });

  it('keeps dictionary history language and repeated-lookup evidence on the result', () => {
    const content = dictionaryEntryMasterContent([{
      query: '吃了',
      lemma: '吃',
      reading: 'chī',
      meaning: 'to eat',
      lang: 'zh',
      at: 20,
      firstAt: 10,
      count: 2,
      lookupTimes: [10, 20],
    }], EN_LABELS);

    expect(content).toEqual([expect.objectContaining({
      kind: 'dictionary-entry',
      id: 'zh:吃',
      title: '吃',
      detail: 'chī · to eat · 2 lookups',
      language: 'zh',
      keywords: ['吃了'],
    })]);
  });

  it('adapts deterministic grammar records and local library rows without fake matches', () => {
    const grammar = grammarPointMasterContent([{
      id: 'n5-te-kudasai',
      lang: 'ja',
      level: 'N5',
      title: '〜てください',
      meaning: 'please do',
      structure: 'verb て-form + ください',
      explanation: 'A polite request.',
      examples: [],
      register: 'neutral',
      categories: ['request'],
      provenance: {
        source: 'authored:test',
        tagSource: 'authored',
        registerSource: 'authored',
        categorySource: 'authored',
        verification: 'verified',
      },
    }], EN_LABELS);
    const library = libraryItemMasterContent([{
      id: 'book-1',
      title: 'コンビニ人間',
      kind: 'book',
      folder: 'Novels',
      sourcePath: 'C:\\Books\\konbini.epub',
      createdAt: 1,
    }], EN_LABELS);

    expect(grammar[0]).toMatchObject({
      kind: 'grammar-point',
      id: 'n5-te-kudasai',
      detail: 'N5 · please do',
      keywords: expect.arrayContaining(['verb て-form + ください', 'request']),
    });
    expect(library[0]).toMatchObject({
      kind: 'library-item',
      id: 'book-1',
      title: 'コンビニ人間',
      detail: 'Book · Novels',
      keywords: ['C:\\Books\\konbini.epub'],
    });

    expect(libraryItemMasterContent([{
      id: 'manga-1',
      title: 'よつばと！',
      kind: 'manga',
      createdAt: 1,
    }], JA_LABELS)[0]).toMatchObject({
      detail: '漫画 · 未分類',
      category: 'ライブラリ',
    });
    expect(dictionaryEntryMasterContent([{
      query: '食べる',
      lemma: '食べる',
      lang: 'ja',
      at: 2,
      firstAt: 1,
      count: 2,
      lookupTimes: [1, 2],
    }], JA_LABELS)[0]).toMatchObject({
      detail: '2 回検索',
      category: '日本語辞書',
    });
  });
});
